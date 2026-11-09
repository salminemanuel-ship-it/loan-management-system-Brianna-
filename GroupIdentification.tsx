import { useState, type FormEvent } from "react";
import { convertGroup, saveGroup } from "../api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface Form {
  name: string;
  location: string;
  centre: string;
  zone: string;
  membersExpected: string;
  meetingDay: string;
  notes: string;
}

const empty: Form = {
  name: "",
  location: "",
  centre: "",
  zone: "",
  membersExpected: "",
  meetingDay: "",
  notes: "",
};

function validate(f: Form): string {
  if (!f.name.trim()) return "Enter the proposed group name.";
  if (!f.location.trim()) return "Enter the group location.";
  if (!f.centre || !f.zone) return "Choose a centre and a zone.";
  const n = Number(f.membersExpected);
  if (!Number.isInteger(n) || n < 1 || n > 500) {
    return "Members expected must be a whole number from 1 to 500.";
  }
  if (!f.meetingDay) return "Choose the meeting day.";
  return "";
}

export default function GroupIdentification({
  onContinue,
}: {
  onContinue?: (groupId: number) => void;
}) {
  const [form, setForm] = useState<Form>(empty);
  const [savedId, setSavedId] = useState<number | undefined>();
  const [converted, setConverted] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm({ ...form, [key]: value });
    setInfo("");
  }

  function payload() {
    return { ...form, membersExpected: Number(form.membersExpected) };
  }

  async function save(): Promise<number | undefined> {
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return undefined;
    }
    const result = await saveGroup(payload(), savedId);
    setSavedId(result.id);
    return result.id;
  }

  async function handleSaveProspect(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const id = await save();
      if (id !== undefined) setInfo(`Saved "${form.name.trim()}" as a prospect.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleConvert() {
    setError("");
    setInfo("");
    setBusy(true);
    try {
      const id = await save();
      if (id === undefined) return;
      await convertGroup(id);
      setConverted(true);
      setInfo(`"${form.name.trim()}" is ready for registration. Next: A2 Group and member registration.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setForm(empty);
    setSavedId(undefined);
    setConverted(false);
    setError("");
    setInfo("");
  }

  const locked = converted || busy;

  return (
    <section className="screen" aria-labelledby="a1-title">
      <div className="screen-head">
        <h1 id="a1-title">
          <span className="screen-code">A1</span> Group identification
        </h1>
        <span className="screen-role">Loan Officer</span>
      </div>

      <form className="screen-body" onSubmit={handleSaveProspect} noValidate>
        <div className="grid-2">
          <label className="field">
            <span>Proposed group name</span>
            <input
              type="text"
              value={form.name}
              disabled={converted}
              onChange={(e) => update("name", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Location</span>
            <input
              type="text"
              value={form.location}
              disabled={converted}
              onChange={(e) => update("location", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Centre</span>
            <input
              type="text"
              value={form.centre}
              disabled={converted}
              placeholder="Enter centre"
              onChange={(e) => update("centre", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Zone</span>
            <input
              type="text"
              value={form.zone}
              disabled={converted}
              placeholder="Enter zone"
              onChange={(e) => update("zone", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Members expected</span>
            <input
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              value={form.membersExpected}
              disabled={converted}
              onChange={(e) => update("membersExpected", e.target.value)}
            />
          </label>
          <label className="field">
            <span>Meeting day</span>
            <select
              value={form.meetingDay}
              disabled={converted}
              onChange={(e) => update("meetingDay", e.target.value)}
            >
              <option value="">Choose a day</option>
              {DAYS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span>Initial notes</span>
          <textarea
            rows={3}
            value={form.notes}
            disabled={converted}
            onChange={(e) => update("notes", e.target.value)}
          />
        </label>

        {error && <p className="note note-error" role="alert">{error}</p>}
        {info && <p className="note" role="status">{info}</p>}

        <div className="actions">
          {converted ? (
            <>
              {onContinue && savedId !== undefined && (
                <button type="button" className="btn btn-primary" onClick={() => onContinue(savedId)}>
                  Continue to registration
                </button>
              )}
              <button type="button" className="btn btn-ghost" onClick={startNew}>
                Identify another group
              </button>
            </>
          ) : (
            <>
              <button type="submit" className="btn btn-ghost" disabled={locked}>
                {busy ? "Saving…" : "Save as prospect"}
              </button>
              <button type="button" className="btn btn-primary" disabled={locked} onClick={handleConvert}>
                Convert to registration
              </button>
            </>
          )}
        </div>

        <p className="next">Next: A2 Group and member registration</p>
      </form>
    </section>
  );
}
