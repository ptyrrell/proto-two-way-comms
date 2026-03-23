import { useState, useEffect } from 'react';
import { useSchedule } from '../context/ScheduleContext';

const TECH_META = {
  'Jake Morrison': { role: 'HVAC Specialist',      icon: '❄️' },
  'Sam Peters':    { role: 'Electrical Specialist', icon: '⚡' },
  'Brad Kim':      { role: 'Plumbing Specialist',   icon: '🔧' },
  'Amy Chen':      { role: 'HVAC & General',        icon: '🔨' },
};

const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function fmtHour(h) {
  if (h === 0)  return '12am';
  if (h < 12)  return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 6); // 6am–10pm

export default function TechSettings({ onClose }) {
  const { refreshBookingSettings } = useSchedule();
  const [techSettings,    setTechSettings]    = useState({});
  const [bookingSettings, setBookingSettings] = useState({
    bufferHours: 4,
    workingDays: [1,2,3,4,5],
    startHour:   8,
    endHour:     17,
  });
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    fetch('/api/settings/techs').then(r => r.json()).then(d => setTechSettings(d));
    fetch('/api/settings/booking').then(r => r.json()).then(d => setBookingSettings(d));
  }, []);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800); };

  /* ─── Tech toggles ─────────────────────────────────── */
  const toggleTech = async (tech) => {
    const newVal = !techSettings[tech]?.availableForBooking;
    setTechSettings(prev => ({ ...prev, [tech]: { ...prev[tech], availableForBooking: newVal } }));
    setSaving(true);
    await fetch('/api/settings/techs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech, availableForBooking: newVal }),
    });
    setSaving(false);
    flash();
  };

  /* ─── Booking rules save ───────────────────────────── */
  const saveBooking = async (patch) => {
    const next = { ...bookingSettings, ...patch };
    setBookingSettings(next);
    setSaving(true);
    await fetch('/api/settings/booking', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
    flash();
    refreshBookingSettings?.();
  };

  const toggleDay = (day) => {
    const days = bookingSettings.workingDays || [1,2,3,4,5];
    const next  = days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort();
    saveBooking({ workingDays: next });
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel settings-panel-wide" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="settings-header">
          <div>
            <div className="settings-title">Settings</div>
            <div className="settings-sub">Technician availability &amp; booking rules</div>
          </div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        {/* ─── TECHNICIAN SECTION ─────────────────────── */}
        <div className="settings-section-label">
          <span>👷</span> Self-Booking Availability
        </div>
        <div className="tech-list">
          {Object.entries(techSettings).map(([tech, cfg]) => {
            const meta = TECH_META[tech] || { role: 'Technician', icon: '👷' };
            const on   = cfg?.availableForBooking ?? true;
            return (
              <div key={tech} className={`tech-row${on ? '' : ' off'}`}>
                <div className="tech-row-icon">{meta.icon}</div>
                <div className="tech-row-info">
                  <div className="tech-row-name">{tech}</div>
                  <div className="tech-row-role">{meta.role}</div>
                </div>
                <div className="tech-row-right">
                  <span className={`avail-pill${on ? ' on' : ' off'}`}>
                    {on ? 'Available' : 'Hidden'}
                  </span>
                  <button
                    className={`toggle-btn${on ? ' on' : ' off'}`}
                    onClick={() => toggleTech(tech)}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* ─── BOOKING RULES SECTION ──────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>📅</span> Booking Rules
        </div>

        <div className="booking-rules">

          {/* Buffer hours */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Advance Notice</div>
              <div className="br-desc">Minimum hours ahead a slot can be booked by customers</div>
            </div>
            <div className="br-control">
              <div className="br-stepper">
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ bufferHours: Math.max(0, bookingSettings.bufferHours - 1) })}
                >−</button>
                <span className="br-value">{bookingSettings.bufferHours}h</span>
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ bufferHours: Math.min(48, bookingSettings.bufferHours + 1) })}
                >+</button>
              </div>
            </div>
          </div>

          {/* Working days */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Working Days</div>
              <div className="br-desc">Days available for customer self-booking</div>
            </div>
            <div className="br-control">
              <div className="br-day-grid">
                {DAY_LABELS.map((lbl, i) => {
                  const active = (bookingSettings.workingDays || []).includes(i);
                  return (
                    <button
                      key={i}
                      className={`br-day-btn${active ? ' active' : ''}`}
                      onClick={() => toggleDay(i)}
                    >
                      {lbl}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bookable hours */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Bookable Hours</div>
              <div className="br-desc">Window of hours open for self-booking</div>
            </div>
            <div className="br-control">
              <div className="br-hours-row">
                <select
                  className="br-select"
                  value={bookingSettings.startHour}
                  onChange={e => saveBooking({ startHour: Number(e.target.value) })}
                >
                  {HOUR_OPTIONS.filter(h => h < bookingSettings.endHour).map(h => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
                <span className="br-to">to</span>
                <select
                  className="br-select"
                  value={bookingSettings.endHour}
                  onChange={e => saveBooking({ endHour: Number(e.target.value) })}
                >
                  {HOUR_OPTIONS.filter(h => h > bookingSettings.startHour).map(h => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
                <span className="br-hours-preview">
                  ({bookingSettings.endHour - bookingSettings.startHour}h window)
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="settings-footer">
          <span className="settings-note">
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Changes apply to the client view and AI bookings immediately'}
          </span>
        </div>

      </div>
    </div>
  );
}
