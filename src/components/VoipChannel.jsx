import { useState, useEffect, useRef } from 'react';

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

export default function VoipChannel() {
  const [config, setConfig]         = useState({ voiceNumber: null, voiceEnabled: false });
  const [configuring, setConfiguring] = useState(false);
  const [configResult, setConfigResult] = useState(null);
  const [sessions, setSessions]     = useState([]);
  const [copied, setCopied]         = useState(false);
  const pollRef                     = useRef(null);
  const bottomRef                   = useRef(null);

  // Load config (voice number, voiceEnabled)
  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => setConfig(d))
      .catch(() => {});
  }, []);

  // Poll /api/voice/sessions every 2 s
  useEffect(() => {
    const poll = () => {
      fetch('/api/voice/sessions')
        .then(r => r.json())
        .then(d => setSessions(d.sessions || []))
        .catch(() => {});
    };
    poll();
    pollRef.current = setInterval(poll, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessions]);

  const activeSession = sessions.find(s => s.status === 'active');
  const recentEnded   = sessions.filter(s => s.status === 'ended').slice(-1)[0];
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
    // Format +61391234567 → +61 3 9123 4567
    if (n.startsWith('+61') && n.length === 12) {
      return `+61 ${n.slice(3, 4)} ${n.slice(4, 8)} ${n.slice(8)}`;
    }
    return n;
  };

  return (
    <div className="channel-body voip-body voip-real">

      {/* ── Dial-in card ── */}
      <div className="voip-dialin-card">
        <div className="voip-dialin-icon">
          {activeSession ? '🔴' : '📞'}
        </div>

        <div className="voip-dialin-meta">
          <div className="voip-dialin-label">
            {activeSession
              ? <><span className="voip-live-dot" /> Live Call in Progress</>
              : 'Fiona\'s Booking Line'}
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

        {/* Configure webhook button */}
        {config.voiceEnabled && (
          <button
            className={`voip-configure-btn${configuring ? ' loading' : ''}`}
            onClick={configureWebhook}
            disabled={configuring}
            title="Auto-configure this number's webhook in Twilio"
          >
            {configuring ? '⏳ Configuring…' : '⚙ Configure Webhook'}
          </button>
        )}
      </div>

      {/* Config result feedback */}
      {configResult && (
        <div className={`voip-config-result${configResult.ok ? ' ok' : ' err'}`}>
          {configResult.ok
            ? `✓ Webhook set — ${configResult.number} → ${configResult.webhookUrl}`
            : `✗ ${configResult.error}`}
        </div>
      )}

      {/* ── How it works ── */}
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
            target="_blank"
            rel="noopener noreferrer"
            className="voip-spec-link"
          >
            📐 Voice IVR Technical Spec →
          </a>
        </div>
      )}

      {/* ── Live session panel ── */}
      {displaySession && (
        <div className="voip-session-panel">

          {/* Session header */}
          <div className={`voip-call-bar${displaySession.status === 'ended' ? ' ended' : ''}`}>
            <div className="voip-call-info">
              <div className="voip-call-name">
                {displaySession.status === 'active' ? 'Live Call' : 'Call Ended'}
                {' '}· {displaySession.from}
              </div>
              <div className="voip-call-sub">
                {displaySession.status === 'active'
                  ? <><span className="voip-live-dot" />{' '}Connected · <CallTimer startedAt={displaySession.startedAt} /> · {displaySession.turnCount} turns</>
                  : `${displaySession.turnCount} turns · ${new Date(displaySession.startedAt).toLocaleTimeString('en-AU')}`}
              </div>
            </div>
            {displaySession.status === 'active' && (
              <Waveform active />
            )}
          </div>

          {/* Transcript */}
          <div className="voip-transcript">
            {displaySession.turns.length === 0 && (
              <div className="transcript-waiting">Waiting for first turn…</div>
            )}

            {displaySession.turns.map((turn, i) => (
              <div key={i} className={`transcript-line ${turn.role}`}>
                <div className="tl-header">
                  <span className="tl-speaker">
                    {turn.role === 'assistant' ? `${' '}Fiona` : '🧑 Caller'}
                  </span>
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

    </div>
  );
}
