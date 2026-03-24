import express from 'express';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import twilio from 'twilio';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // required for Twilio form-encoded webhooks

const BASE_URL = process.env.BASE_URL || 'https://fi-two-way-comms-5c8b7580a98c.herokuapp.com';

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

// ── Twilio client ───────────────────────────────────────────────────
const twilioClient = (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
if (twilioClient) console.log('✓ Twilio client initialised');
else console.log('⚠  No Twilio credentials — voice IVR will be simulated');

// ── In-memory voice sessions ────────────────────────────────────────
// Map<callSid, { from, history, turnCount, startedAt, status, booking, turns }>
const voiceSessions = new Map();

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
  lunchEnabled: true,           // block lunch period from self-booking
  lunchStart:   12,             // lunch break start (noon)
  lunchEnd:     13,             // lunch break end (1 PM)
  // Job duration
  defaultJobDuration: 1,        // default job length in hours (60 min)
  // VOIP / IVR settings
  voiceModel:       'Polly.Joanna',         // TTS voice (Amazon Polly via Twilio)
  voiceSpeechModel: 'numbers_and_commands', // STT model
  voiceEnhanced:    true,       // Twilio enhanced STT model (higher accuracy, extra cost)
  voiceMaxTurns:    20,         // maximum conversation turns before graceful exit
};

// AI persona & prompt settings
let promptSettings = {
  personaName:           'Fiona',
  companyName:           'FieldInsight',
  greeting:              "Hi! I'm Fiona from FieldInsight. How can I help you today? Please provide your name, address and details of your request. Thank you.",
  voiceGreeting:         "Sorry, all our humans are busy right now. Would you be up to booking your job in with me, Fiona?",
  showTechNames:         false,
  collectContactDetails: true,
  enabledJobTypes:       ['HVAC', 'Electrical', 'Plumbing', 'General', 'Quote', 'Service/Breakdown'],
  enabledUrgencyLevels:  ['Routine', 'Soon', 'Urgent', 'Emergency'],
  requiredFields:        ['date', 'time', 'address', 'name', 'business', 'description'],
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

// ── Conflict check ─────────────────────────────────────────────────
// Returns true if [newStart, newStart+newDur) overlaps any existing job
// for a given tech on a given date.
function hasConflict(tech, date, newStart, newDur) {
  return jobs.some(j =>
    j.tech === tech && j.date === date &&
    newStart < j.startHour + j.duration &&
    j.startHour < newStart + newDur
  );
}

// ── Load-balanced tech assignment ───────────────────────────────────
// Returns the active tech with the fewest total booked hours who is
// also free for the requested slot. Falls back to first active tech.
function assignTech(date, startHour, duration) {
  const dur = duration || bookingSettings.defaultJobDuration || 1;
  const activeTechs = TECHS.filter(t => techSettings[t]?.availableForBooking !== false);

  // Sort by total booked hours ascending (load balance)
  const sorted = [...activeTechs].sort((a, b) => {
    const hrs = t => jobs.filter(j => j.tech === t).reduce((s, j) => s + (j.duration || 1), 0);
    return hrs(a) - hrs(b);
  });

  // Pick first free tech for this specific slot
  const free = sorted.find(t => !hasConflict(t, date, startHour, dur));
  return free || sorted[0] || TECHS[0];
}

// ── Available slots for AI / client view ───────────────────────────
function getAvailableSlots() {
  const activeTechs = TECHS.filter(t => techSettings[t]?.availableForBooking !== false);
  const bufferMs    = bookingSettings.bufferHours * 3600 * 1000;
  const dur         = bookingSettings.defaultJobDuration || 1;
  const { startHour, endHour, lunchEnabled, lunchStart, lunchEnd, workingDays } = bookingSettings;
  const slots = [];

  for (let day = 1; day <= 14; day++) {
    const date  = dateStr(day);
    const dObj  = new Date(date);
    if (!workingDays.includes(dObj.getDay())) continue;

    // Sort techs by load so the AI naturally offers the least-busy technician
    const sorted = [...activeTechs].sort((a, b) => {
      const hrs = t => jobs.filter(j => j.tech === t).reduce((s, j) => s + (j.duration || 1), 0);
      return hrs(a) - hrs(b);
    });

    for (const tech of sorted) {
      for (let hour = startHour; hour + dur <= endHour; hour++) {
        // Buffer check: slot must start at least bufferHours from now
        const slotTime = new Date(date);
        slotTime.setHours(hour, 0, 0, 0);
        if (slotTime.getTime() - Date.now() < bufferMs) continue;

        // Lunch overlap: skip if any hour in [hour, hour+dur) touches lunch
        if (lunchEnabled) {
          const touchesLunch = Array.from({ length: dur }, (_, i) => hour + i)
            .some(h => h >= lunchStart && h < lunchEnd);
          if (touchesLunch) continue;
        }

        // Full conflict check for the entire job duration
        if (!hasConflict(tech, date, hour, dur)) {
          const label = dObj.toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
          const endH  = hour + dur;
          slots.push({ tech, date, startHour: hour, label: `${tech} — ${label} at ${hour}:00–${endH}:00` });
          break; // one slot per tech per day
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
  const { personaName, companyName, greeting, enabledJobTypes, collectContactDetails, requiredFields, customInstructions, customFullPrompt } = promptSettings;

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
    voip:  `phone call — natural spoken language, no markdown, short sentences, no lists.
VOICE-SPECIFIC FLOW: The opening greeting asks if the caller is happy to book with you. If they say YES, sure, okay, go ahead, or any affirmative — respond with exactly: "Wonderful! Please just go ahead and give me all the details you have in one go — describe the problem, your name, address, contact email and phone number, and I'll get that sorted for you." Then wait for them to provide everything. If they say NO or want a human, respond with: "No worries at all — I'll let the team know you called and someone will call you back shortly. Thanks for calling FieldInsight, goodbye!" and end the call.
VOICE — MISHEARING RULE: If you did not clearly hear a number (phone, mobile) or email address, respond only with a short natural retry like "Sorry, could you say that again?" or "I didn't quite catch that one." Never explain what a phone number or email address looks like. Never describe expected formats or digit counts. Just ask them to repeat it.`,
  }[channel] || 'conversational';

  // ── Job type instructions ──
  const jobTypes = enabledJobTypes?.length ? enabledJobTypes : ['HVAC', 'Electrical', 'Plumbing', 'General'];
  const hasQuote     = jobTypes.includes('Quote');
  const hasBreakdown = jobTypes.includes('Service/Breakdown');
  const standardTypes = jobTypes.filter(t => t !== 'Quote' && t !== 'Service/Breakdown');

  let jobTypeSection = '';

  // ── Routing decision rule (always shown) ──
  jobTypeSection += `
BOOKING TYPE DECISION — follow this every time:
- Customer describes a fault, problem, not working, breakdown, or repair → book a SERVICE CALL (not a quote)
- Customer asks for urgent help or "someone out today" → book a SERVICE CALL with urgency noted
- Customer explicitly asks for a quote, OR describes new installation / major new works → only then use QUOTE flow
- Default to SERVICE CALL. Never suggest or offer a quote unless the customer explicitly requests one.
`;

  if (standardTypes.length) {
    jobTypeSection += `
[SERVICE CALL — ${standardTypes.join(' / ')}]
1. Identify the type of service needed (HVAC, Electrical, Plumbing, or General)
2. LAYER 1 — once you understand broadly what they need, say warmly in one message:
   "Thanks for that! To get you booked in, could you please let me know:
   • Your full name
   • Your service address [NEEDS_ADDRESS]
   • Your best contact number and email address
   ...and I'll find you some available times."
3. LAYER 2 — after receiving those, ask in one message:
   "Perfect, thank you! Could you give me a full description of the issue or work needed?"
   For HVAC or equipment also ask: "Are you able to identify the unit type and its location? (e.g. split system, ducted, rooftop, ceiling cassette)"
4. LAYER 3 — confirm all details back in a warm summary, then suggest 2–3 available time slots (dates and times only, no technician names)
5. Once they select a slot, finalise the booking`;
  }

  if (hasBreakdown) {
    jobTypeSection += `

[SERVICE / BREAKDOWN — urgent reactive]
1. Acknowledge urgency warmly: "I'm sorry to hear that — let's get someone out to you as quickly as possible."
2. LAYER 1 — ask together in one message:
   "To get a technician to you quickly, could you please let me know:
   • Your full name
   • Your service address [NEEDS_ADDRESS]
   • Your best contact number and email address"
3. LAYER 2 — ask together:
   "Thanks! What's happening exactly? And are you able to identify the unit type and its location? (e.g. rooftop unit, split system, switchboard, Level 2 plant room)"
4. LAYER 3 — confirm all details back warmly, offer the earliest 2–3 available slots, note urgency`;
  }

  if (hasQuote) {
    jobTypeSection += `

[QUOTE — only when customer explicitly asks for a quote or describes new installation / major new works]
1. Acknowledge warmly: "Absolutely — for that scope of work we'd need to come out and assess first, no problem at all."
2. LAYER 1 — ask together in one message:
   "To get this started, could you please let me know:
   • Your full name
   • Your service address [NEEDS_ADDRESS]
   • Your best contact number and email address"
3. LAYER 2 — ask: "Thanks! Could you describe the work required in as much detail as possible?" and if equipment-related: "Are you able to identify the unit type and its location?"
4. LAYER 3 — confirm all details back warmly
5. Do NOT offer a time slot — say: "Our team will review the details and give you a call back to arrange a convenient time to come out."
6. Output the QUOTE JSON below`;
  }

  // ── Contact collection ──
  const contactSection = collectContactDetails ? `
CONTACT COLLECTION (do this after confirming service details, before finalising):
1. "Can I confirm your mobile number? We may already have it on file." → collect/confirm mobile
2. "And your email address for the confirmation?" → collect email
3. Once confirmed say: "Perfect — a confirmation email and SMS will be sent, and you'll receive a reminder 1 hour before your appointment."
When you ask for contact details, include [NEEDS_CONTACT] in your message.

IMPORTANT — if you did not clearly hear a phone number or email, simply say "Sorry, could you repeat that?" or "I didn't quite catch that — could you say it again?". Do NOT explain what a phone number looks like, do NOT describe the expected format, do NOT say things like "a mobile number is usually 10 digits". Just ask them to repeat it, warmly and briefly.` : '';

  // ── Required data fields ──
  const FIELD_META = {
    date:        { label: 'Preferred Date',  prompt: 'Ask if they have a preferred date or date range.' },
    time:        { label: 'Preferred Time',  prompt: 'Ask if they prefer morning or afternoon.' },
    address:     { label: 'Service Address', prompt: 'Collect full service address (handled via [NEEDS_ADDRESS]).' },
    name:        { label: 'Customer Name',   prompt: 'Ask for the customer\'s full name early in the conversation.' },
    business:    { label: 'Business Name',   prompt: 'Ask whether the booking is for a business and collect the business name if so.' },
    description: { label: 'Job Description', prompt: 'Ask the customer to describe the issue or work needed.' },
    urgency:     { label: 'Urgency',         prompt: 'Ask how urgent the request is — routine, soon, or emergency.' },
  };
  const fields = (requiredFields?.length ? requiredFields : []).filter(f => FIELD_META[f]);
  const dataSection = fields.length
    ? `\nDATA TO COLLECT during this conversation:\n${fields.map(f => `- ${FIELD_META[f].label}: ${FIELD_META[f].prompt}`).join('\n')}`
    : '';

  // ── Tech routing (internal) ──
  const techRouting = `
INTERNAL TECH ROUTING — never share names with customer, use only for the BOOKING/QUOTE JSON:
- Jake Morrison → HVAC jobs
- Sam Peters → Electrical jobs  
- Brad Kim → Plumbing / Service/Breakdown jobs
- Amy Chen → HVAC & General jobs`;

  const extra = customInstructions?.trim() ? `\nADDITIONAL INSTRUCTIONS:\n${customInstructions.trim()}` : '';

  return `You are ${personaName}, a warm and helpful ${companyName} service booking assistant. ${companyName} is also referred to as "FI" — if a customer uses that abbreviation, understand it refers to ${companyName}. Channel: ${channel}. Style: ${style}.

Today: ${today}

Opening greeting (first message only): "${greeting}"

JOB TYPE FLOWS:
${jobTypeSection}
${contactSection}
${dataSection}

AVAILABLE TIME SLOTS (next 2 weeks — times only, no names):
${slotList}
${techRouting}

Default job duration: ${bookingSettings.defaultJobDuration || 1} hour(s) — use this value for the "duration" field in the BOOKING JSON below.

OUTPUT FORMATS (output on its own line when confirmed, no surrounding text):

Standard booking:
BOOKING:{"tech":"NAME","customer":"NAME","type":"TYPE","address":"ADDR","mobile":"0400000000","email":"email@example.com","date":"YYYY-MM-DD","startHour":9,"duration":${bookingSettings.defaultJobDuration || 1},"amount":0,"status":"pending"}

Quote request:
BOOKING:{"tech":"TBD","customer":"NAME","type":"Quote","address":"ADDR","mobile":"0400000000","email":"email@example.com","date":"TBD","startHour":0,"duration":0,"amount":0,"status":"quote-pending","description":"DESCRIPTION OF WORK"}

ADDRESS VALIDATION: When the customer gives you an address, say "Just confirming that address for you..." and include the marker [VALIDATE_ADDRESS:<the address they gave>] on its own line — Google will validate it and return the formatted version. Then confirm: "I have you at [formatted address] — is that right?" If it sounds like an apartment or commercial premises, also ask for unit/level/access details.

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
  const allowed = ['personaName','companyName','greeting','voiceGreeting','showTechNames','collectContactDetails','enabledJobTypes','requiredFields','customInstructions','customFullPrompt'];
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
  res.json({
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
    voiceNumber:      process.env.TWILIO_FROM_NUMBER || null,
    voiceEnabled:     !!twilioClient,
    voiceOptions:     VOICE_OPTIONS,
    currentVoice:     bookingSettings.voiceModel || 'Polly.Joanna',
  });
});

// Address validation via Google Geocoding (or basic format check if no key)
// ── Internal address validation helper (reused by chat + voice) ────
async function validateAddressInternal(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return { validated: false, formatted: address.trim() };
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=au&key=${apiKey}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.status === 'OK' && data.results?.length) {
      return { validated: true, formatted: data.results[0].formatted_address };
    }
    return { validated: false, formatted: address.trim() };
  } catch {
    return { validated: false, formatted: address.trim() };
  }
}

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
  const { bufferHours, workingDays, startHour, endHour,
          lunchEnabled, lunchStart, lunchEnd,
          defaultJobDuration,
          voiceSpeechModel, voiceEnhanced, voiceMaxTurns } = req.body;
  if (bufferHours        !== undefined) bookingSettings.bufferHours        = Number(bufferHours);
  if (workingDays        !== undefined) bookingSettings.workingDays        = workingDays;
  if (startHour          !== undefined) bookingSettings.startHour          = Number(startHour);
  if (endHour            !== undefined) bookingSettings.endHour            = Number(endHour);
  if (lunchEnabled       !== undefined) bookingSettings.lunchEnabled       = Boolean(lunchEnabled);
  if (lunchStart         !== undefined) bookingSettings.lunchStart         = Number(lunchStart);
  if (lunchEnd           !== undefined) bookingSettings.lunchEnd           = Number(lunchEnd);
  if (defaultJobDuration !== undefined) bookingSettings.defaultJobDuration = Number(defaultJobDuration);
  if (req.body.voiceModel !== undefined) bookingSettings.voiceModel        = req.body.voiceModel;
  if (voiceSpeechModel   !== undefined) bookingSettings.voiceSpeechModel   = voiceSpeechModel;
  if (voiceEnhanced      !== undefined) bookingSettings.voiceEnhanced      = Boolean(voiceEnhanced);
  if (voiceMaxTurns      !== undefined) bookingSettings.voiceMaxTurns      = Number(voiceMaxTurns);
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

    // ── Address validation: handle [VALIDATE_ADDRESS:<addr>] inline ──
    let addressValidation = null;
    let processedRaw = raw;
    const addrMatch = raw.match(/\[VALIDATE_ADDRESS:([^\]]+)\]/);
    if (addrMatch) {
      const addrInput = addrMatch[1].trim();
      addressValidation = await validateAddressInternal(addrInput);
      // Replace marker in displayed text with a confirmed/formatted result token
      const token = addressValidation.validated
        ? `✓ *${addressValidation.formatted}*`
        : addrInput;
      processedRaw = processedRaw.replace(addrMatch[0], token);
      console.log(`📍 Address validated: "${addrInput}" → "${addressValidation.formatted}" (${addressValidation.validated ? 'OK' : 'fallback'})`);
    }

    // Strip other markers from displayed text
    const displayText = processedRaw
      .replace(/BOOKING:\{[\s\S]*?\}/g, '')
      .replace(/\[NEEDS_ADDRESS\]/g, '')
      .replace(/\[NEEDS_CONTACT\]/g, '')
      .trim();

    const match = raw.match(/BOOKING:([\s\S]*?\})/);
    let booking = null;

    if (match) {
      try {
        booking = JSON.parse(match[1]);
        // If we just validated an address and booking.address is unset/generic, use it
        if (addressValidation?.formatted && (!booking.address || booking.address === 'ADDR')) {
          booking.address = addressValidation.formatted;
        }
        const meta = TYPE_META[booking.type] || TYPE_META.General;
        booking.id = `J-${++nextId}`;
        booking.color = meta.border;
        booking.textColor = meta.text;
        booking.bgColor = meta.color;

        // Always use server-side load-balanced assignment (ignore Claude's suggestion)
        const dur = bookingSettings.defaultJobDuration || 1;
        booking.duration = dur;
        booking.tech = assignTech(booking.date, booking.startHour, dur);

        jobs.push(booking);
        console.log(`✅ Chat booking: ${booking.id} — ${booking.customer} → tech: ${booking.tech} dur: ${dur}h`);
      } catch (e) { console.error('Booking parse error', e); }
    }

    // Tell the client what smart inputs are needed
    const needsAddress = raw.includes('[NEEDS_ADDRESS]');
    const needsContact = raw.includes('[NEEDS_CONTACT]');

    res.json({ text: displayText, booking, needsAddress, needsContact, addressValidation });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Voice IVR helpers ───────────────────────────────────────────────

function xmlEsc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Strip everything that shouldn't be spoken aloud
function forVoice(text) {
  return text
    .replace(/BOOKING:\{[\s\S]*?\}/g, '')
    .replace(/\[NEEDS_ADDRESS\]/g, '')
    .replace(/\[NEEDS_CONTACT\]/g, '')
    .replace(/[*_`#>]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\n{2,}/g, ' ')
    .trim();
}

// ── Available TTS voices (Amazon Polly via Twilio) ─────────────────
// Only voices confirmed active in Twilio/Amazon Polly as of 2025.
// Polly.Nicole and Polly.Russell were retired by Amazon in Aug 2023.
// Neural voices (-Neural) require Twilio Neural TTS tier.
const VOICE_OPTIONS = {
  'Polly.Joanna':        { lang: 'en-US', label: '🇺🇸 Joanna — US Female (Standard) ★ default' },
  'Polly.Matthew':       { lang: 'en-US', label: '🇺🇸 Matthew — US Male (Standard)' },
  'Polly.Joanna-Neural': { lang: 'en-US', label: '🇺🇸 Joanna — US Female (Neural)' },
  'Polly.Matthew-Neural':{ lang: 'en-US', label: '🇺🇸 Matthew — US Male (Neural)' },
  'Polly.Amy':           { lang: 'en-GB', label: '🇬🇧 Amy — British Female (Standard)' },
  'Polly.Brian':         { lang: 'en-GB', label: '🇬🇧 Brian — British Male (Standard)' },
  'Polly.Emma':          { lang: 'en-GB', label: '🇬🇧 Emma — British Female (Standard)' },
  'Polly.Amy-Neural':    { lang: 'en-GB', label: '🇬🇧 Amy — British Female (Neural)' },
  'Polly.Brian-Neural':  { lang: 'en-GB', label: '🇬🇧 Brian — British Male (Neural)' },
};

function getVoiceMeta() {
  const key = bookingSettings.voiceModel || 'Polly.Joanna';
  return { voice: key, lang: VOICE_OPTIONS[key]?.lang || 'en-US' };
}

// Hints that help STT recognise Australian phone numbers and common field-service terms
const VOICE_HINTS = [
  // digits spoken individually
  'zero,one,two,three,four,five,six,seven,eight,nine',
  // AU mobile prefixes
  'oh four,zero four,04,041,042,043,044,045,046,047,048,049',
  // common words
  'HVAC,air conditioning,electrical,plumbing,booking,appointment,urgent,emergency,quote,service,breakdown',
  // address terms
  'street,road,avenue,drive,place,court,unit,level,floor',
].join(',');

function buildTwiML(spokenText, actionUrl, end = false) {
  const safe     = xmlEsc(spokenText);
  const model    = bookingSettings.voiceSpeechModel || 'numbers_and_commands';
  const enhanced = bookingSettings.voiceEnhanced ? 'true' : 'false';
  const { voice, lang } = getVoiceMeta();

  if (end) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}" language="${lang}">${safe}</Say>
  <Hangup/>
</Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionUrl}" method="POST"
          speechTimeout="auto" speechModel="${model}" enhanced="${enhanced}"
          language="en-AU" hints="${VOICE_HINTS}">
    <Say voice="${voice}" language="${lang}">${safe}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">Sorry, I didn't catch that. Let me try again.</Say>
  <Redirect method="POST">${actionUrl}</Redirect>
</Response>`;
}

async function claudeVoiceTurn(history) {
  if (!anthropicClient) {
    const isFirst = history.filter(m => m.role === 'user').length <= 1;
    return isFirst
      ? `${promptSettings.greeting} Would you like to book a job with us today?`
      : "Thanks for that. Could you tell me a bit more about what you need?";
  }
  const resp = await anthropicClient.messages.create({
    model:      'claude-haiku-4-5',
    max_tokens: 400,
    system:     buildSystem('voip'),
    messages:   history,
  });
  return resp.content[0].text;
}

// ── /api/voice/incoming — inbound call webhook ──────────────────────
app.post('/api/voice/incoming', (req, res) => {
  const { CallSid, From, To } = req.body;
  console.log(`📞 Inbound call  CallSid=${CallSid}  From=${From}`);

  voiceSessions.set(CallSid, {
    from:       From || 'unknown',
    to:         To   || process.env.TWILIO_FROM_NUMBER,
    history:    [],
    turns:      [],
    turnCount:  0,
    startedAt:  new Date().toISOString(),
    status:     'active',
    booking:    null,
  });

  const greeting         = xmlEsc(promptSettings.voiceGreeting || "Sorry, all our humans are busy right now. Would you be up to booking your job in with me, Fiona?");
  const actionUrl        = `${BASE_URL}/api/voice/process`;
  const model            = bookingSettings.voiceSpeechModel || 'numbers_and_commands';
  const enhanced         = bookingSettings.voiceEnhanced ? 'true' : 'false';
  const { voice, lang }  = getVoiceMeta();

  res.set('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${actionUrl}" method="POST"
          speechTimeout="auto" speechModel="${model}" enhanced="${enhanced}"
          language="en-AU" hints="${VOICE_HINTS}">
    <Say voice="${voice}" language="${lang}">${greeting}</Say>
  </Gather>
  <Say voice="${voice}" language="${lang}">I didn't catch that. Let me try again.</Say>
  <Redirect method="POST">${actionUrl}</Redirect>
</Response>`);
});

// ── /api/voice/process — each speech turn ──────────────────────────
app.post('/api/voice/process', async (req, res) => {
  const { CallSid, SpeechResult, Confidence } = req.body;
  const actionUrl = `${BASE_URL}/api/voice/process`;

  const session = voiceSessions.get(CallSid);
  if (!session) {
    // Unknown session — create one and redirect to start
    res.set('Content-Type', 'text/xml');
    return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response><Redirect method="POST">${BASE_URL}/api/voice/incoming</Redirect></Response>`);
  }

  // No speech detected — re-ask
  if (!SpeechResult) {
    res.set('Content-Type', 'text/xml');
    return res.send(buildTwiML("I didn't catch that. Could you repeat what you said?", actionUrl));
  }

  // Low confidence — ask to repeat
  if (parseFloat(Confidence || '1') < 0.35) {
    res.set('Content-Type', 'text/xml');
    return res.send(buildTwiML("Sorry, I had trouble hearing that. Could you say it again?", actionUrl));
  }

  // Max turns guard (configurable via bookingSettings.voiceMaxTurns)
  const maxTurns = bookingSettings.voiceMaxTurns || 20;
  if (session.turnCount >= maxTurns) {
    session.status = 'ended';
    res.set('Content-Type', 'text/xml');
    return res.send(buildTwiML(
      "I'm sorry, we've reached the maximum number of turns for this call. Please call back or use our website to complete your booking. Thank you!",
      actionUrl, true
    ));
  }

  console.log(`🗣  CallSid=${CallSid}  Turn=${session.turnCount + 1}  Speech="${SpeechResult}"`);

  // Add user turn to history
  session.history.push({ role: 'user', content: SpeechResult });
  session.turns.push({ role: 'user', content: SpeechResult, ts: new Date().toISOString() });
  session.turnCount++;

  try {
    const raw = await claudeVoiceTurn(session.history);

    // ── Address validation in voice turn ────────────────────────────
    let processedRaw = raw;
    const voiceAddrMatch = raw.match(/\[VALIDATE_ADDRESS:([^\]]+)\]/);
    if (voiceAddrMatch) {
      const addrInput = voiceAddrMatch[1].trim();
      const result    = await validateAddressInternal(addrInput);
      // For voice: replace marker with natural spoken address
      processedRaw = processedRaw.replace(voiceAddrMatch[0], result.formatted);
      console.log(`📍 Voice address validated: "${addrInput}" → "${result.formatted}"`);
    }

    // Detect booking
    const match = processedRaw.match(/BOOKING:([\s\S]*?\})/);
    let booking = null;
    if (match) {
      try {
        booking = JSON.parse(match[1]);
        const meta = TYPE_META[booking.type] || TYPE_META.General;
        booking.id        = `J-${++nextId}`;
        booking.color     = meta.border;
        booking.textColor = meta.text;
        booking.bgColor   = meta.color;

        // Always use server-side load-balanced assignment
        const dur = bookingSettings.defaultJobDuration || 1;
        booking.duration = dur;
        booking.tech = assignTech(booking.date, booking.startHour, dur);

        jobs.push(booking);
        session.booking = booking;
        console.log(`✅ Voice booking: ${booking.id} — ${booking.customer} → tech: ${booking.tech} dur: ${dur}h`);

        // Send SMS confirmation to the caller
        if (twilioClient && session.from && session.from !== 'unknown') {
          const fmtHr = h => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
          const dateFmt = booking.date !== 'TBD'
            ? new Date(booking.date).toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long' })
            : 'TBD';
          const timeFmt = booking.startHour ? `${fmtHr(booking.startHour)}–${fmtHr(booking.startHour + (booking.duration||1))}` : 'TBD';
          const smsBody = [
            `Hi ${booking.customer || 'there'} — your FieldInsight booking is confirmed! ✓`,
            ``,
            `📋 ${booking.type || 'Service Call'}`,
            `📅 ${dateFmt} at ${timeFmt}`,
            `📍 ${booking.address || 'Address on file'}`,
            ``,
            `We'll send a reminder before your appointment.`,
            `Questions? Reply to this SMS or call us.`,
            `— FieldInsight Team`,
          ].join('\n');
          twilioClient.messages.create({
            to:   session.from,
            from: process.env.TWILIO_FROM_NUMBER,
            body: smsBody,
          }).then(() => console.log(`📱 Confirmation SMS sent to ${session.from}`))
            .catch(e  => console.error(`SMS error: ${e.message}`));
        }

      } catch (e) { console.error('Voice booking parse error', e); }
    }

    const spoken = forVoice(processedRaw);

    // Add AI turn to history (use processedRaw so validated address is in context)
    session.history.push({ role: 'assistant', content: processedRaw });
    session.turns.push({ role: 'assistant', content: spoken, ts: new Date().toISOString() });

    const isBookingDone = !!booking;
    if (isBookingDone) session.status = 'ended';

    res.set('Content-Type', 'text/xml');
    res.send(buildTwiML(spoken, actionUrl, isBookingDone));
  } catch (err) {
    console.error('Voice Claude error:', err.message);
    res.set('Content-Type', 'text/xml');
    res.send(buildTwiML("I'm having a technical issue. Please try again in a moment.", actionUrl));
  }
});

// ── /api/voice/status — Twilio call status callback ─────────────────
app.post('/api/voice/status', (req, res) => {
  const { CallSid, CallStatus } = req.body;
  const session = voiceSessions.get(CallSid);
  if (session) {
    session.status = ['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)
      ? 'ended' : CallStatus;
    console.log(`📴 CallSid=${CallSid}  Status=${CallStatus}`);
    // Keep session in map for 5 minutes so frontend can poll the result
    setTimeout(() => voiceSessions.delete(CallSid), 5 * 60 * 1000);
  }
  res.sendStatus(204);
});

// ── /api/voice/sessions — frontend polls this for live transcripts ──
app.get('/api/voice/sessions', (_req, res) => {
  const list = Array.from(voiceSessions.values()).map(s => ({
    from:      s.from,
    status:    s.status,
    turnCount: s.turnCount,
    startedAt: s.startedAt,
    turns:     s.turns,
    booking:   s.booking,
  }));
  res.json({ sessions: list });
});

// ── /api/voice/configure — auto-set webhook on the Twilio number ────
app.post('/api/voice/configure', async (_req, res) => {
  if (!twilioClient) return res.json({ ok: false, error: 'Twilio not configured' });
  const fromNumber = process.env.TWILIO_FROM_NUMBER;
  if (!fromNumber) return res.json({ ok: false, error: 'TWILIO_FROM_NUMBER not set' });

  try {
    const numbers = await twilioClient.incomingPhoneNumbers.list({ phoneNumber: fromNumber });
    if (!numbers.length) return res.json({ ok: false, error: `Number ${fromNumber} not found in this Twilio account` });

    const pn = numbers[0];
    await twilioClient.incomingPhoneNumbers(pn.sid).update({
      voiceUrl:              `${BASE_URL}/api/voice/incoming`,
      voiceMethod:           'POST',
      statusCallback:        `${BASE_URL}/api/voice/status`,
      statusCallbackMethod:  'POST',
    });

    console.log(`✓ Voice webhook configured: ${fromNumber} → ${BASE_URL}/api/voice/incoming`);
    res.json({ ok: true, number: fromNumber, webhookUrl: `${BASE_URL}/api/voice/incoming` });
  } catch (e) {
    console.error('Voice configure error:', e.message);
    res.json({ ok: false, error: e.message });
  }
});

// ── Form booking: available slots (grouped by date) ────────────────
app.get('/api/form/slots', (_req, res) => {
  const raw = getAvailableSlots();
  // Group into { date: [startHour, ...] }, deduped, sorted
  const grouped = {};
  raw.forEach(s => {
    if (!grouped[s.date]) grouped[s.date] = new Set();
    grouped[s.date].add(s.startHour);
  });
  const result = Object.entries(grouped)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([date, hourSet]) => ({
      date,
      label: new Date(date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' }),
      hours: [...hourSet].sort((a,b) => a-b),
    }));
  res.json({ slots: result });
});

// ── Form booking: direct booking creation ───────────────────────────
app.post('/api/form/book', (req, res) => {
  const { name, business, mobile, email, jobType, description, address, date, startHour, urgency } = req.body;
  if (!name || !mobile || !jobType || !address) {
    return res.status(400).json({ ok: false, error: 'Missing required fields: name, mobile, jobType, address' });
  }

  const dur     = bookingSettings.defaultJobDuration || 1;
  const isQuote = jobType === 'Quote';
  const sh      = startHour != null ? Number(startHour) : 0;

  // Load-balanced tech assignment with full conflict check
  const tech = (date && !isQuote)
    ? assignTech(date, sh, dur)
    : 'TBD';

  const meta = TYPE_META[jobType] || TYPE_META.General;
  const job = {
    id:        `J-${++nextId}`,
    tech,
    customer:  business ? `${name} (${business})` : name,
    type:      jobType,
    address,
    date:      date || 'TBD',
    startHour: sh,
    duration:  dur,
    amount:    0,
    mobile,
    email:     email || '',
    status:    isQuote ? 'quote-pending' : 'confirmed',
    description: description || '',
    urgency:   urgency || 'routine',
    color:     meta.border,
    textColor: meta.text,
    bgColor:   meta.color,
    sourceChannel: 'form',
  };
  jobs.push(job);
  console.log(`📋 Form booking: ${job.id} — ${job.customer} → tech: ${tech} dur: ${dur}h`);
  res.json({ ok: true, booking: job });
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
