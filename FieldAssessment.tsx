import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { getAssessment, listAssessmentSubjects, saveAssessment } from "../api";
import type { AssessmentPayload, AssessmentRecord, AssessmentSubject } from "../types";

type Tab = "qualitative" | "quantitative" | "premises";

interface FormState {
  characterRating: string;
  characterNote: string;
  attitudeRating: string;
  attitudeNote: string;
  cohesionRating: string;
  cohesionNote: string;
  monthlySales: string;
  workingCapital: string;
  monthlyCashFlow: string;
  existingObligations: string;
  premisesVisited: boolean;
  premisesOwnership: string;
  premisesNotes: string;
}

const emptyForm: FormState = {
  characterRating: "",
  characterNote: "",
  attitudeRating: "",
  attitudeNote: "",
  cohesionRating: "",
  cohesionNote: "",
  monthlySales: "",
  workingCapital: "",
  monthlyCashFlow: "",
  existingObligations: "",
  premisesVisited: false,
  premisesOwnership: "",
  premisesNotes: "",
};

const RATINGS = [
  { value: "strong", label: "Strong" },
  { value: "average", label: "Average" },
  { value: "weak", label: "Weak" },
];

const statusText = { none: "not started", draft: "draft", submitted: "submitted" };

// ---------- helpers ----------

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 12);
const show = (v: string) => (v ? Number(v).toLocaleString("en-US") : "");
const num = (v: string): number | null => (v === "" ? null : Number(v));
const str = (n: number | null) => (n === null ? "" : String(n));

function toPayload(f: FormState, submit: boolean): AssessmentPayload {
  return {
    characterRating: f.characterRating,
    characterNote: f.characterNote,
    attitudeRating: f.attitudeRating,
    attitudeNote: f.attitudeNote,
    cohesionRating: f.cohesionRating,
    cohesionNote: f.cohesionNote,
    monthlySales: num(f.monthlySales),
    workingCapital: num(f.workingCapital),
    monthlyCashFlow: num(f.monthlyCashFlow),
    existingObligations: num(f.existingObligations),
    premisesVisited: f.premisesVisited,
    premisesOwnership: f.premisesOwnership,
    premisesNotes: f.premisesNotes,
    submit,
  };
}

function fromPayload(p: AssessmentPayload): FormState {
  return {
    characterRating: p.characterRating,
    characterNote: p.characterNote,
    attitudeRating: p.attitudeRating,
    attitudeNote: p.attitudeNote,
    cohesionRating: p.cohesionRating,
    cohesionNote: p.cohesionNote,
    monthlySales: str(p.monthlySales),
    workingCapital: str(p.workingCapital),
    monthlyCashFlow: str(p.monthlyCashFlow),
    existingObligations: str(p.existingObligations),
    premisesVisited: p.premisesVisited,
    premisesOwnership: p.premisesOwnership,
    premisesNotes: p.premisesNotes,
  };
}

function fromRecord(a: AssessmentRecord): FormState {
  return {
    characterRating: a.characterRating ?? "",
    characterNote: a.characterNote,
    attitudeRating: a.attitudeRating ?? "",
    attitudeNote: a.attitudeNote,
    cohesionRating: a.cohesionRating ?? "",
    cohesionNote: a.cohesionNote,
    monthlySales: str(a.monthlySales),
    workingCapital: str(a.workingCapital),
    monthlyCashFlow: str(a.monthlyCashFlow),
    existingObligations: str(a.existingObligations),
    premisesVisited: a.premisesVisited,
    premisesOwnership: a.premisesOwnership ?? "",
    premisesNotes: a.premisesNotes,
  };
}

function validateSubmit(f: FormState, type: "client" | "group"): string {
  const who = type === "group" ? "group" : "client";
  if (!f.characterRating) return `Rate the ${who}'s character on the Qualitative tab.`;
  if (!f.attitudeRating) return `Rate the ${who}'s repayment attitude on the Qualitative tab.`;
  if (type === "group" && !f.cohesionRating) return "Rate the group's cohesion on the Qualitative tab.";
  if (!f.monthlySales) return "Enter the monthly sales on the Quantitative tab.";
  if (!f.monthlyCashFlow) return "Enter the monthly cash flow on the Quantitative tab.";
  return "";
}

// ---------- drafts saved on this device when there is no connection ----------

const QUEUE_KEY = "bml_assessment_queue";

interface Queued {
  key: string;
  type: "client" | "group";
  id: number;
  payload: AssessmentPayload;
}

function readQueue(): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

function writeQueue(q: Queued[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable */
  }
}

function queueDraft(item: Queued) {
  writeQueue([...readQueue().filter((q) => q.key !== item.key), item]);
}

function dropFromQueue(key: string) {
  writeQueue(readQueue().filter((q) => q.key !== key));
}

// Sends saved drafts. Stops when the connection is still down. Returns how many synced.
async function flushQueue(): Promise<number> {
  let done = 0;
  for (const item of readQueue()) {
    try {
      await saveAssessment(item.type, item.id, item.payload);
      dropFromQueue(item.key);
      done++;
    } catch (err) {
      if (err instanceof TypeError) break;
      dropFromQueue(item.key); // the server refused it (for example already submitted)
    }
  }
  return done;
}

// ---------- small components ----------

function MoneyField(props: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <div className="money">
        <em>TZS</em>
        <input
          type="text"
          inputMode="numeric"
          value={show(props.value)}
          disabled={props.disabled}
          onChange={(e) => props.onChange(digits(e.target.value))}
        />
      </div>
    </label>
  );
}

function RatingField(props: {
  label: string;
  value: string;
  note: string;
  disabled: boolean;
  onValue: (v: string) => void;
  onNote: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="rating-block">
      <span className="rating-label" id={id}>{props.label}</span>
      <div className="chips" role="radiogroup" aria-labelledby={id}>
        {RATINGS.map((r) => (
          <button
            key={r.value}
            type="button"
            role="radio"
            aria-checked={props.value === r.value}
            className={props.value === r.value ? "chip chip-active" : "chip"}
            disabled={props.disabled}
            onClick={() => props.onValue(r.value)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <textarea
        className="plain-textarea"
        rows={2}
        value={props.note}
        disabled={props.disabled}
        placeholder="Notes from the visit"
        aria-label={`${props.label} notes`}
        onChange={(e) => props.onNote(e.target.value)}
      />
    </div>
  );
}

// ---------- the screen ----------

export default function FieldAssessment() {
  const [subjects, setSubjects] = useState<AssessmentSubject[]>([]);
  const [key, setKey] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<"new" | "draft" | "submitted">("new");
  const [tab, setTab] = useState<Tab>("quantitative");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pending, setPending] = useState(readQueue().length);

  const subject = useMemo(
    () => subjects.find((s) => `${s.type}:${s.id}` === key),
    [subjects, key]
  );

  async function refreshSubjects() {
    setSubjects(await listAssessmentSubjects());
  }

  const sync = useCallback(async () => {
    if (readQueue().length === 0) return;
    const done = await flushQueue();
    setPending(readQueue().length);
    if (done > 0) {
      setInfo(`Synced ${done} draft${done === 1 ? "" : "s"} saved on this device.`);
      listAssessmentSubjects().then(setSubjects).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    refreshSubjects()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
    sync();
    window.addEventListener("online", sync);
    return () => window.removeEventListener("online", sync);
  }, [sync]);

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    setInfo("");
  }

  async function chooseSubject(value: string) {
    setKey(value);
    setError("");
    setInfo("");
    setForm(emptyForm);
    setStatus("new");
    setTab("quantitative");
    if (!value) return;
    const [type, id] = value.split(":");
    setBusy(true);
    try {
      const { assessment } = await getAssessment(type as "client" | "group", Number(id));
      const queued = readQueue().find((q) => q.key === value);
      if (queued) {
        setForm(fromPayload(queued.payload));
        setStatus(assessment?.status ?? "draft");
        setInfo("This draft is saved on this device and is waiting to sync.");
      } else if (assessment) {
        setForm(fromRecord(assessment));
        setStatus(assessment.status);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave(submit: boolean) {
    if (!subject) return;
    setError("");
    setInfo("");
    if (submit) {
      const problem = validateSubmit(form, subject.type);
      if (problem) {
        setError(problem);
        return;
      }
      if (!window.confirm("Submit this assessment? It cannot be changed afterwards.")) return;
    }
    const payload = toPayload(form, submit);
    setBusy(true);
    try {
      await saveAssessment(subject.type, subject.id, payload);
      dropFromQueue(key);
      setPending(readQueue().length);
      setStatus(submit ? "submitted" : "draft");
      setInfo(submit ? "Assessment submitted. Next: A5 Evidence upload." : "Draft saved.");
      refreshSubjects().catch(() => undefined);
    } catch (err) {
      if (err instanceof TypeError && !submit) {
        queueDraft({ key, type: subject.type, id: subject.id, payload });
        setPending(readQueue().length);
        setStatus((s) => (s === "new" ? "draft" : s));
        setInfo("No connection. The draft is saved on this device and will sync when you are back online.");
      } else if (err instanceof TypeError) {
        setError("No connection. Connect to submit. You can still save a draft on this device.");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  const locked = status === "submitted";
  const off = locked || busy;
  const isGroup = subject?.type === "group";

  return (
    <section className="screen" aria-labelledby="a4-title">
      <div className="screen-head">
        <h1 id="a4-title">
          <span className="screen-code">A4</span> Field credit assessment
        </h1>
        <span className="screen-role">Loan Officer</span>
      </div>

      <div className="screen-body">
        <label className="field">
          <span>Applicant</span>
          <select value={key} onChange={(e) => chooseSubject(e.target.value)} disabled={busy}>
            <option value="">Choose a client or group to assess</option>
            {subjects.map((s) => (
              <option key={`${s.type}:${s.id}`} value={`${s.type}:${s.id}`}>
                {s.name} ({s.type === "group" ? "Group" : "Client"}, {statusText[s.assessmentStatus]})
              </option>
            ))}
          </select>
        </label>

        {loading && <p className="muted">Loading your applicants…</p>}
        {!loading && subjects.length === 0 && (
          <p className="note">
            No applicants are ready for assessment. Submit a client application or a group for
            assessment first.
          </p>
        )}
        {pending > 0 && (
          <p className="note" role="status">
            {pending} draft{pending === 1 ? " is" : "s are"} saved on this device and will sync when you
            are back online.
          </p>
        )}
        {error && <p className="note note-error" role="alert">{error}</p>}
        {info && <p className="note" role="status">{info}</p>}

        {subject && (
          <>
            <div className="tabs" role="tablist">
              {(["qualitative", "quantitative", "premises"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  className={tab === t ? "tab tab-active" : "tab"}
                  onClick={() => setTab(t)}
                >
                  {t === "qualitative" ? "Qualitative" : t === "quantitative" ? "Quantitative" : "Premises"}
                </button>
              ))}
            </div>

            {tab === "qualitative" && (
              <>
                <RatingField
                  label="Character"
                  value={form.characterRating}
                  note={form.characterNote}
                  disabled={off}
                  onValue={(v) => set("characterRating", v)}
                  onNote={(v) => set("characterNote", v)}
                />
                <RatingField
                  label="Repayment attitude"
                  value={form.attitudeRating}
                  note={form.attitudeNote}
                  disabled={off}
                  onValue={(v) => set("attitudeRating", v)}
                  onNote={(v) => set("attitudeNote", v)}
                />
                {isGroup && (
                  <RatingField
                    label="Group cohesion"
                    value={form.cohesionRating}
                    note={form.cohesionNote}
                    disabled={off}
                    onValue={(v) => set("cohesionRating", v)}
                    onNote={(v) => set("cohesionNote", v)}
                  />
                )}
              </>
            )}

            {tab === "quantitative" && (
              <>
                <div className="grid-2">
                  <MoneyField label="Monthly sales" value={form.monthlySales} disabled={off} onChange={(v) => set("monthlySales", v)} />
                  <MoneyField label="Working capital" value={form.workingCapital} disabled={off} onChange={(v) => set("workingCapital", v)} />
                  <MoneyField label="Monthly cash flow" value={form.monthlyCashFlow} disabled={off} onChange={(v) => set("monthlyCashFlow", v)} />
                  <MoneyField label="Existing obligations" value={form.existingObligations} disabled={off} onChange={(v) => set("existingObligations", v)} />
                </div>
              </>
            )}

            {tab === "premises" && (
              <>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={form.premisesVisited}
                    disabled={off}
                    onChange={(e) => set("premisesVisited", e.target.checked)}
                  />
                  <span>Business premises visited and confirmed</span>
                </label>
                <label className="field">
                  <span>Premises held</span>
                  <select
                    value={form.premisesOwnership}
                    disabled={off}
                    onChange={(e) => set("premisesOwnership", e.target.value)}
                  >
                    <option value="">Choose one</option>
                    <option value="owned">Owned</option>
                    <option value="rented">Rented</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="field">
                  <span>Premises notes</span>
                  <textarea
                    className="plain-textarea"
                    rows={3}
                    value={form.premisesNotes}
                    disabled={off}
                    placeholder="Stock on site, condition, neighbours who know the business"
                    onChange={(e) => set("premisesNotes", e.target.value)}
                  />
                </label>
              </>
            )}

            {locked ? (
              <p className="note">This assessment was submitted and can no longer be changed.</p>
            ) : (
              <div className="actions">
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => handleSave(false)}>
                  {busy ? "Saving…" : "Save draft"}
                </button>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => handleSave(true)}>
                  Submit
                </button>
              </div>
            )}

            <p className="note">Amounts in gray are calculated by the system.</p>
          </>
        )}

        <p className="next">Next: A5 Evidence upload</p>
      </div>
    </section>
  );
}
