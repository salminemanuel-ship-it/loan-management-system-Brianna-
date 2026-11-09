import { useEffect, useMemo, useState } from "react";
import { listClients } from "../api";
import type { ClientSummary } from "../types";
import ClientRegistration from "./ClientRegistration";

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Dar_es_Salaam",
  });
}

export default function Customers({ canAdd }: { canAdd: boolean }) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);

  async function refresh() {
    setError("");
    setLoading(true);
    try {
      setClients(await listClients());
    } catch (err) {
      setError((err as Error).message || "Could not load customer records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const visibleClients = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    if (!term) return clients;
    return clients.filter((client) =>
      `${client.fullName} ${client.businessType} ${client.status}`
        .toLocaleLowerCase()
        .includes(term),
    );
  }, [clients, query]);

  if (registering && canAdd) {
    return (
      <>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={() => setRegistering(false)}>
            Back to customers
          </button>
        </div>
        <ClientRegistration />
      </>
    );
  }

  return (
    <section className="screen" aria-labelledby="customers-title">
      <div className="screen-head">
        <h1 id="customers-title">Customer records</h1>
        {canAdd && (
          <button type="button" className="btn btn-primary" onClick={() => setRegistering(true)}>
            Register customer
          </button>
        )}
      </div>

      <div className="screen-body">
        <label className="field">
          <span>Search by name, business, or status</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search customer records"
          />
        </label>

        {error && (
          <div className="note note-error" role="alert">
            <p>{error}</p>
            <button type="button" className="btn btn-ghost" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        )}
        {loading && <p className="muted" role="status">Loading customer records…</p>}

        {!loading && !error && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Business</th>
                  <th>Introduced</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visibleClients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.fullName}</td>
                    <td>{client.businessType}</td>
                    <td>{formatDate(client.introducedAt)}</td>
                    <td>{client.status === "submitted" ? "Submitted" : "Draft"}</td>
                  </tr>
                ))}
                {visibleClients.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      {clients.length === 0
                        ? "No customer records yet."
                        : "No customers match this search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}