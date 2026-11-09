import { useEffect, useState } from "react";
import { getCustomerRequests } from "../api";
import type { CustomerRequest } from "../types";

type GroupMember = Record<string, unknown>;

export default function CustomerGroupProfile({ onNavigate }: { onNavigate: (section: string) => void }) {
  const [groupRequest, setGroupRequest] = useState<CustomerRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadProfile() {
    setLoading(true);
    setError("");
    try {
      const requests = await getCustomerRequests();
      const latestGroup = requests
        .filter(request => request.requestType === "group_registration")
        .sort((left, right) => right.id - left.id)[0] ?? null;
      setGroupRequest(latestGroup);
    } catch (reason) {
      setError((reason as Error).message || "Could not load the group profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProfile(); }, []);

  const details = groupRequest?.details ?? {};
  const value = (key: string) => String(details[key] ?? "Not provided");
  const members = Array.isArray(details.members) ? details.members as GroupMember[] : [];
  const statusLabel: Record<CustomerRequest["status"], string> = {
    new: "Submitted",
    reviewing: "Under review",
    visited: "Visit recorded",
    approved: "Approved",
    rejected: "Not approved",
    completed: "Completed",
  };

  return <section className="portal-section group-profile-page">
    <div className="group-profile-toolbar"><span className="eyebrow">GROUP ACCOUNT</span><button className="btn btn-ghost" type="button" onClick={() => void loadProfile()} disabled={loading}>Refresh</button></div>
    {loading && <p className="muted" role="status">Loading group profile…</p>}
    {error && <p className="note note-error" role="alert">{error}</p>}
    {!loading && !error && !groupRequest && <div className="group-profile-empty"><h3>No group profile yet</h3><p>Register your group to create its shared profile and add member details.</p><button className="btn btn-primary" type="button" onClick={() => onNavigate("register-group")}>Register a group</button></div>}
    {!loading && !error && groupRequest && <>
      <article className="group-profile-summary">
        <div className="group-profile-title"><div><span className="eyebrow">REGISTERED GROUP</span><h3>{value("groupName")}</h3></div><span className={`status-pill ${groupRequest.status === "approved" || groupRequest.status === "completed" ? "status-green" : groupRequest.status === "rejected" ? "status-red" : "status-amber"}`}>{statusLabel[groupRequest.status]}</span></div>
        <dl className="group-profile-details">
          <div><dt>Group location</dt><dd>{value("location")}</dd></div>
          <div><dt>Chairperson</dt><dd>{value("chairpersonName")}</dd></div>
          <div><dt>Chairperson mobile number</dt><dd>{value("chairpersonPhone")}</dd></div>
          <div><dt>Accountant</dt><dd>{value("accountantName")}</dd></div>
          <div><dt>Accountant phone number</dt><dd>{value("accountantPhone")}</dd></div>
          <div><dt>Meeting day</dt><dd>{value("meetingDay")}</dd></div>
          <div><dt>Registered members</dt><dd>{members.length}</dd></div>
        </dl>
      </article>
      <section className="group-profile-members"><div className="section-heading"><div><span className="eyebrow">MEMBERS</span><h3>Registered members</h3></div><button className="btn btn-ghost" type="button" onClick={() => onNavigate("requests")}>View request history</button></div>
        {members.length ? <div className="table-wrap roster-table-wrap"><table><thead><tr><th>Full names</th><th>Location</th><th>National ID</th><th>Phone number</th><th>Age</th><th>Business type</th><th>Referees</th></tr></thead><tbody>{members.map((item, index) => <tr key={`${String(item.nationalId ?? index)}-${index}`}><td>{String(item.fullName ?? "")}</td><td>{String(item.location ?? "")}</td><td>{String(item.nationalId ?? "")}</td><td>{String(item.phoneNumber ?? "")}</td><td>{String(item.age ?? "")}</td><td>{String(item.businessType ?? "")}</td><td>{String(item.referees ?? "")}</td></tr>)}</tbody></table></div> : <p className="empty-state">No member roster was included in this group registration.</p>}
      </section>
      {groupRequest.status === "rejected" && <button className="btn btn-primary" type="button" onClick={() => onNavigate("register-group")}>Submit updated group registration</button>}
    </>}
  </section>;
}
