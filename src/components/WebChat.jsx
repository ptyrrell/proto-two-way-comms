import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function WebChat() {
  const { messages, isLoading, sendMessage, initiate, lastBooking } = useChat('web');
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { initiate(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="channel-body">
      <div className="ch-header-bar">
        <div className="ch-avatar fi-avatar">FI</div>
        <div>
          <div className="ch-contact-name">FieldInsight AI</div>
          <div className="ch-contact-sub">Web Booking Assistant · Claude</div>
        </div>
        <div className="ch-status-dot online" />
      </div>

      <div className="ch-messages">
        {messages.filter(m => !m.hidden).map((msg, i) => (
          <div key={i} className={`msg-row ${msg.role}`}>
            {msg.role === 'assistant' && <div className="msg-avatar fi-avatar sm">FI</div>}
            <div className="msg-bubble-wrap">
              <div className={`msg-bubble ${msg.role}`}>
                {msg.content.split('\n').map((line, j) => (
                  <span key={j}>{line}{j < msg.content.split('\n').length - 1 && <br />}</span>
                ))}
              </div>
              <div className="msg-time">{msg.ts ? fmtTime(msg.ts) : ''}</div>
            </div>
            {msg.role === 'user' && <div className="msg-avatar user-avatar sm">You</div>}
          </div>
        ))}

        {isLoading && (
          <div className="msg-row assistant">
            <div className="msg-avatar fi-avatar sm">FI</div>
            <div className="msg-bubble assistant typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        {lastBooking && (
          <div className="booking-confirmed-banner">
            ✦ Job booked — {lastBooking.customer} · {lastBooking.type} · {lastBooking.date}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="ch-input-row">
        <input
          className="ch-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Type a message…"
          disabled={isLoading}
        />
        <button className={`ch-send-btn${input.trim() ? ' active' : ''}`} onClick={handleSend} disabled={!input.trim() || isLoading}>↑</button>
      </div>
    </div>
  );
}
