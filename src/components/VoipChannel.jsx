import { useState, useEffect, useRef, useCallback } from 'react';
import { useChat } from '../hooks/useChat';

/* ── helpers ─────────────────────────────────────────────────── */
function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function CallTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 500);
    return () => clearInterval(t);
  }, [startTime]);
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

/* ── main component ─────────────────────────────────────────── */
export default function VoipChannel() {
  const { messages, isLoading, sendMessage, initiate, lastBooking } = useChat('voip');

  const [callState, setCallState] = useState('idle');   // idle | ringing | connected | ended
  const [callStart, setCallStart] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interim, setInterim] = useState('');
  const [micError, setMicError] = useState(null);
  const [voiceSupported] = useState(() => !!(window.SpeechRecognition || window.webkitSpeechRecognition));

  const recogRef   = useRef(null);
  const speakingRef = useRef(false);
  const callAlive  = useRef(false);
  const bottomRef  = useRef(null);

  /* ── TTS ─────────────────────────────────────────────────── */
  const speak = useCallback((text, onEnd) => {
    if (!text || !callAlive.current) { onEnd?.(); return; }
    window.speechSynthesis.cancel();
    speakingRef.current = true;
    setIsSpeaking(true);

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate  = 1.05;
    utter.pitch = 1.0;
    utter.lang  = 'en-AU';

    const loadVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const best = voices.find(v => v.lang === 'en-AU' && !v.localService)
        || voices.find(v => v.lang === 'en-AU')
        || voices.find(v => v.lang.startsWith('en-GB'))
        || voices.find(v => v.lang.startsWith('en'));
      if (best) utter.voice = best;
    };

    if (window.speechSynthesis.getVoices().length) {
      loadVoice();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoice, { once: true });
    }

    const finish = () => {
      speakingRef.current = false;
      setIsSpeaking(false);
      onEnd?.();
    };

    utter.onend   = finish;
    utter.onerror = finish;
    window.speechSynthesis.speak(utter);
  }, []);

  /* ── STT ─────────────────────────────────────────────────── */
  const startListening = useCallback(() => {
    if (!callAlive.current || speakingRef.current || isLoading) return;

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    if (recogRef.current) {
      try { recogRef.current.abort(); } catch (_) {}
    }

    const r = new SR();
    r.lang = 'en-AU';
    r.continuous = false;
    r.interimResults = true;
    recogRef.current = r;

    r.onresult = (e) => {
      const text = Array.from(e.results).map(x => x[0].transcript).join('');
      setInterim(text);
      if (e.results[e.results.length - 1].isFinal) {
        setInterim('');
        setIsListening(false);
        sendMessage(text);
      }
    };

    r.onend = () => setIsListening(false);

    r.onerror = (e) => {
      setIsListening(false);
      if (e.error === 'not-allowed') {
        setMicError('Microphone access denied — please allow mic access in browser settings.');
        callAlive.current = false;
        setCallState('ended');
      }
    };

    try {
      r.start();
      setIsListening(true);
    } catch (_) { setIsListening(false); }
  }, [isLoading, sendMessage]);

  /* ── When AI responds: speak then listen ─────────────────── */
  useEffect(() => {
    const visible = messages.filter(m => !m.hidden);
    const last = visible[visible.length - 1];
    if (last?.role === 'assistant' && callState === 'connected') {
      speak(last.content, () => {
        if (callAlive.current) setTimeout(startListening, 600);
      });
    }
  }, [messages]); // eslint-disable-line

  /* ── Auto-scroll ──────────────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interim, isSpeaking]);

  /* ── Clean up on unmount ──────────────────────────────────── */
  useEffect(() => () => {
    callAlive.current = false;
    window.speechSynthesis.cancel();
    try { recogRef.current?.abort(); } catch (_) {}
  }, []);

  /* ── Call controls ────────────────────────────────────────── */
  const startCall = async () => {
    if (!voiceSupported) return;
    setCallState('ringing');
    setMicError(null);
    await new Promise(r => setTimeout(r, 1600));
    callAlive.current = true;
    setCallState('connected');
    setCallStart(Date.now());
    initiate(); // triggers AI greeting → useEffect above speaks it
  };

  const endCall = () => {
    callAlive.current = false;
    window.speechSynthesis.cancel();
    try { recogRef.current?.abort(); } catch (_) {}
    setCallState('ended');
    setIsListening(false);
    setIsSpeaking(false);
  };

  /* ── Manual push-to-talk ─────────────────────────────────── */
  const handlePushToTalk = () => {
    if (isListening) {
      try { recogRef.current?.stop(); } catch (_) {}
    } else {
      window.speechSynthesis.cancel();
      speakingRef.current = false;
      setIsSpeaking(false);
      setTimeout(startListening, 100);
    }
  };

  const visible = messages.filter(m => !m.hidden);

  /* ── RENDER ───────────────────────────────────────────────── */
  if (callState === 'idle') {
    return (
      <div className="channel-body voip-body">
        <div className="voip-idle">
          <div className="voip-ring-icon">📞</div>
          <div className="voip-idle-title">VOIP Booking Line</div>
          <div className="voip-idle-sub">
            {voiceSupported
              ? 'Real voice call — speak your request, AI books a job'
              : 'Browser speech not supported — use Chrome or Edge'}
          </div>
          {micError && <div className="voip-error">{micError}</div>}
          <button
            className={`voip-call-btn${!voiceSupported ? ' disabled' : ''}`}
            onClick={startCall}
            disabled={!voiceSupported}
          >
            📲 Start Voice Call
          </button>
          {!voiceSupported && (
            <p className="voip-browser-note">
              Web Speech API required — use Chrome or Edge
            </p>
          )}
        </div>
      </div>
    );
  }

  if (callState === 'ringing') {
    return (
      <div className="channel-body voip-body">
        <div className="voip-idle">
          <div className="voip-ring-icon ringing">📞</div>
          <div className="voip-idle-title">Connecting…</div>
          <div className="voip-dots"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="channel-body voip-body">
      {/* ── Call bar ── */}
      <div className={`voip-call-bar${callState === 'ended' ? ' ended' : ''}`}>
        <div className="voip-call-info">
          <div className="voip-call-name">FieldInsight Booking Line</div>
          <div className="voip-call-sub">
            {callState === 'connected'
              ? <><span className="voip-live-dot" /> Connected · <CallTimer startTime={callStart} /></>
              : '⬛ Call ended'}
          </div>
        </div>
        {callState === 'connected' && (
          <button className="voip-hangup-btn" onClick={endCall}>⬛ End Call</button>
        )}
      </div>

      {/* ── Voice status bar ── */}
      {callState === 'connected' && (
        <div className={`voice-status-bar${isSpeaking ? ' speaking' : isListening ? ' listening' : ' idle'}`}>
          <Waveform active={isListening || isSpeaking} />
          <span className="voice-status-label">
            {isSpeaking    ? 'FieldInsight AI speaking…'
             : isListening ? 'Listening… speak now'
             : isLoading   ? 'Processing…'
             :               'Tap mic to speak'}
          </span>
        </div>
      )}

      {/* ── Transcript ── */}
      <div className="voip-transcript">
        {visible.length === 0 && !isLoading && (
          <div className="transcript-waiting">Connecting to AI assistant…</div>
        )}

        {visible.map((msg, i) => (
          <div key={i} className={`transcript-line ${msg.role}`}>
            <div className="tl-header">
              <span className="tl-speaker">
                {msg.role === 'assistant' ? 'FieldInsight AI' : 'You'}
              </span>
              <span className="tl-ts">{msg.ts ? fmtTime(msg.ts) : ''}</span>
            </div>
            <div className="tl-text">{msg.content}</div>
          </div>
        ))}

        {isLoading && (
          <div className="transcript-line assistant">
            <div className="tl-header"><span className="tl-speaker">FieldInsight AI</span></div>
            <div className="tl-text typing"><span /><span /><span /></div>
          </div>
        )}

        {/* Interim text preview */}
        {interim && (
          <div className="transcript-line user interim">
            <div className="tl-header"><span className="tl-speaker">You (speaking…)</span></div>
            <div className="tl-text">{interim}</div>
          </div>
        )}

        {lastBooking && (
          <div className="booking-confirmed-banner">
            ✦ Job booked — {lastBooking.customer} · {lastBooking.type} · {lastBooking.date}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Mic button ── */}
      {callState === 'connected' && (
        <div className="voip-mic-controls">
          <button
            className={`mic-btn${isListening ? ' listening' : ''}${isSpeaking ? ' muted' : ''}`}
            onClick={handlePushToTalk}
            title={isListening ? 'Stop listening' : 'Push to talk'}
          >
            {isListening ? '🔴' : '🎙'}
          </button>
          <span className="mic-hint">
            {isListening
              ? 'Listening — tap to stop'
              : isSpeaking
              ? 'AI speaking — tap to interrupt'
              : 'Tap to speak'}
          </span>
        </div>
      )}
    </div>
  );
}
