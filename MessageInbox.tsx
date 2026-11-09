import { useEffect, useState } from "react";
import { getMyMessages, markMessageRead } from "../api";
import type { UserMessage } from "../types";

export default function MessageInbox() {
  const [messages, setMessages] = useState<UserMessage[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getMyMessages().then(setMessages).catch((reason: Error) => setError(reason.message)); }, []);
  const unread = messages.filter((message) => !message.readAt).length;

  async function openMessage(message: UserMessage) {
    setOpen(true);
    if (message.readAt) return;
    try {
      await markMessageRead(message.id);
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch (reason) { setError((reason as Error).message); }
  }

  return <div className="message-inbox">
    <button type="button" className="inbox-trigger" aria-expanded={open} aria-label={`Updates${unread ? `, ${unread} unread` : ""}`} onClick={() => setOpen((value) => !value)}>
      <span aria-hidden="true">✉</span><span className="inbox-trigger-label">Updates</span>{unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
    </button>
    {open && <section className="inbox-popover" aria-label="Update messages">
      <div className="inbox-heading"><div><strong>Updates</strong><small>{unread ? `${unread} unread` : "Your messages"}</small></div><button type="button" onClick={() => setOpen(false)} aria-label="Close updates">×</button></div>
      {error && <p className="inbox-error" role="status">{error}</p>}
      <div className="inbox-list">{messages.map((message) => <article key={message.id} className={message.readAt ? "inbox-message" : "inbox-message inbox-unread"} role="button" tabIndex={0} onClick={() => void openMessage(message)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openMessage(message); } }}>
        <div className="inbox-message-top"><strong>{message.subject}</strong><time>{new Date(message.sentAt).toLocaleDateString()}</time></div>
        <p>{message.body}</p><small>From {message.senderName}</small>
      </article>)}
      {!messages.length && !error && <p className="inbox-empty">No updates yet.</p>}</div>
    </section>}
  </div>;
}
