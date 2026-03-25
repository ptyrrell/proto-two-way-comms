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

const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => i + 6);

const ALL_DATA_FIELDS = [
  { id: 'date',        icon: '📅', label: 'Preferred Date',   desc: 'Ask if they have a preferred date or date range' },
  { id: 'time',        icon: '🕐', label: 'Preferred Time',   desc: 'Ask if they prefer morning or afternoon' },
  { id: 'address',     icon: '📍', label: 'Service Address',  desc: 'Collect full service address (triggers address widget)' },
  { id: 'name',        icon: '👤', label: 'Customer Name',    desc: 'Ask for the customer\'s full name' },
  { id: 'business',    icon: '🏢', label: 'Business Name',    desc: 'Ask if booking is for a business and collect its name' },
  { id: 'description', icon: '📋', label: 'Job Description',  desc: 'Ask customer to describe the issue or work needed' },
];

const ALL_URGENCY_LEVELS = [
  { id: 'Routine',   icon: '🟢', desc: 'No hurry — book at convenience' },
  { id: 'Soon',      icon: '🟡', desc: 'Within the next few days' },
  { id: 'Urgent',    icon: '🟠', desc: 'Today or tomorrow if possible' },
  { id: 'Emergency', icon: '🔴', desc: 'Critical — needs immediate attention' },
];

const ALL_JOB_TYPES = [
  { id: 'HVAC',              icon: '❄️', desc: 'Heating, ventilation & A/C' },
  { id: 'Electrical',        icon: '⚡', desc: 'Electrical work & repairs' },
  { id: 'Plumbing',          icon: '🔧', desc: 'Plumbing & drainage' },
  { id: 'General',           icon: '🔨', desc: 'General maintenance' },
  { id: 'Quote',             icon: '📋', desc: 'Customer describes work, team calls back to arrange' },
  { id: 'Service/Breakdown', icon: '🚨', desc: 'Emergency / reactive service, asks for unit & location' },
];

const DEFAULT_PROMPT = {
  personaName:           'Fiona',
  companyName:           'FieldInsight',
  greeting:              "Hi! I'm Fiona from FieldInsight. How can I help you today? Please provide your name, address and details of your request. Thank you.",
  voiceGreeting:         "Sorry, all our humans are busy right now. Would you be up to booking a job with us today?",
  showTechNames:         false,
  collectContactDetails: true,
  enabledJobTypes:       ['HVAC', 'Electrical', 'Plumbing', 'General', 'Quote', 'Service/Breakdown'],
  enabledUrgencyLevels:  ['Routine', 'Soon', 'Urgent', 'Emergency'],
  requiredFields:        ['date', 'time', 'address', 'name', 'business', 'description'],
  customInstructions:    '',
  customFullPrompt:      null,
};

export default function TechSettings({ onClose }) {
  const { refreshBookingSettings } = useSchedule();
  const [techSettings,    setTechSettings]    = useState({});
  const [bookingSettings, setBookingSettings] = useState({
    defaultJobDuration: 1,
    bufferHours:        4,
    workingDays:        [1,2,3,4,5],
    startHour:          8,
    endHour:            17,
    lunchEnabled:       true,
    lunchStart:         12,
    lunchEnd:           13,
    voiceModel:         'Polly.Joanna',
    voiceSpeechModel:   'numbers_and_commands',
    voiceEnhanced:      true,
    voiceMaxTurns:      20,
    voiceTimeout:       5,
    voiceSpeechTimeout: 1,
  });
  const [promptSettings,  setPromptSettings]  = useState(DEFAULT_PROMPT);
  const [promptPreview,   setPromptPreview]   = useState('');
  const [editingFullPrompt, setEditingFullPrompt] = useState(false);
  const [fullPromptDraft, setFullPromptDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    fetch('/api/settings/techs').then(r => r.json()).then(d => setTechSettings(d));
    fetch('/api/settings/booking').then(r => r.json()).then(d => setBookingSettings(d));
    fetch('/api/settings/prompt').then(r => r.json()).then(d => setPromptSettings(d));
    fetch('/api/settings/prompt/preview').then(r => r.json()).then(d => setPromptPreview(d.prompt || ''));
  }, []);

  const refreshPreview = () => {
    fetch('/api/settings/prompt/preview').then(r => r.json()).then(d => setPromptPreview(d.prompt || ''));
  };

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

  const toggleOnCall = async (tech) => {
    const newVal = !techSettings[tech]?.onCall;
    setTechSettings(prev => ({ ...prev, [tech]: { ...prev[tech], onCall: newVal } }));
    setSaving(true);
    await fetch('/api/settings/techs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech, onCall: newVal }),
    });
    setSaving(false);
    flash();
  };

  /* ─── Prompt settings save ─────────────────────────── */
  const savePrompt = async (patch) => {
    const next = { ...promptSettings, ...patch };
    setPromptSettings(next);
    setSaving(true);
    await fetch('/api/settings/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setSaving(false);
    flash();
    setTimeout(refreshPreview, 200);
  };

  const toggleJobType = (id) => {
    const cur = promptSettings.enabledJobTypes || [];
    const next = cur.includes(id) ? cur.filter(t => t !== id) : [...cur, id];
    savePrompt({ enabledJobTypes: next });
  };

  const toggleDataField = (id) => {
    const cur = promptSettings.requiredFields || [];
    const next = cur.includes(id) ? cur.filter(f => f !== id) : [...cur, id];
    savePrompt({ requiredFields: next });
  };

  const toggleUrgencyLevel = (id) => {
    const cur = promptSettings.enabledUrgencyLevels || [];
    const next = cur.includes(id) ? cur.filter(u => u !== id) : [...cur, id];
    savePrompt({ enabledUrgencyLevels: next });
  };

  const enterFullEdit = () => {
    setFullPromptDraft(promptSettings.customFullPrompt || promptPreview);
    setEditingFullPrompt(true);
  };

  const saveFullPrompt = async () => {
    await savePrompt({ customFullPrompt: fullPromptDraft.trim() || null });
    setEditingFullPrompt(false);
  };

  const resetFullPrompt = async () => {
    setFullPromptDraft('');
    await savePrompt({ customFullPrompt: null });
    setEditingFullPrompt(false);
    setTimeout(refreshPreview, 300);
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
            const meta   = TECH_META[tech] || { role: 'Technician', icon: '👷' };
            const on     = cfg?.availableForBooking ?? true;
            const onCall = cfg?.onCall ?? false;
            return (
              <div key={tech} className={`tech-row${on ? '' : ' off'}`}>
                <div className="tech-row-icon">{meta.icon}</div>
                <div className="tech-row-info">
                  <div className="tech-row-name">{tech}</div>
                  <div className="tech-row-role">{meta.role}</div>
                </div>
                <div className="tech-row-right">
                  {/* On Call checkbox */}
                  <label
                    className={`oncall-label${onCall ? ' active' : ''}`}
                    title="On Call — available 24x7, jobs can be allocated outside normal hours"
                  >
                    <input
                      type="checkbox"
                      checked={onCall}
                      onChange={() => toggleOnCall(tech)}
                      className="oncall-checkbox"
                    />
                    <span className="oncall-icon">📟</span>
                    <span className="oncall-text">On Call</span>
                  </label>

                  {/* Available toggle */}
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

          {/* Default job duration */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Default Job Duration</div>
              <div className="br-desc">Standard job length — used for conflict checking and slot availability</div>
            </div>
            <div className="br-control">
              <div className="br-stepper">
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ defaultJobDuration: Math.max(1, (bookingSettings.defaultJobDuration || 1) - 1) })}
                >−</button>
                <span className="br-value">
                  {(bookingSettings.defaultJobDuration || 1) === 1 ? '60 min' : `${bookingSettings.defaultJobDuration}h`}
                </span>
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ defaultJobDuration: Math.min(8, (bookingSettings.defaultJobDuration || 1) + 1) })}
                >+</button>
              </div>
            </div>
          </div>

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

          {/* Lunch break */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Lunch Break</div>
              <div className="br-desc">Block this period from self-booking on working days</div>
            </div>
            <div className="br-control">
              <div className="br-hours-row" style={{ alignItems: 'center', gap: '8px' }}>
                <button
                  className={`toggle-btn${bookingSettings.lunchEnabled ? ' on' : ' off'}`}
                  onClick={() => saveBooking({ lunchEnabled: !bookingSettings.lunchEnabled })}
                  style={{ flexShrink: 0 }}
                >
                  <span className="toggle-thumb" />
                </button>
                <select
                  className="br-select"
                  disabled={!bookingSettings.lunchEnabled}
                  value={bookingSettings.lunchStart ?? 12}
                  onChange={e => saveBooking({ lunchStart: Number(e.target.value) })}
                >
                  {HOUR_OPTIONS.filter(h => h < (bookingSettings.lunchEnd ?? 13)).map(h => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
                <span className="br-to">to</span>
                <select
                  className="br-select"
                  disabled={!bookingSettings.lunchEnabled}
                  value={bookingSettings.lunchEnd ?? 13}
                  onChange={e => saveBooking({ lunchEnd: Number(e.target.value) })}
                >
                  {HOUR_OPTIONS.filter(h => h > (bookingSettings.lunchStart ?? 12)).map(h => (
                    <option key={h} value={h}>{fmtHour(h)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

        </div>

        {/* ─── VOIP / IVR SECTION ─────────────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>📞</span> VOIP / IVR Settings
        </div>

        <div className="booking-rules">

          {/* TTS Voice */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Fiona's Voice</div>
              <div className="br-desc">Amazon Polly voice used for text-to-speech on calls</div>
            </div>
            <div className="br-control">
              <select
                className="br-select"
                value={bookingSettings.voiceModel || 'Polly.Joanna'}
                onChange={e => saveBooking({ voiceModel: e.target.value })}
                style={{ minWidth: 280 }}
              >
                <optgroup label="🇺🇸 US English (Standard)">
                  <option value="Polly.Joanna">Joanna — US Female ★ default</option>
                  <option value="Polly.Matthew">Matthew — US Male</option>
                </optgroup>
                <optgroup label="🇺🇸 US English (Neural)">
                  <option value="Polly.Joanna-Neural">Joanna — US Female (Neural)</option>
                  <option value="Polly.Matthew-Neural">Matthew — US Male (Neural)</option>
                </optgroup>
                <optgroup label="🇬🇧 British (Standard)">
                  <option value="Polly.Amy">Amy — UK Female</option>
                  <option value="Polly.Brian">Brian — UK Male</option>
                  <option value="Polly.Emma">Emma — UK Female</option>
                </optgroup>
                <optgroup label="🇬🇧 British (Neural)">
                  <option value="Polly.Amy-Neural">Amy — UK Female (Neural)</option>
                  <option value="Polly.Brian-Neural">Brian — UK Male (Neural)</option>
                </optgroup>
              </select>
            </div>
          </div>

          {/* Speech recognition model */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Speech Recognition Model</div>
              <div className="br-desc">Which Twilio STT engine processes the caller's speech</div>
            </div>
            <div className="br-control">
              <select
                className="br-select"
                value={bookingSettings.voiceSpeechModel || 'numbers_and_commands'}
                onChange={e => saveBooking({ voiceSpeechModel: e.target.value })}
                style={{ minWidth: 200 }}
              >
                <option value="numbers_and_commands">numbers_and_commands — best for digits &amp; phone numbers ★</option>
                <option value="phone_call">phone_call — optimised for phone audio quality</option>
                <option value="experimental_conversations">experimental_conversations — best for natural speech</option>
                <option value="experimental_utterances">experimental_utterances — shorter phrases</option>
                <option value="default">default — basic model</option>
              </select>
            </div>
          </div>

          {/* Enhanced model toggle */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Enhanced Model</div>
              <div className="br-desc">Higher accuracy STT (recommended — small Twilio cost premium)</div>
            </div>
            <div className="br-control">
              <button
                className={`toggle-btn${bookingSettings.voiceEnhanced ? ' on' : ' off'}`}
                onClick={() => saveBooking({ voiceEnhanced: !bookingSettings.voiceEnhanced })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Max turns */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Max Conversation Turns</div>
              <div className="br-desc">Call ends gracefully after this many exchanges (prevents runaway usage)</div>
            </div>
            <div className="br-control">
              <div className="br-stepper">
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ voiceMaxTurns: Math.max(5, (bookingSettings.voiceMaxTurns || 20) - 5) })}
                >−</button>
                <span className="br-value">{bookingSettings.voiceMaxTurns || 20}</span>
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ voiceMaxTurns: Math.min(50, (bookingSettings.voiceMaxTurns || 20) + 5) })}
                >+</button>
              </div>
            </div>
          </div>

          {/* Wait for caller to start speaking */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Response Wait — Start</div>
              <div className="br-desc">Seconds Twilio waits for caller to begin speaking after Fiona finishes (currently {bookingSettings.voiceTimeout ?? 15}s)</div>
            </div>
            <div className="br-control">
              <div className="br-stepper">
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ voiceTimeout: Math.max(3, (bookingSettings.voiceTimeout ?? 15) - 1) })}
                >−</button>
                <span className="br-value">{bookingSettings.voiceTimeout ?? 15}s</span>
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ voiceTimeout: Math.min(30, (bookingSettings.voiceTimeout ?? 15) + 1) })}
                >+</button>
              </div>
            </div>
          </div>

          {/* Wait after caller stops speaking */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Response Wait — End of Speech</div>
              <div className="br-desc">Seconds of silence after caller stops speaking before Fiona processes the reply (currently {bookingSettings.voiceSpeechTimeout ?? 4}s)</div>
            </div>
            <div className="br-control">
              <div className="br-stepper">
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ voiceSpeechTimeout: Math.max(1, (bookingSettings.voiceSpeechTimeout ?? 4) - 1) })}
                >−</button>
                <span className="br-value">{bookingSettings.voiceSpeechTimeout ?? 4}s</span>
                <button
                  className="br-step-btn"
                  onClick={() => saveBooking({ voiceSpeechTimeout: Math.min(10, (bookingSettings.voiceSpeechTimeout ?? 4) + 1) })}
                >+</button>
              </div>
            </div>
          </div>

        </div>

        {/* ─── PROMPT / PERSONA SECTION ───────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>🤖</span> AI Persona &amp; Prompt
        </div>

        <div className="booking-rules">

          {/* Persona name */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Persona Name</div>
              <div className="br-desc">The name the AI introduces itself as</div>
            </div>
            <div className="br-control">
              <input
                className="br-input"
                value={promptSettings.personaName}
                onChange={e => setPromptSettings(p => ({ ...p, personaName: e.target.value }))}
                onBlur={e => savePrompt({ personaName: e.target.value })}
                placeholder="e.g. Fiona"
              />
            </div>
          </div>

          {/* Company name */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Company Name</div>
              <div className="br-desc">Used in greetings and sign-offs</div>
            </div>
            <div className="br-control">
              <input
                className="br-input"
                value={promptSettings.companyName}
                onChange={e => setPromptSettings(p => ({ ...p, companyName: e.target.value }))}
                onBlur={e => savePrompt({ companyName: e.target.value })}
                placeholder="e.g. FieldInsight"
              />
            </div>
          </div>

          {/* Greeting */}
          <div className="br-row br-row-col">
            <div className="br-label">
              <div className="br-title">Opening Greeting</div>
              <div className="br-desc">First message sent on Web, SMS and Email channels</div>
            </div>
            <textarea
              className="br-textarea"
              value={promptSettings.greeting}
              rows={2}
              onChange={e => setPromptSettings(p => ({ ...p, greeting: e.target.value }))}
              onBlur={e => savePrompt({ greeting: e.target.value })}
              placeholder="Hi! I'm Fiona from FieldInsight. How can I help you today? Please provide your name, address and details of your request. Thank you."
            />
          </div>

          {/* Voice greeting */}
          <div className="br-row br-row-col">
            <div className="br-label">
              <div className="br-title">📞 Voice / IVR Greeting</div>
              <div className="br-desc">First thing Fiona says when someone calls. After this she waits for a yes/no before proceeding.</div>
            </div>
            <textarea
              className="br-textarea"
              value={promptSettings.voiceGreeting || ''}
              rows={2}
              onChange={e => setPromptSettings(p => ({ ...p, voiceGreeting: e.target.value }))}
              onBlur={e => savePrompt({ voiceGreeting: e.target.value })}
              placeholder="Sorry, all our humans are busy right now. Would you be up to booking a job with us today?"
            />
          </div>

          {/* Show tech names toggle */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Show Technician Names</div>
              <div className="br-desc">When off, Fiona only offers dates &amp; times — never mentions who the tech is</div>
            </div>
            <div className="br-control">
              <button
                className={`toggle-btn${promptSettings.showTechNames ? ' on' : ' off'}`}
                onClick={() => savePrompt({ showTechNames: !promptSettings.showTechNames })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Collect contact details toggle */}
          <div className="br-row">
            <div className="br-label">
              <div className="br-title">Collect Contact Details</div>
              <div className="br-desc">Ask customer to confirm mobile &amp; email — sends confirmation &amp; reminder</div>
            </div>
            <div className="br-control">
              <button
                className={`toggle-btn${promptSettings.collectContactDetails ? ' on' : ' off'}`}
                onClick={() => savePrompt({ collectContactDetails: !promptSettings.collectContactDetails })}
              >
                <span className="toggle-thumb" />
              </button>
            </div>
          </div>

          {/* Custom instructions */}
          <div className="br-row br-row-col">
            <div className="br-label">
              <div className="br-title">Custom Instructions</div>
              <div className="br-desc">Extra rules appended to the auto-built prompt</div>
            </div>
            <textarea
              className="br-textarea"
              value={promptSettings.customInstructions}
              rows={2}
              onChange={e => setPromptSettings(p => ({ ...p, customInstructions: e.target.value }))}
              onBlur={e => savePrompt({ customInstructions: e.target.value })}
              placeholder="e.g. Always offer a 12-month maintenance plan at the end of the booking."
            />
          </div>

        </div>

        {/* ─── JOB TYPES SECTION ──────────────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>🗂</span> Enabled Job Types
        </div>
        <div className="job-types-grid">
          {ALL_JOB_TYPES.map(jt => {
            const on = (promptSettings.enabledJobTypes || []).includes(jt.id);
            return (
              <button
                key={jt.id}
                className={`jt-chip${on ? ' on' : ' off'}`}
                onClick={() => toggleJobType(jt.id)}
                title={jt.desc}
              >
                <span className="jt-icon">{jt.icon}</span>
                <span className="jt-label">{jt.id}</span>
                <span className={`jt-dot${on ? ' on' : ''}`} />
              </button>
            );
          })}
        </div>
        <div className="jt-hint">
          {ALL_JOB_TYPES.filter(jt => (promptSettings.enabledJobTypes||[]).includes(jt.id)).map(jt => (
            <span key={jt.id} className="jt-desc-item">{jt.icon} <strong>{jt.id}</strong> — {jt.desc}</span>
          ))}
        </div>

        {/* ─── URGENCY LEVELS ─────────────────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>⚡</span> Urgency Levels
        </div>
        <div className="jt-hint" style={{ marginBottom: '8px' }}>
          Fiona infers urgency from the conversation and stamps it on the job. Enable the levels that apply to your business.
        </div>
        <div className="job-types-grid">
          {ALL_URGENCY_LEVELS.map(u => {
            const on = (promptSettings.enabledUrgencyLevels || []).includes(u.id);
            return (
              <button
                key={u.id}
                className={`jt-chip${on ? ' on' : ' off'}`}
                onClick={() => toggleUrgencyLevel(u.id)}
                title={u.desc}
              >
                <span className="jt-icon">{u.icon}</span>
                <span className="jt-label">{u.id}</span>
                <span className={`jt-dot${on ? ' on' : ''}`} />
              </button>
            );
          })}
        </div>
        <div className="jt-desc-list" style={{ marginTop: '6px' }}>
          {ALL_URGENCY_LEVELS.filter(u => (promptSettings.enabledUrgencyLevels || []).includes(u.id)).map(u => (
            <span key={u.id} className="jt-desc-item">{u.icon} <strong>{u.id}</strong> — {u.desc}</span>
          ))}
        </div>

        {/* ─── KEY DATA TO COLLECT ────────────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>🗃</span> Key Data to Collect
        </div>
        <div className="jt-hint" style={{ marginBottom: '8px' }}>
          Fiona will ask for each enabled field during the conversation.
        </div>
        <div className="job-types-grid">
          {ALL_DATA_FIELDS.map(f => {
            const on = (promptSettings.requiredFields || []).includes(f.id);
            return (
              <button
                key={f.id}
                className={`jt-chip${on ? ' on' : ' off'}`}
                onClick={() => toggleDataField(f.id)}
                title={f.desc}
              >
                <span className="jt-icon">{f.icon}</span>
                <span className="jt-label">{f.label}</span>
                <span className={`jt-dot${on ? ' on' : ''}`} />
              </button>
            );
          })}
        </div>
        <div className="jt-hint" style={{ marginTop: '6px' }}>
          {ALL_DATA_FIELDS.filter(f => (promptSettings.requiredFields || []).includes(f.id)).map(f => (
            <span key={f.id} className="jt-desc-item">{f.icon} <strong>{f.label}</strong> — {f.desc}</span>
          ))}
        </div>

        {/* ─── FULL PROMPT EDITOR ─────────────────────────── */}
        <div className="settings-section-label" style={{ marginTop: '20px' }}>
          <span>📝</span> Full System Prompt
          {promptSettings.customFullPrompt && <span className="prompt-custom-badge">Custom</span>}
        </div>

        {editingFullPrompt ? (
          <div className="prompt-editor">
            <div className="prompt-editor-hint">
              Available tokens: <code>{'{TODAY}'}</code> <code>{'{SLOTS}'}</code> <code>{'{PERSONA}'}</code> <code>{'{COMPANY}'}</code> <code>{'{CHANNEL}'}</code>
            </div>
            <textarea
              className="br-textarea prompt-full-textarea"
              value={fullPromptDraft}
              rows={16}
              onChange={e => setFullPromptDraft(e.target.value)}
            />
            <div className="prompt-editor-actions">
              <button className="pe-btn pe-save" onClick={saveFullPrompt}>Save Custom Prompt</button>
              <button className="pe-btn pe-reset" onClick={resetFullPrompt}>Reset to Auto-build</button>
              <button className="pe-btn pe-cancel" onClick={() => setEditingFullPrompt(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="prompt-preview">
            <pre className="prompt-preview-text">{promptPreview || 'Loading…'}</pre>
            <button className="pe-btn pe-edit" onClick={enterFullEdit}>
              {promptSettings.customFullPrompt ? '✏️ Edit Custom Prompt' : '✏️ Edit / Override Prompt'}
            </button>
          </div>
        )}

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
