import { useState, type FormEvent } from "react";
import { completePasswordReset, login, registerCustomer, requestPasswordReset, requestStaffRegistration, verifyRegistrationEmail } from "../api";
import type { Role } from "../types";
import type { LoginResult } from "../types";

function suggestUsername(name: string): string {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const suggestion = normalized.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.|\.$/g, "").slice(0, 30).replace(/\.$/, "");
  return suggestion.length >= 3 ? suggestion : `${suggestion || "customer"}.user`.slice(0, 30);
}

export default function Login({ creatingAccount, onModeChange, onSignedIn }: { creatingAccount: boolean; onModeChange: (creatingAccount: boolean) => void; onSignedIn: (r: LoginResult) => void }) {
  const [username, setUsername] = useState("");
  const [usernameCustomized, setUsernameCustomized] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState<"customer" | "staff">("customer");
  const [requestedRole, setRequestedRole] = useState<Exclude<Role, "customer" | "admin">>("loan_officer");
  const [requestedZone, setRequestedZone] = useState("");
  const [requestingReset, setRequestingReset] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [awaitingRegistrationVerification, setAwaitingRegistrationVerification] = useState(false);
  const [registrationCode, setRegistrationCode] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      if (requestingReset) {
        if (!resetCodeSent) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter the email address verified on your account.");
          const result = await requestPasswordReset(email);
          setInfo(result.message);
          setResetCodeSent(true);
        } else {
          if (!/^\d{6}$/.test(resetCode.trim())) throw new Error("Enter the six-digit code from your email.");
          if (resetNewPassword.length < 12 || resetNewPassword.length > 128) throw new Error("Choose a password between 12 and 128 characters.");
          if (resetNewPassword !== resetConfirmPassword) throw new Error("The passwords do not match.");
          const result = await completePasswordReset(email, resetCode, resetNewPassword);
          setInfo(result.message);
          setRequestingReset(false);
          setResetCodeSent(false);
          setResetCode("");
          setResetNewPassword("");
          setResetConfirmPassword("");
          setEmail("");
          setUsername("");
        }
      } else if (creatingAccount) {
        if (awaitingRegistrationVerification) {
          if (!/^\d{6}$/.test(registrationCode.trim())) throw new Error("Enter the six-digit code from your email.");
          const result = await verifyRegistrationEmail(email, registrationCode);
          setInfo(result.message);
          setAwaitingRegistrationVerification(false);
          setRegistrationCode("");
          onModeChange(false);
          setUsername("");
          setPhone("");
          setEmail("");
          setPassword("");
          setConfirmPassword("");
          setProfilePhoto("");
          setRequestedZone("");
          return;
        }
        if (!fullName.trim() || fullName.trim().length > 120) throw new Error("Enter a name between 1 and 120 characters.");
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || email.trim().length > 254) throw new Error("Enter a valid email address.");
        if (!/^[^\s\p{C}]{3,30}$/u.test(username.trim().toLowerCase())) {
          throw new Error("Choose a username with 3 to 30 characters and no spaces. Special characters are allowed.");
        }
        const compactPhone = phone.replace(/[\s()-]/g, "");
        const internationalPhone = compactPhone.startsWith("0") && /^[07][67]\d{8}$/.test(compactPhone)
          ? `+255${compactPhone.slice(1)}`
          : compactPhone.startsWith("255") && /^255[67]\d{8}$/.test(compactPhone)
            ? `+${compactPhone}`
            : compactPhone;
        if (!/^\+[1-9]\d{7,14}$/.test(internationalPhone)) {
          throw new Error("Enter a valid mobile number with country code, for example +255 712 345 678.");
        }
        if (password.length < 10 || password.length > 128) throw new Error("Choose a password between 10 and 128 characters.");
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        if (accountType === "customer") {
          const result = await registerCustomer(fullName, username, email, phone, password, profilePhoto || undefined);
          setInfo(result.message);
        } else {
          if (requestedRole === "supervisor" && !requestedZone.trim()) throw new Error("Enter the zone this supervisor will be responsible for.");
          const result = await requestStaffRegistration({ fullName, username, email, phone, password, ...(profilePhoto ? { profileImage: profilePhoto } : {}), requestedRole, ...(requestedRole === "supervisor" ? { requestedZone: requestedZone.trim() } : {}) });
          setInfo(result.message);
        }
        setAwaitingRegistrationVerification(true);
      } else {
        if (!username.trim() || !password) throw new Error("Enter your username and password.");
        onSignedIn(await login(username, password));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen screen-narrow" aria-labelledby="auth-title">
      <div className="screen-head">
        <h1 id="auth-title">{creatingAccount ? <><span className="screen-code"></span> Create your account</> : "Brianna Microfinance Limited"}</h1>
        <span className="screen-role">{creatingAccount ? "User registration" : "Secure sign in"}</span>
      </div>
      <form className="screen-body" onSubmit={handleSubmit} noValidate>
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && <label className="field">
          <span>Account type</span>
          <select value={accountType} onChange={(e) => setAccountType(e.target.value as "customer" | "staff")}>
            <option value="customer">Customer</option>
            <option value="staff">BML staff member</option>
          </select>
        </label>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && accountType === "staff" && <label className="field">
          <span>Role you are requesting</span>
          <select value={requestedRole} onChange={(e) => setRequestedRole(e.target.value as Exclude<Role, "customer" | "admin">)}>
            <option value="loan_officer">Loan Officer</option>
            <option value="management">Manager</option>
            <option value="director">Company Director</option>
            <option value="ceo">Chief Executive Officer (Owner)</option>
            <option value="supervisor">Supervisor</option>
            <option value="committee">Credit Committee</option>
            <option value="finance">Finance Officer</option>
          </select>
          <small className="field-help">An administrator must approve your requested role before you can sign in.</small>
        </label>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && <label className="field">
          <span>Full name</span>
          <input type="text" autoComplete="name" value={fullName} onChange={(e) => {
            const value = e.target.value;
            setFullName(value);
            if (!usernameCustomized) {
              setUsername(suggestUsername(value));
            }
          }} />
        </label>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && <label className="field">
          <span>Username</span>
          <input type="text" autoComplete="username" value={username} onChange={(e) => { setUsernameCustomized(true); setUsername(e.target.value.toLowerCase().replace(/\s/g, "")); }} />
          <small className="field-help">Suggested from your name. You can change it.</small>
        </label>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && <label className="field">
          <span>Email address</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
          <small className="field-help">Use an address you can access. It can be used for account verification.</small>
        </label>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && <label className="field photo-upload-field">
          <span>Profile photo <b className="field-help">Optional</b></span>
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
            const file = event.target.files?.[0];
            setError("");
            if (!file) { setProfilePhoto(""); return; }
            if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setProfilePhoto(""); setError("Choose a JPEG, PNG or WebP image."); event.target.value = ""; return; }
            if (file.size > 1_500_000) { setProfilePhoto(""); setError("The profile photo must be 1.5 MB or smaller."); event.target.value = ""; return; }
            const reader = new FileReader();
            reader.onload = () => setProfilePhoto(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => setError("Could not read that photo. Please try another image.");
            reader.readAsDataURL(file);
          }} />
          {profilePhoto && <img className="signup-photo-preview" src={profilePhoto} alt="Profile photo preview" />}
          <small className="field-help">JPEG, PNG or WebP · maximum 1.5 MB</small>
        </label>}
        {!awaitingRegistrationVerification && <label className="field">
          <span>{requestingReset ? "Email address" : creatingAccount ? "Mobile phone" : "Username"}</span>
          <input type={requestingReset ? "email" : "text"} autoComplete={requestingReset ? "email" : creatingAccount ? "tel" : "username"} value={requestingReset ? email : creatingAccount ? phone : username} onChange={(e) => requestingReset ? setEmail(e.target.value) : creatingAccount ? setPhone(e.target.value) : setUsername(e.target.value)} required />
        </label>}
        {awaitingRegistrationVerification && <p className="role-guidance">Enter the six-digit code sent to <strong>{email}</strong>.</p>}
        {requestingReset && !resetCodeSent && <small className="field-help">We’ll send a reset code if this address is verified on an account.</small>}
        {requestingReset && resetCodeSent && <>
          <label className="field"><span>Email code</span><input inputMode="numeric" autoComplete="one-time-code" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} required /></label>
          <label className="field"><span>New password</span><input type="password" autoComplete="new-password" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} required /></label>
          <label className="field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={resetConfirmPassword} onChange={(e) => setResetConfirmPassword(e.target.value)} required /></label>
        </>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && accountType === "staff" && requestedRole === "supervisor" && <label className="field">
          <span>Supervising zone</span>
          <input type="text" value={requestedZone} onChange={(event) => setRequestedZone(event.target.value)} maxLength={100} placeholder="Enter the existing BML loan group zone" required />
          <small className="field-help">The system administrator will review this zone with the account request.</small>
        </label>}
        {!requestingReset && !awaitingRegistrationVerification && <label className="field">
          <span>{creatingAccount ? "Create password" : "Password"}</span>
          <div className="password-control">
            <input type={showPasswords ? "text" : "password"} autoComplete={creatingAccount ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="password-toggle" aria-label={showPasswords ? "Hide password" : "Show password"} aria-pressed={showPasswords} onClick={() => setShowPasswords((show) => !show)}>{showPasswords ? "Hide" : "Show"}</button>
          </div>
        </label>}
        {!requestingReset && creatingAccount && !awaitingRegistrationVerification && <label className="field">
          <span>Confirm password</span>
          <div className="password-control">
            <input type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <button type="button" className="password-toggle" aria-label={showPasswords ? "Hide passwords" : "Show passwords"} aria-pressed={showPasswords} onClick={() => setShowPasswords((show) => !show)}>{showPasswords ? "Hide" : "Show"}</button>
          </div>
        </label>}
        {awaitingRegistrationVerification && <>
          <label className="field"><span>Email code</span><input inputMode="numeric" autoComplete="one-time-code" value={registrationCode} onChange={(e) => setRegistrationCode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} required /></label>
          <small className="field-help">The account will be created only after the email code is verified.</small>
        </>}
        {error && <p className="note note-error" role="alert">{error}</p>}
        {info && <p className="note" role="status">{info}</p>}
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Please wait…" : requestingReset ? resetCodeSent ? "Reset password" : "Email reset code" : creatingAccount ? awaitingRegistrationVerification ? "Verify email and create account" : accountType === "customer" ? "Send verification code" : "Verify email to submit request" : "Sign in"}</button>
          {!creatingAccount && !requestingReset && <button type="button" className="btn btn-ghost" onClick={() => { setRequestingReset(true); setResetCodeSent(false); setError(""); setInfo(""); setPassword(""); setEmail(""); }}>Forgot password?</button>}
          {requestingReset && <button type="button" className="btn btn-ghost" onClick={() => { setRequestingReset(false); setResetCodeSent(false); setResetCode(""); setError(""); setInfo(""); setEmail(""); }}>Back to sign in</button>}
          {awaitingRegistrationVerification && <button type="button" className="btn btn-ghost" onClick={() => { setAwaitingRegistrationVerification(false); setRegistrationCode(""); setError(""); setInfo(""); }}>Back to registration</button>}
        </div>
        {requestingReset
          ? <p className="role-guidance">Use the verified email address on your account. Reset codes expire after 10 minutes.</p>
          : creatingAccount
          ? <p className="role-guidance role-guidance-registration">Customers can sign in after verifying their email. Staff also need administrator approval before role-based access is enabled.</p>
          : <p className="role-guidance">Staff roles are assigned to your BML account by an administrator. Customer accounts are created through public registration.</p>}
        {!requestingReset && !awaitingRegistrationVerification && <button type="button" className="auth-switch" onClick={() => { onModeChange(!creatingAccount); setAwaitingRegistrationVerification(false); setRegistrationCode(""); setUsername(""); setUsernameCustomized(false); setPhone(""); setEmail(""); setFullName(""); setError(""); setInfo(""); }}>{creatingAccount ? "Already registered? Sign in" : "Create account"}</button>}
      </form>
    </section>
  );
}
