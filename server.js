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
  personaName:        'Fiona',
  companyName:        'FieldInsight',
  greeting:           'Hi! I\'m Fiona from FieldInsight. Would you like to book a service job today?',
  showTechNames:      false,    // when false, Fiona never mentions technician names to the customer
  customInstructions: '',       // extra instructions appended to the system prompt
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

function buildSystem(channel) {
  const slots = getAvailableSlots();
  const today = new Date().toLocaleDateString('en-AU', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  const { personaName, companyName, greeting, showTechNames, customInstructions } = promptSettings;

  const style = {
    web:   'conversational chat — warm, friendly, use short paragraphs',
    sms:   'SMS — concise messages, no markdown, under 160 chars each when possible',
    email: `email — professional friendly tone, greet by name once known, sign off as "${companyName} Team"`,
    voip:  'phone call — speak naturally as if on a live phone call, no markdown, keep responses short and clear',
  }[channel] || 'conversational';

  // Build slot list — hide or show tech names based on setting
  const slotList = slots.map((s, i) => {
    const timeLabel = new Date(s.date).toLocaleDateString('en-AU', { weekday:'short', day:'numeric', month:'short' });
    return showTechNames
      ? `  ${i+1}. ${s.label}`
      : `  ${i+1}. ${timeLabel} at ${s.startHour}:00–${s.startHour + 2}:00`;
  }).join('\n');

  // Internal tech routing (always present so Fiona picks the right tech for the BOOKING JSON)
  const techRouting = `
INTERNAL TECH ROUTING (do NOT share tech names with the customer — use this only to populate the BOOKING JSON):
- Jake Morrison — HVAC jobs
- Sam Peters — Electrical jobs
- Brad Kim — Plumbing jobs
- Amy Chen — HVAC & General jobs

Each available slot maps to a specific technician internally. When generating the BOOKING JSON, choose the correct technician for the job type.`;

  const extra = customInstructions?.trim()
    ? `\nADDITIONAL INSTRUCTIONS:\n${customInstructions.trim()}`
    : '';

  return `You are ${personaName}, a friendly ${companyName} service booking assistant. Channel: ${channel}. Style: ${style}.

Today: ${today}

Your opening greeting (use on first message): "${greeting}"

BOOKING FLOW:
1. Use the opening greeting above
2. Collect: customer name, job type (HVAC/Plumbing/Electrical/General), service address, preferred date/time
3. Suggest 2–3 available time slots from the list below — present dates and times only, never mention technician names
4. Confirm all details with the customer
5. When customer confirms, output EXACTLY this JSON on its own line (no surrounding text):
   BOOKING:{"tech":"NAME","customer":"NAME","type":"TYPE","address":"ADDR","date":"YYYY-MM-DD","startHour":9,"duration":2,"amount":0,"status":"pending"}

AVAILABLE TIME SLOTS (next 2 weeks):
${slotList || '  No slots currently available — apologise and suggest calling the office.'}
${techRouting}

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
  const allowed = ['personaName', 'companyName', 'greeting', 'showTechNames', 'customInstructions'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) promptSettings[key] = req.body[key];
  }
  console.log('Prompt settings updated:', promptSettings);
  res.json({ ok: true, promptSettings });
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
    const match = raw.match(/BOOKING:(\{[^}]+\})/s);
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

    res.json({ text: raw.replace(/BOOKING:\{[^}]+\}/s, '').trim(), booking });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  app.use((_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
}

app.listen(PORT, () => console.log(`🚀 FieldInsight Two-Way Comms — port ${PORT}`));
