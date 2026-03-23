import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

let anthropicClient = null;
try {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic();
    console.log('✓ Anthropic client initialised');
  } else {
    console.log('⚠  No ANTHROPIC_API_KEY — using mock responses');
  }
} catch (e) {
  console.log('Anthropic SDK not available:', e.message);
}

// ── In-memory schedule ─────────────────────────────────────────────
const TECHS = ['Jake Morrison', 'Sam Peters', 'Brad Kim', 'Amy Chen'];

// Technician self-booking availability (all on by default)
let techSettings = Object.fromEntries(TECHS.map(t => [t, { availableForBooking: true }]));

// Booking rules
let bookingSettings = {
  bufferHours:  4,              // minimum hours in advance before a slot is bookable
  workingDays:  [1, 2, 3, 4, 5], // Mon–Fri (0=Sun … 6=Sat)
  startHour:    8,              // first bookable hour (8 AM)
  endHour:      17,             // last bookable start hour (5 PM, so jobs end by 6 PM)
};

// AI persona & prompt settings
let promptSettings = {
  personaName:           'Fiona',
  companyName:           'FieldInsight',
  greeting:              "Hi! I'm Fiona from FieldInsight. How can I help you today?",
  showTechNames:         false,
  collectContactDetails: true,
  enabledJobTypes:       ['HVAC', 'Electrical', 'Plumbing', 'General', 'Quote', 'Service/Breakdown'],
  customInstructions:    '',
  customFullPrompt:      null,   // when set, overrides the auto-built prompt; supports tokens: {TODAY} {SLOTS} {PERSONA} {COMPANY}
};

const TYPE_META = {
  HVAC:       { color: '#1e4a6e', border: '#2563eb', text: '#93c5fd' },
  Electrical: { color: '#3b1f6e', border: '#7c3aed', text: '#c4b5fd' },
  Plumbing:   { color: '#0c3d4a', border: '#0891b2', text: '#67e8f9' },
  General:    { color: '#0f3d2a', border: '#059669', text: '#6ee7b7' },
};

function dateStr(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

let jobs = [
  { id:'J-1',  tech:'Jake Morrison', customer:'Sunrise Aged Care',    type:'HVAC',       address:'42 Sunrise Dr, Mulgrave',  date:dateStr(1),  startHour:9,  duration:2, amount:380,  status:'confirmed' },
  { id:'J-2',  tech:'Sam Peters',    customer:'Cornerstone Dental',   type:'Electrical', address:'15 Collins St, Melbourne', date:dateStr(2),  startHour:8,  duration:3, amount:840,  status:'confirmed' },
  { id:'J-3',  tech:'Brad Kim',      customer:'GreenLeaf Childcare',  type:'Plumbing',   address:'8 Eucalyptus Rd, Ringwood',date:dateStr(3),  startHour:7,  duration:2, amount:290,  status:'confirmed' },
  { id:'J-4',  tech:'Jake Morrison', customer:'Metro Hotel',          type:'HVAC',       address:'200 Spencer St, Melbourne',date:dateStr(4),  startHour:10, duration:4, amount:1200, status:'confirmed' },
  { id:'J-5',  tech:'Amy Chen',      customer:'Chadstone SC',         type:'HVAC',       address:'1341 Dandenong Rd',        date:dateStr(5),  startHour:9,  duration:3, amount:650,  status:'confirmed' },
  { id:'J-6',  tech:'Brad Kim',      customer:'St Vincent Hospital',  type:'Plumbing',   address:'41 Victoria Pde, Fitzroy', date:dateStr(7),  startHour:8,  duration:2, amount:420,  status:'confirmed' },
  { id:'J-7',  tech:'Sam Peters',    customer:'City Towers',          type:'Electrical', address:'101 Collins St, Melbourne',date:dateStr(8),  startHour:11, duration:2, amount:580,  status:'confirmed' },
  { id:'J-8',  tech:'Jake Morrison', customer:'Dulux Office Park',    type:'HVAC',       address:'22 Compark Cct, Scoresby', date:dateStr(10), startHour:9,  duration:3, amount:720,  status:'confirmed' },
  { id:'J-9',  tech:'Amy Chen',      customer:'Fitzroy North Body Co',type:'HVAC',       address:'188 Johnston St, Fitzroy', date:dateStr(6),  startHour:10, duration:2, amount:310,  status:'confirmed' },
  { id:'J-10', tech:'Sam Peters',    customer:'Doncaster Toyota',     type:'Electrical', address:'619 Doncaster Rd',         date:dateStr(9),  startHour:8,  duration:4, amount:960,  status:'confirmed' },
  { id:'J-11', tech:'Brad Kim',      customer:'Williamstown Pool',    type:'Plumbing',   address:'15 Strand St, Williamstown',date:dateStr(11), startHour:9, duration:3, amount:540,  status:'confirmed' },
  { id:'J-12', tech:'Amy Chen',      customer:'Richmond HVAC Club',   type:'HVAC',       address:'102 Bridge Rd, Richmond',  date:dateStr(12), startHour:10, duration:2, amount:390,  status:'confirmed' },
];

let nextId = 20;

function getAvailableSlots() {
  const activeTechs = TECHS.filter(t => techSettings[t]?.availableForBooking !== false);
  const bufferMs    = bookingSettings.bufferHours * 3600 * 1000;
  const slots = [];

  for (let day = 1; day <= 14; day++) {
    const date = dateStr(day);
    const d = new Date(date);
    if (!bookingSettings.workingDays.includes(d.getDay())) continue;

    for (const tech of activeTechs) {
      const busy = new Set();
      jobs.filter(j => j.tech === tech && j.date === date)
          .forEach(j => { for (let h = j.startHour; h < j.startHour + j.duration; h++) busy.add(h); });

      const { startHour, endHour } = bookingSettings;
      for (let hour = startHour; hour <= endHour - 2; hour++) {
        // Check buffer: slot must be at least bufferHours from now
        const slotTime = new Date(date);
        slotTime.setHours(hour, 0, 0, 0);
        if (slotTime.getTime() - Date.now() < bufferMs) continue;

        if (!busy.has(hour) && !busy.has(hour + 1)) {
          const label = new Date(date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
          slots.push({ tech, date, startHour: hour, label: `${tech} — ${label} at ${hour}:00–${hour+2}:00` });
          break; // one slot per tech per day for brevity
        }
      }
    }
  }
  return slots.slice(0, 12);
}

function buildSlotList(showTechNames) {
  const slots = getAvailableSlots();
  if (!slots.length) return '  No slots currently available — apologise and suggest calling the office.';
  return slots.map((s, i) => {
    const timeLabel = new Date(s.date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
    return showTechNames
      ? `  ${i+1}. ${s.label}`
      : `  ${i+1}. ${timeLabel} at ${s.startHour}:00–${s.startHour + 2}:00`;
  }).join('\n');
}

function buildSystem(channel) {
  const today    = new Date().toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  const slotList = buildSlotList(promptSettings.showTechNames);
  const { personaName, companyName, greeting, enabledJobTypes, collectContactDetails, customInstructions, customFullPrompt } = promptSettings;

  // ── Custom full prompt override ──
  if (customFullPrompt?.trim()) {
    return customFullPrompt
      .replace(/\{TODAY\}/g, today)
      .replace(/\{SLOTS\}/g, slotList)
      .replace(/\{PERSONA\}/g, personaName)
      .replace(/\{COMPANY\}/g, companyName)
      .replace(/\{CHANNEL\}/g, channel);
  }

  // ── Channel style ──
  const style = {
    web:   'conversational web chat — warm, friendly, short paragraphs',
    sms:   'SMS — brief, plain text, under 160 chars per reply when possible',
    email: `email — professional and friendly, greet by name once known, sign off as "${companyName} Team"`,
    voip:  'phone call — natural spoken language, no markdown, short sentences, no lists',
  }[channel] || 'conversational';

  // ── Job type instructions ──
  const jobTypes = enabledJobTypes?.length ? enabledJobTypes : ['HVAC', 'Electrical', 'Plumbing', 'General'];
  const hasQuote     = jobTypes.includes('Quote');
  const hasBreakdown = jobTypes.includes('Service/Breakdown');
  const standardTypes = jobTypes.filter(t => t !== 'Quote' && t !== 'Service/Breakdown');

  let jobTypeSection = '';

  if (standardTypes.length) {
    jobTypeSection += `
[STANDARD BOOKING — ${standardTypes.join(' / ')}]
1. Ask what type of service is needed
2. Collect service address — when you ask for address, include [NEEDS_ADDRESS] in your message
3. Ask: for HVAC or equipment jobs, "Are you able to identify the unit type and its location? (e.g. rooftop, ceiling cassette, split system, plant room)" — skip for simple plumbing/electrical
4. Suggest 2–3 available time slots (dates and times only, no technician names)
5. Confirm all booking details before finalising`;
  }

  if (hasQuote) {
    jobTypeSection += `

[QUOTE REQUEST]
1. Acknowledge warmly — a Quote means we'll need to come and assess first
2. Ask the customer to describe the work required in as much detail as possible
3. Ask: "Are you able to identify the unit type and its location?" (if equipment-related)
4. Collect service address — when you ask for address, include [NEEDS_ADDRESS] in your message
5. Do NOT offer a time slot — instead say: "Our team will review the details and call you back to arrange a convenient time to come out."
6. Confirm contact details, then output the QUOTE JSON below`;
  }

  if (hasBreakdown) {
    jobTypeSection += `

[SERVICE / BREAKDOWN — emergency reactive]
1. Acknowledge urgency with empathy: "I'm sorry to hear that, let's get someone out to you as soon as possible."
2. Ask: "Are you able to identify the unit type and its location? (e.g. rooftop unit, split system, switchboard)" 
3. Collect service address — include [NEEDS_ADDRESS] in the message where you ask
4. Offer the earliest 2–3 available time slots
5. Confirm all details and note urgency`;
  }

  // ── Contact collection ──
  const contactSection = collectContactDetails ? `
CONTACT COLLECTION (do this after confirming service details, before finalising):
1. "Can I confirm your mobile number? We may already have it on file." → collect/confirm mobile
2. "And your email address for the confirmation?" → collect email
3. Once confirmed say: "Perfect — a confirmation email and SMS will be sent, and you'll receive a reminder 1 hour before your appointment."
When you ask for contact details, include [NEEDS_CONTACT] in your message.` : '';

  // ── Tech routing (internal) ──
  const techRouting = `
INTERNAL TECH ROUTING — never share names with customer, use only for the BOOKING/QUOTE JSON:
- Jake Morrison → HVAC jobs
- Sam Peters → Electrical jobs  
- Brad Kim → Plumbing / Service/Breakdown jobs
- Amy Chen → HVAC & General jobs`;

  const extra = customInstructions?.trim() ? `\nADDITIONAL INSTRUCTIONS:\n${customInstructions.trim()}` : '';

  return `You are ${personaName}, a friendly ${companyName} service booking assistant. Channel: ${channel}. Style: ${style}.

Today: ${today}

Opening greeting (first message only): "${greeting}"

JOB TYPE FLOWS:
${jobTypeSection}
${contactSection}

AVAILABLE TIME SLOTS (next 2 weeks — times only, no names):
${slotList}
${techRouting}

OUTPUT FORMATS (output on its own line when confirmed, no surrounding text):

Standard booking:
BOOKING:{"tech":"NAME","customer":"NAME","type":"TYPE","address":"ADDR","mobile":"0400000000","email":"email@example.com","date":"YYYY-MM-DD","startHour":9,"duration":2,"amount":0,"status":"pending"}

Quote request:
BOOKING:{"tech":"TBD","customer":"NAME","type":"Quote","address":"ADDR","mobile":"0400000000","email":"email@example.com","date":"TBD","startHour":0,"duration":0,"amount":0,"status":"quote-pending","description":"DESCRIPTION OF WORK"}

ADDRESS VALIDATION: When repeating an address back, confirm it clearly. If it sounds like an apartment or commercial premises, ask for unit/level/access details.

Keep responses brief and action-oriented. Never mention technician names to the customer.${extra}`;
}

// ── API routes ─────────────────────────────────────────────────────
app.get('/api/schedule', (_req, res) => {
  res.json({ jobs, techs: TECHS, techSettings, bookingSettings });
});

app.get('/api/settings/techs', (_req, res) => {
  res.json(techSettings);
});

app.post('/api/settings/techs', (req, res) => {
  const { tech, availableForBooking } = req.body;
  if (techSettings[tech] !== undefined) {
    techSettings[tech] = { ...techSettings[tech], availableForBooking };
    console.log(`Tech "${tech}" self-booking: ${availableForBooking}`);
  }
  res.json({ ok: true, techSettings });
});

app.get('/api/settings/booking', (_req, res) => {
  res.json(bookingSettings);
});

app.get('/api/settings/prompt', (_req, res) => {
  res.json(promptSettings);
});

app.post('/api/settings/prompt', (req, res) => {
  const allowed = ['personaName','companyName','greeting','showTechNames','collectContactDetails','enabledJobTypes','customInstructions','customFullPrompt'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) promptSettings[key] = req.body[key];
  }
  console.log('Prompt settings updated');
  res.json({ ok: true, promptSettings });
});

// Expose a read-only preview of the compiled system prompt
app.get('/api/settings/prompt/preview', (req, res) => {
  const { channel = 'web' } = req.query;
  res.json({ prompt: buildSystem(channel) });
});

// Client-safe config (public keys only)
app.get('/api/config', (_req, res) => {
  res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null });
});

// Address validation via Google Geocoding (or basic format check if no key)
app.post('/api/validate-address', async (req, res) => {
  const { address } = req.body;
  if (!address?.trim()) return res.json({ ok: false, message: 'No address provided' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    // No API key — return basic confirmation so flow can continue
    return res.json({ ok: true, validated: false, formattedAddress: address.trim(), message: 'Validation unavailable — address accepted as entered' });
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=au&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const r = data.results[0];
      return res.json({
        ok: true,
        validated: true,
        formattedAddress: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
        placeId: r.place_id,
      });
    }
    return res.json({ ok: false, validated: false, message: 'Address not found — please double-check' });
  } catch (e) {
    console.error('Geocoding error:', e.message);
    return res.json({ ok: true, validated: false, formattedAddress: address.trim(), message: 'Validation unavailable' });
  }
});

app.post('/api/settings/booking', (req, res) => {
  const { bufferHours, workingDays, startHour, endHour } = req.body;
  if (bufferHours  !== undefined) bookingSettings.bufferHours  = Number(bufferHours);
  if (workingDays  !== undefined) bookingSettings.workingDays  = workingDays;
  if (startHour    !== undefined) bookingSettings.startHour    = Number(startHour);
  if (endHour      !== undefined) bookingSettings.endHour      = Number(endHour);
  console.log('Booking settings updated:', bookingSettings);
  res.json({ ok: true, bookingSettings });
});

app.post('/api/chat', async (req, res) => {
  const { messages, channel } = req.body;

  if (!anthropicClient) {
    const isFirst = messages.filter(m => m.role === 'user' && !m.hidden).length <= 1;
    const mock = isFirst
      ? "Hi there! 👋 Welcome to FieldInsight. Would you like to book a service job? I can arrange HVAC, Electrical, Plumbing, or General maintenance — just let me know what you need."
      : "Thanks for that! To confirm, I'll need your name, service address, and preferred time. Could you share those details?";
    return res.json({ text: mock, booking: null });
  }

  try {
    const resp = await anthropicClient.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 600,
      system: buildSystem(channel || 'web'),
      messages: messages.filter(m => !m.hidden).map(m => ({ role: m.role, content: m.content })),
    });

    const raw = resp.content[0].text;
    // Strip [NEEDS_ADDRESS] and [NEEDS_CONTACT] markers from displayed text
    const displayText = raw
      .replace(/BOOKING:\{[\s\S]*?\}/g, '')
      .replace(/\[NEEDS_ADDRESS\]/g, '')
      .replace(/\[NEEDS_CONTACT\]/g, '')
      .trim();

    const match = raw.match(/BOOKING:([\s\S]*?\})/);
    let booking = null;

    if (match) {
      try {
        booking = JSON.parse(match[1]);
        const meta = TYPE_META[booking.type] || TYPE_META.General;
        booking.id = `J-${++nextId}`;
        booking.color = meta.border;
        booking.textColor = meta.text;
        booking.bgColor = meta.color;
        jobs.push(booking);
      } catch (e) { console.error('Booking parse error', e); }
    }

    // Tell the client what smart inputs are needed
    const needsAddress = raw.includes('[NEEDS_ADDRESS]');
    const needsContact = raw.includes('[NEEDS_CONTACT]');

    res.json({ text: displayText, booking, needsAddress, needsContact });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── SMS send (Twilio if configured, simulated otherwise) ────────────
app.post('/api/send-sms', async (req, res) => {
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ ok: false, error: 'to and message are required' });

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_FROM_NUMBER;

  if (accountSid && authToken && fromNumber) {
    try {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({ To: to, From: fromNumber, Body: message });
      const resp = await fetch(twilioUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        },
        body,
      });
      const data = await resp.json();
      if (data.sid) {
        console.log(`SMS sent via Twilio to ${to} — SID: ${data.sid}`);
        return res.json({ ok: true, simulated: false, sid: data.sid });
      }
      return res.status(400).json({ ok: false, error: data.message || 'Twilio error' });
    } catch (e) {
      console.error('Twilio error:', e.message);
      return res.status(500).json({ ok: false, error: e.message });
    }
  }

  // Simulated — log and return success
  console.log(`[SMS SIMULATION]\nTo: ${to}\n---\n${message}\n---`);
  return res.json({ ok: true, simulated: true, to, message });
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
}

app.listen(PORT, () => console.log(`🚀 FieldInsight Two-Way Comms — port ${PORT}`));
