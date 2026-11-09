import { Router } from "express";
import { pool } from "../db";
import { audit } from "../audit";
import { requireAuth, JwtUser } from "../auth";

export const managementRoutes = Router();
managementRoutes.use(requireAuth, (req, res, next) => {
  const user = res.locals.user as JwtUser;
  if (!["management", "supervisor", "admin"].includes(user.role)) return res.status(403).json({ message: "Officer oversight is not available for your role." });
  next();
});

managementRoutes.get("/workspace", async (_req, res) => {
  const actor = res.locals.user as JwtUser;
  try {
    const [officers, loans, messages] = await Promise.all([
      pool.query(
        `SELECT u.id, u.full_name AS name, u.username, COALESCE(u.phone, '') AS phone,
           (SELECT count(*)::int FROM loans l WHERE l.officer_id = u.id AND l.status = 'active') AS "activeLoans",
           (SELECT count(*)::int FROM loans l WHERE l.officer_id = u.id AND l.status = 'in_progress') AS "inProgress",
           (SELECT COALESCE(sum(l.balance), 0)::float FROM loans l WHERE l.officer_id = u.id AND l.status = 'active') AS "portfolioBalance",
           (SELECT COALESCE(sum(p.amount), 0)::float FROM loan_payments p JOIN loans l ON l.id = p.loan_id WHERE l.officer_id = u.id AND p.received_at >= date_trunc('month', now())) AS "collectedThisMonth"
         FROM users u WHERE u.role = 'loan_officer' AND u.active = TRUE ORDER BY u.full_name`
      ),
      pool.query(
        `SELECT l.id, l.client_id AS "clientId", l.loan_number AS "loanNumber", c.full_name AS "clientName", l.product, l.stage, l.status,
           (SELECT NULLIF(COALESCE(r.details->>'centre', r.details->>'center'), '') FROM customer_requests r
             WHERE r.request_type = 'group_registration' AND (r.client_id = c.id OR r.customer_id = c.user_id)
             ORDER BY r.created_at DESC LIMIT 1) AS centre,
           (SELECT NULLIF(r.details->>'zone', '') FROM customer_requests r
             WHERE r.request_type = 'group_registration' AND (r.client_id = c.id OR r.customer_id = c.user_id)
             ORDER BY r.created_at DESC LIMIT 1) AS zone,
           COALESCE(l.principal_amount, l.amount_due, 0)::float AS amount,
           COALESCE(l.balance, 0)::float AS balance, COALESCE(l.amount_due, 0)::float AS "amountDue",
           COALESCE(l.savings_amount, 0)::float AS "savingsAmount",
           l.savings_rate AS "savingsRate",
           COALESCE(l.processing_fee_amount, 0)::float AS "processingFeeAmount",
           l.processing_fee_rate AS "processingFeeRate",
           COALESCE(l.interest_amount, 0)::float AS "interestAmount",
           l.weekly_interest_rate AS "weeklyInterestRate",
           l.installment_count AS "installmentCount",
           l.weekly_installment_amount AS "weeklyInstallmentAmount",
           l.final_installment_amount AS "finalInstallmentAmount",
           COALESCE(l.amount_paid, 0)::float AS "amountPaid", COALESCE(l.arrears, 0)::float AS arrears,
           l.repayment_performance AS "repaymentPerformance", l.next_due_date AS "nextDueDate",
           l.disbursed_amount AS "disbursedAmount", l.disbursed_at AS "disbursedAt", l.updated_at AS "updatedAt",
           l.officer_id AS "officerId", COALESCE(u.full_name, 'Unassigned') AS "officerName",
           COALESCE(u.phone, '') AS "officerPhone"
         FROM loans l JOIN clients c ON c.id = l.client_id LEFT JOIN users u ON u.id = l.officer_id
        ORDER BY l.updated_at DESC, l.id DESC LIMIT 1000`
      ),
      pool.query(
        `SELECT m.id, m.subject, m.body, m.sent_at AS "sentAt", u.id AS "officerId", u.full_name AS "officerName"
           FROM user_messages m JOIN users u ON u.id = m.recipient_id
          WHERE m.sender_id = $1 ORDER BY m.sent_at DESC LIMIT 20`,
        [actor.id]
      ),
    ]);
    return res.json({ officers: officers.rows, loans: loans.rows, messages: messages.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load officer oversight." });
  }
});

managementRoutes.post("/messages", async (req, res) => {
  const actor = res.locals.user as JwtUser;
  const { officerId, subject, body } = req.body ?? {};
  const id = Number(officerId);
  if (!Number.isInteger(id) || id < 1 || typeof subject !== "string" || typeof body !== "string") return res.status(400).json({ message: "Choose an officer and enter a subject and message." });
  const cleanSubject = subject.trim(); const cleanBody = body.trim();
  if (cleanSubject.length < 3 || cleanSubject.length > 100 || cleanBody.length < 5 || cleanBody.length > 1500) return res.status(400).json({ message: "Subject must be 3–100 characters and message 5–1,500 characters." });
  try {
    const recipient = await pool.query("SELECT id, full_name FROM users WHERE id = $1 AND role = 'loan_officer' AND active = TRUE", [id]);
    if (!recipient.rowCount) return res.status(404).json({ message: "Active loan officer not found." });
    await pool.query("INSERT INTO user_messages (sender_id, recipient_id, subject, body) VALUES ($1, $2, $3, $4)", [actor.id, id, cleanSubject, cleanBody]);
    await audit(actor.username, "Officer update sent", String(id), cleanSubject);
    return res.status(201).json({ ok: true, officerName: recipient.rows[0].full_name });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not send the officer update." });
  }
});
