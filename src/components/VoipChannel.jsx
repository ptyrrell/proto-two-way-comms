import { useState, useEffect, useRef, useCallback } from 'react';

/* ── helpers ─────────────────────────────────────────────────────── */
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function CallTimer({ startedAt }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - new Date(startedAt)) / 1000)), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  return <span className="call-timer">{m}:{s}</span>;
}

function Waveform({ active }) {
  return (
    <div className={`waveform${active ? ' active' : ''}`}>
      {Array.from({ length: 7 }, (_, i) => (
        <span key={i} className="waveform-bar" style={{ animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

/* ── strip markdown for TTS ──────────────────────────────────────── */
function forTTS(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/#{1,6}\s/g, '')
    .replace(/•/g, '')
    .replace(/\[BOOKING\][\s\S]*$/i, '')
    .replace(/\[NEEDS_ADDRESS\]/gi, '')
    .replace(/\[NEEDS_CONTACT\]/gi, '')
    .replace(/\[VALIDATE_ADDRESS:[^\]]*\]/gi, '')
    .trim();
}

/* ════════════════════════════════════════════════════════════════════
   BROWSER VOICE TEST — uses browser mic + speech synthesis
   Routes through /api/chat with channel:'voip' — same AI logic
   ════════════════════════════════════════════════════════════════════ */
function BrowserVoiceTest() {
  const [phase, setPhase]       = useState('idle');   // idle | greeting | listening | thinking | speaking | ended
  const [turns, setTurns]       = useState([]);
  const [history, setHistory]   = useState([]);
  const [interim, setInterim]   = useState('');
  const [booking, setBooking]   = useState(null);
  const [error, setError]       = useState('');
  const [voices, setVoices]     = useState([]);
  const [selectedVoice, setSelectedVoice] = useState('');

  const recognRef   = useRef(null);
  const synthRef    = useRef(window.speechSynthesis);
  const bottomRef   = useRef(null);
  const phaseRef    = useRef(phase);
  phaseRef.current  = phase;

  /* load browser TTS voices */
  useEffect(() => {
    const load = () => {
      const vs = synthRef.current.getVoices();
      setVoices(vs);
      // prefer en-AU, then en-GB, then en-US
      const preferred = vs.find(v => v.lang === 'en-AU')
        || vs.find(v => v.lang === 'en-GB')
        || vs.find(v => v.lang.startsWith('en'));
      if (preferred) setSelectedVoice(preferred.name);
    };
    load();
    synthRef.current.addEventListener('voiceschanged', load);
    return () => synthRef.current.removeEventListener('voiceschanged', load);
  }, []);

  /* auto-scroll */
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, interim]);

  /* speak text using selected browser voice */
  const speak = useCallback((text, onDone) => {
    synthRef.current.cancel();
    const utt = new SpeechSynthesisUtterance(forTTS(text));
    const voice = voices.find(v => v.name === selectedVoice);
    if (voice) utt.voice = voice;
    utt.rate = 0.95;
    utt.onend  = () => onDone?.();
    utt.onerror = () => onDone?.();
    synthRef.current.speak(utt);
  }, [voices, selectedVoice]);

  /* add a turn to the transcript */
  const addTurn = (role, content) => {
    const ts = new Date().toISOString();
    setTurns(prev => [...prev, { role, content, ts }]);
    setHistory(prev => [...prev, { role, content }]);
  };

  /* send user speech to /api/chat and speak the reply */
  const sendToFiona = useCallback(async (userText, currentMessages) => {
    // currentMessages already includes the user turn (added by onresult)
    setPhase('thinking');
    const newMessages = currentMessages;
    setHistory(newMessages);

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, channel: 'voip' }),
      });
      const data = await r.json();
      const reply = data.text || "Sorry, I didn't catch that.";

      if (data.booking) setBooking(data.booking);

      addTurn('assistant', reply);

      setPhase('speaking');
      speak(reply, () => {
        if (phaseRef.current !== 'ended') startListening();
      });
    } catch (e) {
      setError('Connection error — check app is running');
      setPhase('idle');
    }
  }, [speak]);

  /* start browser speech recognition */
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setError('Browser speech recognition not supported. Try Chrome.'); return; }

    synthRef.current.cancel(); // stop any speech first
    setInterim('');
    setPhase('listening');

    const recog = new SR();
    recognRef.current = recog;
    recog.lang = 'en-AU';
    recog.interimResults = true;
    recog.maxAlternatives = 1;

    recog.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (const res of e.results) {
        if (res.isFinal) finalText += res[0].transcript;
        else interimText += res[0].transcript;
      }
      setInterim(interimText);
      if (finalText) {
        setInterim('');
        recog.stop();
        const ts = new Date().toISOString();
        setTurns(prev => [...prev, { role: 'user', content: finalText, ts }]);
        // Use functional update to get latest history, then call sendToFiona
        setHistory(prev => {
          const updated = [...prev, { role: 'user', content: finalText }];
          sendToFiona(finalText, updated);
          return updated;
        });
      }
    };

    recog.onerror = (e) => {
      if (e.error === 'no-speech') {
        setPhase('listening');
        recog.start(); // retry
      } else {
        setError(`Mic error: ${e.error}`);
        setPhase('idle');
      }
    };

    recog.onend = () => {
      if (phaseRef.current === 'listening') {
        // no speech detected — retry
        try { recog.start(); } catch (_) {}
      }
    };

    recog.start();
  }, [sendToFiona]);

  /* start a test session — pull voice greeting from prompt settings */
  const startSession = async () => {
    setPhase('greeting');
    setTurns([]);
    setHistory([]);
    setBooking(null);
    setError('');
    setInterim('');
    synthRef.current.cancel();

    try {
      // Fetch the configured voice greeting from settings
      const r = await fetch('/api/settings/prompt');
      const data = await r.json();
      const greeting = data.voiceGreeting
        || "Sorry, all our humans are busy right now. Would you be up to booking your job in with me, Fiona?";

      addTurn('assistant', greeting);
      // Seed history with assistant greeting so Claude has context
      setHistory([{ role: 'assistant', content: greeting }]);
      setPhase('speaking');
      speak(greeting, () => { if (phaseRef.current !== 'ended') startListening(); });
    } catch (e) {
      // Fallback greeting if settings unreachable
      const fallback = "Hi! I'm Fiona from FieldInsight. How can I help you today?";
      addTurn('assistant', fallback);
      setHistory([{ role: 'assistant', content: fallback }]);
      setPhase('speaking');
      speak(fallback, () => { if (phaseRef.current !== 'ended') startListening(); });
    }
  };

  const endSession = () => {
    synthRef.current.cancel();
    recognRef.current?.stop();
    recognRef.current?.abort();
    setPhase('ended');
    setInterim('');
  };

  const reset = () => {
    synthRef.current.cancel();
    recognRef.current?.abort();
    setPhase('idle');
    setTurns([]);
    setHistory([]);
    setBooking(null);
    setError('');
    setInterim('');
  };

  const enVoices = voices.filter(v => v.lang.startsWith('en'));
  const isActive = ['listening', 'thinking', 'speaking', 'greeting'].includes(phase);

  return (
    <div className="bvt-wrap">

      {/* ── Header / controls ── */}
      <div className="bvt-header">
        <div className="bvt-header-left">
          <div className="bvt-title">🎤 Browser Voice Test</div>
          <div className="bvt-subtitle">Tests Fiona's AI logic via browser mic — no phone needed</div>
        </div>

        {/* Voice picker */}
        {phase === 'idle' && enVoices.length > 0 && (
          <select
            className="bvt-voice-select"
            value={selectedVoice}
            onChange={e => setSelectedVoice(e.target.value)}
            title="Browser TTS voice"
          >
            {enVoices.map(v => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="bvt-error">⚠ {error}</div>}

      {/* ── Idle state ── */}
      {phase === 'idle' && (
        <div className="bvt-idle">
          <div className="bvt-idle-icon">🤖</div>
          <div className="bvt-idle-text">Start a browser-based test session with Fiona</div>
          <div className="bvt-idle-bullets">
            <span>🎙 Speaks via your browser mic</span>
            <span>🔊 Fiona replies with browser TTS</span>
            <span>📋 Same AI logic as the real call</span>
            <span>📅 Bookings land in the schedule</span>
          </div>
          <button className="bvt-start-btn" onClick={startSession}>
            ▶ Start Test Session
          </button>
        </div>
      )}

      {/* ── Session panel ── */}
      {phase !== 'idle' && (
        <div className="bvt-session">

          {/* Status bar */}
          <div className={`bvt-status-bar bvt-status-${phase}`}>
            <div className="bvt-status-left">
              {phase === 'listening' && <><span className="bvt-pulse-dot" /> Listening…</>}
              {phase === 'thinking'  && <><span className="bvt-spin">⏳</span> Fiona is thinking…</>}
              {phase === 'speaking'  && <><Waveform active /> Fiona is speaking…</>}
              {phase === 'greeting'  && <><span className="bvt-spin">⏳</span> Starting session…</>}
              {phase === 'ended'     && <>Session ended · {turns.length} turns</>}
            </div>
            <div className="bvt-status-right">
              {isActive && (
                <button className="bvt-end-btn" onClick={endSession}>■ End</button>
              )}
              {phase === 'ended' && (
                <button className="bvt-reset-btn" onClick={reset}>↺ New Session</button>
              )}
            </div>
          </div>

          {/* Transcript */}
          <div className="bvt-transcript">
            {turns.map((t, i) => (
              <div key={i} className={`bvt-turn bvt-turn-${t.role}`}>
                <div className="bvt-turn-header">
                  <span className="bvt-speaker">
                    {t.role === 'assistant' ? '🤖 Fiona' : '🧑 You'}
                  </span>
                  <span className="bvt-ts">{fmtTime(t.ts)}</span>
                </div>
                <div className="bvt-turn-text">{t.content}</div>
              </div>
            ))}

            {/* interim speech */}
            {interim && (
              <div className="bvt-turn bvt-turn-user bvt-interim">
                <div className="bvt-turn-header"><span className="bvt-speaker">🧑 You</span></div>
                <div className="bvt-turn-text">{interim}<span className="bvt-cursor">|</span></div>
              </div>
            )}

            {/* thinking dots */}
            {phase === 'thinking' && (
              <div className="bvt-turn bvt-turn-assistant">
                <div className="bvt-turn-header"><span className="bvt-speaker">🤖 Fiona</span></div>
                <div className="tl-text typing"><span /><span /><span /></div>
              </div>
            )}

            {/* booking confirmation */}
            {booking && (
              <div className="bvt-booking-banner">
                ✦ Booking confirmed — {booking.customer} · {booking.type} · {booking.date}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Manual mic button (for when listening stalls) */}
          {phase === 'ended' ? null : (
            <div className="bvt-mic-row">
              {phase === 'listening'
                ? <button className="bvt-mic-btn active" onClick={() => { recognRef.current?.stop(); }}>🎙 Listening — tap to send</button>
                : phase === 'speaking'
                ? <button className="bvt-mic-btn" onClick={() => { synthRef.current.cancel(); startListening(); }}>⏭ Skip — start speaking</button>
                : null
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   LIVE CALL (Twilio) — existing panel
   ════════════════════════════════════════════════════════════════════ */
function LiveCallPanel() {
  const [config, setConfig]           = useState({ voiceNumber: null, voiceEnabled: false, voiceOptions: {}, aiEngine: 'gemini-flash' });
  const [bookingSettings, setBookingSettings] = useState({ aiEngine: 'claude', voiceModel: 'Google.en-AU-Wavenet-C' });
  const [configuring, setConfiguring] = useState(false);
  const [configResult, setConfigResult] = useState(null);
  const [sessions, setSessions]       = useState([]);
  const [copied, setCopied]           = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const pollRef                       = useRef(null);
  const bottomRef                     = useRef(null);

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => setConfig(d)).catch(() => {});
    fetch('/api/settings/booking').then(r => r.json()).then(d => setBookingSettings(d)).catch(() => {});
  }, []);

  const saveSetting = async (patch) => {
    const next = { ...bookingSettings, ...patch };
    setBookingSettings(next);
    setSaving(true);
    try {
      await fetch('/api/settings/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const poll = () => {
      fetch('/api/voice/sessions').then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [sessions]);

  const activeSession  = sessions.find(s => s.status === 'active');
  const recentEnded    = sessions.filter(s => s.status === 'ended').slice(-1)[0];
  const displaySession = activeSession || recentEnded;

  const copyNumber = () => {
    if (!config.voiceNumber) return;
    navigator.clipboard.writeText(config.voiceNumber).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const configureWebhook = async () => {
    setConfiguring(true);
    setConfigResult(null);
    try {
      const r = await fetch('/api/voice/configure', { method: 'POST' });
      const d = await r.json();
      setConfigResult(d);
    } catch (e) {
      setConfigResult({ ok: false, error: e.message });
    } finally {
      setConfiguring(false);
    }
  };

  const fmtNumber = (n) => {
    if (!n) return '';
    if (n.startsWith('+61') && n.length === 12) {
      return `+61 ${n.slice(3, 4)} ${n.slice(4, 8)} ${n.slice(8)}`;
    }
    return n;
  };

  return (
    <>
      {/* Dial-in card */}
      <div className="voip-dialin-card">
        <div className="voip-dialin-icon">{activeSession ? '🔴' : '📞'}</div>
        <div className="voip-dialin-meta">
          <div className="voip-dialin-label">
            {activeSession ? <><span className="voip-live-dot" /> Live Call in Progress</> : "Fiona's Booking Line"}
          </div>
          {config.voiceNumber ? (
            <div className="voip-number-row">
              <span className="voip-number">{fmtNumber(config.voiceNumber)}</span>
              <button className="voip-copy-btn" onClick={copyNumber} title="Copy number">
                {copied ? '✓ Copied' : '📋'}
              </button>
            </div>
          ) : (
            <div className="voip-number voip-number-none">No number configured</div>
          )}
          <div className="voip-dialin-hint">
            {config.voiceEnabled
              ? 'Call this number — Fiona will answer and book a job via voice'
              : 'Add TWILIO_FROM_NUMBER + credentials to enable live calls'}
          </div>
        </div>
        {config.voiceEnabled && (
          <button
            className={`voip-configure-btn${configuring ? ' loading' : ''}`}
            onClick={configureWebhook}
            disabled={configuring}
          >
            {configuring ? '⏳ Configuring…' : '⚙ Configure Webhook'}
          </button>
        )}
      </div>

      {configResult && (
        <div className={`voip-config-result${configResult.ok ? ' ok' : ' err'}`}>
          {configResult.ok
            ? `✓ Webhook set — ${configResult.number} → ${configResult.webhookUrl}`
            : `✗ ${configResult.error}`}
        </div>
      )}

      {/* ── Quick engine + voice controls ── */}
      <div className="voip-engine-bar">
        <div className="voip-engine-item">
          <label className="voip-engine-label">🤖 AI Engine</label>
          <select
            className="voip-engine-select"
            value={bookingSettings.aiEngine || 'gemini-flash'}
            onChange={e => saveSetting({ aiEngine: e.target.value })}
          >
            <optgroup label="Google Gemini">
              <option value="gemini-flash">Gemini 2.5 Flash ★</option>
              <option value="gemini-pro">Gemini 2.5 Flash (Pro)</option>
            </optgroup>
            <optgroup label="Anthropic">
              <option value="claude">Claude Sonnet 4.5</option>
            </optgroup>
          </select>
        </div>
        <div className="voip-engine-item">
          <label className="voip-engine-label">🎙 Voice</label>
          <select
            className="voip-engine-select"
            value={bookingSettings.voiceModel || 'Google.en-AU-Wavenet-C'}
            onChange={e => saveSetting({ voiceModel: e.target.value })}
          >
            <optgroup label="🇦🇺 AU — Google Wavenet">
              <option value="Google.en-AU-Wavenet-C">Wavenet-C · AU Female ★</option>
              <option value="Google.en-AU-Wavenet-A">Wavenet-A · AU Female</option>
              <option value="Google.en-AU-Wavenet-B">Wavenet-B · AU Male</option>
              <option value="Google.en-AU-Wavenet-D">Wavenet-D · AU Male</option>
            </optgroup>
            <optgroup label="🇦🇺 AU — Google Neural2 (HD)">
              <option value="Google.en-AU-Neural2-A">Neural2-A · AU Female HD</option>
              <option value="Google.en-AU-Neural2-B">Neural2-B · AU Male HD</option>
              <option value="Google.en-AU-Neural2-C">Neural2-C · AU Female HD</option>
              <option value="Google.en-AU-Neural2-D">Neural2-D · AU Male HD</option>
            </optgroup>
            <optgroup label="🇺🇸 US — Amazon Polly">
              <option value="Polly.Joanna">Joanna · US Female</option>
              <option value="Polly.Matthew">Matthew · US Male</option>
              <option value="Polly.Joanna-Neural">Joanna · US Female Neural</option>
            </optgroup>
            <optgroup label="🇬🇧 GB — Amazon Polly">
              <option value="Polly.Amy">Amy · UK Female</option>
              <option value="Polly.Brian">Brian · UK Male</option>
            </optgroup>
          </select>
        </div>
        {saving && <span className="voip-engine-status saving">saving…</span>}
        {saved  && <span className="voip-engine-status ok">✓ saved</span>}
      </div>

      {!displaySession && (
        <div className="voip-how-it-works">
          <div className="voip-how-title">How it works</div>
          <div className="voip-how-steps">
            <div className="voip-how-step"><span className="voip-step-num">1</span><span>Call the number above from any phone</span></div>
            <div className="voip-how-step"><span className="voip-step-num">2</span><span>Fiona answers and guides you through booking</span></div>
            <div className="voip-how-step"><span className="voip-step-num">3</span><span>Live transcript appears here as you speak</span></div>
            <div className="voip-how-step"><span className="voip-step-num">4</span><span>Booking lands in the scheduler automatically</span></div>
          </div>
          <a
            href="https://ptyrrell.github.io/product-roadmap/voice-spec.html"
            target="_blank" rel="noopener noreferrer"
            className="voip-spec-link"
          >
            📐 Voice IVR Technical Spec →
          </a>
        </div>
      )}

      {displaySession && (
        <div className="voip-session-panel">
          <div className={`voip-call-bar${displaySession.status === 'ended' ? ' ended' : ''}`}>
            <div className="voip-call-info">
              <div className="voip-call-name">
                {displaySession.status === 'active' ? 'Live Call' : 'Call Ended'} · {displaySession.from}
              </div>
              <div className="voip-call-sub">
                {displaySession.status === 'active'
                  ? <><span className="voip-live-dot" />{' '}Connected · <CallTimer startedAt={displaySession.startedAt} /> · {displaySession.turnCount} turns</>
                  : `${displaySession.turnCount} turns · ${new Date(displaySession.startedAt).toLocaleTimeString('en-AU')}`}
              </div>
            </div>
            {displaySession.status === 'active' && <Waveform active />}
          </div>

          <div className="voip-transcript">
            {displaySession.turns.length === 0 && <div className="transcript-waiting">Waiting for first turn…</div>}
            {displaySession.turns.map((turn, i) => (
              <div key={i} className={`transcript-line ${turn.role}`}>
                <div className="tl-header">
                  <span className="tl-speaker">{turn.role === 'assistant' ? ' Fiona' : '🧑 Caller'}</span>
                  <span className="tl-ts">{fmtTime(turn.ts)}</span>
                </div>
                <div className="tl-text">{turn.content}</div>
              </div>
            ))}
            {displaySession.status === 'active' && displaySession.turns.length > 0 && (
              <div className="transcript-line assistant">
                <div className="tl-header"><span className="tl-speaker">Fiona</span></div>
                <div className="tl-text typing"><span /><span /><span /></div>
              </div>
            )}
            {displaySession.booking && (
              <div className="booking-confirmed-banner">
                ✦ Booking confirmed — {displaySession.booking.customer} · {displaySession.booking.type} · {displaySession.booking.date}
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════
   MAIN EXPORT — mode toggle wrapper
   ════════════════════════════════════════════════════════════════════ */
export default function VoipChannel() {
  const [mode, setMode] = useState('test'); // 'call' | 'test'

  return (
    <div className="channel-body voip-body voip-real">

      {/* Mode toggle */}
      <div className="voip-mode-toggle">
        <button
          className={`voip-mode-btn${mode === 'call' ? ' active' : ''}`}
          onClick={() => setMode('call')}
        >
          📞 Live Call
        </button>
        <button
          className={`voip-mode-btn${mode === 'test' ? ' active' : ''}`}
          onClick={() => setMode('test')}
        >
          🎤 Browser Test
        </button>
      </div>

      {mode === 'call' ? <LiveCallPanel /> : <BrowserVoiceTest />}

    </div>
  );
}
