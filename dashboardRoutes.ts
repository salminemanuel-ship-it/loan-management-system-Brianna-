import { Router } from "express";
import { pool } from "../db";
import { requireAuth, JwtUser, Role } from "../auth";

export const dashboardRoutes = Router();

const roleLabel: Record<Exclude<Role, "customer">, string> = {
  loan_officer: "Loan Officer view",
  supervisor: "Supervisor view",
  committee: "Credit Committee view",
  finance: "Finance officer view",
  management: "Management view",
  admin: "System administrator view",
};

const nextScreen: Record<Exclude<Role, "customer">, string> = {
  loan_officer: "the screen for the selected phase",
  supervisor: "B1 Supervisor verification",
  committee: "B2 Credit Committee review",
  finance: "C1 Loan account creation",
  management: "E3 PAR tracker and portfolio",
  admin: "System settings",
};

function millions(n: number): string {
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%";
}

dashboardRoutes.get("/", requireAuth, async (_req, res) => {
  try {
    const user = res.locals.user as JwtUser;
    if (user.role === "customer") {
      return res.status(403).json({ message: "Customer accounts use the customer portal." });
    }
    // Loan officers see their own portfolio. Other roles see everything.
    const scope = user.role === "loan_officer" ? user.id : null;

    const statsQuery = await pool.query(
      `SELECT
         (SELECT count(*) FROM clients WHERE ($1::int IS NULL OR officer_id = $1))::int AS clients,
         count(*) FILTER (WHERE status = 'active' AND next_due_date = CURRENT_DATE)::int AS due_today,
         count(*) FILTER (WHERE status = 'active' AND next_due_date < CURRENT_DATE)::int AS overdue,
         count(*) FILTER (WHERE status = 'in_progress')::int AS in_progress,
         count(*) FILTER (WHERE stage = 'verification')::int AS awaiting_verification,
         count(*) FILTER (WHERE stage = 'approval')::int AS awaiting_committee,
         count(*) FILTER (WHERE stage = 'disbursement')::int AS ready_to_disburse,
         count(*) FILTER (WHERE status = 'active')::int AS active_loans,
         COALESCE(sum(balance) FILTER (WHERE status = 'active'), 0)::float AS portfolio,
         COALESCE(sum(COALESCE(amount_due, principal_amount, 0)) FILTER (WHERE status IN ('active','closed')), 0)::float AS repayment_due,
         COALESCE((SELECT sum(p.amount)::float FROM loan_payments p JOIN loans paid_loan ON paid_loan.id = p.loan_id
                   WHERE paid_loan.status IN ('active','closed') AND ($1::int IS NULL OR paid_loan.officer_id = $1)), 0)::float AS repayment_collected,
         COALESCE(sum(balance) FILTER (WHERE status = 'active' AND next_due_date < CURRENT_DATE), 0)::float AS par1,
         COALESCE(sum(balance) FILTER (WHERE status = 'active' AND next_due_date <= CURRENT_DATE - 30), 0)::float AS par30,
         (SELECT count(*)::int FROM audit_log WHERE action = 'Loan stage updated' AND detail = 'Verified and sent to Credit Committee' AND at >= date_trunc('day', now())) AS verified_today,
         (SELECT count(*)::int FROM audit_log WHERE action = 'Loan stage updated' AND detail LIKE 'Returned to loan officer%' AND at >= date_trunc('day', now())) AS returned_today,
         (SELECT count(*)::int FROM users WHERE role = 'loan_officer' AND active = TRUE) AS officers
       FROM loans
       WHERE ($1::int IS NULL OR officer_id = $1)`,
      [scope]
    );
    const s = statsQuery.rows[0];
    const adminStatsQuery = user.role === "admin" ? await pool.query(
      `SELECT
         count(*) FILTER (WHERE active)::int AS active_users,
         count(*) FILTER (WHERE active AND role = 'customer')::int AS customers,
         count(*) FILTER (WHERE active AND role = 'loan_officer')::int AS loan_officers,
         count(*) FILTER (WHERE admin_locked OR locked_until > now())::int AS locked_accounts
       FROM users`
    ) : null;

    const stats = {
      loan_officer: [
        { label: "My clients", value: s.clients, highlight: true },
        { label: "Due today", value: s.due_today },
        { label: "Overdue", value: s.overdue },
        { label: "In progress", value: s.in_progress },
        { label: "Amount due (TZS)", value: `TZS ${Number(s.repayment_due).toLocaleString("en-US")}` },
        { label: "Amount collected (TZS)", value: `TZS ${Number(s.repayment_collected).toLocaleString("en-US")}` },
        { label: "Outstanding portfolio (TZS)", value: `TZS ${Number(s.portfolio).toLocaleString("en-US")}` },
         { label: "Payment performance", value: Number(s.repayment_due) > 0 ? `${Math.min(100, Number(s.repayment_collected) / Number(s.repayment_due) * 100).toFixed(1)}%` : "0.0%" },
        { label: "PAR 30 days", value: percent(s.par30, s.portfolio) },
      ],
      supervisor: [
        { label: "Awaiting verification", value: s.awaiting_verification, highlight: true },
        { label: "Due today", value: s.due_today },
        { label: "Overdue", value: s.overdue },
        { label: "In progress", value: s.in_progress },
      ],
      committee: [
        { label: "Awaiting committee review", value: s.awaiting_committee, highlight: true },
        { label: "Verified today", value: s.verified_today },
        { label: "Returned today", value: s.returned_today },
        { label: "Active officers", value: s.officers },
      ],
      finance: [
        { label: "Ready to disburse", value: s.ready_to_disburse, highlight: true },
        { label: "Active loans", value: s.active_loans },
        { label: "Due today", value: s.due_today },
        { label: "Overdue", value: s.overdue },
      ],
      management: [
        { label: "Portfolio (TZS)", value: millions(s.portfolio), highlight: true },
        { label: "PAR 1 day", value: percent(s.par1, s.portfolio) },
        { label: "PAR 30 days", value: percent(s.par30, s.portfolio) },
        { label: "Overdue loans", value: s.overdue },
      ],
      admin: [
        { label: "Active users", value: adminStatsQuery?.rows[0].active_users ?? 0, highlight: true },
        { label: "Customers", value: adminStatsQuery?.rows[0].customers ?? 0 },
        { label: "Loan officers", value: adminStatsQuery?.rows[0].loan_officers ?? 0 },
        { label: "Locked accounts", value: adminStatsQuery?.rows[0].locked_accounts ?? 0 },
      ],
    }[user.role];

    const rowsQuery = await pool.query(
      `SELECT l.id, c.full_name AS client, l.product,
              (l.next_due_date - CURRENT_DATE)::int AS days
         FROM loans l
         JOIN clients c ON c.id = l.client_id
        WHERE l.status = 'active' AND ($1::int IS NULL OR l.officer_id = $1)
        ORDER BY l.next_due_date
        LIMIT 50`,
      [scope]
    );

    const rows = rowsQuery.rows.map((r) => {
      const days: number = r.days;
      return {
        id: r.id,
        client: r.client,
        product: r.product,
        due: days === 0 ? "Today" : days < 0 ? `${-days} days late` : `${days} days`,
        status: days < 0 ? "Overdue" : days === 0 ? "Due" : "On track",
      };
    });

    res.json({ roleLabel: roleLabel[user.role], stats, rows, nextScreen: nextScreen[user.role] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load the dashboard. Try again." });
  }
});
