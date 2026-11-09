import { useEffect, useMemo, useState, type FormEvent } from "react";
import { approveStaffRequest, changePassword, dismissPasswordResetRequest, emailPasswordResetCode, getAdminAccounts, getMessageRecipients, getPasswordResetRequests, getRecentSignIns, getSupervisorZones, listPendingStaffRequests, rejectStaffRequest, saveProfile, saveSupervisorZone, sendAdminMessage, setAccountLock, type AdminMessageAudience } from "../api";
import { roleNames } from "../permissions";
import type { AdminAccount, MessageRecipient, PasswordResetRequest, PendingStaffRequest, RecentSignIn, User } from "../types";

const roleLabels: Record<PendingStaffRequest["requestedRole"], string> = {
  loan_officer: "Loan Officer", management: "Manager", director: "Company Director", ceo: "Chief Executive Officer (Owner)", supervisor: "Supervisor", committee: "Credit Committee", finance: "Finance Officer",
};
const timeLabel = (value: string) => new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function AdminUsers({ username, user, onProfileChange, section = "all", language = "en", onLanguageChange }: { username: string; user: User; onProfileChange: (changes: Partial<User>) => void; section?: "all" | "accounts" | "signins" | "messages" | "requests" | "resets" | "zones" | "profile" | "language" | "credentials"; language?: "en" | "sw"; onLanguageChange: (language: "en" | "sw") => void }) {
  const [requests, setRequests] = useState<PendingStaffRequest[]>([]);
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [signIns, setSignIns] = useState<RecentSignIn[]>([]);
  const [recipients, setRecipients] = useState<MessageRecipient[]>([]);
  const [resetRequests, setResetRequests] = useState<PasswordResetRequest[]>([]);
  const [resetCodeSentTo, setResetCodeSentTo] = useState<string | null>(null);
  const [zones, setZones] = useState<{ zone: string; supervisorId: number | null; supervisorName: string | null }[]>([]);
  const [supervisors, setSupervisors] = useState<{ id: number; username: string; fullName: string }[]>([]);
  const [newZone, setNewZone] = useState("");
  const [zoneSupervisor, setZoneSupervisor] = useState("");
  const [recipient, setRecipient] = useState("");
  const [messageDelivery, setMessageDelivery] = useState<"in_app" | "sms">(user.role === "committee" ? "sms" : "in_app");
  const [accountFilter, setAccountFilter] = useState<"all" | "staff">("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState(user.fullName ?? user.username);
  const [profileImage, setProfileImage] = useState(user.profileImage ?? "");
  const [profileBusy, setProfileBusy] = useState(false);
  const [credentialUsername, setCredentialUsername] = useState(username);
  const [usernameCurrentPassword, setUsernameCurrentPassword] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [credentialBusy, setCredentialBusy] = useState(false);
  const [showUsernamePassword, setShowUsernamePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function refresh() {
    setError("");
    if (section === "messages") {
      try { setRecipients(await getMessageRecipients()); }
      catch (reason) { setError((reason as Error).message); }
      finally { setLoading(false); }
      return;
    }
    const results = await Promise.allSettled([listPendingStaffRequests(), getAdminAccounts(), getRecentSignIns(), getMessageRecipients(), getPasswordResetRequests(), getSupervisorZones()]);
    const [pending, accountList, activity, people, resets, zoneData] = results;
    if (pending.status === "fulfilled") setRequests(pending.value); else setError(pending.reason.message);
    if (accountList.status === "fulfilled") setAccounts(accountList.value); else setError(accountList.reason.message);
    if (activity.status === "fulfilled") setSignIns(activity.value); else setError(activity.reason.message);
    if (people.status === "fulfilled") setRecipients(people.value); else setError(people.reason.message);
    if (resets.status === "fulfilled") setResetRequests(resets.value); else setError(resets.reason.message);
    if (zoneData.status === "fulfilled") { setZones(zoneData.value.zones); setSupervisors(zoneData.value.supervisors); } else setError(zoneData.reason.message);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, []);

  const filteredAccounts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return accounts.filter((item) => {
      const isStaff = item.role !== "customer" && item.role !== "admin" || Boolean(item.requestedRole);
      const matchesType = accountFilter === "all" || isStaff;
      return matchesType && `${item.fullName} ${item.username} ${item.phone ?? ""} ${item.requestedRole ? roleLabels[item.requestedRole] : roleNames[item.role]}`.toLowerCase().includes(needle);
    });
  }, [accounts, query, accountFilter]);

  async function review(request: PendingStaffRequest, approve: boolean) {
    setBusyId(request.id); setError(""); setNotice("");
    try {
      if (approve) await approveStaffRequest(request.id); else await rejectStaffRequest(request.id);
      setRequests((current) => current.filter((item) => item.id !== request.id));
      setNotice(approve ? `${request.fullName} has been approved.` : `${request.fullName}'s request was rejected.`);
      void refresh();
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  async function toggleLock(account: AdminAccount) {
    setBusyId(account.id); setError(""); setNotice("");
    try {
      await setAccountLock(account.id, !account.adminLocked);
      setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, adminLocked: !item.adminLocked } : item));
      setNotice(`${account.fullName}'s account has been ${account.adminLocked ? "unlocked" : "locked"}.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  async function handlePasswordRequest(request: PasswordResetRequest, action: "issue" | "dismiss") {
    setBusyId(request.id); setError(""); setNotice(""); setResetCodeSentTo(null);
    try {
      if (action === "issue") {
        const result = await emailPasswordResetCode(request.id);
        setResetCodeSentTo(result.username);
        setNotice(result.message);
      } else {
        await dismissPasswordResetRequest(request.id);
        setNotice("Password request dismissed.");
      }
      setResetRequests((current) => current.filter((item) => item.id !== request.id));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(null); }
  }

  async function submitMessage(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const audience: AdminMessageAudience = recipient === "all" || recipient.startsWith("customers") ? recipient as AdminMessageAudience : Number(recipient);
      const result = await sendAdminMessage(audience, subject, body, messageDelivery);
      setNotice(messageDelivery === "sms"
        ? `SMS submitted to ${result.sent} recipient${result.sent === 1 ? "" : "s"}${result.skipped ? `; ${result.skipped} without a valid number were skipped` : ""}${result.requestId ? ` · Beem request ${result.requestId}` : ""}.`
        : `Update sent to ${result.sent} user${result.sent === 1 ? "" : "s"}.`);
      setSubject(""); setBody("");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }

  const lockedCount = accounts.filter((item) => item.adminLocked).length;
  const showRequests = section === "all" || section === "requests";
  const showAccounts = section === "all" || section === "accounts";
  const showSignins = section === "all" || section === "signins";
  const showProfile = section === "profile";
  const showLanguage = section === "language";
  const showCredentials = section === "credentials";
  const showResets = section === "all" || section === "resets";
  const showZones = section === "zones";
  const showMessages = section === "all" || section === "messages";

  return <div className="admin-workspace">
    <div className="admin-action-row"><button className="btn btn-ghost admin-refresh" type="button" onClick={() => { setLoading(true); void refresh(); }}>↻ <span>Refresh data</span></button></div>
    {error && <p className="note note-error" role="alert">{error}</p>}
    {notice && <div className="notice-success" role="status">✓ {notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
    {!showProfile && !showLanguage && !showCredentials && <div className="admin-summary-grid">
      <article><span>System accounts</span><strong>{accounts.length}</strong><small>Registered accounts</small></article>
      <article><span>Pending staff</span><strong>{requests.length}</strong><small>Awaiting approval</small></article>
      <article><span>Locked accounts</span><strong>{lockedCount}</strong><small>Admin locked</small></article>
      <article><span>Sign-ins · last hour</span><strong>{signIns.length}</strong><small>Recorded successful sign-ins</small></article>
    </div>}

    {showProfile && <section className="panel panel-admin-section">
        <div className="panel-head"><div><h2>Profile editing</h2><p className="panel-sub">Keep your administrator profile current.</p></div></div>
        <form className="settings-profile-form" onSubmit={async (event) => {
          event.preventDefault(); setProfileBusy(true); setError(""); setNotice("");
          try {
            const result = await saveProfile({ fullName: profileName, ...(profileImage ? { profileImage } : {}) });
            onProfileChange({ fullName: result.fullName, profileImage: result.profileImage });
            setNotice("Your profile has been updated.");
          } catch (reason) { setError((reason as Error).message); }
          finally { setProfileBusy(false); }
        }}>
          <label className="field"><span>Full name</span><input value={profileName} onChange={(event) => setProfileName(event.target.value)} minLength={2} maxLength={120} required /></label>
          <label className="field"><span>Profile photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 1_500_000) { setError("Choose a JPEG, PNG or WebP photo no larger than 1.5 MB."); event.target.value = ""; return; }
            const reader = new FileReader(); reader.onload = () => setProfileImage(typeof reader.result === "string" ? reader.result : ""); reader.onerror = () => setError("Could not read that photo. Try another image."); reader.readAsDataURL(file);
          }} />{profileImage && <img className="signup-photo-preview" src={profileImage} alt="Profile preview" />}</label>
          <button type="submit" className="btn btn-primary" disabled={profileBusy}>{profileBusy ? "Saving…" : "Save profile"}</button>
        </form>
    </section>}
    {showLanguage && <section className="panel panel-admin-section">
        <div className="panel-head"><div><h2>Language selector</h2><p className="panel-sub">Choose a language for the interface.</p></div></div>
        <label className="settings-language-field"><span>Display language</span><select value={language} onChange={(event) => onLanguageChange(event.target.value as "en" | "sw")}><option value="en">English</option><option value="sw">Kiswahili</option></select></label>
        <p className="settings-language-note">Your selection is saved on this device.</p>
    </section>}
    {showCredentials && <section className="panel panel-admin-section">
        <div className="panel-head"><div><h2>Admin login credentials</h2><p className="panel-sub">Update the username or password used to sign in.</p></div></div>
        <form className="settings-profile-form" onSubmit={async (event) => {
          event.preventDefault(); setCredentialBusy(true); setError(""); setNotice("");
          try {
            const result = await saveProfile({ username: credentialUsername, currentPassword: usernameCurrentPassword });
            setCredentialUsername(result.username); setUsernameCurrentPassword(""); onProfileChange({ username: result.username }); setNotice("Admin username updated.");
          } catch (reason) { setError((reason as Error).message); }
          finally { setCredentialBusy(false); }
        }}>
          <label className="field"><span>New username</span><input value={credentialUsername} onChange={(event) => setCredentialUsername(event.target.value)} minLength={3} maxLength={30} required /></label>
          <label className="field"><span>Current password to confirm</span><div className="password-control"><input type={showUsernamePassword ? "text" : "password"} autoComplete="current-password" value={usernameCurrentPassword} onChange={(event) => setUsernameCurrentPassword(event.target.value)} required /><button type="button" className="password-toggle" aria-label={showUsernamePassword ? "Hide current password" : "Show current password"} aria-pressed={showUsernamePassword} onClick={() => setShowUsernamePassword((shown) => !shown)}>{showUsernamePassword ? "Hide" : "Show"}</button></div></label>
          <button type="submit" className="btn btn-primary" disabled={credentialBusy}>{credentialBusy ? "Saving…" : "Change username"}</button>
        </form>
        <form className="settings-profile-form" onSubmit={async (event) => {
          event.preventDefault(); setError(""); setNotice("");
          if (passwordNext.length < 12 || passwordNext.length > 128) { setError("Choose a password between 12 and 128 characters."); return; }
          if (passwordNext !== passwordConfirm) { setError("The new passwords do not match."); return; }
          setCredentialBusy(true);
          try { await changePassword(passwordCurrent, passwordNext); setPasswordCurrent(""); setPasswordNext(""); setPasswordConfirm(""); setNotice("Admin password updated."); }
          catch (reason) { setError((reason as Error).message); }
          finally { setCredentialBusy(false); }
        }}>
          <label className="field"><span>Current password</span><div className="password-control"><input type={showCurrentPassword ? "text" : "password"} autoComplete="current-password" value={passwordCurrent} onChange={(event) => setPasswordCurrent(event.target.value)} required /><button type="button" className="password-toggle" aria-label={showCurrentPassword ? "Hide current password" : "Show current password"} aria-pressed={showCurrentPassword} onClick={() => setShowCurrentPassword((shown) => !shown)}>{showCurrentPassword ? "Hide" : "Show"}</button></div></label>
          <label className="field"><span>New password</span><div className="password-control"><input type={showNewPassword ? "text" : "password"} autoComplete="new-password" value={passwordNext} onChange={(event) => setPasswordNext(event.target.value)} minLength={12} maxLength={128} required /><button type="button" className="password-toggle" aria-label={showNewPassword ? "Hide new password" : "Show new password"} aria-pressed={showNewPassword} onClick={() => setShowNewPassword((shown) => !shown)}>{showNewPassword ? "Hide" : "Show"}</button></div></label>
          <label className="field"><span>Confirm new password</span><div className="password-control"><input type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} required /><button type="button" className="password-toggle" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword((shown) => !shown)}>{showConfirmPassword ? "Hide" : "Show"}</button></div></label>
          <small className="field-help">Special characters are allowed.</small>
          <button type="submit" className="btn btn-primary" disabled={credentialBusy}>{credentialBusy ? "Saving…" : "Change password"}</button>
        </form>
    </section>}

    {showRequests && <section className="panel panel-admin-section">
      <div className="panel-head"><div><h2>Staff registration requests</h2><p className="panel-sub">Approve access requests after confirming the applicant’s details.</p></div><span className="count-chip">{requests.length} pending</span></div>
      <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Phone</th><th>Requested role</th><th>Supervising zone</th><th>Submitted</th><th>Decision</th></tr></thead><tbody>
        {requests.map((request) => <tr key={request.id}><td><strong>{request.fullName}</strong><small className="cell-sub">{request.username}</small></td><td>{request.phone ?? "—"}</td><td>{roleLabels[request.requestedRole]}</td><td>{request.requestedRole === "supervisor" ? request.requestedZone || "Zone missing" : "—"}</td><td>{timeLabel(request.createdAt)}</td><td><div className="row-actions"><button className="mini-button mini-approve" disabled={busyId !== null || (request.requestedRole === "supervisor" && !request.requestedZone)} onClick={() => void review(request, true)}>{busyId === request.id ? "Saving…" : "Approve"}</button><button className="mini-button" disabled={busyId !== null} onClick={() => void review(request, false)}>Reject</button></div></td></tr>)}
        {!requests.length && <tr><td colSpan={6} className="empty-state">{loading ? "Loading requests…" : "No staff requests are waiting for review."}</td></tr>}
      </tbody></table></div>
    </section>}

    {showResets && <section className="panel panel-admin-section">
      <div className="panel-head"><div><h2>Password help requests</h2><p className="panel-sub">After confirming the requester’s identity, send a reset code to their verified email.</p></div><span className="count-chip">{resetRequests.length} pending</span></div>
      {resetCodeSentTo && <div className="notice-success" role="status"><strong>Reset code sent for {resetCodeSentTo}.</strong><small>Ask the user to check their verified email and enter the code on the sign-in screen.</small></div>}
      <div className="table-wrap"><table><thead><tr><th>Username requested</th><th>Contact phone</th><th>Matched account</th><th>Submitted</th><th>Action</th></tr></thead><tbody>
        {resetRequests.map((request) => <tr key={request.id}><td><strong>{request.requestedUsername}</strong></td><td>{request.contactPhone}</td><td>{request.accountUsername ? <><strong>{request.fullName || request.accountUsername}</strong><small className="cell-sub">{request.accountUsername} · {request.role}</small></> : <span className="muted">No matching account</span>}</td><td>{timeLabel(request.createdAt)}</td><td><div className="row-actions">{request.accountUsername && <button className="mini-button mini-approve" disabled={busyId !== null} onClick={() => void handlePasswordRequest(request, "issue")}>{busyId === request.id ? "Working…" : "Email reset code"}</button>}<button className="mini-button" disabled={busyId !== null} onClick={() => void handlePasswordRequest(request, "dismiss")}>Dismiss</button></div></td></tr>)}
        {!resetRequests.length && <tr><td colSpan={5} className="empty-state">{loading ? "Loading requests…" : "No password requests are waiting for review."}</td></tr>}
      </tbody></table></div>
    </section>}

    {showZones && <section className="panel panel-admin-section">
      <div className="panel-head"><div><h2>Supervisor zone assignments</h2><p className="panel-sub">Assessment requests are routed to the supervisor assigned to the customer’s loan group zone.</p></div></div>
      <form className="admin-toolbar" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(""); setNotice(""); try { await saveSupervisorZone(newZone, Number(zoneSupervisor)); setNewZone(""); setZoneSupervisor(""); setNotice("Zone supervisor assignment saved."); await refresh(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>
        <input className="inline-search" aria-label="Zone name" placeholder="Add a zone name" value={newZone} onChange={(event) => setNewZone(event.target.value)} required maxLength={100} />
        <select aria-label="Supervisor" value={zoneSupervisor} onChange={(event) => setZoneSupervisor(event.target.value)} required><option value="">Choose supervisor</option>{supervisors.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.username}</option>)}</select>
        <button className="btn btn-primary" type="submit" disabled={busy || !supervisors.length}>{busy ? "Saving…" : "Save zone assignment"}</button>
      </form>
      <div className="table-wrap"><table><thead><tr><th>Existing loan group zone</th><th>Supervisor</th></tr></thead><tbody>{zones.map((item) => <tr key={item.zone}><td><strong>{item.zone}</strong></td><td><select aria-label={`Supervisor for ${item.zone}`} value={item.supervisorId ?? ""} onChange={async (event) => { const id = Number(event.target.value); if (!id) return; setBusy(true); setError(""); try { await saveSupervisorZone(item.zone, id); setNotice(`${item.zone} is assigned to ${supervisors.find((person) => person.id === id)?.fullName ?? "the supervisor"}.`); await refresh(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }} disabled={busy}><option value="">Unassigned</option>{supervisors.map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.username}</option>)}</select></td></tr>)}{!zones.length && <tr><td colSpan={2} className="empty-state">No zones exist in the current loan group records yet. Add a zone above when one is known.</td></tr>}</tbody></table></div>
    </section>}

    {(showAccounts || showSignins) && <div className={showAccounts && showSignins ? "admin-two-column" : "admin-two-column admin-single-column"}>
      {showAccounts && <section className="panel panel-admin-section">
        <div className="panel-head"><div><h2>Staff and account access</h2><p className="panel-sub">View staff names, usernames, phone numbers, roles, and access status. Passwords cannot be viewed; use Password requests to issue a temporary password after verifying identity.</p></div></div>
        <div className="admin-toolbar"><select aria-label="Filter account type" value={accountFilter} onChange={(event) => setAccountFilter(event.target.value as "all" | "staff")}><option value="all">All accounts</option><option value="staff">Staff accounts</option></select><input className="inline-search" type="search" placeholder="Search name, phone or role" aria-label="Search accounts" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        <div className="table-wrap"><table className="account-access-table"><thead><tr><th>User</th><th>Role</th><th>Access</th><th></th></tr></thead><tbody>
          {filteredAccounts.map((account) => <tr className={account.requestedRole || (account.role !== "customer" && account.role !== "admin") ? "staff-account-row" : undefined} key={account.id}><td><strong>{account.fullName}</strong><small className="cell-sub">{account.username}{account.phone ? ` · ${account.phone}` : ""}</small></td><td>{account.requestedRole ? roleLabels[account.requestedRole] : roleNames[account.role]}</td><td><span className={account.adminLocked ? "admin-status admin-status-locked" : account.active ? "admin-status admin-status-active" : "admin-status"}>{account.adminLocked ? "Locked" : account.active ? "Active" : "Pending"}</span></td><td>{account.username === username ? <span className="muted">Current account</span> : <button className={account.adminLocked ? "mini-button mini-approve" : "mini-button mini-lock"} disabled={busyId !== null} onClick={() => void toggleLock(account)}>{busyId === account.id ? "Saving…" : account.adminLocked ? "Unlock" : "Lock account"}</button>}</td></tr>)}
          {!filteredAccounts.length && <tr><td colSpan={4} className="empty-state">{loading ? "Loading accounts…" : "No matching accounts."}</td></tr>}
        </tbody></table></div>
      </section>}

      {showSignins && <section className="panel panel-admin-section">
        <div className="panel-head"><div><h2>Sign-ins in the last hour</h2><p className="panel-sub">Successful sign-in activity from the audit log.</p></div><span className="count-chip">{signIns.length}</span></div>
        <div className="admin-signin-list">{signIns.map((event) => <article key={event.id}><span className="admin-presence"/><div><strong>{event.username}</strong><small>{timeLabel(event.signedInAt)}</small></div></article>)}{!signIns.length && <p className="empty-state">{loading ? "Loading activity…" : "No successful sign-ins recorded in the past hour."}</p>}</div>
      </section>}
    </div>}

    {showMessages && <section className="panel panel-admin-section admin-message-panel">
      <div className="panel-head"><div><h2>{user.role === "committee" ? "Repayment reminders" : "Send a one-way message"}</h2><p className="panel-sub">{user.role === "committee" ? "Send a one-way SMS to customers whose repayments are due or overdue." : "Send an in-app update or a one-way SMS to one user or a group."}</p></div><span className="admin-mail-icon" aria-hidden="true">✉</span></div>
      <form className="admin-message-form" onSubmit={(event) => void submitMessage(event)}>
        {user.role !== "committee" && <label className="field"><span>Delivery</span><select value={messageDelivery} onChange={(event) => { const value = event.target.value as "in_app" | "sms"; setMessageDelivery(value); if (value === "in_app" && recipient.startsWith("customers")) setRecipient(""); }}><option value="in_app">In-app Updates inbox</option><option value="sms">SMS · Beem</option></select></label>}
        <label className="field"><span>Recipients</span><select value={recipient} onChange={(event) => { const value = event.target.value; setRecipient(value); if (value === "customers_due") { setSubject("Repayment reminder"); setBody("BML reminder: your loan repayment is due. Please make your payment through your usual BML channel. If you have already paid, contact your Loan Officer."); } else if (value === "customers_due_soon") { setSubject("Repayment reminder"); setBody("BML reminder: you have a loan repayment due within the next 3 days. Please make your payment through your usual BML channel. If you have already paid, contact your Loan Officer."); } else if (value === "customers_overdue") { setSubject("Overdue repayment reminder"); setBody("BML reminder: our records show that a loan repayment is overdue. Please contact your Loan Officer if you have already paid or need assistance."); } }} required><option value="">Choose recipients</option>{messageDelivery === "sms" && <optgroup label="Customer groups">{user.role === "committee" ? <option value="customers_due">Customers with repayment due or overdue</option> : <><option value="customers">All BML customers</option><option value="customers_due">Customers with repayment due or overdue</option><option value="customers_due_soon">Customers with repayment due within 3 days</option><option value="customers_overdue">Customers with overdue repayments</option></>}</optgroup>}{user.role !== "committee" && <optgroup label={messageDelivery === "sms" ? "System users with saved phone numbers" : "Active system users"}><option value="all">{messageDelivery === "sms" ? "All active users with mobile numbers" : "All active users"}</option>{recipients.filter((person) => messageDelivery !== "sms" || Boolean(person.phone)).map((person) => <option key={person.id} value={person.id}>{person.fullName} · {roleNames[person.role]}</option>)}</optgroup>}</select></label>
        <label className="field"><span>{messageDelivery === "sms" ? "Subject (first SMS line)" : "Subject"}</span><input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={100} required placeholder="Short, clear subject" /></label>
        <label className="field admin-message-body"><span>Message</span><textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={messageDelivery === "sms" ? 1499 : 2000} required rows={4} placeholder={messageDelivery === "sms" ? "Write a one-way SMS…" : "Write an update for your team…"} /></label>
        <div className="admin-message-actions"><small>{messageDelivery === "sms" ? "SMS is one-way. Replies are not received in this system; valid phone numbers only are sent." : "Messages appear in the recipient’s Updates inbox."}</small><button className="btn btn-primary" type="submit" disabled={busy || (user.role !== "committee" && !recipients.length) || !recipient}>{busy ? "Sending…" : messageDelivery === "sms" ? "Send one-way SMS →" : "Send update →"}</button></div>
      </form>
    </section>}
  </div>;
}
