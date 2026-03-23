import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';
import AddressInput from './AddressInput';
import ClientBookingView from './ClientBookingView';
import BookingDetailsView from './BookingDetailsView';

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

const TABS = [
  { id: 'chat',    label: 'Internal',       icon: '💬' },
  { id: 'client',  label: 'Client View',    icon: '👤' },
  { id: 'details', label: 'Booking Details', icon: '📋' },
];

export default function WebChat() {
  const { messages, isLoading, sendMessage, initiate, lastBooking, needsAddress, needsContact } = useChat('web');
  const [input,   setInput]   = useState('');
  const [webView, setWebView] = useState('chat'); // 'chat' | 'client' | 'details'
  const bottomRef = useRef(null);

  useEffect(() => { initiate(); }, []);
  useEffect(() => {
    if (webView === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, needsAddress, needsContact, webView]);

  // Auto-switch to Details tab when a booking is first confirmed
  const prevBookingRef = useRef(null);
  useEffect(() => {
    if (lastBooking && lastBooking !== prevBookingRef.current) {
      prevBookingRef.current = lastBooking;
      // Brief delay so user sees the confirmation banner first
      setTimeout(() => setWebView('details'), 1800);
    }
  }, [lastBooking]);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  return (
    <div className="channel-body web-channel-body">

      {/* ── Sub-tab bar ── */}
      <div className="web-subtabs">
        <div className="web-subtab-header">
          <div className="ch-avatar fi-avatar sm">FI</div>
          <div className="web-subtab-meta">
            <div className="ch-contact-name">FieldInsight AI</div>
            <div className="ch-contact-sub">Web Booking Assistant · Claude</div>
          </div>
          <div className="ch-status-dot online" style={{ marginLeft: 'auto' }} />
        </div>
        <div className="web-subtab-pills">
          {TABS.map(t => (
            <button
              key={t.id}
              className={`web-subtab-pill${webView === t.id ? ' active' : ''}${t.id !== 'chat' && !lastBooking ? ' disabled' : ''}`}
              onClick={() => setWebView(t.id)}
              title={t.id !== 'chat' && !lastBooking ? 'Complete a booking first' : t.label}
            >
              <span className="wst-icon">{t.icon}</span>
              <span className="wst-label">{t.label}</span>
              {t.id === 'details' && lastBooking && <span className="wst-dot" />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Chat view (always mounted, hidden when inactive) ── */}
      <div className={`web-view-pane${webView === 'chat' ? ' active' : ''}`}>
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
            <div
              className={`booking-confirmed-banner clickable${lastBooking.status === 'quote-pending' ? ' quote' : ''}`}
              onClick={() => setWebView('details')}
              title="Click to view booking details"
            >
              {lastBooking.status === 'quote-pending'
                ? `📋 Quote submitted — ${lastBooking.customer} · tap to view details`
                : `✦ Job booked — ${lastBooking.customer} · ${lastBooking.type} · ${lastBooking.date} · tap to view`}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {needsAddress && !isLoading && (
          <AddressInput onSubmit={addr => sendMessage(addr)} />
        )}
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
          <button
            className={`ch-send-btn${input.trim() ? ' active' : ''}`}
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >↑</button>
        </div>
      </div>

      {/* ── Client View pane ── */}
      <div className={`web-view-pane${webView === 'client' ? ' active' : ''}`}>
        <div className="web-view-scroll">
          <ClientBookingView booking={lastBooking} />
        </div>
      </div>

      {/* ── Booking Details pane ── */}
      <div className={`web-view-pane${webView === 'details' ? ' active' : ''}`}>
        <div className="web-view-scroll">
          <BookingDetailsView booking={lastBooking} />
        </div>
      </div>

    </div>
  );
}
