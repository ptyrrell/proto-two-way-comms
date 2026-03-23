import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

function fmtDateTime(d) {
  return new Date(d).toLocaleString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function EmailChannel() {
  const { messages, isLoading, sendMessage, initiate, lastBooking } = useChat('email');
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(null);
  const bottomRef = useRef(null);

  useEffect(() => { initiate(); }, []);
  useEffect(() => {
    const visible = messages.filter(m => !m.hidden);
    if (visible.length > 0) setExpanded(visible.length - 1);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const visible = messages.filter(m => !m.hidden);
  const subject = 'Service Booking Request — FieldInsight';

  return (
    <div className="channel-body email-body">
      <div className="email-thread-header">
        <div className="email-subject">{subject}</div>
        <div className="email-participants">
          <span className="email-addr">you@example.com</span>
          <span style={{ color: 'var(--muted)' }}> ↔ </span>
          <span className="email-addr">bookings@fieldinsight.com.au</span>
        </div>
      </div>

      <div className="ch-messages email-messages">
        {visible.map((msg, i) => {
          const isOpen = expanded === i;
          return (
            <div
              key={i}
              className={`email-msg-card ${msg.role} ${isOpen ? 'open' : 'closed'}`}
              onClick={() => setExpanded(isOpen ? null : i)}
            >
              <div className="email-msg-hdr">
                <div className={`email-msg-avatar ${msg.role === 'assistant' ? 'fi-avatar' : 'user-avatar'}`}>
                  {msg.role === 'assistant' ? 'FI' : 'You'}
                </div>
                <div className="email-msg-from">
                  {msg.role === 'assistant' ? 'FieldInsight AI <bookings@fieldinsight.com.au>' : 'You'}
                </div>
                <div className="email-msg-ts">{msg.ts ? fmtDateTime(msg.ts) : ''}</div>
              </div>
              {isOpen && (
                <div className="email-msg-body">
                  {msg.content.split('\n').map((line, j) => (
                    <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                  ))}
                </div>
              )}
              {!isOpen && (
                <div className="email-msg-preview">{msg.content.slice(0, 90)}…</div>
              )}
            </div>
          );
        })}

        {isLoading && (
          <div className="email-msg-card assistant open">
            <div className="email-msg-hdr">
              <div className="email-msg-avatar fi-avatar">FI</div>
              <div className="email-msg-from">FieldInsight AI is typing…</div>
            </div>
            <div className="email-msg-body typing"><span /><span /><span /></div>
          </div>
        )}

        {lastBooking && (
          <div className="booking-confirmed-banner">
            ✦ Job booked — {lastBooking.customer} · {lastBooking.type} · {lastBooking.date}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="email-compose">
        <div className="email-compose-hdr">
          <span className="compose-field-label">To:</span>
          <span className="compose-field-val">bookings@fieldinsight.com.au</span>
        </div>
        <textarea
          className="email-compose-body"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && e.ctrlKey && handleSend()}
          placeholder="Type your reply… (Ctrl+Enter to send)"
          disabled={isLoading}
          rows={3}
        />
        <div className="email-compose-footer">
          <button className={`email-send-btn${input.trim() ? ' active' : ''}`} onClick={handleSend} disabled={!input.trim() || isLoading}>
            Send ↗
          </button>
        </div>
      </div>
    </div>
  );
}
