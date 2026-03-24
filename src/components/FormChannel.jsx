import { useState, useEffect, useRef, useCallback } from 'react';
import AddressInput from './AddressInput';
import ClientBookingView from './ClientBookingView';
import { useSchedule } from '../context/ScheduleContext';

/* ── helpers ─────────────────────────────────────────────────────── */
const JOB_TYPES = [
  { id: 'HVAC',              icon: '❄️', label: 'HVAC / Air Con',     desc: 'Heating, ventilation & air conditioning' },
  { id: 'Electrical',        icon: '⚡', label: 'Electrical',          desc: 'Electrical work & repairs' },
  { id: 'Plumbing',          icon: '🔧', label: 'Plumbing',            desc: 'Plumbing & drainage' },
  { id: 'General',           icon: '🔨', label: 'General Maintenance', desc: 'General maintenance & repairs' },
  { id: 'Quote',             icon: '📋', label: 'Request a Quote',     desc: 'Describe the work — we\'ll call back with pricing' },
  { id: 'Service/Breakdown', icon: '🚨', label: 'Service / Breakdown', desc: 'Urgent reactive service — we\'ll get someone out fast' },
];

// Urgency levels are fetched from settings; this is the fallback
const URGENCY_META = {
  Routine:   { icon: '🟢', desc: 'No hurry, book at convenience' },
  Soon:      { icon: '🟡', desc: 'Within the next few days' },
  Urgent:    { icon: '🟠', desc: 'Today or tomorrow if possible' },
  Emergency: { icon: '🔴', desc: 'Critical — needs attention ASAP' },
};
const DEFAULT_URGENCY = ['Routine', 'Soon', 'Urgent', 'Emergency'];

function fmtHour(h) {
  if (h === 0)  return '12am';
  if (h < 12)  return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

/* ── Progress bar ────────────────────────────────────────────────── */
function StepBar({ step, total }) {
  return (
    <div className="fw-stepbar">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`fw-stepdot${i + 1 < step ? ' done' : i + 1 === step ? ' active' : ''}`}>
          {i + 1 < step ? '✓' : i + 1}
        </div>
      ))}
      <div className="fw-stepline" style={{ width: `${((step - 1) / (total - 1)) * 100}%` }} />
    </div>
  );
}

/* ── Compact AI chat panel ───────────────────────────────────────── */
function AskPanel({ open, onToggle, stepContext }) {
  const [msgs,    setMsgs]    = useState([{ role: 'assistant', content: 'Hi! 👋 Got a question about your booking? I\'m here to help.' }]);
  const [input,   setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const next = [...msgs, { role: 'user', content: text }];
    setMsgs(next);
    setLoading(true);
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: 'web',
          messages: [
            {
              role: 'user',
              content: `[Context: Customer is filling out a booking form — ${stepContext}]\n\n${text}`,
            },
          ],
        }),
      });
      const d = await r.json();
      setMsgs(m => [...m, { role: 'assistant', content: d.text || 'Let me know if you need help!' }]);
    } catch {
      setMsgs(m => [...m, { role: 'assistant', content: 'Sorry, I\'m having trouble connecting. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, msgs, stepContext]);

  return (
    <div className={`fw-ask-panel${open ? ' open' : ''}`}>
      <button className="fw-ask-toggle" onClick={onToggle}>
        <span>💬 Questions? Ask Fiona</span>
        <span className="fw-ask-chevron">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="fw-ask-body">
          <div className="fw-ask-msgs">
            {msgs.map((m, i) => (
              <div key={i} className={`fw-ask-msg ${m.role}`}>
                <span className="fw-ask-speaker">{m.role === 'assistant' ? 'Fiona' : 'You'}</span>
                <span className="fw-ask-text">{m.content}</span>
              </div>
            ))}
            {loading && (
              <div className="fw-ask-msg assistant">
                <span className="fw-ask-speaker">Fiona</span>
                <span className="fw-ask-text typing"><span /><span /><span /></span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="fw-ask-input-row">
            <input
              className="fw-ask-input"
              placeholder="Ask a question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button className="fw-ask-send" onClick={send} disabled={!input.trim() || loading}>→</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Slot picker ─────────────────────────────────────────────────── */
function SlotPicker({ selected, onSelect }) {
  const [slots,   setSlots]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/form/slots')
      .then(r => r.json())
      .then(d => setSlots(d.slots || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="fw-slot-loading">Loading available times…</div>;
  if (!slots.length) return <div className="fw-slot-empty">No slots available in the next 2 weeks. Please call us directly.</div>;

  return (
    <div className="fw-slot-grid">
      {slots.map(day => (
        <div key={day.date} className="fw-slot-day">
          <div className="fw-slot-day-label">{day.label}</div>
          <div className="fw-slot-times">
            {day.hours.map(h => {
              const key = `${day.date}:${h}`;
              const active = selected?.date === day.date && selected?.startHour === h;
              return (
                <button
                  key={h}
                  className={`fw-slot-btn${active ? ' active' : ''}`}
                  onClick={() => onSelect({ date: day.date, startHour: h })}
                >
                  {fmtHour(h)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main FormChannel ────────────────────────────────────────────── */
const TOTAL_STEPS = 5;
const STEP_LABELS = ['About You', 'Service', 'Details', 'Location', 'Schedule'];

export default function FormChannel() {
  const { addJob } = useSchedule();

  const [phase,   setPhase]   = useState('landing'); // landing | wizard | confirmed
  const [step,    setStep]    = useState(1);
  const [chatOpen, setChatOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors,  setErrors]  = useState({});
  const [booking, setBooking] = useState(null);
  const [urgencyLevels, setUrgencyLevels] = useState(DEFAULT_URGENCY);

  useEffect(() => {
    fetch('/api/settings/prompt')
      .then(r => r.json())
      .then(d => { if (d.enabledUrgencyLevels?.length) setUrgencyLevels(d.enabledUrgencyLevels); })
      .catch(() => {});
  }, []);

  const [form, setForm] = useState({
    name: '', business: '', mobile: '', email: '',
    jobType: '', urgency: '',
    description: '', unitType: '', unitLocation: '',
    address: '',
    date: '', startHour: null,
  });

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const isQuote    = form.jobType === 'Quote';
  const isBreakdown = form.jobType === 'Service/Breakdown';
  const isHVAC     = form.jobType === 'HVAC';
  const skipSchedule = isQuote;
  const effectiveTotal = skipSchedule ? 4 : TOTAL_STEPS;

  /* ── Validation ──────────────────────────────────────────────── */
  function validate(s) {
    const e = {};
    if (s === 1) {
      if (!form.name.trim())   e.name   = 'Name is required';
      if (!form.mobile.trim()) e.mobile = 'Mobile number is required';
    }
    if (s === 2) {
      if (!form.jobType) e.jobType = 'Please select a service type';
    }
    if (s === 4) {
      if (!form.address.trim()) e.address = 'Service address is required';
    }
    if (s === 5 && !skipSchedule) {
      if (!form.date || form.startHour == null) e.slot = 'Please select a date and time';
    }
    return e;
  }

  const next = () => {
    const e = validate(step);
    if (Object.keys(e).length) { setErrors(e); return; }
    setErrors({});
    if (step >= effectiveTotal) { submit(); return; }
    setStep(s => s + 1);
  };

  const back = () => {
    setErrors({});
    setStep(s => Math.max(1, s - 1));
  };

  /* ── Submit ──────────────────────────────────────────────────── */
  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await fetch('/api/form/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          form.name.trim(),
          business:      form.business.trim(),
          mobile:        form.mobile.trim(),
          email:         form.email.trim(),
          jobType:       form.jobType,
          description:   [form.description, form.unitType && `Unit: ${form.unitType}`, form.unitLocation && `Location: ${form.unitLocation}`].filter(Boolean).join(' | '),
          address:       form.address,
          date:          form.date || null,
          startHour:     form.startHour,
          urgency:       form.urgency,
        }),
      });
      const d = await r.json();
      if (d.ok && d.booking) {
        setBooking(d.booking);
        addJob(d.booking);
        setPhase('confirmed');
      } else {
        setErrors({ submit: d.error || 'Booking failed — please try again' });
      }
    } catch {
      setErrors({ submit: 'Network error — please try again' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Step context string for AI chat ─────────────────────────── */
  const stepContext = `Step ${step}: ${STEP_LABELS[step - 1]}. ` +
    (form.jobType ? `Service: ${form.jobType}. ` : '') +
    (form.name ? `Customer: ${form.name}. ` : '');

  /* ── LANDING ─────────────────────────────────────────────────── */
  if (phase === 'landing') {
    return (
      <div className="channel-body fw-landing">
        <div className="fw-landing-inner">
          <div className="fw-landing-icon">📋</div>
          <div className="fw-landing-title">Book a Job</div>
          <div className="fw-landing-sub">
            Fill out our quick booking form and we'll confirm your appointment instantly.
          </div>
          <div className="fw-landing-steps">
            {STEP_LABELS.map((lbl, i) => (
              <div key={i} className="fw-landing-step">
                <span className="fw-landing-step-num">{i + 1}</span>
                <span>{lbl}</span>
              </div>
            ))}
          </div>
          <button className="fw-start-btn" onClick={() => setPhase('wizard')}>
            Start Booking →
          </button>
          <div className="fw-landing-chat-hint">💬 Questions? Use the Ask Fiona panel at any step</div>
        </div>
      </div>
    );
  }

  /* ── CONFIRMED ───────────────────────────────────────────────── */
  if (phase === 'confirmed') {
    return (
      <div className="channel-body fw-confirmed">
        <div className="fw-confirmed-scroll">
          <ClientBookingView booking={booking} />
          <button
            className="fw-restart-btn"
            onClick={() => { setPhase('landing'); setStep(1); setForm({ name:'',business:'',mobile:'',email:'',jobType:'',urgency:'',description:'',unitType:'',unitLocation:'',address:'',date:'',startHour:null }); setBooking(null); }}
          >
            ← Make Another Booking
          </button>
        </div>
      </div>
    );
  }

  /* ── WIZARD ──────────────────────────────────────────────────── */
  return (
    <div className="channel-body fw-wizard">

      {/* Progress */}
      <div className="fw-header">
        <div className="fw-header-top">
          <button className="fw-back-link" onClick={step === 1 ? () => setPhase('landing') : back}>‹ Back</button>
          <span className="fw-step-label">Step {step} of {effectiveTotal} — {STEP_LABELS[step - 1]}</span>
          <span />
        </div>
        <StepBar step={step} total={effectiveTotal} />
      </div>

      {/* Step content */}
      <div className="fw-body">

        {/* ── STEP 1: About You ── */}
        {step === 1 && (
          <div className="fw-step-wrap">
            <div className="fw-step-title">👤 About You</div>
            <div className="fw-step-sub">We'll use this to send your booking confirmation.</div>

            <div className="fw-field-row">
              <div className="fw-field">
                <label className="fw-label">Full Name <span className="fw-req">*</span></label>
                <input className={`fw-input${errors.name ? ' err' : ''}`} placeholder="e.g. Jane Smith"
                  value={form.name} onChange={e => set('name', e.target.value)} />
                {errors.name && <div className="fw-err">{errors.name}</div>}
              </div>
              <div className="fw-field">
                <label className="fw-label">Business Name <span className="fw-opt">(optional)</span></label>
                <input className="fw-input" placeholder="e.g. Sunrise Health Group"
                  value={form.business} onChange={e => set('business', e.target.value)} />
              </div>
            </div>

            <div className="fw-field-row">
              <div className="fw-field">
                <label className="fw-label">Mobile <span className="fw-req">*</span></label>
                <input className={`fw-input${errors.mobile ? ' err' : ''}`} placeholder="04XX XXX XXX"
                  type="tel" value={form.mobile} onChange={e => set('mobile', e.target.value)} />
                {errors.mobile && <div className="fw-err">{errors.mobile}</div>}
              </div>
              <div className="fw-field">
                <label className="fw-label">Email <span className="fw-opt">(for confirmation)</span></label>
                <input className="fw-input" placeholder="you@example.com"
                  type="email" value={form.email} onChange={e => set('email', e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Service Type ── */}
        {step === 2 && (
          <div className="fw-step-wrap">
            <div className="fw-step-title">🔧 What do you need?</div>
            <div className="fw-step-sub">Select the type of service required.</div>
            {errors.jobType && <div className="fw-err">{errors.jobType}</div>}

            <div className="fw-jobtype-grid">
              {JOB_TYPES.map(jt => (
                <button
                  key={jt.id}
                  className={`fw-jt-card${form.jobType === jt.id ? ' active' : ''}`}
                  onClick={() => set('jobType', jt.id)}
                >
                  <span className="fw-jt-icon">{jt.icon}</span>
                  <span className="fw-jt-label">{jt.label}</span>
                  <span className="fw-jt-desc">{jt.desc}</span>
                </button>
              ))}
            </div>

            {form.jobType && !isQuote && (
              <div className="fw-urgency-row">
                <div className="fw-field-label">Urgency</div>
                <div className="fw-urgency-btns">
                  {urgencyLevels.map(id => {
                    const meta = URGENCY_META[id] || { icon: '⚪', desc: '' };
                    return (
                      <button
                        key={id}
                        className={`fw-urgency-btn${form.urgency === id ? ' active' : ''}`}
                        onClick={() => set('urgency', id)}
                      >
                        <span>{meta.icon} {id}</span>
                        <span className="fw-urgency-desc">{meta.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: Details ── */}
        {step === 3 && (
          <div className="fw-step-wrap">
            <div className="fw-step-title">
              {isBreakdown ? '🚨 Tell us about the issue' : isQuote ? '📋 Describe the work' : '📝 Job Details'}
            </div>
            <div className="fw-step-sub">
              {isBreakdown
                ? 'Help us understand the problem so we can send the right technician.'
                : isQuote
                ? 'The more detail you give, the more accurate our quote will be.'
                : 'A brief description helps us prepare for the job.'}
            </div>

            {(isHVAC || isBreakdown) && (
              <div className="fw-field-row">
                <div className="fw-field">
                  <label className="fw-label">Unit Type <span className="fw-opt">(if known)</span></label>
                  <input className="fw-input" placeholder="e.g. Split system, Ducted, Rooftop"
                    value={form.unitType} onChange={e => set('unitType', e.target.value)} />
                </div>
                <div className="fw-field">
                  <label className="fw-label">Unit Location <span className="fw-opt">(if known)</span></label>
                  <input className="fw-input" placeholder="e.g. Ceiling cassette, Level 2 plant room"
                    value={form.unitLocation} onChange={e => set('unitLocation', e.target.value)} />
                </div>
              </div>
            )}

            <div className="fw-field">
              <label className="fw-label">
                {isQuote ? 'Description of Work Required' : 'Describe the issue or work needed'}
                {isQuote && <span className="fw-req"> *</span>}
              </label>
              <textarea
                className="fw-textarea"
                rows={4}
                placeholder={
                  isBreakdown ? 'What\'s happening? e.g. "Air con unit stopped working, making a loud noise, no cooling"'
                  : isQuote   ? 'Please describe the work required in as much detail as possible…'
                  : 'Optional — any notes for the technician'
                }
                value={form.description}
                onChange={e => set('description', e.target.value)}
              />
            </div>
          </div>
        )}

        {/* ── STEP 4: Location ── */}
        {step === 4 && (
          <div className="fw-step-wrap">
            <div className="fw-step-title">📍 Where is the job?</div>
            <div className="fw-step-sub">Enter the full service address.</div>
            {errors.address && <div className="fw-err">{errors.address}</div>}

            <div className="fw-address-wrap">
              <AddressInput
                label="Service address"
                onSubmit={({ address }) => set('address', address)}
              />
              {form.address && (
                <div className="fw-address-confirmed">
                  <span className="fw-address-tick">✓</span>
                  <span>{form.address}</span>
                  <button className="fw-address-clear" onClick={() => set('address', '')}>✕</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP 5: Schedule (or Quote bypass) ── */}
        {step === 5 && !skipSchedule && (
          <div className="fw-step-wrap">
            <div className="fw-step-title">
              {isBreakdown ? '🚨 First available slot' : '📅 Choose a time'}
            </div>
            <div className="fw-step-sub">
              {isBreakdown
                ? 'We\'ll get someone out as soon as possible — select the earliest slot that works.'
                : 'Pick a date and time from the available slots below.'}
            </div>
            {errors.slot && <div className="fw-err">{errors.slot}</div>}

            <SlotPicker
              selected={form.date ? { date: form.date, startHour: form.startHour } : null}
              onSelect={({ date, startHour }) => { set('date', date); set('startHour', startHour); }}
            />

            {form.date && form.startHour != null && (
              <div className="fw-slot-selected">
                ✓ Selected: {new Date(form.date).toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long' })} at {fmtHour(form.startHour)}–{fmtHour(form.startHour + 2)}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 5 for Quote: confirmation summary before submit ── */}
        {step === effectiveTotal && skipSchedule && (
          <div className="fw-step-wrap">
            <div className="fw-step-title">📋 Confirm Your Quote Request</div>
            <div className="fw-step-sub">We'll review the details and call you back to arrange a time.</div>
            <div className="fw-summary">
              <div className="fw-summary-row"><span>Name</span><strong>{form.name}{form.business ? ` · ${form.business}` : ''}</strong></div>
              <div className="fw-summary-row"><span>Contact</span><strong>{form.mobile}{form.email ? ` · ${form.email}` : ''}</strong></div>
              <div className="fw-summary-row"><span>Address</span><strong>{form.address}</strong></div>
              <div className="fw-summary-row"><span>Description</span><strong>{form.description || '—'}</strong></div>
            </div>
          </div>
        )}

      </div>

      {/* Next / Submit button */}
      <div className="fw-footer">
        {errors.submit && <div className="fw-err" style={{ marginBottom: 8 }}>{errors.submit}</div>}
        <button
          className="fw-next-btn"
          onClick={next}
          disabled={submitting}
        >
          {submitting ? 'Booking…'
            : step === effectiveTotal ? (skipSchedule ? 'Submit Quote Request' : 'Confirm Booking →')
            : 'Continue →'}
        </button>
      </div>

      {/* Ask Fiona chat panel */}
      <AskPanel open={chatOpen} onToggle={() => setChatOpen(o => !o)} stepContext={stepContext} />

    </div>
  );
}
