import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getManagementWorkspace, sendOfficerMessage } from "../api";
import type { ManagementWorkspace } from "../types";

const money = (amount: number) => `TZS ${Math.round(amount).toLocaleString("en-US")}`;
const stageLabel = (stage: string, status: string) => status === "active" ? "Repayment" : stage === "approval" ? "Committee review" : stage === "disbursement" ? "Approved · ready to disburse" : stage[0].toUpperCase() + stage.slice(1);
const dateLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const monthKey = (value: string | null) => value ? new Date(value).toISOString().slice(0, 7) : "";

export default function ManagerWorkspace() {
  const [data, setData] = useState<ManagementWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [selectedOfficerId, setSelectedOfficerId] = useState<number | null>(null);
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setError("");
    try { setData(await getManagementWorkspace()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const search = query.trim().toLowerCase();
  const officers = useMemo(() => (data?.officers ?? []).filter((officer) => `${officer.name} ${officer.username} ${officer.phone}`.toLowerCase().includes(search)), [data, search]);
  const loans = useMemo(() => (data?.loans ?? []).filter((loan) => `${loan.loanNumber} ${loan.clientName} ${loan.product} ${loan.officerName}`.toLowerCase().includes(search) && (selectedOfficerId === null || loan.officerId === selectedOfficerId)), [data, search, selectedOfficerId]);
  const activeCount = data?.officers.reduce((sum, officer) => sum + Number(officer.activeLoans), 0) ?? 0;
  const activeLoans = (data?.loans ?? []).filter((loan) => loan.status === "active");
  const totalPortfolio = (data?.loans ?? []).reduce((sum, loan) => sum + (loan.status === "active" || loan.status === "closed" ? Number(loan.disbursedAmount ?? loan.amount) : 0), 0);
  const outstandingPortfolio = activeLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const amountDue = activeLoans.reduce((sum, loan) => sum + Number(loan.amountDue || 0), 0);
  const amountCollected = (data?.loans ?? []).reduce((sum, loan) => sum + Number(loan.amountPaid || 0), 0);
  const arrears = activeLoans.reduce((sum, loan) => sum + Number(loan.arrears || 0), 0);
  const now = new Date();
  const thisMonth = now.toISOString().slice(0, 7);
  const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const monthlyDisbursements = (month: string) => (data?.loans ?? []).filter((loan) => monthKey(loan.disbursedAt) === month).reduce((sum, loan) => sum + Number(loan.disbursedAmount ?? loan.amount), 0);
  const growthAmount = monthlyDisbursements(thisMonth) - monthlyDisbursements(previousMonth);
  const growthRate = monthlyDisbursements(previousMonth) ? growthAmount / monthlyDisbursements(previousMonth) * 100 : null;
  const performanceLoans = activeLoans.filter((loan) => loan.repaymentPerformance !== null);
  const loanPerformance = performanceLoans.length ? performanceLoans.reduce((sum, loan) => sum + Number(loan.repaymentPerformance), 0) / performanceLoans.length : null;
  const officerPerformanceValues = (data?.officers ?? []).map((officer) => {
    const assigned = activeLoans.filter((loan) => loan.officerId === officer.id && loan.repaymentPerformance !== null);
    return assigned.length ? assigned.reduce((sum, loan) => sum + Number(loan.repaymentPerformance), 0) / assigned.length : null;
  }).filter((value): value is number => value !== null);
  const officerPerformance = officerPerformanceValues.length ? officerPerformanceValues.reduce((sum, value) => sum + value, 0) / officerPerformanceValues.length : null;
  const parBalance = activeLoans.filter((loan) => loan.nextDueDate && Math.floor((Date.now() - new Date(`${loan.nextDueDate.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000) >= 30).reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const par = outstandingPortfolio ? parBalance / outstandingPortfolio * 100 : 0;
  const groupPerformance = [...new Set((data?.loans ?? []).map((loan) => loan.product))].map((product) => {
    const productLoans = (data?.loans ?? []).filter((loan) => loan.product === product);
    const measured = productLoans.filter((loan) => loan.repaymentPerformance !== null);
    return { product, loans: productLoans.length, portfolio: productLoans.reduce((sum, loan) => sum + Number(loan.disbursedAmount ?? loan.amount), 0), performance: measured.length ? measured.reduce((sum, loan) => sum + Number(loan.repaymentPerformance), 0) / measured.length : null };
  });
  const aggregateLocations = (field: "centre" | "zone") => [...new Set((data?.loans ?? []).map((loan) => loan[field]?.trim() || "Unassigned"))].map((name) => {
    const scoped = (data?.loans ?? []).filter((loan) => (loan[field]?.trim() || "Unassigned") === name);
    const active = scoped.filter((loan) => loan.status === "active");
    const prevAmount = scoped.filter((loan) => monthKey(loan.disbursedAt) === previousMonth).reduce((sum, loan) => sum + Number(loan.disbursedAmount ?? loan.amount), 0);
    const currentAmount = scoped.filter((loan) => monthKey(loan.disbursedAt) === thisMonth).reduce((sum, loan) => sum + Number(loan.disbursedAmount ?? loan.amount), 0);
    const parAmount = active.filter((loan) => loan.nextDueDate && Math.floor((Date.now() - new Date(`${loan.nextDueDate.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000) >= 30).reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
    const officers = [...new Set(active.map((loan) => loan.officerId).filter((id): id is number => id !== null))].map((id) => {
      const assigned = active.filter((loan) => loan.officerId === id && loan.repaymentPerformance !== null);
      return assigned.length ? assigned.reduce((sum, loan) => sum + Number(loan.repaymentPerformance), 0) / assigned.length : null;
    }).filter((value): value is number => value !== null);
    return {
      name,
      portfolio: scoped.reduce((sum, loan) => sum + (loan.status === "active" || loan.status === "closed" ? Number(loan.disbursedAmount ?? loan.amount) : 0), 0),
      borrowers: new Set(scoped.map((loan) => loan.clientId)).size,
      repayments: scoped.reduce((sum, loan) => sum + Number(loan.amountPaid || 0), 0),
      arrears: active.reduce((sum, loan) => sum + Number(loan.arrears || 0), 0),
      par: active.reduce((sum, loan) => sum + Number(loan.balance || 0), 0) ? parAmount / active.reduce((sum, loan) => sum + Number(loan.balance || 0), 0) * 100 : 0,
      growth: prevAmount ? (currentAmount - prevAmount) / prevAmount * 100 : null,
      officerPerformance: officers.length ? officers.reduce((sum, value) => sum + value, 0) / officers.length : null,
    };
  });
  const selectedOfficer = data?.officers.find((officer) => officer.id === selectedOfficerId);

  async function sendMessage(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const sent = await sendOfficerMessage(Number(recipient), subject, messageBody);
      setNotice(`Update sent to ${sent.officerName}.`); setSubject(""); setMessageBody("");
      await refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="manager-workspace">
    {error && <p className="note note-error" role="alert">{error}</p>}
    {notice && <div className="notice-success" role="status">✓ {notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    <section className="manager-hero"><div><span className="eyebrow">MANAGER WORKSPACE</span><h2>Lead supervisors and loan officers</h2><p>Review team performance, follow loan activity, and send updates to your supervisors and officers.</p></div><div className="manager-hero-chip"><span>Total portfolio</span><strong>{money(totalPortfolio)}</strong><small>{activeCount} active loans</small></div></section>
    <div className="manager-stats"><article><span>Total portfolio</span><strong>{money(totalPortfolio)}</strong></article><article><span>Portfolio growth</span><strong>{money(growthAmount)}</strong><small>{`${growthRate === null ? "+0.0" : `${growthRate >= 0 ? "+" : ""}${growthRate.toFixed(1)}`}% vs previous month`}</small></article><article><span>Amount due</span><strong>{money(amountDue)}</strong></article><article><span>Amount collected</span><strong>{money(amountCollected)}</strong></article><article><span>Outstanding portfolio</span><strong>{money(outstandingPortfolio)}</strong></article><article><span>PAR</span><strong>{par.toFixed(1)}%</strong></article><article><span>Arrears</span><strong>{money(arrears)}</strong></article><article><span>Loan performance</span><strong>{loanPerformance === null ? "0.0%" : `${loanPerformance.toFixed(1)}%`}</strong></article><article><span>Officer performance</span><strong>{officerPerformance === null ? "0.0%" : `${officerPerformance.toFixed(1)}%`}</strong></article><article><span>Group performance</span><strong>{groupPerformance.find((item) => item.product === "Group")?.performance == null ? "0.0%" : `${groupPerformance.find((item) => item.product === "Group")?.performance?.toFixed(1)}%`}</strong></article></div>

    <section className="panel manager-search-panel"><div className="manager-search-heading"><div><h2>Loan officer portfolio</h2><p className="panel-sub">Review the officers and loan activity you lead.</p></div><div className="manager-search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search officers and loans…" /><button type="button" className="manager-refresh-link" onClick={() => { setLoading(true); void refresh(); }}>Refresh</button></div></div>
      <div className="officer-grid">{officers.map((officer) => { const officerLoans = (data?.loans ?? []).filter((loan) => loan.officerId === officer.id && loan.status === "active" && loan.repaymentPerformance !== null); const performance = officerLoans.length ? officerLoans.reduce((sum, loan) => sum + Number(loan.repaymentPerformance), 0) / officerLoans.length : 0; return <button type="button" className="officer-card" key={officer.id} onClick={() => setSelectedOfficerId(selectedOfficerId === officer.id ? null : officer.id)}><span className="officer-avatar">{officer.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span className="officer-card-main"><strong>{officer.name}</strong><small>{officer.phone || officer.username}</small></span><span className="officer-open">{selectedOfficerId === officer.id ? "✓" : "↗"}</span><span className="officer-metrics"><span><b>{officer.activeLoans}</b><small>Active loans</small></span><span><b>{officer.inProgress}</b><small>In progress</small></span><span><b>{money(Number(officer.portfolioBalance))}</b><small>Portfolio</small></span></span><span className="officer-card-foot">Officer performance <b>{performance.toFixed(1)}%</b></span></button>; })}{!officers.length && <p className="empty-state">{loading ? "Loading officer records…" : search ? "No officers match this search." : "No active loan officer accounts."}</p>}</div>
    </section>

    <section className="panel workflow-panel"><div className="panel-head"><div><h2>Supervisors</h2><p className="panel-sub">Active supervisors and their assigned zones.</p></div></div><div className="table-wrap"><table><thead><tr><th>Supervisor</th><th>Contact</th><th>Assigned zones</th></tr></thead><tbody>{(data?.supervisors ?? []).map((supervisor) => <tr key={supervisor.id}><td><strong>{supervisor.name}</strong></td><td>{supervisor.phone || supervisor.username}</td><td>{supervisor.zones.length ? supervisor.zones.join(", ") : "No zones assigned"}</td></tr>)}{!data?.supervisors.length && <tr><td colSpan={3} className="empty-state">{loading ? "Loading supervisors…" : "No active supervisors."}</td></tr>}</tbody></table></div></section>

    <section className="panel workflow-panel"><div className="panel-head"><div><h2>Centre performance</h2></div></div><div className="table-wrap"><table><thead><tr><th>Centre</th><th>Portfolio</th><th>Borrowers</th><th>Repayments</th><th>Arrears</th><th>PAR</th><th>Growth</th><th>Officer performance</th></tr></thead><tbody>{aggregateLocations("centre").map((item) => <tr key={item.name}><td>{item.name}</td><td>{money(item.portfolio)}</td><td>{item.borrowers}</td><td>{money(item.repayments)}</td><td>{money(item.arrears)}</td><td>{item.par.toFixed(1)}%</td><td>{item.growth === null ? "—" : `${item.growth >= 0 ? "+" : ""}${item.growth.toFixed(1)}%`}</td><td>{item.officerPerformance === null ? "—" : `${item.officerPerformance.toFixed(1)}%`}</td></tr>)}{!data?.loans.length && <tr><td colSpan={8} className="empty-state">{loading ? "Loading centre performance…" : "No centre performance records."}</td></tr>}</tbody></table></div></section>

    <section className="panel workflow-panel"><div className="panel-head"><div><h2>Zone performance</h2></div></div><div className="table-wrap"><table><thead><tr><th>Zone</th><th>Portfolio</th><th>Borrowers</th><th>Repayments</th><th>Arrears</th><th>PAR</th><th>Growth</th><th>Officer performance</th></tr></thead><tbody>{aggregateLocations("zone").map((item) => <tr key={item.name}><td>{item.name}</td><td>{money(item.portfolio)}</td><td>{item.borrowers}</td><td>{money(item.repayments)}</td><td>{money(item.arrears)}</td><td>{item.par.toFixed(1)}%</td><td>{item.growth === null ? "—" : `${item.growth >= 0 ? "+" : ""}${item.growth.toFixed(1)}%`}</td><td>{item.officerPerformance === null ? "—" : `${item.officerPerformance.toFixed(1)}%`}</td></tr>)}{!data?.loans.length && <tr><td colSpan={8} className="empty-state">{loading ? "Loading zone performance…" : "No zone performance records."}</td></tr>}</tbody></table></div></section>

    <section className="panel workflow-panel"><div className="panel-head"><div><h2>Group performance</h2><p className="panel-sub">Loan performance by product</p></div></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>Loans</th><th>Portfolio</th><th>Loan performance</th></tr></thead><tbody>{groupPerformance.map((group) => <tr key={group.product}><td>{group.product}</td><td>{group.loans}</td><td>{money(group.portfolio)}</td><td>{group.performance === null ? "—" : `${group.performance.toFixed(1)}%`}</td></tr>)}{!groupPerformance.length && <tr><td colSpan={4} className="empty-state">No group performance records.</td></tr>}</tbody></table></div></section>

    <section className="panel workflow-panel"><div className="panel-head"><div><h2>{selectedOfficer ? `${selectedOfficer.name} · loan records` : "Loan records"}</h2><p className="panel-sub">{selectedOfficer ? "Current assigned portfolio" : "All records available to management"}</p></div>{selectedOfficer && <button className="text-action" onClick={() => setSelectedOfficerId(null)}>Show all officers →</button>}</div><div className="table-wrap"><table><thead><tr><th>Customer</th><th>Loan number</th><th>Product</th><th>Officer</th><th>Stage</th><th>Balance</th><th>Last updated</th></tr></thead><tbody>{loans.slice(0, 100).map((loan) => <tr key={loan.id}><td><strong>{loan.clientName}</strong></td><td>{loan.loanNumber}</td><td>{loan.product}</td><td>{loan.officerName}</td><td>{stageLabel(loan.stage, loan.status)}</td><td>{money(Number(loan.balance))}</td><td>{dateLabel(loan.updatedAt)}</td></tr>)}{!loans.length && <tr><td colSpan={7} className="empty-state">{loading ? "Loading loan records…" : "No loan records match this view."}</td></tr>}</tbody></table></div></section>

    <div className="manager-lower-grid">
      <section className="panel manager-messages"><div className="calendar-heading"><div><span className="eyebrow">TEAM COMMUNICATION</span><h2>Send a team update</h2><p className="panel-sub">Send an update to a loan officer or supervisor. The recipient will see it in Updates.</p></div><span className="message-icon">✉</span></div><form onSubmit={(event) => void sendMessage(event)}><label className="field"><span>To</span><select value={recipient} onChange={(event) => setRecipient(event.target.value)} required><option value="">Choose a team member</option><optgroup label="Supervisors">{(data?.supervisors ?? []).map((supervisor) => <option key={`s-${supervisor.id}`} value={supervisor.id}>{supervisor.name}</option>)}</optgroup><optgroup label="Loan officers">{(data?.officers ?? []).map((officer) => <option key={`o-${officer.id}`} value={officer.id}>{officer.name}</option>)}</optgroup></select></label><label className="field"><span>Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Message subject" maxLength={100} required /></label><label className="field"><span>Message</span><textarea value={messageBody} onChange={(event) => setMessageBody(event.target.value)} rows={4} placeholder="Write a team update…" maxLength={1500} required /></label><button className="btn btn-primary" type="submit" disabled={busy || !(data?.officers.length || data?.supervisors.length)}>{busy ? "Sending…" : "Send update →"}</button></form>{Boolean(data?.messages.length) && <div className="sent-messages"><h3>Recently sent</h3>{data?.messages.slice(0, 5).map((message) => <article key={message.id}><b>{message.subject}</b><small>To {message.officerName} · {dateLabel(message.sentAt)}</small></article>)}</div>}</section>
      <section className="panel manager-messages"><div className="calendar-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Loan updates</h2><p className="panel-sub">Most recently changed records from the database.</p></div></div><div className="admin-signin-list">{(data?.loans ?? []).slice(0, 8).map((loan) => <article key={loan.id}><span className="admin-presence"/><div><strong>{loan.clientName} · {loan.loanNumber}</strong><small>{stageLabel(loan.stage, loan.status)} · {dateLabel(loan.updatedAt)}</small></div></article>)}{!data?.loans.length && <p className="empty-state">{loading ? "Loading activity…" : "No loan activity has been recorded."}</p>}</div></section>
    </div>
  </div>;
}
