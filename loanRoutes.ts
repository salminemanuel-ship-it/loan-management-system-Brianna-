import { Router } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { pool } from "../db";
import { audit } from "../audit";
import { requireAuth, JwtUser } from "../auth";
import { config } from "../config";
import { calculateRepaymentTerms } from "../repaymentTerms";

export const loanRoutes = Router();
loanRoutes.use(requireAuth);

const loanSelect = `SELECT l.id, l.loan_number AS "loanNumber", l.client_id AS "clientId",
  c.full_name AS "clientName", c.phone AS "clientPhone", c.business_type AS "businessType",
  c.business_location AS "businessLocation", l.product, l.stage, l.status, l.principal_amount AS "principalAmount",
  l.amount_due AS "amountDue", l.amount_paid AS "amountPaid", l.repayment_performance AS "repaymentPerformance", l.balance,
  l.savings_amount AS "savingsAmount", l.processing_fee_amount AS "processingFeeAmount", l.interest_amount AS "interestAmount",
  l.savings_rate AS "savingsRate", l.processing_fee_rate AS "processingFeeRate", l.weekly_interest_rate AS "weeklyInterestRate",
  l.installment_count AS "installmentCount", l.weekly_installment_amount AS "weeklyInstallmentAmount", l.final_installment_amount AS "finalInstallmentAmount",
  l.next_due_date AS "nextDueDate", l.transfer_reference AS "transferReference", l.disbursed_amount AS "disbursedAmount",
  COALESCE(l.arrears, 0) AS arrears,
  CASE WHEN COALESCE(l.first_due_date, l.next_due_date) <= CURRENT_DATE THEN GREATEST((CASE
    WHEN l.first_due_date IS NULL THEN COALESCE(l.weekly_installment_amount, l.amount_due, 0)
    WHEN LEAST(l.installment_count, FLOOR((CURRENT_DATE - l.first_due_date)::numeric / 7)::int + 1) >= l.installment_count THEN COALESCE(l.amount_due, 0)
    ELSE LEAST(l.installment_count, FLOOR((CURRENT_DATE - l.first_due_date)::numeric / 7)::int + 1) * COALESCE(l.weekly_installment_amount, 0)
  END) - COALESCE(l.amount_paid, 0), 0) ELSE 0 END AS "overdueAmount",
  (SELECT MAX(p.received_at) FROM loan_payments p WHERE p.loan_id = l.id) AS "paymentDate",
  l.created_at AS "createdAt", l.updated_at AS "updatedAt", l.officer_id AS "officerId",
  COALESCE(u.full_name, 'Unassigned') AS "officerName", COALESCE(u.phone, '') AS "officerPhone"
  FROM loans l JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = l.officer_id`;

function selcomHeaders(payload: Record<string, unknown>, signedFields: string[]) {
  const timestamp = new Date().toISOString().replace("Z", "+00:00");
  const signingText = `timestamp=${timestamp}&${signedFields.map((key) => `${key}=${String(payload[key] ?? "")}`).join("&")}`;
  const digest = createHmac("sha256", config.selcomApiSecret!).update(signingText).digest("base64");
  return { "Content-Type": "application/json", Authorization: `SELCOM ${Buffer.from(config.selcomApiKey!).toString("base64")}`, "Digest-Method": "HS256", Digest: digest, Timestamp: timestamp, "Signed-Fields": signedFields.join(",") };
}

loanRoutes.get("/decisions", async (_req, res) => {
  const actor = res.locals.user as JwtUser;
  if (actor.role !== "committee") return res.status(403).json({ message: "Committee decision records are restricted to Credit Committee members." });
  try {
    const result = await pool.query(
      `SELECT d.id, d.loan_id AS "loanId", l.loan_number AS "loanNumber", c.full_name AS "clientName",
              l.product, COALESCE(l.principal_amount, l.amount_due, 0) AS amount,
              d.decision, d.rationale, COALESCE(u.full_name, u.username) AS "decidedBy",
              d.decided_at AS "decidedAt", COALESCE(s.full_name, s.username) AS "signedBy", d.signed_at AS "signedAt"
         FROM loan_decision_records d
         JOIN loans l ON l.id = d.loan_id
         JOIN clients c ON c.id = l.client_id
         JOIN users u ON u.id = d.reviewer_id
         LEFT JOIN users s ON s.id = d.signer_id
        ORDER BY d.decided_at DESC, d.id DESC LIMIT 500`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load committee decision records." });
  }
});

loanRoutes.get("/bank-transfers", async (_req, res) => {
  const actor = res.locals.user as JwtUser;
  if (!["finance", "supervisor", "management"].includes(actor.role)) return res.status(403).json({ message: "Bank-transfer reconciliation is restricted to Finance and authorized managers." });
  try {
    const result = await pool.query(
      `SELECT i.id, i.loan_id AS "loanId", l.loan_number AS "loanNumber", c.full_name AS "clientName",
              i.amount, i.provider_order_id AS "paymentReference", i.customer_reference AS "transferReference",
              i.created_at AS "submittedAt", u.phone AS "customerPhone"
         FROM loan_payment_intents i JOIN loans l ON l.id = i.loan_id
         JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = c.user_id
        WHERE i.provider = 'bank_transfer' AND i.status = 'pending' AND i.customer_reference IS NOT NULL
        ORDER BY i.created_at ASC LIMIT 500`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load bank transfers for reconciliation." });
  }
});

loanRoutes.post("/bank-transfers/:id/confirm", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  if (!["finance", "supervisor", "management"].includes(actor.role)) return res.status(403).json({ message: "Only Finance and authorized managers can confirm bank transfers." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid bank transfer." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query("SELECT * FROM loan_payment_intents WHERE id = $1 AND provider = 'bank_transfer' FOR UPDATE", [id]);
    if (!result.rowCount || result.rows[0].status !== "pending" || !result.rows[0].customer_reference) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "This bank transfer is not awaiting confirmation." });
    }
    const intent = result.rows[0];
    const loan = await client.query("SELECT balance, status, amount_due, principal_amount, amount_paid, loan_number FROM loans WHERE id = $1 FOR UPDATE", [intent.loan_id]);
    if (!loan.rowCount || loan.rows[0].status !== "active" || Number(intent.amount) > Number(loan.rows[0].balance)) {
      await client.query("ROLLBACK");
      return res.status(409).json({ message: "The loan balance changed; reconcile this transfer manually." });
    }
    await client.query(
      `INSERT INTO loan_payments (loan_id, amount, reference, received_by, provider, provider_transaction_id)
       VALUES ($1, $2, $3, $4, 'bank_transfer', $5)`,
      [intent.loan_id, intent.amount, intent.customer_reference, actor.id, intent.provider_order_id]
    );
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
    await client.query("UPDATE loan_payment_intents SET status = 'paid', gateway_reference = customer_reference, paid_at = now(), updated_at = now() WHERE id = $1", [id]);
    await client.query("COMMIT");
    await audit(actor.username, "Bank repayment reconciled", loan.rows[0].loan_number, `Confirmed ${intent.amount} TZS; transfer reference ${intent.customer_reference}`);
    return res.json({ ok: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return res.status(500).json({ message: "Could not confirm this bank transfer." });
  } finally { client.release(); }
});

loanRoutes.post("/:id/payout", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  if (!["finance", "supervisor", "management"].includes(actor.role)) return res.status(403).json({ message: "Loan payouts are restricted to Finance and authorized managers." });
  const id = Number(req.params.id);
  const amount = Number(req.body?.amount);
  const provider = req.body?.provider;
  const destination = typeof req.body?.destination === "string" ? req.body.destination.trim() : "";
  const destinationName = typeof req.body?.destinationName === "string" ? req.body.destinationName.trim() : "";
  const bankCode = typeof req.body?.bankCode === "string" ? req.body.bankCode.trim().toUpperCase() : "";
  const nextDueDate = typeof req.body?.nextDueDate === "string" ? req.body.nextDueDate : "";
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid loan record." });
  if (!Number.isFinite(amount) || amount <= 0 || !["selcom_wallet", "selcom_bank"].includes(provider)) return res.status(400).json({ message: "Choose a payout route and enter a valid amount." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate) || Number.isNaN(Date.parse(`${nextDueDate}T00:00:00Z`))) return res.status(400).json({ message: "Choose the first repayment due date." });
  if (destination.length < 6 || destination.length > 80 || destinationName.length < 2 || destinationName.length > 120) return res.status(400).json({ message: "Enter valid customer payout destination details." });
  if (provider === "selcom_wallet" && !/^255\d{9}$/.test(destination)) return res.status(400).json({ message: "Enter a Tanzanian wallet number starting with 255." });
  if (provider === "selcom_bank" && !/^[A-Z0-9]{3,20}$/.test(bankCode)) return res.status(400).json({ message: "Enter a valid Selcom bank code." });
  if (!config.selcomApiKey || !config.selcomApiSecret || !config.selcomVendor || !config.selcomFloatPin) return res.status(503).json({ message: "Selcom payout credentials are not configured. Use staff-confirmed transfer instead." });

  const client = await pool.connect();
  let intent: Record<string, unknown>;
  let loan: Record<string, unknown>;
  const transactionId = `BMLP${Date.now()}${randomUUID().replace(/-/g, "").slice(0, 10)}`;
  try {
    await client.query("BEGIN");
    const record = await client.query(
      `SELECT l.id, l.loan_number, l.stage, l.status, l.principal_amount, l.amount_due, c.full_name, c.phone
         FROM loans l JOIN clients c ON c.id = l.client_id WHERE l.id = $1 FOR UPDATE OF l`, [id]
    );
    if (!record.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Loan record not found." }); }
    loan = record.rows[0];
    const approvedAmount = Number(loan.principal_amount ?? loan.amount_due ?? 0);
    if (loan.stage !== "disbursement" || loan.status !== "in_progress" || amount > approvedAmount) { await client.query("ROLLBACK"); return res.status(409).json({ message: "This loan is not ready for this payout amount." }); }
    const repaymentTerms = calculateRepaymentTerms(amount);
    const existing = await client.query("SELECT id FROM loan_payout_intents WHERE loan_id = $1 AND status IN ('pending','ambiguous')", [id]);
    if (existing.rowCount) { await client.query("ROLLBACK"); return res.status(409).json({ message: "A payout is already pending. Check its status before retrying." }); }
    const saved = await client.query(
      `INSERT INTO loan_payout_intents (loan_id, initiated_by, provider, transaction_id, amount, principal_amount, destination, destination_name, destination_bank_code, next_due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, actor.id, provider, transactionId, repaymentTerms.netDisbursedAmount, repaymentTerms.principalAmount, destination, destinationName, provider === "selcom_bank" ? bankCode : null, nextDueDate]
    );
    intent = saved.rows[0];
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return res.status(500).json({ message: "Could not prepare the payout." });
  } finally { client.release(); }

  const payload: Record<string, unknown> = provider === "selcom_wallet" ? {
    transid: transactionId, utilitycode: "CASHIN", utilityref: destination, amount: Number(intent!.amount).toFixed(2),
    vendor: config.selcomVendor, pin: config.selcomFloatPin, msisdn: loan!.phone ?? "",
  } : {
    transid: transactionId, recipientFiCode: bankCode, recipientAccount: destination, recipientName: destinationName,
    senderAccount: config.selcomPayoutSenderAccount ?? config.selcomVendor, senderName: config.selcomPayoutSenderName ?? "Brianna Microfinance",
    amount: Number(intent!.amount).toFixed(2), vendor: config.selcomBankVendor ?? config.selcomVendor, pin: config.selcomFloatPin,
    msisdn: loan!.phone ?? "", purpose: "LOAN", remarks: `BML loan ${loan!.loan_number}`,
  };
  const signedFields = provider === "selcom_wallet"
    ? ["transid", "utilitycode", "utilityref", "amount", "vendor", "pin", "msisdn"]
    : ["transid", "recipientFiCode", "recipientAccount", "recipientName", "senderAccount", "senderName", "amount", "vendor", "pin", "msisdn", "purpose", "remarks"];
  try {
    const response = await fetch(`${config.selcomBaseUrl}${provider === "selcom_wallet" ? "/v1/walletcashin/process" : "/v1/qwiksend/process"}`, {
      method: "POST", headers: selcomHeaders(payload, signedFields), body: JSON.stringify(payload),
    });
    const gateway = await response.json() as { result?: string; resultcode?: string; reference?: string; message?: string };
    if (!response.ok || !["SUCCESS", "PENDING", "INPROGRESS"].includes(String(gateway.result).toUpperCase())) {
      await pool.query("UPDATE loan_payout_intents SET status = 'failed', failure_message = $2, updated_at = now() WHERE id = $1 AND status = 'pending'", [intent!.id, gateway.message ?? "Selcom payout was rejected."]);
      return res.status(502).json({ message: gateway.message ?? "Selcom payout was rejected." });
    }
    await pool.query("UPDATE loan_payout_intents SET provider_reference = $2, status = 'ambiguous', updated_at = now() WHERE id = $1", [intent!.id, gateway.reference ?? null]);
    return res.status(202).json({ ok: true, status: gateway.result === "SUCCESS" ? "awaiting_confirmation" : "ambiguous", transactionId, message: "Payout submitted. The loan activates only after provider confirmation." });
  } catch {
    await pool.query("UPDATE loan_payout_intents SET status = 'ambiguous', failure_message = 'Gateway timeout; verify status before retrying.', updated_at = now() WHERE id = $1", [intent!.id]);
    return res.status(202).json({ ok: true, status: "ambiguous", transactionId, message: "Payout status is uncertain. Verify with Selcom before retrying." });
  }
});

loanRoutes.get("/payouts/pending", async (_req, res) => {
  const actor = res.locals.user as JwtUser;
  if (!["finance", "supervisor", "management"].includes(actor.role)) return res.status(403).json({ message: "Payout reconciliation is restricted to Finance and authorized managers." });
  try {
    const result = await pool.query(
      `SELECT p.id, p.loan_id AS "loanId", l.loan_number AS "loanNumber", c.full_name AS "clientName",
              p.provider, p.transaction_id AS "transactionId", p.amount, p.destination, p.destination_name AS "destinationName",
              p.status, p.created_at AS "createdAt"
         FROM loan_payout_intents p JOIN loans l ON l.id = p.loan_id JOIN clients c ON c.id = l.client_id
        WHERE p.status IN ('pending','ambiguous') ORDER BY p.created_at ASC LIMIT 200`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load pending payout transactions." });
  }
});

loanRoutes.post("/payouts/:transactionId/reconcile", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  if (!["finance", "supervisor", "management"].includes(actor.role)) return res.status(403).json({ message: "Only Finance and authorized managers can reconcile payouts." });
  const transactionId = String(req.params.transactionId ?? "");
  if (!transactionId) return res.status(400).json({ message: "Missing payout transaction ID." });
  if (!config.selcomApiKey || !config.selcomApiSecret) return res.status(503).json({ message: "Selcom status queries are not configured." });
  const initial = await pool.query("SELECT * FROM loan_payout_intents WHERE transaction_id = $1", [transactionId]);
  if (!initial.rowCount) return res.status(404).json({ message: "Payout transaction not found." });
  const statusPath = initial.rows[0].provider === "selcom_wallet" ? "/v1/walletcashin/query" : "/v1/qwiksend/query";
  const statusPayload = initial.rows[0].provider === "selcom_wallet" ? { transid: transactionId } : { transid: transactionId };
  let statusResponse: Response;
  try {
    statusResponse = await fetch(`${config.selcomBaseUrl}${statusPath}?transid=${encodeURIComponent(transactionId)}`, {
      headers: selcomHeaders(statusPayload, ["transid"]),
    });
  } catch {
    return res.status(503).json({ message: "Could not reach Selcom to query this payout." });
  }
  const gateway = await statusResponse.json() as { result?: string; resultcode?: string; reference?: string; message?: string };
  if (!statusResponse.ok) return res.status(502).json({ message: gateway.message ?? "Selcom payout status query failed." });
  const result = String(gateway.result ?? "").toUpperCase();
  if (result !== "SUCCESS" && !["FAIL", "FAILED"].includes(result)) {
    await pool.query("UPDATE loan_payout_intents SET status = 'ambiguous', updated_at = now() WHERE transaction_id = $1 AND status <> 'paid'", [transactionId]);
    return res.json({ ok: true, status: result || "AMBIGUOUS", message: "Payout is not confirmed. It will remain unreleased until Selcom confirms success." });
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query("SELECT * FROM loan_payout_intents WHERE transaction_id = $1 FOR UPDATE", [transactionId]);
    if (!found.rowCount) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Payout transaction not found." }); }
    const payout = found.rows[0];
    if (payout.status === "paid") { await client.query("COMMIT"); return res.json({ ok: true }); }
    if (result === "SUCCESS" && gateway.resultcode === "000") {
      const repaymentTerms = calculateRepaymentTerms(Number(payout.principal_amount ?? payout.amount));
      const updated = await client.query(
        `UPDATE loans SET stage = 'repayment', status = 'active', transfer_reference = $2, disbursed_amount = $3, disbursed_at = now(),
            principal_amount = $4, savings_amount = $5, savings_rate = 0.05,
            processing_fee_amount = $6, processing_fee_rate = 0.10, interest_amount = $7, weekly_interest_rate = 0.0475,
            installment_count = $8, weekly_installment_amount = $9, final_installment_amount = $10,
            amount_due = $11, amount_paid = 0, arrears = 0, repayment_performance = 0, balance = $11,
            first_due_date = $12, next_due_date = $12, updated_at = now()
         WHERE id = $1 AND stage = 'disbursement' AND status = 'in_progress' RETURNING loan_number`,
        [payout.loan_id, gateway.reference ?? payout.provider_reference ?? transactionId, payout.amount,
          repaymentTerms.principalAmount, repaymentTerms.savingsAmount, repaymentTerms.processingFeeAmount,
          repaymentTerms.interestAmount, repaymentTerms.installmentCount, repaymentTerms.weeklyInstallmentAmount,
          repaymentTerms.finalInstallmentAmount, repaymentTerms.amountDue, payout.next_due_date]
      );
      if (!updated.rowCount) throw new Error("Loan changed before payout confirmation.");
        await client.query("UPDATE loan_payout_intents SET status = 'paid', provider_reference = $2, paid_at = now(), updated_at = now() WHERE id = $1", [payout.id, gateway.reference ?? null]);
      await client.query("COMMIT");
        await audit(actor.username, "Loan payout confirmed", updated.rows[0].loan_number, `Payout transaction ${transactionId}; provider reference ${gateway.reference ?? ""}`);
      return res.json({ ok: true });
    }
    const status = ["FAIL", "FAILED"].includes(result) ? "failed" : "ambiguous";
      await client.query("UPDATE loan_payout_intents SET status = $2, failure_message = $3, updated_at = now() WHERE id = $1", [payout.id, status, gateway.message ?? result]);
    await client.query("COMMIT");
      return res.json({ ok: true, status });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return res.status(409).json({ message: "Payout requires manual reconciliation." });
  } finally { client.release(); }
});

loanRoutes.get("/", async (_req, res) => {
  const actor = res.locals.user as JwtUser;
  if (actor.role === "customer") return res.status(403).json({ message: "Customers use the customer portal to view their loans." });
  try {
    const result = await pool.query(
      `${loanSelect} ${actor.role === "loan_officer" ? "WHERE l.officer_id = $1" : ""} ORDER BY l.updated_at DESC, l.id DESC LIMIT 500`,
      actor.role === "loan_officer" ? [actor.id] : []
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load loan records." });
  }
});

loanRoutes.post("/:id/action", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  const id = Number(req.params.id);
  const { action, transferReference, nextDueDate, amount, reference, decisionNote, disbursedAmount, electronicSignature } = req.body ?? {};
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ message: "Invalid loan record." });
  try {
    const result = await pool.query(
      "SELECT id, officer_id, stage, status, balance, principal_amount, amount_due, amount_paid, loan_number FROM loans WHERE id = $1",
      [id]
    );
    const loan = result.rows[0];
    if (!loan) return res.status(404).json({ message: "Loan record not found." });
    if (actor.role === "loan_officer" && loan.officer_id !== actor.id) return res.status(403).json({ message: "You can only update loans assigned to you." });

    let nextStage: string | undefined;
    let detail = "";
    if (action === "submit") {
      if (actor.role !== "loan_officer" || loan.stage !== "assessment") return res.status(403).json({ message: "This loan cannot be submitted by your role." });
      nextStage = "verification"; detail = "Submitted for supervisor verification";
    } else if (action === "verify") {
      if (actor.role !== "supervisor" || loan.stage !== "verification") return res.status(403).json({ message: "This loan is not available for supervisor verification." });
      nextStage = "approval"; detail = "Verified and sent to Credit Committee";
    } else if (action === "approve") {
      if (actor.role !== "committee" || loan.stage !== "approval") return res.status(403).json({ message: "This loan is not available for committee approval." });
      if (typeof decisionNote !== "string" || decisionNote.trim().length < 10 || decisionNote.trim().length > 1000) return res.status(400).json({ message: "Enter a decision rationale between 10 and 1000 characters." });
      if (electronicSignature !== true) return res.status(400).json({ message: "Electronic signing is required." });
      nextStage = "disbursement"; detail = `Approved by Credit Committee; rationale: ${decisionNote.trim()}`;
    } else if (action === "return") {
      if (!["supervisor", "committee"].includes(actor.role) || !["verification", "approval"].includes(loan.stage)) return res.status(403).json({ message: "This loan cannot be returned by your role." });
      if (actor.role === "committee" && (typeof decisionNote !== "string" || decisionNote.trim().length < 10 || decisionNote.trim().length > 1000)) return res.status(400).json({ message: "Enter a decision rationale between 10 and 1000 characters." });
      if (actor.role === "committee" && electronicSignature !== true) return res.status(400).json({ message: "Electronic signing is required." });
      nextStage = "assessment"; detail = `Returned to loan officer from ${loan.stage}${actor.role === "committee" ? `; rationale: ${decisionNote.trim()}` : ""}`;
    } else if (action === "disburse") {
      if (!["finance", "supervisor", "management"].includes(actor.role) || loan.stage !== "disbursement") return res.status(403).json({ message: "This loan is not ready for disbursement by your role." });
      const pendingPayout = await pool.query("SELECT id FROM loan_payout_intents WHERE loan_id = $1 AND status IN ('pending','ambiguous') LIMIT 1", [id]);
      if (pendingPayout.rowCount) return res.status(409).json({ message: "A provider payout is pending or uncertain. Reconcile it before recording a separate transfer." });
      if (typeof transferReference !== "string" || transferReference.trim().length < 3 || transferReference.trim().length > 120) return res.status(400).json({ message: "Enter a transfer reference between 3 and 120 characters." });
      if (typeof nextDueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(nextDueDate) || Number.isNaN(Date.parse(`${nextDueDate}T00:00:00Z`))) return res.status(400).json({ message: "Choose a valid next repayment date." });
      const actualDisbursedAmount = Number(disbursedAmount);
      if (!Number.isFinite(actualDisbursedAmount) || actualDisbursedAmount <= 0 || actualDisbursedAmount > Number(loan.principal_amount ?? loan.amount_due ?? 0)) return res.status(400).json({ message: "Enter a disbursed amount greater than zero and no more than the approved amount." });
      const repaymentTerms = calculateRepaymentTerms(actualDisbursedAmount);
      const active = await pool.query(
        `UPDATE loans SET stage = 'repayment', status = 'active', transfer_reference = $2, disbursed_amount = $3, disbursed_at = now(),
          principal_amount = $4, savings_amount = $5, savings_rate = 0.05,
          processing_fee_amount = $6, processing_fee_rate = 0.10, interest_amount = $7, weekly_interest_rate = 0.0475,
          installment_count = $8, weekly_installment_amount = $9, final_installment_amount = $10,
          amount_due = $11, amount_paid = 0, arrears = 0, repayment_performance = 0, balance = $11,
          first_due_date = $12, next_due_date = $12, updated_at = now()
         WHERE id = $1 AND stage = 'disbursement' AND status = 'in_progress' RETURNING id`,
        [id, transferReference.trim(), repaymentTerms.netDisbursedAmount, repaymentTerms.principalAmount,
          repaymentTerms.savingsAmount, repaymentTerms.processingFeeAmount, repaymentTerms.interestAmount,
          repaymentTerms.installmentCount, repaymentTerms.weeklyInstallmentAmount, repaymentTerms.finalInstallmentAmount,
          repaymentTerms.amountDue, nextDueDate]
      );
      if (!active.rowCount) return res.status(409).json({ message: "This loan changed before disbursement could be recorded. Refresh and try again." });
      detail = `Disbursement recorded: ${transferReference.trim()}; next due ${nextDueDate}`;
      await audit(actor.username, "Loan disbursed", loan.loan_number, detail);
      return res.json({ ok: true, id: active.rows[0].id });
    } else if (action === "repay") {
      if (!["loan_officer", "finance", "supervisor", "management"].includes(actor.role) || loan.status !== "active") return res.status(403).json({ message: "This active loan is not available for repayment recording." });
      const payment = Number(amount);
      if (!Number.isFinite(payment) || payment <= 0 || payment > Number(loan.balance)) return res.status(400).json({ message: "Enter a payment greater than zero and no more than the outstanding balance." });
      const cleanReference = typeof reference === "string" ? reference.trim().slice(0, 120) : "";
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query("SELECT balance, status, amount_due, principal_amount, amount_paid, first_due_date, installment_count, weekly_installment_amount, final_installment_amount FROM loans WHERE id = $1 FOR UPDATE", [id]);
        if (!current.rowCount || current.rows[0].status !== "active") {
          await client.query("ROLLBACK");
          return res.status(409).json({ message: "This loan is no longer active. Refresh the records." });
        }
        if (payment > Number(current.rows[0].balance)) {
          await client.query("ROLLBACK");
          return res.status(400).json({ message: "The payment is greater than the current outstanding balance. Refresh and try again." });
        }
        await client.query("INSERT INTO loan_payments (loan_id, amount, reference, received_by) VALUES ($1, $2, $3, $4)", [id, payment, cleanReference, actor.id]);
        await client.query(
        `UPDATE loans SET balance = GREATEST(balance - $2, 0),
             amount_paid = COALESCE(amount_paid, 0) + $2,
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
             updated_at = now() WHERE id = $1`, [id, payment]
        );
        await client.query("COMMIT");
      } catch (err) { await client.query("ROLLBACK").catch(() => undefined); throw err; }
      finally { client.release(); }
      detail = `Payment recorded: ${payment.toFixed(2)}${cleanReference ? `; reference ${cleanReference}` : ""}`;
      await audit(actor.username, "Loan repayment recorded", loan.loan_number, detail);
      return res.json({ ok: true });
    } else {
      return res.status(400).json({ message: "Unknown loan action." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query("UPDATE loans SET stage = $2, updated_at = now() WHERE id = $1 AND stage = $3 AND status = 'in_progress' RETURNING id", [id, nextStage, loan.stage]);
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: "This loan stage changed before the action was recorded. Refresh and try again." });
      }
      if (actor.role === "committee" && (action === "approve" || action === "return")) {
        await client.query(
          "INSERT INTO loan_decision_records (loan_id, reviewer_id, decision, rationale, signer_id, signed_at) VALUES ($1, $2, $3, $4, $5, now())",
          [id, actor.id, action === "approve" ? "approved" : "returned", decisionNote.trim(), actor.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
    await audit(actor.username, actor.role === "committee" ? "Committee decision signed" : "Loan stage updated", loan.loan_number, detail);
    return res.json({ ok: true, stage: nextStage });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not update this loan." });
  }
});
