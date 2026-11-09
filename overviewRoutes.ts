import { Router } from "express";
import { pool } from "../db";
import { requireAuth, JwtUser } from "../auth";

export const overviewRoutes = Router();
overviewRoutes.get("/", requireAuth, async (_req, res) => {
  const user = res.locals.user as JwtUser;
  if (user.role === "customer") return res.status(403).json({ message: "Customers use the customer portal." });
  const scope = user.role === "loan_officer" ? user.id : null;
  try {
    const [summary, monthly, stages] = await Promise.all([
      pool.query(
        `SELECT (SELECT count(*)::int FROM clients c WHERE ($1::int IS NULL OR c.officer_id = $1)) AS customers,
          (SELECT count(*)::int FROM clients c WHERE ($1::int IS NULL OR c.officer_id = $1) AND c.created_at >= date_trunc('month', now())) AS "customersThisMonth",
          count(*) FILTER (WHERE status = 'active')::int AS "activeLoans",
          count(*) FILTER (WHERE status = 'in_progress')::int AS "pendingApplications",
          COALESCE(sum(balance) FILTER (WHERE status = 'active'), 0)::float AS "portfolioBalance"
         FROM loans WHERE ($1::int IS NULL OR officer_id = $1)`, [scope]
      ),
      pool.query(
        `SELECT to_char(date_trunc('month', created_at), 'Mon') AS label,
           COALESCE(sum(COALESCE(principal_amount, amount_due, 0)), 0)::float AS value
         FROM loans WHERE created_at >= date_trunc('month', now()) - interval '5 months'
           AND ($1::int IS NULL OR officer_id = $1)
         GROUP BY date_trunc('month', created_at) ORDER BY date_trunc('month', created_at)`, [scope]
      ),
      pool.query(
        `SELECT CASE WHEN status = 'active' THEN 'Repayment' WHEN stage = 'approval' THEN 'Committee review'
          WHEN stage = 'disbursement' THEN 'Approved · ready to disburse' ELSE initcap(stage) END AS label,
          count(*)::int AS count FROM loans WHERE ($1::int IS NULL OR officer_id = $1)
         GROUP BY 1 ORDER BY 1`, [scope]
      ),
    ]);
    const s = summary.rows[0];
    const latestMonth = monthly.rows.length ? monthly.rows[monthly.rows.length - 1].value : 0;
    return res.json({ customers: s.customers, customersThisMonth: s.customersThisMonth, activeLoans: s.activeLoans, loansThisMonth: latestMonth, pendingApplications: s.pendingApplications, portfolioBalance: s.portfolioBalance, monthly: monthly.rows, stages: stages.rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Could not load the portfolio overview." });
  }
});
