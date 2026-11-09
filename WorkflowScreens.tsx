import { useEffect, useMemo, useState } from "react";
import type { Role } from "../permissions";
import type { CommitteeDecisionRecord, LoanPayoutIntent, LoanRecord, User } from "../types";
import { getPendingLoanPayouts, initiateLoanPayout, listCommitteeDecisions, listLoans, performLoanAction, reconcileLoanPayout } from "../api";
import AdminUsers from "./AdminUsers";

const money = (n: number) => `TZS ${Math.round(n).toLocaleString("en-US")}`;
const stageName = (loan: LoanRecord) => loan.status === "active" ? "Repayment" : loan.stage === "approval" ? "Committee review" : loan.stage === "disbursement" ? "Approved · ready to disburse" : loan.stage[0].toUpperCase() + loan.stage.slice(1);
const roleCanManage = (role: Role, screen: string) => screen === "applications" ? ["loan_officer", "supervisor", "director", "ceo"].includes(role) : screen === "approvals" ? ["loan_officer", "supervisor", "committee", "director", "ceo"].includes(role) : screen === "disbursement" ? ["finance", "supervisor", "director", "ceo"].includes(role) : screen === "repayments" ? ["loan_officer", "finance", "supervisor", "director", "ceo"].includes(role) : ["loan_officer", "supervisor", "director", "ceo"].includes(role);
const daysOverdue = (due: string | null) => due ? Math.max(0, Math.floor((new Date(new Date().toDateString()).getTime() - new Date(`${due.slice(0, 10)}T00:00:00`).getTime()) / 86_400_000)) : 0;

export default function WorkflowScreen({ screen, role, username, user, onProfileChange, language, onLanguageChange }: { screen: string; role: Role; username: string; user: User; onProfileChange: (changes: Partial<User>) => void; language: "en" | "sw"; onLanguageChange: (language: "en" | "sw") => void }) {
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [decisionRecords, setDecisionRecords] = useState<CommitteeDecisionRecord[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<LoanPayoutIntent[]>([]);
  const [committeeView, setCommitteeView] = useState<"pending" | "records">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All stages");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [reviewLoanId, setReviewLoanId] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [electronicSignature, setElectronicSignature] = useState(false);
  const [disbursedAmount, setDisbursedAmount] = useState("");
  const [payoutProvider, setPayoutProvider] = useState<"snippe_mobile" | "snippe_bank">("snippe_mobile");
  const [payoutDestination, setPayoutDestination] = useState("");
  const [payoutDestinationName, setPayoutDestinationName] = useState("");
  const [payoutBankCode, setPayoutBankCode] = useState("");
  const [payoutNextDueDate, setPayoutNextDueDate] = useState("");
  const [payoutLoanId, setPayoutLoanId] = useState<number | null>(null);
  const [paymentLoanId, setPaymentLoanId] = useState<number | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [showActiveLoans, setShowActiveLoans] = useState(false);
  const adminSection = screen === "settings" ? "profile" : screen === "adminLanguage" ? "language" : screen === "adminCredentials" ? "credentials" : screen === "adminAccounts" ? "accounts" : screen === "adminSignins" ? "signins" : screen === "adminMessages" ? "messages" : screen === "adminRequests" ? "requests" : screen === "adminResets" ? "resets" : screen === "adminZones" ? "zones" : "all";
  const isAdminScreen = ["settings", "adminLanguage", "adminCredentials", "adminAccounts", "adminSignins", "adminMessages", "adminRequests", "adminResets", "adminZones"].includes(screen);

  async function refreshLoans() {
    setError("");
    try { setLoans(await listLoans()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }

  async function refreshDecisionRecords() {
    try { setDecisionRecords(await listCommitteeDecisions()); }
    catch (reason) { setError((reason as Error).message); }
  }

  async function refreshPendingPayouts() {
    try { setPendingPayouts(await getPendingLoanPayouts()); }
    catch (reason) { setError((reason as Error).message); }
  }

  useEffect(() => {
    if (isAdminScreen) return;
    setLoading(true);
    void refreshLoans();
    if (screen === "approvals" && role === "committee") void refreshDecisionRecords();
    if (screen === "disbursement" && ["finance", "supervisor", "director", "ceo"].includes(role)) void refreshPendingPayouts();
  }, [screen, role, isAdminScreen]);

  async function act(loan: LoanRecord, action: string, data: Record<string, unknown> = {}, success: string) {
    setBusyId(loan.id); setError(""); setNotice("");
    try {
      await performLoanAction(loan.id, action, data);
      setNotice(success);
      await refreshLoans();
      if (screen === "approvals" && role === "committee") await refreshDecisionRecords();
      setDisbursedAmount(""); setPaymentLoanId(null); setPaymentAmount(""); setPaymentReference("");
      setDecisionNote(""); setElectronicSignature(false); setReviewLoanId(null);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  async function sendPayout(loan: LoanRecord) {
    setBusyId(loan.id); setError(""); setNotice("");
    try {
      const result = await initiateLoanPayout(loan.id, {
        amount: Number(disbursedAmount || loan.principalAmount || loan.amountDue || 0),
        provider: payoutProvider,
        destination: payoutDestination,
        destinationName: payoutDestinationName,
        ...(payoutProvider === "snippe_bank" ? { bankCode: payoutBankCode } : {}),
        nextDueDate: payoutNextDueDate,
      });
      setNotice(`${result.message} Transaction ${result.transactionId}.`);
      setPayoutDestination(""); setPayoutDestinationName(""); setPayoutBankCode(""); setPayoutLoanId(null); setDisbursedAmount("");
      await Promise.all([refreshLoans(), refreshPendingPayouts()]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  async function reconcilePayout(payout: LoanPayoutIntent) {
    setBusyId(payout.loanId); setError(""); setNotice("");
    try {
      const result = await reconcileLoanPayout(payout.transactionId);
      setNotice(result.message ?? (result.status === "failed" ? "Snippe reported the payout failed." : "Payout status updated."));
      await Promise.all([refreshLoans(), refreshPendingPayouts()]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  const searched = useMemo(() => loans.filter((loan) => `${loan.loanNumber} ${loan.clientName} ${loan.product} ${loan.officerName}`.toLowerCase().includes(query.trim().toLowerCase())), [loans, query]);
  const rows = useMemo(() => {
    let records = searched;
    if (screen === "approvals" && role === "loan_officer") records = records.filter((loan) => ["disbursement", "repayment"].includes(loan.stage) || loan.status === "active");
    else if (screen === "approvals" && role === "supervisor") records = records.filter((loan) => loan.stage === "verification");
    else if (screen === "approvals" && role === "committee") records = records.filter((loan) => loan.stage === "approval");
    else if (screen === "disbursement") records = records.filter((loan) => loan.stage === "disbursement" || loan.stage === "repayment");
    else if (screen === "repayments") records = records.filter((loan) => loan.stage === "repayment");
    if (filter !== "All stages") records = records.filter((loan) => stageName(loan) === filter);
    return records;
  }, [searched, screen, role, filter]);

  if (isAdminScreen) return <AdminUsers username={username} user={user} onProfileChange={onProfileChange} language={language} onLanguageChange={onLanguageChange} section={adminSection} />;
  if (!roleCanManage(role, screen)) return <p className="note">Your role does not have access to this workspace.</p>;

  const activeLoans = loans.filter((loan) => loan.status === "active");
  const reviewLoan = loans.find((loan) => loan.id === reviewLoanId);
  const portfolio = activeLoans.reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const overdueLoans = activeLoans.filter((loan) => daysOverdue(loan.nextDueDate) >= 1);
  const par30 = overdueLoans.filter((loan) => daysOverdue(loan.nextDueDate) >= 30).reduce((sum, loan) => sum + Number(loan.balance || 0), 0);
  const stageOptions = [...new Set(loans.map(stageName))];
  const payoutEligibleLoans = loans.filter((loan) => loan.stage === "disbursement" && !pendingPayouts.some((payout) => payout.loanId === loan.id));
  const loanRegisterRows = screen === "disbursement" && role === "finance" ? rows.filter((loan) => !pendingPayouts.some((payout) => payout.loanId === loan.id)) : rows;

  if (screen === "reports") {
    const officerMetrics = [...new Set(activeLoans.map((loan) => loan.officerId).filter((id): id is number => id !== null))].map((id) => {
      const assigned = activeLoans.filter((loan) => loan.officerId === id);
      const measured = assigned.filter((loan) => loan.repaymentPerformance !== null);
      const performance = measured.length ? measured.reduce((sum, loan) => sum + Number(loan.repaymentPerformance), 0) / measured.length : null;
      return { id, name: assigned[0]?.officerName ?? "Unassigned", active: assigned.length, balance: assigned.reduce((sum, loan) => sum + Number(loan.balance || 0), 0), performance };
    }).sort((a, b) => (b.performance ?? -1) - (a.performance ?? -1));
    return <div className="workflow-stack report-print-area">
      {error && <p className="note note-error" role="alert">{error}</p>}
      <section className="workflow-hero"><div><span className="eyebrow">PORTFOLIO REPORTS</span><h2>Portfolio performance</h2><p>Figures are calculated from current loan and repayment records.</p></div><div className="report-actions"><button className="btn btn-ghost" type="button" onClick={() => { setLoading(true); void refreshLoans(); }}>Refresh</button><button className="btn btn-primary print-report-button" type="button" onClick={() => window.print()}>Print report</button></div></section>
      <div className="card-grid"><Stat label="OUTSTANDING PORTFOLIO" value={money(portfolio)} highlight/><Stat label="ACTIVE LOANS" value={activeLoans.length} onClick={() => setShowActiveLoans((visible) => !visible)} expanded={showActiveLoans}/><Stat label="PAR 30 BALANCE" value={money(par30)}/><Stat label="PAR 30" value={`${portfolio ? (par30 / portfolio * 100).toFixed(1) : "0.0"}%`}/></div>
      {showActiveLoans && <section className="panel workflow-panel active-loans-panel" aria-label="Active loans">
        <div className="panel-head"><div><h2>Active loans</h2><p className="panel-sub">{activeLoans.length} active loan records</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Loan</th><th>Product</th><th>Officer</th><th>Outstanding</th><th>Next due</th></tr></thead><tbody>
          {activeLoans.map((loan) => <tr key={loan.id}><td>{loan.clientName}</td><td>{loan.loanNumber}</td><td>{loan.product}</td><td>{loan.officerName}</td><td>{money(Number(loan.balance))}</td><td>{loan.nextDueDate ? new Date(`${loan.nextDueDate.slice(0, 10)}T00:00:00`).toLocaleDateString() : "—"}</td></tr>)}
          {!activeLoans.length && <tr><td colSpan={6} className="empty-state">No active loans are available.</td></tr>}
        </tbody></table></div>
      </section>}
      <section className="panel workflow-panel"><div className="panel-head"><div><h2>Officer performance ranking</h2><p className="panel-sub">Average recorded repayment performance across active loans.</p></div></div><div className="table-wrap"><table><thead><tr><th>Rank</th><th>Loan officer</th><th>Active loans</th><th>Portfolio</th><th>Repayment performance</th></tr></thead><tbody>{officerMetrics.map((officer, i) => <tr key={officer.id}><td>{i + 1}</td><td>{officer.name}</td><td>{officer.active}</td><td>{money(officer.balance)}</td><td>{officer.performance === null ? "Not recorded" : `${officer.performance.toFixed(1)}%`}</td></tr>)}{!officerMetrics.length && <tr><td colSpan={5} className="empty-state">{loading ? "Loading portfolio…" : "No active officer portfolios to rank."}</td></tr>}</tbody></table></div></section>
      {loading && <p className="muted">Refreshing records…</p>}
    </div>;
  }

  const title = screen === "applications" ? "Loan applications" : screen === "approvals" ? role === "loan_officer" ? "Approved loan tracker" : role === "committee" ? "Committee decisions" : "Supervisor verification" : screen === "disbursement" ? role === "finance" ? "Finance operations" : "Disburse approved loans" : "Repayment accounts";
  const description = screen === "applications" ? "Submit assessed loans for supervisor verification." : screen === "approvals" ? role === "loan_officer" ? "Follow approved loans through disbursement and repayment." : "Review assigned loans and record your decision." : screen === "disbursement" ? role === "finance" ? "Prepare approved loan payouts and review transfer status." : "Send approved loans through Snippe and track confirmed payouts." : "Record customer payments against the current outstanding balance.";

  return <div className="workflow-stack">
    {error && <p className="note note-error" role="alert">{error}</p>}
    {notice && <div className="notice-success" role="status">✓ {notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    <section className="workflow-hero"><div><span className="eyebrow">{screen === "disbursement" && role === "finance" ? "FINANCE WORKSPACE" : "BML LOAN OPERATIONS"}</span><h2>{title}</h2><p>{description}</p></div><button className="btn btn-ghost" type="button" onClick={() => { setLoading(true); void refreshLoans(); if (screen === "disbursement") void refreshPendingPayouts(); }}>Refresh</button></section>
    {screen === "approvals" && role === "committee" && <div className="committee-tabs" role="tablist" aria-label="Committee workspace">
      <button type="button" role="tab" aria-selected={committeeView === "pending"} className={committeeView === "pending" ? "committee-tab committee-tab-active" : "committee-tab"} onClick={() => setCommitteeView("pending")}>Pending review <span>{rows.length}</span></button>
      <button type="button" role="tab" aria-selected={committeeView === "records"} className={committeeView === "records" ? "committee-tab committee-tab-active" : "committee-tab"} onClick={() => setCommitteeView("records")}>Decision records <span>{decisionRecords.length}</span></button>
    </div>}
    {screen === "disbursement" && <div className="card-grid"><Stat label="APPROVED AMOUNT" value={money(payoutEligibleLoans.reduce((sum, loan) => sum + Number(loan.principalAmount ?? loan.amountDue ?? 0), 0))} highlight/><Stat label="DISBURSED AMOUNT" value={money(loans.filter((loan) => loan.stage === "repayment").reduce((sum, loan) => sum + Number(loan.disbursedAmount ?? 0), 0))}/><Stat label="READY TO DISBURSE" value={payoutEligibleLoans.length}/><Stat label="REPAYMENT DUE" value={money(loans.filter((loan) => loan.stage === "repayment" && loan.status === "active").reduce((sum, loan) => sum + Number(loan.amountDue ?? 0), 0))}/></div>}
    {screen === "disbursement" && ["finance", "supervisor", "director", "ceo"].includes(role) && <section className="panel snippe-payout-panel">
      <div className="snippe-payout-heading"><div className="snippe-payout-icon" aria-hidden="true">↗</div><div><span className="eyebrow">PROVIDER PAYOUT</span><h2>Prepare a payout</h2><p>Select an approved loan and enter the recipient’s transfer details.</p></div></div>
      <div className="snippe-payout-notice"><span aria-hidden="true">ⓘ</span><span>Payout submission requires valid Snippe credentials.</span></div>
      <div className="snippe-payout-fields">
        <label className="payout-loan-field">Approved loan<select value={payoutLoanId ?? ""} onChange={(event) => { const id = Number(event.target.value); const loan = loans.find((item) => item.id === id); setPayoutLoanId(loan?.id ?? null); setDisbursedAmount(String(loan?.principalAmount ?? loan?.amountDue ?? "")); }}><option value="">Choose a loan</option>{payoutEligibleLoans.length === 0 && <option value="" disabled>No approved loans ready for payout</option>}{payoutEligibleLoans.map(loan => <option key={loan.id} value={loan.id}>{loan.loanNumber} · {loan.clientName}</option>)}</select></label>
        <label>Payment route<select value={payoutProvider} onChange={(event) => setPayoutProvider(event.target.value as "snippe_mobile" | "snippe_bank")}><option value="snippe_mobile">Mobile money wallet</option><option value="snippe_bank">Bank account</option></select></label>
        <label>Amount (TZS)<input type="number" min="500" step="1" value={disbursedAmount} onChange={(event) => setDisbursedAmount(event.target.value)} /></label>
        <label>{payoutProvider === "snippe_mobile" ? "Wallet number (255…)" : "Bank account number"}<input value={payoutDestination} onChange={(event) => setPayoutDestination(event.target.value)} placeholder={payoutProvider === "snippe_mobile" ? "255 7XX XXX XXX" : "Enter account number"} /></label>
        <label>Recipient full name<input value={payoutDestinationName} onChange={(event) => setPayoutDestinationName(event.target.value)} placeholder="Name on the account" /></label>
        {payoutProvider === "snippe_bank" && <label>Snippe bank code<input value={payoutBankCode} onChange={(event) => setPayoutBankCode(event.target.value)} placeholder="Bank code" /></label>}
        <label>First repayment due date<input type="date" value={payoutNextDueDate} onChange={(event) => setPayoutNextDueDate(event.target.value)} /></label>
        <div className="payout-submit"><button className="btn btn-primary" type="button" disabled={busyId !== null || !payoutLoanId || !disbursedAmount || !payoutDestination || !payoutDestinationName || !payoutNextDueDate || (payoutProvider === "snippe_bank" && !payoutBankCode)} onClick={() => { const loan = loans.find(item => item.id === payoutLoanId); if (loan) void sendPayout(loan); }}>{busyId === payoutLoanId ? "Sending payout…" : "Send payout"}</button><small>The loan activates after Snippe confirms the transfer.</small></div>
      </div>
    </section>}
    {screen === "disbursement" && ["finance", "supervisor", "director", "ceo"].includes(role) && <section className="panel workflow-panel bank-reconciliation-panel"><div className="panel-head"><div><h2>{role === "finance" ? "Transfers to confirm" : "Snippe payout reconciliation"}</h2><p className="panel-sub">Pending or uncertain transactions · {pendingPayouts.length}</p></div><button className="btn btn-ghost" type="button" onClick={() => void refreshPendingPayouts()}>Refresh</button></div><div className="table-wrap"><table><thead><tr><th>Customer / loan</th><th>Submitted</th><th>Route</th><th>Amount</th><th>Recipient</th><th>Status</th><th></th></tr></thead><tbody>{pendingPayouts.map(payout => <tr key={payout.id}><td><strong>{payout.clientName}</strong><small className="cell-sub">{payout.loanNumber}</small></td><td>{new Date(payout.createdAt).toLocaleString()}</td><td>{payout.provider === "snippe_mobile" ? "Mobile money" : "Bank"}</td><td>{money(Number(payout.amount))}</td><td>{payout.destinationName}<small className="cell-sub">{payout.destination}</small></td><td><Pill>{payout.status}</Pill></td><td><button className="mini-button mini-approve" type="button" disabled={busyId !== null} onClick={() => void reconcilePayout(payout)}>{busyId === payout.loanId ? "Checking…" : "Check status"}</button></td></tr>)}{!pendingPayouts.length && <tr><td colSpan={7} className="empty-state">No payouts need confirmation.</td></tr>}</tbody></table></div></section>}
    {(screen !== "approvals" || role !== "committee" || committeeView === "pending") && <section className="panel workflow-panel"><div className="panel-head"><div>{!(screen === "approvals" && role === "supervisor") && <h2>{screen === "disbursement" && role === "finance" ? "Loan payout register" : title}</h2>}<p className="panel-sub">{loading ? "Loading records…" : screen === "disbursement" && role === "finance" ? `${loanRegisterRows.length} approved or active loans` : `${rows.length} records from BML database`}</p></div><div className="filter-tools"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All stages</option>{stageOptions.map((stage) => <option key={stage}>{stage}</option>)}</select><input className="inline-search" type="search" placeholder="Search customer, loan or officer" value={query} onChange={(event) => setQuery(event.target.value)} /></div></div>
      <div className="table-wrap"><table><thead><tr>{screen === "disbursement" ? <><th>Borrower</th><th>Approved amount</th><th>Disbursed amount</th><th>Due</th><th>Transaction / reference</th><th>Status</th></> : screen === "repayments" ? <><th>Repayment schedule</th><th>Amount due</th><th>Amount paid</th><th>Outstanding balance</th><th>Payment date</th><th>Overdue amount</th><th>Arrears</th><th>Repayment status</th><th>Record payment</th></> : <><th>Customer</th><th>Loan</th><th>Amount</th><th>Officer</th><th>Stage</th></>}{screen !== "repayments" && screen !== "disbursement" && <th>Action</th>}</tr></thead><tbody>{loanRegisterRows.map((loan) => <tr key={loan.id}>
        {screen === "disbursement" ? <><td><strong>{loan.clientName}</strong><small className="cell-sub">{loan.loanNumber} · {loan.product}</small></td><td>{money(Number(loan.principalAmount ?? loan.amountDue ?? 0))}</td><td>{loan.disbursedAmount == null ? "—" : money(Number(loan.disbursedAmount))}</td><td><strong>{loan.amountDue == null ? "—" : money(Number(loan.amountDue))}</strong><small className="cell-sub">Due {loan.nextDueDate ? new Date(`${loan.nextDueDate.slice(0, 10)}T00:00:00`).toLocaleDateString() : "date not set"}</small></td><td>{loan.transferReference ? <><strong>{loan.transferReference}</strong><small className="cell-sub">{loan.updatedAt ? new Date(loan.updatedAt).toLocaleDateString() : ""}</small></> : "—"}</td><td><Pill>{loan.stage === "disbursement" ? "Ready to disburse" : loan.status === "closed" ? "Closed" : "Disbursed · active"}</Pill></td></> : screen === "repayments" ? null : <><td><strong>{loan.clientName}</strong><small className="cell-sub">{loan.loanNumber}</small></td><td>{loan.product}</td><td>{money(Number(loan.principalAmount ?? loan.amountDue ?? 0))}</td><td>{loan.officerName}</td><td><Pill>{stageName(loan)}</Pill></td></>}
        {screen === "repayments" && <><td>{loan.nextDueDate ? new Date(`${loan.nextDueDate.slice(0, 10)}T00:00:00`).toLocaleDateString() : "—"}</td><td>{money(Number(loan.amountDue ?? 0))}</td><td>{money(Number(loan.amountPaid ?? 0))}</td><td>{money(Number(loan.balance ?? 0))}</td><td>{loan.paymentDate ? new Date(loan.paymentDate).toLocaleDateString() : "—"}</td><td>{money(Number(loan.overdueAmount ?? 0))}</td><td>{money(Number(loan.arrears ?? 0))}</td><td><Pill>{loan.status === "closed" ? "Paid" : Number(loan.overdueAmount ?? 0) > 0 ? "Overdue" : "Current"}</Pill></td><td>{loan.status === "active" && roleCanManage(role, screen) ? <div className="row-actions"><input className="table-input" type="number" min="1" step="1" max={loan.balance ?? undefined} aria-label={`Payment amount for ${loan.loanNumber}`} placeholder="Amount (TZS)" value={paymentLoanId === loan.id ? paymentAmount : ""} onFocus={() => setPaymentLoanId(loan.id)} onChange={(event) => { setPaymentLoanId(loan.id); setPaymentAmount(event.target.value); }} /><input className="table-input" aria-label={`Payment reference for ${loan.loanNumber}`} placeholder="Reference (optional)" value={paymentLoanId === loan.id ? paymentReference : ""} onFocus={() => setPaymentLoanId(loan.id)} onChange={(event) => { setPaymentLoanId(loan.id); setPaymentReference(event.target.value); }} /><button className="mini-button mini-approve" disabled={busyId !== null || paymentLoanId !== loan.id || !paymentAmount || Number(paymentAmount) <= 0 || Number(paymentAmount) > Number(loan.balance)} onClick={() => void act(loan, "repay", { amount: Number(paymentAmount), reference: paymentReference }, `Payment recorded for ${loan.clientName}.`)}>{busyId === loan.id ? "Saving…" : "Record"}</button></div> : <span className="muted">{loan.status === "closed" ? "Loan closed" : "—"}</span>}</td></>}
        {screen !== "repayments" && screen !== "disbursement" && <td>{screen === "applications" && role === "loan_officer" && loan.stage === "assessment" ? <button className="text-action" disabled={busyId !== null} onClick={() => void act(loan, "submit", {}, `${loan.clientName}'s application was submitted for verification.`)}>Submit for review →</button> : screen === "approvals" && role === "supervisor" && loan.stage === "verification" ? <div className="row-actions"><button className="mini-button mini-approve" disabled={busyId !== null} onClick={() => void act(loan, "verify", {}, `${loan.clientName}'s loan was verified.`)}>Verify</button><button className="mini-button" disabled={busyId !== null} onClick={() => void act(loan, "return", {}, `${loan.clientName}'s loan was returned to assessment.`)}>Return</button></div> : screen === "approvals" && role === "committee" && loan.stage === "approval" ? <button className="mini-button" disabled={busyId !== null} onClick={() => { setReviewLoanId(loan.id); setDecisionNote(""); setElectronicSignature(false); }}>Review case</button> : <span className="muted">View only</span>}</td>}
      </tr>)}{!loanRegisterRows.length && <tr><td colSpan={screen === "repayments" ? 9 : screen === "disbursement" ? 6 : 6} className="empty-state">{loading ? "Loading loan records…" : "No matching loan records are available."}</td></tr>}</tbody></table></div></section>}
    {screen === "approvals" && role === "committee" && committeeView === "records" && <section className="panel workflow-panel committee-records-panel">
      <div className="panel-head"><div><h2>Audit trail</h2></div><button className="btn btn-ghost" type="button" onClick={() => void refreshDecisionRecords()}>Refresh records</button></div>
      <div className="table-wrap"><table><thead><tr><th>Date and time</th><th>Applicant / loan</th><th>Product</th><th>Amount</th><th>Outcome</th><th>Authentication</th><th>Electronic signing</th><th>Rationale</th></tr></thead><tbody>
        {decisionRecords.map((record) => <tr key={record.id}><td>{new Date(record.decidedAt).toLocaleString()}</td><td><strong>{record.clientName}</strong><small className="cell-sub">{record.loanNumber}</small></td><td>{record.product}</td><td>{money(Number(record.amount))}</td><td><span className={record.decision === "approved" ? "decision-outcome decision-approved" : "decision-outcome decision-returned"}>{record.decision === "approved" ? "Approved" : "Returned"}</span></td><td>{record.decidedBy}</td><td>{record.signedBy ? `${record.signedBy} · ${record.signedAt ? new Date(record.signedAt).toLocaleString() : ""}` : "—"}</td><td className="decision-rationale">{record.rationale}</td></tr>)}
        {!decisionRecords.length && <tr><td colSpan={8} className="empty-state">No committee decisions have been recorded.</td></tr>}
      </tbody></table></div>
    </section>}
    {screen === "approvals" && role === "committee" && reviewLoan && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && busyId === null) setReviewLoanId(null); }}>
      <section className="committee-review-dialog" role="dialog" aria-modal="true" aria-labelledby="committee-review-title">
        <div className="committee-review-heading"><div><span className="eyebrow">CREDIT COMMITTEE</span><h2 id="committee-review-title">Review loan case</h2><p>{reviewLoan.loanNumber} · submitted by {reviewLoan.officerName}</p></div><button type="button" className="dialog-close" aria-label="Close review" disabled={busyId !== null} onClick={() => setReviewLoanId(null)}>×</button></div>
        <dl className="committee-case-facts">
          <div><dt>Applicant</dt><dd>{reviewLoan.clientName}</dd></div>
          <div><dt>Loan product</dt><dd>{reviewLoan.product}</dd></div>
          <div><dt>Requested amount</dt><dd>{money(Number(reviewLoan.principalAmount ?? reviewLoan.amountDue ?? 0))}</dd></div>
          <div><dt>Date and time records</dt><dd>{new Date(reviewLoan.createdAt).toLocaleString()}</dd></div>
          <div><dt>Authentication</dt><dd>{user.fullName || username} · Credit Committee</dd></div>
          <div><dt>Applicant phone</dt><dd>{reviewLoan.clientPhone || "Not recorded"}</dd></div>
          <div><dt>Business type</dt><dd>{reviewLoan.businessType || "Not recorded"}</dd></div>
          <div className="committee-fact-wide"><dt>Business location</dt><dd>{reviewLoan.businessLocation || "Not recorded"}</dd></div>
        </dl>
        <label className="committee-note-field"><span>Decision rationale</span><textarea rows={4} maxLength={1000} placeholder="Record the reasons for the committee decision" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} /></label>
        <label className="committee-signature-field"><input type="checkbox" checked={electronicSignature} onChange={(event) => setElectronicSignature(event.target.checked)} /><span>Electronic signing</span></label>
        <p className="committee-note-hint">Required for approval or return. The outcome and rationale are retained in committee decision records.</p>
        <div className="committee-review-actions">
          <button type="button" className="mini-button" disabled={busyId !== null} onClick={() => setReviewLoanId(null)}>Cancel</button>
          <button type="button" className="mini-button" disabled={busyId !== null || decisionNote.trim().length < 10 || !electronicSignature} onClick={() => void act(reviewLoan, "return", { decisionNote, electronicSignature }, `${reviewLoan.clientName}'s loan was returned to assessment.`)}>Return for revision</button>
          <button type="button" className="mini-button mini-approve" disabled={busyId !== null || decisionNote.trim().length < 10 || !electronicSignature} onClick={() => void act(reviewLoan, "approve", { decisionNote, electronicSignature }, `${reviewLoan.clientName}'s loan was approved.`)}>{busyId === reviewLoan.id ? "Recording…" : "Approve loan"}</button>
        </div>
      </section>
    </div>}
  </div>;
}

function Stat({ label, value, highlight = false, onClick, expanded }: { label: string; value: string | number; highlight?: boolean; onClick?: () => void; expanded?: boolean }) {
  const className = `${highlight ? "stat-card stat-card-hl" : "stat-card"}${onClick ? " report-stat-action" : ""}`;
  const content = <><span className="card-icon"/><div><span className="stat-card-label">{label}</span><strong className="stat-card-value">{value}</strong></div></>;
  return onClick
    ? <button type="button" className={className} onClick={onClick} aria-expanded={expanded}>{content}</button>
    : <div className={className}>{content}</div>;
}

function Pill({ children }: { children: string }) {
  const cls = children.toLowerCase().includes("repayment") ? "status-pill status-green" : children.toLowerCase().includes("approved") ? "status-pill status-blue" : children.toLowerCase().includes("committee") || children.toLowerCase().includes("verification") ? "status-pill status-amber" : "status-pill status-neutral";
  return <span className={cls}>{children}</span>;
}
