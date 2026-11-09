import { useState, type FormEvent } from "react";
import { saveProfile } from "../api";
import { roleNames } from "../permissions";
import type { User } from "../types";

export default function ProfileSettings({ user, onProfileChange, onSignOut }: { user: User; onProfileChange: (changes: Partial<User>) => void; onSignOut: () => void }) {
  const [fullName, setFullName] = useState(user.fullName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const result = await saveProfile({ fullName });
      onProfileChange({ fullName: result.fullName });
      setNotice("Profile updated.");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="panel panel-admin-section profile-settings-screen">
    <div className="panel-head"><div><h2>Your profile</h2><p className="panel-sub">Manage your account details and sign out.</p></div></div>
    {error && <p className="note note-error" role="alert">{error}</p>}
    {notice && <p className="notice-success" role="status">{notice}</p>}
    <form className="settings-profile-form" onSubmit={(event) => void submit(event)}>
      <label className="field"><span>Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} minLength={2} maxLength={80} required /></label>
      <label className="field"><span>Username</span><input value={user.username} readOnly /></label>
      <label className="field"><span>Account type</span><input value={roleNames[user.role]} readOnly /></label>
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    </form>
    <div className="profile-signout-action"><div><strong>Sign out</strong><p className="panel-sub">End your current session on this device.</p></div><button type="button" className="btn btn-ghost" onClick={onSignOut}>Sign out</button></div>
  </section>;
}
