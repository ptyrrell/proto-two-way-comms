import { useState } from "react";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  });
}

function StatusTick({ status }) {
  if (status === "delivered") return <span className="sms-tick delivered">✓✓</span>;
  if (status === "sent") return <span className="sms-tick sent">✓</span>;
  if (status === "failed") return <span className="sms-tick failed">✗</span>;
  return null;
}

export default function SmsThread({ job, messages }) {
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState([]);

  const allMessages = [...messages, ...sent];

  function handleSend() {
    if (!draft.trim()) return;
    setSent((prev) => [
      ...prev,
      {
        id: `sms-${Date.now()}`,
        direction: "outbound",
        body: draft,
        timestamp: new Date().toISOString(),
        status: "sent",
      },
    ]);
    setDraft("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="thread-container sms-container">
      <div className="sms-header">
        <div className="sms-avatar">{job.contact[0]}</div>
        <div className="sms-header-info">
          <div className="sms-contact-name">{job.contact}</div>
          <div className="sms-contact-number">{job.phone}</div>
        </div>
        <div className="sms-via">via Twilio · {job.id}</div>
      </div>

      <div className="sms-messages">
        {allMessages.length === 0 && (
          <div className="empty-state">No SMS messages on this job yet.</div>
        )}
        {allMessages.map((msg) => (
          <div
            key={msg.id}
            className={`sms-bubble-row ${msg.direction}`}
          >
            {msg.direction === "inbound" && (
              <div className="sms-bubble-avatar">{job.contact[0]}</div>
            )}
            <div className={`sms-bubble ${msg.direction}`}>
              <span className="sms-bubble-text">{msg.body}</span>
              <span className="sms-bubble-time">
                {formatTime(msg.timestamp)}
                {msg.direction === "outbound" && (
                  <StatusTick status={msg.status} />
                )}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="sms-compose">
        <div className="sms-compose-from">
          <span className="sms-from-label">From:</span>
          <span className="sms-from-number">+61 4XX XXX XXX (FieldInsight)</span>
        </div>
        <div className="sms-input-row">
          <textarea
            className="sms-input"
            placeholder={`Message ${job.contact}…`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
          />
          <button
            className={`sms-send-btn ${draft.trim() ? "active" : ""}`}
            onClick={handleSend}
            disabled={!draft.trim()}
          >
            ↑
          </button>
        </div>
        <div className="sms-hint">Enter to send · Shift+Enter for new line</div>
      </div>
    </div>
  );
}
