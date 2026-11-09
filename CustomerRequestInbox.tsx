import { useEffect, useState } from "react";
import { getCustomerOfficers, getCustomerRequests, updateCustomerRequest } from "../api";
import type { CustomerRequest, CustomerRequestStatus, Role } from "../types";

const typeLabels: Record<CustomerRequest["requestType"], string> = {
  loan: "Loan request",
  group_registration: "Group registration",
  assessment: "Assessment request",
  member_performance: "Member performance report",
};

export default function CustomerRequestInbox({ role }: { role: Role }) {
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visitNotes, setVisitNotes] = useState<Record<number, string>>({});
  const [officers, setOfficers] = useState<{ id: number; username: string; fullName: string }[]>([]);
  const [officerSelections, setOfficerSelections] = useState<Record<number, number>>({});

  async function refresh() {
    setError("");
    try { setRequests(await getCustomerRequests()); }
    catch (reason) { setError((reason as Error).message); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (role === "supervisor") getCustomerOfficers().then(setOfficers).catch((reason) => setError((reason as Error).message)); }, [role]);

  async function update(id: number, status: Exclude<CustomerRequestStatus, "new">, assignedOfficerId?: number) {
    setBusyId(id); setError(""); setNotice("");
    try {
      await updateCustomerRequest(id, status, status === "visited" ? visitNotes[id] : undefined, assignedOfficerId);
      setNotice(status === "reviewing" ? "Loan officer assigned to the assessment visit." : status === "visited" ? "Assessment visit recorded." : status === "approved" ? requestTypeNotice(requests, id) : status === "rejected" ? "Request not approved." : "Request marked completed.");
      await refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  function requestTypeNotice(records: CustomerRequest[], id: number) {
    const request = records.find(record => record.id === id);
    return request?.requestType === "loan" ? "Loan application approved and forwarded for processing." : "Assessment approved. The customer can now request a loan.";
  }

  return <div className="workflow-stack">
    {error && <p className="note note-error" role="alert">{error}</p>}
    {notice && <p className="notice-success" role="status">{notice}</p>}
    <section className="workflow-hero"><div><span className="eyebrow">CUSTOMER SERVICES</span><h2>{role === "supervisor" ? "Zone assessment requests" : role === "director" || role === "ceo" ? "Company customer requests" : "Assigned customer requests"}</h2><p>{role === "supervisor" ? "Review assessment requests for your zones and assign a loan officer to visit." : role === "director" || role === "ceo" ? "Review request activity across BML. Supervisors and loan officers handle assignments and decisions." : "Complete the assessment visits assigned to you."}</p></div><button className="btn btn-ghost" type="button" onClick={() => { setLoading(true); void refresh(); }}>Refresh</button></section>
    {loading && <p className="muted" role="status">Loading customer requests…</p>}
    {!loading && !error && requests.length === 0 && <p className="empty-state">There are no customer requests to review.</p>}
    <div className="request-list officer-request-list">{requests.map((request) => <article className="customer-request-row" key={request.id}>
      <div className="customer-request-title"><div><span className="eyebrow">{typeLabels[request.requestType]}{request.zone ? ` · ${request.zone} zone` : ""}</span><h3>{request.summary}</h3><p>{request.customerName}{request.customerPhone ? ` · ${request.customerPhone}` : ""}</p>{request.assignedSupervisor && <small>Zone supervisor: {request.assignedSupervisor}</small>}{request.assignedOfficer && <small>Assigned officer: {request.assignedOfficer}</small>}<time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time></div><span className={`status-pill ${request.status === "completed" || request.status === "approved" ? "status-green" : request.status === "reviewing" || request.status === "visited" ? "status-amber" : request.status === "rejected" ? "status-red" : "status-neutral"}`}>{request.status === "new" ? "New" : request.status === "reviewing" ? "Officer assigned" : request.status === "visited" ? "Visit recorded" : request.status === "approved" ? "Approved" : request.status === "rejected" ? "Not approved" : "Completed"}</span></div>
      <dl className="request-details">{Object.entries(request.details).filter(([key, value]) => key !== "members" && !Array.isArray(value) && (value === null || typeof value !== "object")).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value)}</dd></div>)}</dl>
      {Array.isArray(request.details.members) && request.details.members.length > 0 && <div className="request-roster"><h4>Registered group members ({request.details.members.length})</h4><div className="table-wrap roster-table-wrap"><table><thead><tr><th>Full names</th><th>Location</th><th>National ID</th><th>Phone number</th><th>Age</th><th>Business type</th><th>Referees</th></tr></thead><tbody>{request.details.members.map((item, index) => {
        const member = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return <tr key={`${String(member.nationalId ?? index)}-${index}`}><td>{String(member.fullName ?? "")}</td><td>{String(member.location ?? "")}</td><td>{String(member.nationalId ?? "")}</td><td>{String(member.phoneNumber ?? "")}</td><td>{String(member.age ?? "")}</td><td>{String(member.businessType ?? "")}</td><td>{String(member.referees ?? "")}</td></tr>;
      })}</tbody></table></div></div>}
      {role === "loan_officer" && request.requestType === "assessment" && request.status === "reviewing" && <label className="visit-notes-field">Visit notes<textarea rows={3} placeholder="Record the visit date and assessment observations" value={visitNotes[request.id] ?? ""} onChange={(event) => setVisitNotes(current => ({ ...current, [request.id]: event.target.value }))} /></label>}
      {role !== "director" && role !== "ceo" && request.status !== "completed" && request.status !== "approved" && request.status !== "rejected" && <div className="request-actions">
        {role === "supervisor" && request.requestType === "assessment" && request.status === "new" && <><label>Assign loan officer<select value={officerSelections[request.id] ?? ""} onChange={(event) => setOfficerSelections((current) => ({ ...current, [request.id]: Number(event.target.value) || 0 }))}><option value="">Choose an officer</option>{officers.map((officer) => <option key={officer.id} value={officer.id}>{officer.fullName} · {officer.username}</option>)}</select></label><button className="btn btn-primary" type="button" disabled={busyId !== null || !officerSelections[request.id]} onClick={() => void update(request.id, "reviewing", officerSelections[request.id])}>Assign visit</button></>}
        {role === "loan_officer" && request.requestType === "assessment" && request.status === "reviewing" && <button className="btn btn-primary" type="button" disabled={busyId !== null || !visitNotes[request.id]?.trim()} onClick={() => void update(request.id, "visited")}>Record officer visit</button>}
        {role === "loan_officer" && request.requestType === "assessment" && request.status === "visited" && <><button className="btn btn-ghost" type="button" disabled={busyId !== null} onClick={() => void update(request.id, "rejected")}>Reject assessment</button><button className="btn btn-primary" type="button" disabled={busyId !== null} onClick={() => void update(request.id, "approved")}>Approve assessment</button></>}
        {request.requestType === "loan" && request.status === "reviewing" && <><button className="btn btn-ghost" type="button" disabled={busyId !== null} onClick={() => void update(request.id, "rejected")}>Reject application</button><button className="btn btn-primary" type="button" disabled={busyId !== null} onClick={() => void update(request.id, "approved")}>Approve application</button></>}
        {!(["assessment", "loan"].includes(request.requestType)) && request.status !== "new" && <button className="btn btn-primary" type="button" disabled={busyId !== null} onClick={() => void update(request.id, "completed")}>Mark completed</button>}
      </div>}
    </article>)}</div>
  </div>;
}
