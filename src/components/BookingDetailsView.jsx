import { useState } from 'react';

const JOB_ICONS = {
  HVAC: '❄️', Electrical: '⚡', Plumbing: '🔧',
  General: '🔨', Quote: '📋', 'Service/Breakdown': '🚨',
};
const STATUS_CFG = {
  pending:       { label: 'Pending',       cls: 'status-pending' },
  confirmed:     { label: 'Confirmed',     cls: 'status-confirmed' },
  'quote-pending': { label: 'Quote Pending', cls: 'status-quote' },
};

function fmtDate(dateStr) {
  if (!dateStr || dateStr === 'TBD') return 'TBD';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtHour(h) {
  if (!h) return '';
  return h < 12 ? `${h}:00am` : h === 12 ? '12:00pm' : `${h - 12}:00pm`;
}

function buildSmsText(booking) {
  if (!booking) return '';
  const isQuote = booking.status === 'quote-pending';
  if (isQuote) {
    return `Hi ${booking.customer}! We've received your quote request for ${booking.type} work at ${booking.address}. Our team will be in touch soon to arrange a time to come out. – FieldInsight`;
  }
  const date = fmtDate(booking.date);
  const time = booking.startHour ? `${fmtHour(booking.startHour)}–${fmtHour(booking.startHour + (booking.duration || 2))}` : '';
  return `Hi ${booking.customer}! Your ${booking.type} appointment with FieldInsight is confirmed for ${date}${time ? ` at ${time}` : ''}, at ${booking.address}. A reminder will be sent 1 hour before. Reply STOP to opt out.`;
}

export default function BookingDetailsView({ booking }) {
  const [mobileOverride, setMobileOverride] = useState('');
  const [smsStatus,      setSmsStatus]      = useState('idle'); // idle | sending | sent | error
  const [smsError,       setSmsError]       = useState('');
  const [smsCustomText,  setSmsCustomText]  = useState('');
  const [editingSms,     setEditingSms]     = useState(false);

  if (!booking) {
    return (
      <div className="cbv-empty">
        <div className="cbv-empty-icon">📋</div>
        <div className="cbv-empty-title">No booking yet</div>
        <div className="cbv-empty-sub">Complete a booking in the Chat tab to view and dispatch booking details.</div>
      </div>
    );
  }

  const isQuote    = booking.status === 'quote-pending';
  const icon       = JOB_ICONS[booking.type] || '🔧';
  const statusCfg  = STATUS_CFG[booking.status] || { label: booking.status, cls: 'status-pending' };
  const defaultSms = buildSmsText(booking);
  const smsText    = smsCustomText || defaultSms;
  const toNumber   = mobileOverride || booking.mobile || '';

  const sendSms = async () => {
    if (!toNumber.trim()) return;
    setSmsStatus('sending');
    setSmsError('');
    try {
      const r = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: toNumber, message: smsText }),
      });
      const d = await r.json();
      if (d.ok) {
        setSmsStatus(d.simulated ? 'simulated' : 'sent');
      } else {
        setSmsStatus('error');
        setSmsError(d.error || 'Unknown error');
      }
    } catch (e) {
      setSmsStatus('error');
      setSmsError(e.message);
    }
  };

  return (
    <div className="bkd-wrap">

      {/* Header */}
      <div className="bkd-header">
        <div className="bkd-header-left">
          <span className="bkd-job-icon">{icon}</span>
          <div>
            <div className="bkd-title">{booking.type} {isQuote ? 'Quote Request' : 'Booking'}</div>
            <div className="bkd-id">#{booking.id}</div>
          </div>
        </div>
        <span className={`bkd-status ${statusCfg.cls}`}>{statusCfg.label}</span>
      </div>

      {/* Fields grid */}
      <div className="bkd-fields">
        <div className="bkd-field"><div className="bkd-fl">Customer</div><div className="bkd-fv">{booking.customer || '—'}</div></div>
        <div className="bkd-field"><div className="bkd-fl">Address</div><div className="bkd-fv bkd-addr">{booking.address || '—'}</div></div>
        {!isQuote && <>
          <div className="bkd-field"><div className="bkd-fl">Date</div><div className="bkd-fv">{fmtDate(booking.date)}</div></div>
          <div className="bkd-field"><div className="bkd-fl">Time</div><div className="bkd-fv">{booking.startHour ? `${fmtHour(booking.startHour)} – ${fmtHour(booking.startHour + (booking.duration || 2))}` : '—'}</div></div>
          <div className="bkd-field"><div className="bkd-fl">Duration</div><div className="bkd-fv">{booking.duration ? `${booking.duration}h` : '—'}</div></div>
          <div className="bkd-field"><div className="bkd-fl">Technician</div><div className="bkd-fv">{booking.tech || '—'}</div></div>
          {booking.amount > 0 && <div className="bkd-field"><div className="bkd-fl">Amount</div><div className="bkd-fv">${booking.amount}</div></div>}
        </>}
        {isQuote && booking.description && (
          <div className="bkd-field bkd-field-full"><div className="bkd-fl">Work Description</div><div className="bkd-fv">{booking.description}</div></div>
        )}
        <div className="bkd-field"><div className="bkd-fl">Mobile</div><div className="bkd-fv">{booking.mobile || '—'}</div></div>
        <div className="bkd-field"><div className="bkd-fl">Email</div><div className="bkd-fv">{booking.email || '—'}</div></div>
      </div>

      {/* SMS send panel */}
      <div className="bkd-sms-panel">
        <div className="bkd-sms-title">
          <span>💬 Send SMS Confirmation</span>
          {smsStatus === 'sent'       && <span className="sms-sent-badge">✓ Sent via Twilio</span>}
          {smsStatus === 'simulated'  && <span className="sms-sent-badge simulated">✓ Simulated (no Twilio key)</span>}
          {smsStatus === 'error'      && <span className="sms-error-badge">✗ {smsError}</span>}
        </div>

        {/* To field */}
        <div className="bkd-sms-to">
          <span className="bkd-sms-to-label">To:</span>
          <input
            className="bkd-sms-to-input"
            placeholder={booking.mobile || 'Enter mobile number'}
            value={mobileOverride}
            onChange={e => { setMobileOverride(e.target.value); setSmsStatus('idle'); }}
          />
        </div>

        {/* Message */}
        <div className="bkd-sms-msg-wrap">
          <div className="bkd-sms-bubble">
            {editingSms ? (
              <textarea
                className="bkd-sms-edit"
                value={smsCustomText || defaultSms}
                rows={4}
                onChange={e => setSmsCustomText(e.target.value)}
              />
            ) : (
              <p className="bkd-sms-text">{smsText}</p>
            )}
            <div className="bkd-sms-meta">
              <span className="bkd-sms-chars">{smsText.length} chars</span>
              <button className="bkd-sms-edit-btn" onClick={() => { setEditingSms(!editingSms); if (!editingSms) setSmsCustomText(smsText); }}>
                {editingSms ? 'Done' : '✏️ Edit'}
              </button>
              {smsCustomText && (
                <button className="bkd-sms-edit-btn" onClick={() => { setSmsCustomText(''); setEditingSms(false); }}>↺ Reset</button>
              )}
            </div>
          </div>
        </div>

        {/* Send button */}
        <button
          className={`bkd-send-btn${toNumber.trim() && smsStatus !== 'sending' ? ' ready' : ''}${smsStatus === 'sent' || smsStatus === 'simulated' ? ' done' : ''}`}
          onClick={smsStatus === 'sent' || smsStatus === 'simulated' ? undefined : sendSms}
          disabled={!toNumber.trim() || smsStatus === 'sending'}
        >
          {smsStatus === 'sending'   ? '⏳ Sending…'
           : smsStatus === 'sent'    ? '✓ SMS Sent'
           : smsStatus === 'simulated' ? '✓ Simulated'
           : '📤 Send SMS to Client'}
        </button>

        <div className="bkd-sms-note">
          {process.env.NODE_ENV !== 'production'
            ? 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER on Heroku to enable real SMS.'
            : 'SMS will be sent from your FieldInsight Twilio number.'}
        </div>
      </div>
    </div>
  );
}
