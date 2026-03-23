import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

export default function SmsChannel() {
  const { messages, isLoading, sendMessage, initiate, lastBooking } = useChat('sms');
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
    <div className="channel-body sms-body">
      <div className="sms-header-bar">
        <div className="sms-contact-bubble">FI</div>
        <div>
          <div className="ch-contact-name">FieldInsight SMS</div>
          <div className="ch-contact-sub">+61 4XX XXX XXX · via Twilio</div>
        </div>
      </div>

      <div className="ch-messages sms-messages">
        {messages.filter(m => !m.hidden).map((msg, i) => (
          <div key={i} className={`sms-bubble-row ${msg.role}`}>
            <div className={`sms-bubble ${msg.role}`}>
              <span>{msg.content}</span>
              <span className="sms-ts">{msg.ts ? fmtTime(msg.ts) : ''}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="sms-bubble-row assistant">
            <div className="sms-bubble assistant typing"><span /><span /><span /></div>
          </div>
        )}

        {lastBooking && (
          <div className="booking-confirmed-banner">
            ✦ Job booked — {lastBooking.customer} · {lastBooking.type} · {lastBooking.date}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="ch-input-row sms-input-row">
        <div className="sms-from-pill">From: FieldInsight</div>
        <input
          className="ch-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="SMS message…"
          disabled={isLoading}
          maxLength={320}
        />
        <button className={`ch-send-btn${input.trim() ? ' active' : ''}`} onClick={handleSend} disabled={!input.trim() || isLoading}>↑</button>
      </div>
    </div>
  );
}
