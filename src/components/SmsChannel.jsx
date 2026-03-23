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

export default function SmsChannel() {
  const { messages, isLoading, sendMessage, initiate, lastBooking, needsAddress, needsContact } = useChat('sms');
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
          <div className={`booking-confirmed-banner${lastBooking.status === 'quote-pending' ? ' quote' : ''}`}>
            {lastBooking.status === 'quote-pending'
              ? `📋 Quote submitted — ${lastBooking.customer}`
              : `✦ Job booked — ${lastBooking.customer} · ${lastBooking.date}`}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {needsAddress && !isLoading && (
        <div className="sms-smart-input">
          <AddressInput onSubmit={addr => sendMessage(addr)} />
        </div>
      )}
      {needsContact && !isLoading && !needsAddress && (
        <div className="sms-smart-input">
          <ContactInput onSubmit={text => sendMessage(text)} />
        </div>
      )}

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
