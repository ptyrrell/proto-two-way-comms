const JOB_ICONS = {
  HVAC:              '❄️',
  Electrical:        '⚡',
  Plumbing:          '🔧',
  General:           '🔨',
  Quote:             '📋',
  'Service/Breakdown': '🚨',
};

function fmtDate(dateStr) {
  if (!dateStr || dateStr === 'TBD') return 'To be confirmed';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtHour(h) {
  if (!h) return '';
  const ampm = h < 12 ? 'am' : 'pm';
  const hr = h <= 12 ? h : h - 12;
  return `${hr}:00${ampm}`;
}

export default function ClientBookingView({ booking }) {
  if (!booking) {
    return (
      <div className="cbv-empty">
        <div className="cbv-empty-icon">📋</div>
        <div className="cbv-empty-title">No booking yet</div>
        <div className="cbv-empty-sub">Complete a booking in the Chat tab to see the client confirmation here.</div>
      </div>
    );
  }

  const isQuote   = booking.status === 'quote-pending';
  const icon      = JOB_ICONS[booking.type] || '🔧';
  const endHour   = booking.startHour ? booking.startHour + (booking.duration || 2) : null;

  return (
    <div className="cbv-wrap">
      {/* Hero */}
      <div className={`cbv-hero${isQuote ? ' cbv-hero-quote' : ''}`}>
        <div className="cbv-hero-icon">{isQuote ? '📋' : '✅'}</div>
        <div className="cbv-hero-title">
          {isQuote ? 'Quote Request Received' : 'Booking Confirmed'}
        </div>
        <div className="cbv-hero-sub">
          {isQuote
            ? 'Our team will review your request and call you back to arrange a time.'
            : `Your ${booking.type} appointment is locked in.`}
        </div>
      </div>

      {/* Details card */}
      <div className="cbv-card">

        {/* Job type */}
        <div className="cbv-row">
          <span className="cbv-row-icon">{icon}</span>
          <div className="cbv-row-body">
            <div className="cbv-row-label">Service Type</div>
            <div className="cbv-row-value">{booking.type}</div>
            {isQuote && booking.description && (
              <div className="cbv-row-note">"{booking.description}"</div>
            )}
          </div>
        </div>

        {/* Date & time */}
        {!isQuote && (
          <div className="cbv-row">
            <span className="cbv-row-icon">📅</span>
            <div className="cbv-row-body">
              <div className="cbv-row-label">Date</div>
              <div className="cbv-row-value">{fmtDate(booking.date)}</div>
              {booking.startHour > 0 && (
                <div className="cbv-row-note">
                  {fmtHour(booking.startHour)}
                  {endHour && ` – ${fmtHour(endHour)}`}
                  {` (${booking.duration || 2}h appointment)`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Address */}
        {booking.address && (
          <div className="cbv-row">
            <span className="cbv-row-icon">📍</span>
            <div className="cbv-row-body">
              <div className="cbv-row-label">Service Address</div>
              <div className="cbv-row-value">{booking.address}</div>
              <a
                className="cbv-map-link"
                href={`https://maps.google.com/?q=${encodeURIComponent(booking.address)}`}
                target="_blank"
                rel="noreferrer"
              >
                View on Google Maps ↗
              </a>
            </div>
          </div>
        )}

        {/* Customer */}
        {booking.customer && (
          <div className="cbv-row">
            <span className="cbv-row-icon">👤</span>
            <div className="cbv-row-body">
              <div className="cbv-row-label">Name</div>
              <div className="cbv-row-value">{booking.customer}</div>
            </div>
          </div>
        )}

        {/* Contact */}
        {(booking.mobile || booking.email) && (
          <div className="cbv-row">
            <span className="cbv-row-icon">📱</span>
            <div className="cbv-row-body">
              <div className="cbv-row-label">Contact</div>
              {booking.mobile && <div className="cbv-row-value">{booking.mobile}</div>}
              {booking.email  && <div className="cbv-row-note">{booking.email}</div>}
            </div>
          </div>
        )}

      </div>

      {/* Footer notice */}
      {!isQuote && (
        <div className="cbv-notice">
          <span className="cbv-notice-icon">🔔</span>
          <span>A confirmation SMS and email will be sent. You'll receive a reminder 1 hour before your appointment.</span>
        </div>
      )}
      {isQuote && (
        <div className="cbv-notice cbv-notice-quote">
          <span className="cbv-notice-icon">📞</span>
          <span>Our team will be in touch shortly to discuss the work and arrange a convenient time to come out.</span>
        </div>
      )}

      <div className="cbv-brand">Powered by FieldInsight</div>
    </div>
  );
}
