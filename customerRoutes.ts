import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { pool } from "../db";
import { requireAuth, JwtUser } from "../auth";
import { config } from "../config";

export const customerRoutes = Router();

function selcomHeaders(payload: Record<string, unknown>, signedFields: string[]) {
  const timestamp = new Date().toISOString().replace("Z", "+00:00");
  const signingText = `timestamp=${timestamp}&${signedFields.map((key) => `${key}=${String(payload[key] ?? "")}`).join("&")}`;
  const digest = createHmac("sha256", config.selcomApiSecret!).update(signingText).digest("base64");
  return {
    "Content-Type": "application/json",
    Authorization: `SELCOM ${Buffer.from(config.selcomApiKey!).toString("base64")}`,
    "Digest-Method": "HS256",
    Digest: digest,
    Timestamp: timestamp,
    "Signed-Fields": signedFields.join(","),
  };
}

async function creditRepayment(client: import("pg").PoolClient, intent: { id: number; loan_id: number; amount: string; provider: string; provider_transaction_id: string | null; gateway_reference: string | null; channel: string | null; customer_id: number }) {
  if (intent.provider_transaction_id) {
    const duplicate = await client.query("SELECT id FROM loan_payments WHERE provider = $1 AND provider_transaction_id = $2", [intent.provider, intent.provider_transaction_id]);
    if (duplicate.rowCount) return false;
  }
  const locked = await client.query("SELECT balance, status, amount_due, principal_amount, amount_paid, first_due_date, installment_count, weekly_installment_amount, final_installment_amount FROM loans WHERE id = $1 FOR UPDATE", [intent.loan_id]);
  if (!locked.rowCount || locked.rows[0].status !== "active" || Number(intent.amount) > Number(locked.rows[0].balance)) {
    throw new Error("Loan balance changed or is no longer active; reconcile this payment manually.");
  }
  const inserted = await client.query(
    `INSERT INTO loan_payments (loan_id, amount, reference, received_by, provider, provider_transaction_id)
     VALUES ($1, $2, $3, NULL, $4, $5)
     ON CONFLICT (provider, provider_transaction_id) WHERE provider_transaction_id IS NOT NULL DO NOTHING RETURNING id`,
    [intent.loan_id, intent.amount, intent.gateway_reference ?? "", intent.provider, intent.provider_transaction_id]
  );
  if (!inserted.rowCount) {
    await client.query("UPDATE loan_payment_intents SET status = 'paid', paid_at = COALESCE(paid_at, now()), updated_at = now() WHERE id = $1", [intent.id]);
    return false;
  }
  await client.query(
    `UPDATE loans SET balance = GREATEST(balance - $2, 0), amount_paid = COALESCE(amount_paid, 0) + $2,
       arrears = CASE WHEN first_due_date IS NOT NULL AND weekly_installment_amount > 0 AND CURRENT_DATE >= first_due_date
         THEN GREATEST((CASE
           WHEN LEAST(installment_count, FLOOR((CURRENT_DATE - first_due_date)::numeric / 7)::int + 1) >= installment_count THEN amount_due
           ELSE LEAST(installment_count, FLOOR((CURRENT_DATE - first_due_date)::numeric / 7)::int + 1) * weekly_installment_amount
         END) - COALESCE(amount_paid, 0) - $2, 0)
         ELSE GREATEST(COALESCE(arrears, 0) - $2, 0) END,
       next_due_date = CASE WHEN first_due_date IS NOT NULL AND weekly_installment_amount > 0
         THEN first_due_date + (LEAST(installment_count - 1, FLOOR((COALESCE(amount_paid, 0) + $2) / weekly_installment_amount)::int) * 7)
         ELSE next_due_date END,
       repayment_performance = CASE WHEN COALESCE(amount_due, principal_amount, 0) > 0
         THEN LEAST(100, ((COALESCE(amount_paid, 0) + $2) / COALESCE(amount_due, principal_amount)) * 100) ELSE repayment_performance END,
       status = CASE WHEN GREATEST(balance - $2, 0) = 0 THEN 'closed' ELSE status END,
       updated_at = now() WHERE id = $1`, [intent.loan_id, intent.amount]
  );
  await client.query("UPDATE loan_payment_intents SET status = 'paid', paid_at = now(), updated_at = now() WHERE id = $1 AND status = 'pending'", [intent.id]);
  return true;
}

customerRoutes.get("/payments", requireAuth, async (_req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "customer") return res.status(403).json({ message: "Only customers can view their payment records." });
  try {
    const result = await pool.query(
      `SELECT p.id, p.loan_id AS "loanId", l.loan_number AS "loanNumber", p.amount,
              p.provider, p.reference, p.received_at AS "receivedAt"
         FROM loan_payments p JOIN loans l ON l.id = p.loan_id
         JOIN clients c ON c.id = l.client_id
        WHERE c.user_id = $1 ORDER BY p.received_at DESC LIMIT 200`, [user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load your payment records." });
  }
});

customerRoutes.get("/payment-intents", requireAuth, async (_req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "customer") return res.status(403).json({ message: "Only customers can view their payment attempts." });
  try {
    const result = await pool.query(
      `SELECT i.id, i.loan_id AS "loanId", l.loan_number AS "loanNumber", i.provider_order_id AS "orderId",
              i.amount, i.provider, i.status, i.checkout_url AS "checkoutUrl", i.customer_reference AS "customerReference",
              i.gateway_reference AS "gatewayReference", i.created_at AS "createdAt", i.paid_at AS "paidAt"
         FROM loan_payment_intents i JOIN loans l ON l.id = i.loan_id
         JOIN clients c ON c.id = l.client_id WHERE i.customer_id = $1
        ORDER BY i.created_at DESC LIMIT 100`, [user.id]
    );
    return res.json(result.rows.map((row) => ({
      ...row,
      bank: row.provider === "bank_transfer" && config.bankPaymentName && config.bankPaymentAccount && config.bankPaymentBank
        ? { name: config.bankPaymentName, account: config.bankPaymentAccount, bank: config.bankPaymentBank }
        : null,
    })));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load your payment attempts." });
  }
});

customerRoutes.post("/loans/:loanId/payment-intents", requireAuth, async (req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "customer") return res.status(403).json({ message: "Only customers can initiate loan repayments." });
  const loanId = Number(req.params.loanId);
  const amount = Number(req.body?.amount);
  const provider = req.body?.provider;
  const mobile = typeof req.body?.mobile === "string" ? req.body.mobile.replace(/\D/g, "") : "";
  if (!Number.isInteger(loanId) || loanId < 1) return res.status(400).json({ message: "Invalid loan account." });
  if (!Number.isFinite(amount) || amount <= 0 || !["selcom", "bank_transfer"].includes(provider)) return res.status(400).json({ message: "Choose a payment method and enter a valid amount." });
  if (amount > 1_000_000_000) return res.status(400).json({ message: "Payment amount exceeds the supported limit." });
  if (provider === "selcom" && !/^255\d{9}$/.test(mobile)) return res.status(400).json({ message: "Enter a Tanzanian mobile number starting with 255." });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const loan = await client.query(
      `SELECT l.id, l.loan_number, l.balance, l.status, c.full_name, c.phone
         FROM loans l JOIN clients c ON c.id = l.client_id JOIN users u ON u.id = c.user_id
        WHERE l.id = $1 AND c.user_id = $2 FOR UPDATE OF l`, [loanId, user.id]
    );
    if (!loan.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Loan account not found." }); }
    if (loan.rows[0].status !== "active" || amount > Number(loan.rows[0].balance)) { await client.query("ROLLBACK"); return res.status(400).json({ message: "Payment must be for an active loan and cannot exceed its outstanding balance." }); }
    const orderId = `BML${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
    const intent = await client.query(
      `INSERT INTO loan_payment_intents (loan_id, customer_id, provider, provider_order_id, amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`, [loanId, user.id, provider, orderId, amount]
    );

    if (provider === "bank_transfer") {
      if (!config.bankPaymentName || !config.bankPaymentAccount || !config.bankPaymentBank) {
        await client.query("ROLLBACK");
        return res.status(503).json({ message: "Bank-transfer instructions are not configured. Contact BML for repayment options." });
      }
      await client.query("COMMIT");
      return res.status(201).json({ intentId: intent.rows[0].id, orderId, provider, status: "pending", amount, bank: { name: config.bankPaymentName, account: config.bankPaymentAccount, bank: config.bankPaymentBank }, paymentReference: orderId });
    }

    if (!config.selcomApiKey || !config.selcomApiSecret || !config.selcomVendor) {
      await client.query("ROLLBACK");
      return res.status(503).json({ message: "Selcom payments are not configured. Contact BML or choose bank transfer if available." });
    }
    const [firstName, ...lastParts] = String(loan.rows[0].full_name).split(" ");
    const callbackUrl = config.selcomCollectionWebhookUrl;
    const payload: Record<string, unknown> = {
      vendor: config.selcomVendor,
      order_id: orderId,
      buyer_email: "",
      buyer_name: loan.rows[0].full_name,
      buyer_phone: mobile,
      amount: amount.toFixed(2),
      currency: "TZS",
      payment_methods: "ALL",
      ...(callbackUrl ? { webhook: Buffer.from(callbackUrl).toString("base64") } : {}),
      buyer_remarks: `Loan repayment ${loan.rows[0].loan_number}`,
      merchant_remarks: `BML repayment ${loan.rows[0].loan_number}`,
      no_of_items: 1,
    };
    const signedFields = Object.keys(payload);
    await client.query("COMMIT");
    let response: Response;
    try {
      response = await fetch(`${config.selcomBaseUrl}/v1/checkout/create-order-minimal`, {
        method: "POST", headers: selcomHeaders(payload, signedFields), body: JSON.stringify(payload),
      });
    } catch {
      await pool.query("UPDATE loan_payment_intents SET status = 'ambiguous', failure_message = 'Gateway request timed out; verify status before retrying.', updated_at = now() WHERE id = $1", [intent.rows[0].id]);
      return res.status(202).json({ intentId: intent.rows[0].id, orderId, status: "ambiguous", message: "Payment status is being reconciled. Do not retry this payment yet." });
    }
    const gateway = await response.json() as { result?: string; resultcode?: string; message?: string; data?: Array<{ payment_gateway_url?: string }> };
    const checkoutUrl = gateway.data?.[0]?.payment_gateway_url;
    if (!response.ok || gateway.result !== "SUCCESS" || !checkoutUrl) {
      await pool.query("UPDATE loan_payment_intents SET status = 'failed', failure_message = $2, updated_at = now() WHERE id = $1 AND status = 'pending'", [intent.rows[0].id, gateway.message ?? "Selcom could not create a checkout session."]);
      return res.status(502).json({ message: gateway.message ?? "Selcom could not create a checkout session." });
    }
    await pool.query("UPDATE loan_payment_intents SET checkout_url = $2, updated_at = now() WHERE id = $1", [intent.rows[0].id, checkoutUrl]);
    return res.status(201).json({ intentId: intent.rows[0].id, orderId, provider, status: "pending", amount, checkoutUrl: Buffer.from(checkoutUrl, "base64").toString("utf8") });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return res.status(500).json({ message: "Could not start this repayment." });
  } finally { client.release(); }
});

customerRoutes.post("/payment-intents/:id/bank-reference", requireAuth, async (req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "customer") return res.status(403).json({ message: "Only customers can submit bank-transfer references." });
  const id = Number(req.params.id);
  const reference = typeof req.body?.reference === "string" ? req.body.reference.trim() : "";
  if (!Number.isInteger(id) || id < 1 || reference.length < 4 || reference.length > 120) return res.status(400).json({ message: "Enter a transfer reference between 4 and 120 characters." });
  const result = await pool.query(
    `UPDATE loan_payment_intents i SET customer_reference = $3, updated_at = now()
      FROM clients c WHERE i.id = $1 AND i.customer_id = $2 AND i.provider = 'bank_transfer' AND i.status = 'pending' AND c.user_id = $2 AND c.id = (SELECT client_id FROM loans WHERE id = i.loan_id)
      RETURNING i.id`, [id, user.id, reference]
  );
  if (!result.rowCount) return res.status(404).json({ message: "Pending bank-transfer repayment not found." });
  return res.json({ ok: true, message: "Reference submitted for BML reconciliation." });
});

customerRoutes.post("/selcom/webhook", async (req, res) => {
  const { order_id: orderId, reference, transid, payment_status: paymentStatus, result, amount, channel } = req.body ?? {};
  if (typeof orderId !== "string" || typeof paymentStatus !== "string") return res.status(400).json({ message: "Invalid Selcom callback." });
  if (!config.selcomApiKey || !config.selcomApiSecret) return res.status(503).json({ message: "Selcom callback verification is not configured." });
  const timestamp = req.header("Timestamp") ?? "";
  const digest = req.header("Digest") ?? "";
  const digestMethod = req.header("Digest-Method") ?? "";
  const authorization = req.header("Authorization") ?? "";
  const signedFields = (req.header("Signed-Fields") ?? "").split(",").filter(Boolean);
  const requiredFields = ["transid", "order_id", "reference", "result", "resultcode", "payment_status"];
  if (digestMethod !== "HS256" || authorization !== `SELCOM ${Buffer.from(config.selcomApiKey).toString("base64")}` || requiredFields.some((field) => !signedFields.includes(field))) {
    return res.status(401).json({ message: "Invalid Selcom callback authentication." });
  }
  const signingText = `timestamp=${timestamp}&${signedFields.map((key) => `${key}=${String(req.body[key] ?? "")}`).join("&")}`;
  const expectedDigest = createHmac("sha256", config.selcomApiSecret).update(signingText).digest();
  let receivedDigest: Buffer;
  try { receivedDigest = Buffer.from(digest, "base64"); } catch { return res.status(401).json({ message: "Invalid Selcom callback signature." }); }
  if (receivedDigest.length !== expectedDigest.length || !timingSafeEqual(receivedDigest, expectedDigest)) {
    return res.status(401).json({ message: "Invalid Selcom callback signature." });
  }
  const intentResult = await pool.query("SELECT * FROM loan_payment_intents WHERE provider_order_id = $1 AND provider = 'selcom'", [orderId]);
  if (!intentResult.rowCount) return res.status(404).json({ message: "Payment order not found." });
  const intent = intentResult.rows[0];
  if (Number(amount) !== Number(intent.amount)) return res.status(400).json({ message: "Payment amount does not match this repayment." });
  if (["COMPLETED", "COMPLETE"].includes(paymentStatus.toUpperCase()) && result === "SUCCESS") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT * FROM loan_payment_intents WHERE id = $1 FOR UPDATE", [intent.id]);
      if (locked.rows[0].status !== "paid") {
        if (!transid || !reference) throw new Error("Successful Selcom callback is missing transaction references.");
        await creditRepayment(client, { ...intent, gateway_reference: reference ?? null, provider_transaction_id: transid ?? null, channel: channel ?? null });
      }
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK").catch(() => undefined); console.error(err); return res.status(409).json({ message: "Payment requires manual reconciliation." }); }
    finally { client.release(); }
  } else if (["CANCELLED", "USERCANCELLED", "REJECTED"].includes(paymentStatus.toUpperCase())) {
    await pool.query("UPDATE loan_payment_intents SET status = 'failed', failure_message = $2, updated_at = now() WHERE id = $1 AND status = 'pending'", [intent.id, paymentStatus]);
  } else {
    await pool.query("UPDATE loan_payment_intents SET status = 'ambiguous', updated_at = now() WHERE id = $1 AND status = 'pending'", [intent.id]);
  }
  return res.json({ ok: true });
});

customerRoutes.get("/loans", requireAuth, async (_req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "customer") {
    return res.status(403).json({ message: "Only customers can view their loan accounts." });
  }
  try {
    const result = await pool.query(
      `SELECT l.id, l.loan_number AS "loanNumber", l.product,
              l.principal_amount AS "principalAmount", l.amount_due AS "amountDue",
              l.savings_amount AS "savingsAmount", l.savings_rate AS "savingsRate",
              l.processing_fee_amount AS "processingFeeAmount", l.processing_fee_rate AS "processingFeeRate",
              l.interest_amount AS "interestAmount", l.installment_count AS "installmentCount",
              l.weekly_interest_rate AS "weeklyInterestRate", l.weekly_installment_amount AS "weeklyInstallmentAmount",
              l.final_installment_amount AS "finalInstallmentAmount",
              l.amount_paid AS "amountPaid", l.balance AS "outstandingBalance",
              l.repayment_performance AS "repaymentPerformance", l.arrears,
              l.stage, l.transfer_reference AS "transferReference",
              l.status AS "loanStatus", l.next_due_date AS "nextDueDate"
         FROM loans l
         JOIN clients c ON c.id = l.client_id
        WHERE c.user_id = $1
        ORDER BY l.created_at DESC, l.id DESC`,
      [user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load your loan accounts." });
  }
});

const requestTypes = ["loan", "group_registration", "assessment", "member_performance"] as const;
const requestStatuses = ["new", "reviewing", "visited", "approved", "rejected", "completed"] as const;

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `255${digits.slice(1)}` : digits;
}

customerRoutes.get("/requests", requireAuth, async (_req, res) => {
  const user = res.locals.user as JwtUser;
  try {
    if (user.role === "customer") {
      const result = await pool.query(
        `SELECT id, request_type AS "requestType", summary, details, status,
                created_at AS "createdAt", updated_at AS "updatedAt"
           FROM customer_requests WHERE customer_id = $1
          ORDER BY created_at DESC, id DESC`,
        [user.id]
      );
      return res.json(result.rows);
    }
    if (user.role !== "loan_officer") return res.status(403).json({ message: "Only customers and loan officers can view customer requests." });
    const result = await pool.query(
      `SELECT r.id, r.request_type AS "requestType", r.summary, r.details, r.status,
              r.created_at AS "createdAt", r.updated_at AS "updatedAt",
              c.full_name AS "customerName", c.phone AS "customerPhone"
         FROM customer_requests r
         JOIN users c ON c.id = r.customer_id
        WHERE r.assigned_officer_id = $1 OR r.assigned_officer_id IS NULL
        ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'visited' THEN 2 ELSE 3 END,
                 r.created_at ASC, r.id ASC`,
      [user.id]
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: user.role === "customer" ? "Could not load your requests." : "Could not load customer requests." });
  }
});

customerRoutes.post("/requests", requireAuth, async (req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "customer") return res.status(403).json({ message: "Only customers can submit customer requests." });
  const { requestType, summary, details } = req.body ?? {};
  if (!requestTypes.includes(requestType)) return res.status(400).json({ message: "Choose a valid request type." });
  if (typeof summary !== "string" || summary.trim().length < 3 || summary.trim().length > 160) {
    return res.status(400).json({ message: "Enter a short summary between 3 and 160 characters." });
  }
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return res.status(400).json({ message: "Enter the request details." });
  }
  try {
    if (requestType === "group_registration") {
      const chairpersonPhone = typeof details.chairpersonPhone === "string" ? normalizePhone(details.chairpersonPhone) : "";
      const account = await pool.query("SELECT phone FROM users WHERE id = $1", [user.id]);
      if (!chairpersonPhone || !account.rows[0]?.phone || chairpersonPhone !== normalizePhone(account.rows[0].phone)) {
        return res.status(403).json({ message: "Only the group chairperson can register it. Sign in with the customer account whose phone number is entered as chairperson." });
      }
      const duplicate = await pool.query(
        `SELECT id FROM customer_requests
          WHERE request_type = 'group_registration'
            AND regexp_replace(COALESCE(details->>'chairpersonPhone', ''), '[^0-9]', '', 'g') = $1
          LIMIT 1`,
        [chairpersonPhone]
      );
      if (duplicate.rowCount) return res.status(409).json({ message: "This chairperson has already submitted a group registration. Ask the chairperson to manage the existing group profile." });
    }
    if (requestType === "assessment" || requestType === "loan") {
      const registration = await pool.query(
        `SELECT id FROM customer_requests
          WHERE customer_id = $1 AND request_type = 'group_registration'
          ORDER BY created_at DESC LIMIT 1`, [user.id]
      );
      if (!registration.rowCount) return res.status(409).json({ message: "Submit your group registration before requesting an assessment." });
      if (requestType === "assessment") {
        const currentAssessment = await pool.query(
          `SELECT status FROM customer_requests WHERE customer_id = $1 AND request_type = 'assessment'
            ORDER BY created_at DESC LIMIT 1`, [user.id]
        );
        if (["new", "reviewing", "visited", "approved"].includes(currentAssessment.rows[0]?.status)) {
          return res.status(409).json({ message: "Your current assessment request is still active. Check its status before submitting another." });
        }
      }
      if (requestType === "loan") {
        const approvedAssessment = await pool.query(
          `SELECT id FROM customer_requests
            WHERE customer_id = $1 AND request_type = 'assessment' AND status = 'approved'
            ORDER BY updated_at DESC LIMIT 1`, [user.id]
        );
        if (!approvedAssessment.rowCount) return res.status(409).json({ message: "Your loan request will be available after a loan officer visits and approves your assessment." });
      }
    }
    const client = await pool.query("SELECT id, officer_id FROM clients WHERE user_id = $1", [user.id]);
    const linkedClient = client.rows[0];
    const result = await pool.query(
      `INSERT INTO customer_requests (customer_id, client_id, assigned_officer_id, request_type, summary, details)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING id, request_type AS "requestType", summary, details, status, created_at AS "createdAt"`,
      [user.id, linkedClient?.id ?? null, linkedClient?.officer_id ?? null, requestType, summary.trim(), JSON.stringify(details)]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not submit your request." });
  }
});

customerRoutes.patch("/requests/:id", requireAuth, async (req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role !== "loan_officer") return res.status(403).json({ message: "Only loan officers can update customer requests." });
  const id = Number(req.params.id);
  const status = req.body?.status;
  const visitNotes = typeof req.body?.visitNotes === "string" ? req.body.visitNotes.trim().slice(0, 2000) : "";
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid customer request." });
  if (!requestStatuses.includes(status) || status === "new") return res.status(400).json({ message: "Choose a valid request outcome." });
  try {
    const current = await pool.query(
      `SELECT request_type, status, customer_id, client_id, assigned_officer_id, details
         FROM customer_requests WHERE id = $1 AND (assigned_officer_id = $2 OR assigned_officer_id IS NULL)`,
      [id, user.id]
    );
    if (!current.rowCount) return res.status(404).json({ message: "Request not found or assigned to another officer." });
    const isAssessment = current.rows[0].request_type === "assessment";
    const isLoanRequest = current.rows[0].request_type === "loan";
    const currentStatus = current.rows[0].status as string;
    const allowedNext: Record<string, string[]> = isAssessment
      ? { new: ["reviewing"], reviewing: ["visited"], visited: ["approved", "rejected"] }
      : isLoanRequest
        ? { new: ["reviewing"], reviewing: ["approved", "rejected"] }
        : { new: ["reviewing", "completed"], reviewing: ["completed"] };
    if (!allowedNext[currentStatus]?.includes(status)) {
      return res.status(409).json({ message: "This request has changed or cannot move to that status." });
    }
    if (isAssessment && status === "visited" && !visitNotes) {
      return res.status(400).json({ message: "Enter the visit date and assessment observations before recording the visit." });
    }
    if (isAssessment && status === "approved" && currentStatus !== "visited") {
      return res.status(409).json({ message: "Record the assessment visit before approving it." });
    }
    if (isAssessment && status === "visited" && currentStatus !== "reviewing") {
      return res.status(409).json({ message: "Start reviewing this assessment before recording the visit." });
    }
    if (isAssessment && status === "rejected" && currentStatus !== "visited") {
      return res.status(409).json({ message: "Record the assessment visit before making a decision." });
    }
    if (!isAssessment && !isLoanRequest && ["visited", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Visit and approval outcomes apply only to assessment requests." });
    }
    if (isLoanRequest && status === "approved") {
      const details = current.rows[0].details as Record<string, unknown>;
      const product = details.product;
      const amount = Number(details.amount);
      const clientId = current.rows[0].client_id as number | null;
      if (!["Emergency", "Group", "Business Emergency"].includes(String(product)) || !Number.isFinite(amount) || amount <= 0 || !clientId) {
        return res.status(409).json({ message: "This loan request is missing a valid product, amount, or customer profile. Update the request before approving it." });
      }
      const db = await pool.connect();
      try {
        await db.query("BEGIN");
        const updated = await db.query(
          `UPDATE customer_requests SET status = 'approved', assigned_officer_id = COALESCE(assigned_officer_id, $2), updated_at = now()
            WHERE id = $1 AND status = $3 RETURNING id`,
          [id, user.id, currentStatus]
        );
        if (!updated.rowCount) {
          await db.query("ROLLBACK");
          return res.status(409).json({ message: "This request has changed. Refresh and try again." });
        }
        await db.query(
          `INSERT INTO loans (loan_number, client_id, officer_id, product, stage, status, principal_amount, amount_due)
           VALUES ($1, $2, $3, $4, 'assessment', 'in_progress', $5, $5)`,
          [`BML-REQ-${id}`, clientId, current.rows[0].assigned_officer_id ?? user.id, product, amount]
        );
        await db.query("COMMIT");
        return res.json({ ok: true, id, status: "approved" });
      } catch (err) {
        await db.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        db.release();
      }
    }
    const result = await pool.query(
      `UPDATE customer_requests SET status = $3,
          details = CASE WHEN $4 = '' THEN details ELSE details || jsonb_build_object('officerVisitNotes', $4) END,
          assigned_officer_id = COALESCE(assigned_officer_id, $2), updated_at = now()
        WHERE id = $1 AND status = $5 AND (assigned_officer_id = $2 OR assigned_officer_id IS NULL)
        RETURNING id, status`,
      [id, user.id, status, visitNotes, currentStatus]
    );
    if (!result.rowCount) return res.status(404).json({ message: "Request not found or assigned to another officer." });
    return res.json({ ok: true, ...result.rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not update this request." });
  }
});