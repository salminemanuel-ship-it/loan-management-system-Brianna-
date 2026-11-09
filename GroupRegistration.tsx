import { useEffect, useState, type FormEvent } from "react";
import { addMember, getGroup, listGroups, removeMember, submitGroup } from "../api";
import type { GroupDetail, GroupSummary, MemberInput } from "../types";

const ROLES = ["Leader", "Secretary", "Treasurer", "Member"];
const emptyMember: MemberInput = { fullName: "", nationalId: "", phone: "", business: "", role: "" };

const statusLabel: Record<string, string> = {
  prospect: "Prospect",
  registration: "In registration",
  assessment: "Submitted for assessment",
  closed: "Closed",
};

function validate(m: MemberInput): string {
  if (!m.fullName.trim()) return "Enter the member's full name.";
  if (!m.role) return "Choose the member's role.";
  if (!/^[A-Za-z0-9]{8,20}$/.test(m.nationalId.replace(/\s/g, ""))) {
    return "Enter a valid ID number (8 to 20 letters or digits).";
  }
  if (!/^(?:\+?255|0)[67]\d{8}$/.test(m.phone.replace(/[\s-]/g, ""))) {
    return "Enter a valid phone number, for example 0712 345 678.";
  }
  if (!m.business.trim()) return "Enter the member's business.";
  return "";
}

export default function GroupRegistration({ initialGroupId }: { initialGroupId?: number }) {
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupId, setGroupId] = useState<number | undefined>(initialGroupId);
  const [group, setGroup] = useState<GroupDetail | null>(null);
  const [tab, setTab] = useState<"details" | "members">("members");
  const [formOpen, setFormOpen] = useState(false);
  const [member, setMember] = useState<MemberInput>(emptyMember);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function refreshList() {
    setGroups(await listGroups("registration"));
  }

  useEffect(() => {
    refreshList()
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (groupId === undefined) {
      setGroup(null);
      return;
    }
    let cancelled = false;
    getGroup(groupId)
      .then((g) => !cancelled && setGroup(g))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  function chooseGroup(value: string) {
    setError("");
    setInfo("");
    setFormOpen(false);
    setMember(emptyMember);
    setGroupId(value ? Number(value) : undefined);
  }

  async function reload() {
    if (groupId !== undefined) setGroup(await getGroup(groupId));
  }

  async function handleSaveMember(e: FormEvent) {
    e.preventDefault();
    if (!group) return;
    setError("");
    setInfo("");
    const problem = validate(member);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      await addMember(group.id, member);
      await reload();
      setInfo(`Added ${member.fullName.trim()}.`);
      setMember(emptyMember);
      setFormOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: number, name: string) {
    if (!group || !window.confirm(`Remove ${name} from this group?`)) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await removeMember(group.id, id);
      await reload();
      setInfo(`Removed ${name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (!group) return;
    setError("");
    setInfo("");
    setBusy(true);
    try {
      await submitGroup(group.id);
      await reload();
      await refreshList();
      setFormOpen(false);
      setInfo("Submitted for assessment. Next: A4 Field credit assessment.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const open = group?.status === "registration";
  const options = [...groups];
  if (group && !options.some((g) => g.id === group.id)) {
    options.unshift({
      id: group.id,
      name: group.name,
      status: group.status,
      membersExpected: group.membersExpected,
      memberCount: group.members.length,
    });
  }

  return (
    <section className="screen" aria-labelledby="a2-title">
      <div className="screen-head">
        <h1 id="a2-title">
          <span className="screen-code">A2</span> Group and member registration
        </h1>
        <span className="screen-role">Loan Officer</span>
      </div>

      <div className="screen-body">
        <label className="field">
          <span>Group</span>
          <select value={groupId ?? ""} onChange={(e) => chooseGroup(e.target.value)} disabled={busy}>
            <option value="">Choose a group in registration</option>
            {options.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({statusLabel[g.status] ?? g.status})
              </option>
            ))}
          </select>
        </label>

        {loading && <p className="muted">Loading your groups…</p>}
        {!loading && options.length === 0 && (
          <p className="note">
            No groups are ready for registration. Convert a prospect in Group identification first.
          </p>
        )}
        {error && <p className="note note-error" role="alert">{error}</p>}
        {info && <p className="note" role="status">{info}</p>}

        {group && (
          <>
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === "details"}
                className={tab === "details" ? "tab tab-active" : "tab"}
                onClick={() => setTab("details")}
              >
                Group details
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "members"}
                className={tab === "members" ? "tab tab-active" : "tab"}
                onClick={() => setTab("members")}
              >
                Members ({group.members.length})
              </button>
            </div>

            {tab === "details" && (
              <dl className="details">
                <dt>Group name</dt><dd>{group.name}</dd>
                <dt>Location</dt><dd>{group.location}</dd>
                <dt>Centre</dt><dd>{group.centre}</dd>
                <dt>Zone</dt><dd>{group.zone}</dd>
                <dt>Members expected</dt><dd>{group.membersExpected}</dd>
                <dt>Meeting day</dt><dd>{group.meetingDay}</dd>
                <dt>Status</dt><dd>{statusLabel[group.status] ?? group.status}</dd>
                <dt>Notes</dt><dd>{group.notes || "None"}</dd>
              </dl>
            )}

            {tab === "members" && (
              <>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>ID number</th>
                        <th>Phone</th>
                        <th>Business</th>
                        <th>Role</th>
                        {open && <th><span className="sr-only">Actions</span></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {group.members.map((m) => (
                        <tr key={m.id}>
                          <td>{m.fullName}</td>
                          <td>{m.idMasked}</td>
                          <td>{m.phoneMasked}</td>
                          <td>{m.business}</td>
                          <td>{m.role}</td>
                          {open && (
                            <td>
                              <button
                                type="button"
                                className="link-btn"
                                disabled={busy}
                                onClick={() => handleRemove(m.id, m.fullName)}
                              >
                                Remove
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                      {group.members.length === 0 && (
                        <tr>
                          <td colSpan={open ? 6 : 5} className="muted">
                            No members yet. Choose Add member to start.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {open && formOpen && (
                  <form className="member-form" onSubmit={handleSaveMember} noValidate>
                    <div className="grid-2">
                      <label className="field">
                        <span>Full name</span>
                        <input
                          type="text"
                          value={member.fullName}
                          onChange={(e) => setMember({ ...member, fullName: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>ID number</span>
                        <input
                          type="text"
                          value={member.nationalId}
                          onChange={(e) => setMember({ ...member, nationalId: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Phone</span>
                        <input
                          type="tel"
                          value={member.phone}
                          onChange={(e) => setMember({ ...member, phone: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Business</span>
                        <input
                          type="text"
                          value={member.business}
                          onChange={(e) => setMember({ ...member, business: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Role</span>
                        <select
                          value={member.role}
                          onChange={(e) => setMember({ ...member, role: e.target.value })}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </form>
                )}

                {open ? (
                  <div className="actions">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || formOpen}
                      onClick={() => {
                        setFormOpen(true);
                        setError("");
                        setInfo("");
                      }}
                    >
                      Add member
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy || !formOpen}
                      onClick={handleSaveMember}
                    >
                      Save member
                    </button>
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={handleSubmit}>
                      Submit for assessment
                    </button>
                  </div>
                ) : (
                  <p className="note">
                    This group is {statusLabel[group.status]?.toLowerCase()}. Members can no longer be changed here.
                  </p>
                )}

                <p className="note">
                  A person cannot belong to two active groups. ID and phone are checked for duplicates.
                </p>
              </>
            )}
          </>
        )}

        <p className="next">Next: A4 Field credit assessment</p>
      </div>
    </section>
  );
}
