import { useState, type FormEvent } from "react";
import { changePassword } from "../api";

export default function PasswordChangeRequired({ username, onChanged, onSignOut }: { username: string; onChanged: () => void; onSignOut: () => void }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword.length < 12 || newPassword.length > 128) { setError("Choose a password between 12 and 128 characters."); return; }
    if (newPassword !== confirmPassword) { setError("The new passwords do not match."); return; }
    setBusy(true);
    try { await changePassword(currentPassword, newPassword); onChanged(); }
    catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  return <div className="dark-page"><section className="screen screen-narrow" aria-labelledby="password-change-title"><div className="screen-head"><h1 id="password-change-title">Set a new password</h1><span className="screen-role">Account security</span></div><form className="screen-body" onSubmit={(event) => void submit(event)}><p className="role-guidance">A temporary password was issued for <strong>{username}</strong>. Change it to continue.</p><label className="field"><span>Temporary password</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>{error && <p className="note note-error" role="alert">{error}</p>}<div className="actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Change password"}</button><button className="btn btn-ghost" type="button" onClick={onSignOut}>Sign out</button></div></form></section></div>;
}
