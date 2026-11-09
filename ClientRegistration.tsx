import { useEffect, useState, type FormEvent } from "react";
import { getClient, listClients, saveClient, submitClient } from "../api";
import type { ClientInput, ClientSummary } from "../types";

const SOURCES = [
  { value: "self", label: "Customer self-registration" },
  { value: "staff", label: "BML staff" },
  { value: "officer", label: "Loan Officer" },
];

const empty: ClientInput = {
  source: "",
  fullName: "",
  nationalId: "",
  phone: "",
  businessType: "",
  businessLocation: "",
  introducedBy: "",
};

function validate(f: ClientInput): string {
  if (!f.source) return "Choose how the customer was introduced.";
  if (!f.fullName.trim()) return "Enter the client's full name.";
  if (!/^[A-Za-z0-9]{8,20}$/.test(f.nationalId.replace(/\s/g, ""))) {
    return "Enter a valid national ID (8 to 20 letters or digits).";
  }
  if (!/^(?:\+?255|0)[67]\d{8}$/.test(f.phone.replace(/[\s-]/g, ""))) {
    return "Enter a valid phone number, for example 0712 345 678.";
  }
  if (!f.businessType.trim()) return "Enter the business type.";
  if (!f.businessLocation.trim()) return "Enter the business location.";
  return "";
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Dar_es_Salaam",
  });
}

export default function ClientRegistration() {
  const [form, setForm] = useState<ClientInput>(empty);
  const [clientId, setClientId] = useState<number | undefined>();
  const [introducedAt, setIntroducedAt] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [drafts, setDrafts] = useState<ClientSummary[]>([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshDrafts() {
    const all = await listClients();
    setDrafts(all.filter((c) => c.status === "draft"));
  }

  useEffect(() => {
    refreshDrafts().catch((e: Error) => setError(e.message));
  }, []);

  function update<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
    setForm({ ...form, [key]: value });
    setInfo("");
  }

  async function persist(): Promise<number | undefined> {
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return undefined;
    }
    const result = await saveClient(form, clientId);
    setClientId(result.id);
    setIntroducedAt(result.introducedAt);
    setForm((f) => ({ ...f, introducedBy: f.introducedBy || result.introducedBy }));
    return result.id;
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const id = await persist();
      if (id !== undefined) {
        setInfo(`Saved ${form.fullName.trim()} as a draft.`);
        await refreshDrafts();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const id = await persist();
      if (id === undefined) return;
      await submitClient(id);
      setSubmitted(true);
      setInfo("Application submitted. Next: A3a Application tracker, then A4 Field credit assessment.");
      await refreshDrafts();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadDraft(value: string) {
    setError("");
    setInfo("");
    if (!value) {
      startNew();
      return;
    }
    setBusy(true);
    try {
      const c = await getClient(Number(value));
      setForm({
        source: c.source,
        fullName: c.fullName,
        nationalId: c.nationalId,
        phone: c.phone,
        businessType: c.businessType,
        businessLocation: c.businessLocation,
        introducedBy: c.introducedBy,
      });
      setClientId(c.id);
      setIntroducedAt(c.introducedAt);
      setSubmitted(c.status === "submitted");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setForm(empty);
    setClientId(undefined);
    setIntroducedAt("");
    setSubmitted(false);
    setError("");
    setInfo("");
  }

  const locked = submitted;

  return (
    <section className="screen" aria-labelledby="a3-title">
      <div className="screen-head">
        <h1 id="a3-title">
          <span className="screen-code">A3</span> Client registration
        </h1>
        <span className="screen-role">Loan Officer, BML staff or customer</span>
      </div>

      <form className="screen-body" onSubmit={handleSave} noValidate>
        {drafts.length > 0 && !submitted && (
          <label className="field">
            <span>Continue a saved draft</span>
            <select
              value={clientId !== undefined && drafts.some((d) => d.id === clientId) ? clientId : ""}
              onChange={(e) => loadDraft(e.target.value)}
              disabled={busy}
            >
              <option value="">New client</option>
              {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName} ({d.businessType})
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="field">
          <span id="source-label">Registration source</span>
          <div className="chips" role="radiogroup" aria-labelledby="source-label">
            {SOURCES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={form.source === s.value}
                className={form.source === s.value ? "chip chip-active" : "chip"}
                disabled={locked}
                onClick={() => update("source", s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid-2">
          <label className="field">
            <span>Full name</span>
            <input
              type="text"
              value={form.fullName}
              disabled={locked}
              placeholder="Enter customer name"
              onChange={(e) => update("fullName", e.target.value)}
            />
          </label>
          <label className="field">
            <span>National ID</span>
            <input
              type="text"
              value={form.nationalId}
              disabled={locked}
              onChange={(e) => update("nationalId", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Phone</span>
            <input
              type="tel"
              value={form.phone}
              disabled={locked}
              onChange={(e) => update("phone", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Business type</span>
            <input
              type="text"
              value={form.businessType}
              disabled={locked}
              onChange={(e) => update("businessType", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Business location</span>
            <input
              type="text"
              value={form.businessLocation}
              disabled={locked}
              onChange={(e) => update("businessLocation", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Introduced by</span>
            <input
              type="text"
              value={form.introducedBy}
              disabled={locked}
              placeholder="Defaults to you"
              onChange={(e) => update("introducedBy", e.target.value)}
            />
          </label>
        </div>

        <p className="note">
          {introducedAt
            ? `Introduced ${formatTime(introducedAt)}. The time is stamped by the system and cannot be edited.`
            : "The introduced time is stamped by the system when you save and cannot be edited."}
        </p>

        {error && <p className="note note-error" role="alert">{error}</p>}
        {info && <p className="note" role="status">{info}</p>}

        <div className="actions">
          {submitted ? (
            <button type="button" className="btn btn-primary" onClick={startNew}>
              Register another client
            </button>
          ) : (
            <>
              <button type="submit" className="btn btn-ghost" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={handleSubmit}>
                Submit application
              </button>
            </>
          )}
        </div>

        <p className="next">Next: A3a Application tracker, then A4</p>
      </form>
    </section>
  );
}
