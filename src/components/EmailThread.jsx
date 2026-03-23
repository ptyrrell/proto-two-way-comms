import { useState } from "react";

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function EmailMessage({ msg, isExpanded, onClick }) {
  const isInbound = msg.direction === "inbound";
  const isUnread = !msg.read && isInbound;

  return (
    <div
      className={`email-msg ${isInbound ? "inbound" : "outbound"} ${isUnread ? "unread" : ""} ${isExpanded ? "expanded" : "collapsed"}`}
      onClick={onClick}
    >
      <div className="email-msg-header">
        <div className="email-avatar">
          {isInbound ? msg.from[0].toUpperCase() : "FI"}
        </div>
        <div className="email-meta">
          <div className="email-from">
            {isInbound ? msg.from : "FieldInsight (via you)"}
            {isUnread && <span className="new-tag">New</span>}
          </div>
          <div className="email-to">to {msg.to}</div>
        </div>
        <div className="email-time">{formatDate(msg.timestamp)}</div>
      </div>

      {isExpanded ? (
        <div className="email-body">{msg.body}</div>
      ) : (
        <div className="email-preview">{msg.body.slice(0, 80)}…</div>
      )}
    </div>
  );
}

export default function EmailThread({ job, messages }) {
  const [expandedId, setExpandedId] = useState(
    messages.length > 0 ? messages[messages.length - 1].id : null
  );
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState([]);

  const allMessages = [...messages, ...sent];

  function handleSend() {
    if (!draft.trim()) return;
    setSent((prev) => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        direction: "outbound",
        from: "noreply@fieldinsight.com.au",
        to: job.email,
        subject: `Re: ${messages[0]?.subject || "Your job"}`,
        body: draft,
        timestamp: new Date().toISOString(),
        read: true,
      },
    ]);
    setDraft("");
    setComposing(false);
  }

  return (
    <div className="thread-container">
      {allMessages.length === 0 ? (
        <div className="empty-state">No emails on this job yet.</div>
      ) : (
        <div className="email-thread">
          <div className="thread-subject">
            {messages[0]?.subject || "Email Thread"}
          </div>
          <div className="messages-list">
            {allMessages.map((msg) => (
              <EmailMessage
                key={msg.id}
                msg={msg}
                isExpanded={expandedId === msg.id}
                onClick={() =>
                  setExpandedId(expandedId === msg.id ? null : msg.id)
                }
              />
            ))}
          </div>
        </div>
      )}

      <div className="compose-area">
        {composing ? (
          <div className="compose-box">
            <div className="compose-to">
              <span className="compose-label">To:</span>
              <span className="compose-address">{job.email}</span>
            </div>
            <textarea
              className="compose-input"
              placeholder="Type your reply…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              rows={5}
            />
            <div className="compose-actions">
              <button className="btn-send" onClick={handleSend}>
                Send Email ↗
              </button>
              <button
                className="btn-cancel"
                onClick={() => {
                  setComposing(false);
                  setDraft("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="reply-btn" onClick={() => setComposing(true)}>
            ↩ Reply to {job.contact}
          </button>
        )}
      </div>
    </div>
  );
}
