import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import AddressInput from './AddressInput';

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function ContactInput({ onSubmit }) {
  const [mobile, setMobile] = useState('');
  const [email,  setEmail]  = useState('');
  return (
    <div className="contact-input-widget">
      <div className="contact-label">📱 Confirm your contact details</div>
      <div className="contact-fields">
        <input className="contact-field" placeholder="Mobile number" value={mobile} onChange={e => setMobile(e.target.value)} />
        <input className="contact-field" placeholder="Email address" value={email}  onChange={e => setEmail(e.target.value)} type="email" />
      </div>
      <button
        className={`addr-submit-btn${mobile.trim() && email.trim() ? ' ready' : ''}`}
        disabled={!mobile.trim() || !email.trim()}
        onClick={() => onSubmit(`My mobile is ${mobile} and my email is ${email}`)}
      >
        Confirm details →
      </button>
    </div>
  );
}

export default function WebChat() {
  const { messages, isLoading, sendMessage, initiate, lastBooking, needsAddress, needsContact } = useChat('web');
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { initiate(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading, needsAddress, needsContact]);

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
            <div className="msg-bubble assistant typing"><span /><span /><span /></div>
          </div>
        )}

        {lastBooking && (
          <div className={`booking-confirmed-banner${lastBooking.status === 'quote-pending' ? ' quote' : ''}`}>
            {lastBooking.status === 'quote-pending'
              ? `📋 Quote request submitted — ${lastBooking.customer} · ${lastBooking.type}`
              : `✦ Job booked — ${lastBooking.customer} · ${lastBooking.type} · ${lastBooking.date}`}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Smart address input */}
      {needsAddress && !isLoading && (
        <AddressInput onSubmit={addr => sendMessage(addr)} />
      )}

      {/* Smart contact input */}
      {needsContact && !isLoading && !needsAddress && (
        <ContactInput onSubmit={text => sendMessage(text)} />
      )}

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
