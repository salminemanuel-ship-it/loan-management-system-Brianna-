import { useEffect, useMemo, useState } from "react";
import { getDashboard, getOverview } from "../api";
import { can, type Permission } from "../permissions";
import type { ClientStatus, DashboardData, Overview, User } from "../types";

type Target = "customers" | "groups" | "assessment" | "reports";

const statusClass: Record<ClientStatus, string> = {
  Due: "pill pill-due",
  Overdue: "pill pill-overdue",
  "On track": "pill pill-ok",
};

const sliceColours = ["#c99a2e", "#e6c46b", "#8a6a1c", "#2b2210", "#b9b2a0"];

const money = (n: number) => n.toLocaleString("en-US");
const millions = (n: number) => `${(n / 1_000_000).toFixed(1)}M`;

const quickActions: { label: string; text: string; to: Target; needs: Permission }[] = [
  { label: "New customer", text: "Register a customer", to: "customers", needs: "customers.add" },
  { label: "New group", text: "Identify or register a group", to: "groups", needs: "groups.manage" },
  { label: "Field assessment", text: "Visit and assess an applicant", to: "assessment", needs: "assessment.do" },
  { label: "Reports", text: "Open reports", to: "reports", needs: "reports.view" },
];

export default function Dashboard({
  user,
  onNavigate,
}: {
  user: User;
  onNavigate: (to: Target) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [table, setTable] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const showCharts = can(user.role, "dashboard.portfolio");
  const showDueList = can(user.role, "dashboard.dueList");

  useEffect(() => {
    let stale = false;
    setOverview(null);
    setTable(null);
    setError("");
    Promise.all([showCharts ? getOverview() : Promise.resolve(null), getDashboard(user.role)])
      .then(([o, t]) => {
        if (stale) return;
        setOverview(o);
        setTable(t);
      })
      .catch((e: Error) => {
        if (!stale) setError(e.message);
      });
    return () => {
      stale = true;
    };
  }, [user.role, showCharts]);

  const rows = useMemo(() => {
    if (!table) return [];
    const q = query.trim().toLowerCase();
    if (!q) return table.rows;
    return table.rows.filter(
      (r) => r.client.toLowerCase().includes(q) || r.product.toLowerCase().includes(q)
    );
  }, [table, query]);

  if (error) return <p className="note note-error" role="alert">{error}</p>;
  if (!table) return <p className="muted">Loading your dashboard…</p>;

  const actions = quickActions.filter((a) => can(user.role, a.needs));
  const biggest = overview ? Math.max(1, ...overview.monthly.map((m) => m.value)) : 1;
  const total = overview ? overview.stages.reduce((sum, s) => sum + s.count, 0) : 0;
  let used = 0;

  return (
    <div className="dash">
      <div className="card-grid">
        {table.stats.map((s) => (
          <div key={s.label} className={s.highlight ? "stat-card stat-card-hl" : "stat-card"}>
            <span className="card-icon" aria-hidden="true" />
            <div>
              <span className="stat-card-label">{s.label}</span>
              <strong className="stat-card-value">{s.value}</strong>
            </div>
          </div>
        ))}
      </div>

      {user.role === "admin" && (
        <p className="note">
          Your dashboard shows how the system is used. Client and loan records are not shown to this role.
        </p>
      )}

      {overview && (
        <div className="panel-row">
          <section className="panel" aria-labelledby="chart-title">
            <h2 id="chart-title">Loan portfolio overview</h2>
            <p className="panel-sub">Loan balances opened in each month</p>
            <div className="chart">
              <div className="chart-axis" aria-hidden="true">
                <span>{millions(biggest)}</span>
                <span>{millions(biggest / 2)}</span>
                <span>0</span>
              </div>
              <div className="bars">
                {overview.monthly.map((m) => (
                  <div key={m.label} className="bar-col">
                    <div
                      className="bar"
                      style={{ height: `${(m.value / biggest) * 100}%` }}
                      title={`${m.label}: TZS ${money(m.value)}`}
                    />
                    <span>{m.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="status-title">
            <h2 id="status-title">Loan status</h2>
            <p className="panel-sub">Loans by stage</p>
            {total === 0 ? (
              <p className="muted">No loans yet.</p>
            ) : (
              <div className="donut-wrap">
                <svg viewBox="0 0 42 42" className="donut" role="img" aria-label="Loans by stage">
                  <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#eee7d4" strokeWidth="6" />
                  {overview.stages.map((s, i) => {
                    const part = (s.count / total) * 100;
                    const circle = (
                      <circle
                        key={s.label}
                        cx="21"
                        cy="21"
                        r="15.9155"
                        fill="none"
                        stroke={sliceColours[i % sliceColours.length]}
                        strokeWidth="6"
                        strokeDasharray={`${part} ${100 - part}`}
                        strokeDashoffset={25 - used}
                      />
                    );
                    used += part;
                    return circle;
                  })}
                  <text x="21" y="20" textAnchor="middle" className="donut-small">Total</text>
                  <text x="21" y="26" textAnchor="middle" className="donut-big">{total}</text>
                </svg>
                <ul className="legend">
                  {overview.stages.map((s, i) => (
                    <li key={s.label}>
                      <span className="dot" style={{ background: sliceColours[i % sliceColours.length] }} />
                      {s.label}
                      <b>{Math.round((s.count / total) * 100)}%</b>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {showDueList && (
        <section className="panel" aria-labelledby="due-title">
          <div className="panel-head">
            <h2 id="due-title">Repayments due and overdue</h2>
            <input
              type="search"
              className="inline-search"
              placeholder="Search client or product"
              aria-label="Search client or product"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Product</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.client}</td>
                    <td>{r.product}</td>
                    <td>{r.due}</td>
                    <td><span className={statusClass[r.status]}>{r.status}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">No match. Check the spelling.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {actions.length > 0 && (
        <div className="quick-grid">
          {actions.map((a) => (
            <button key={a.label} type="button" className="quick" onClick={() => onNavigate(a.to)}>
              <strong>{a.label}</strong>
              <span>{a.text}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
