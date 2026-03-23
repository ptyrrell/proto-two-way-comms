import { useState, useEffect, useRef } from 'react';
import { useChat } from '../hooks/useChat';

function fmtTime(d) {
  return new Date(d).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function CallTimer({ startTime }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(t);
  }, [startTime]);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  return <span className="call-timer">{m}:{s}</span>;
}

export default function VoipChannel() {
  const { messages, isLoading, sendMessage, initiate, lastBooking } = useChat('voip');
  const [callState, setCallState] = useState('idle'); // idle | ringing | connected | ended
  const [callStart, setCallStart] = useState(null);
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  const startCall = async () => {
    setCallState('ringing');
    await new Promise(r => setTimeout(r, 1800));
    setCallState('connected');
    setCallStart(Date.now());
    await initiate();
  };

  const endCall = () => {
    setCallState('ended');
  };

  const handleSpeak = () => {
    if (!input.trim() || isLoading) return;
    sendMessage(input.trim());
    setInput('');
  };

  const visible = messages.filter(m => !m.hidden);

  return (
    <div className="channel-body voip-body">
      {callState === 'idle' && (
        <div className="voip-idle">
          <div className="voip-icon">📞</div>
          <div className="voip-idle-title">VOIP Booking Line</div>
          <div className="voip-idle-sub">Simulated call with live AI transcript</div>
          <button className="voip-call-btn" onClick={startCall}>
            📲 Start Call
          </button>
        </div>
      )}

      {callState === 'ringing' && (
        <div className="voip-idle">
          <div className="voip-icon ringing">📞</div>
          <div className="voip-idle-title">Calling FieldInsight…</div>
          <div className="voip-dots"><span /><span /><span /></div>
        </div>
      )}

      {(callState === 'connected' || callState === 'ended') && (
        <>
          <div className={`voip-call-bar ${callState === 'ended' ? 'ended' : ''}`}>
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

          <div className="voip-transcript">
            <div className="transcript-label">— Transcript —</div>

            {visible.map((msg, i) => (
              <div key={i} className={`transcript-line ${msg.role}`}>
                <span className="tl-speaker">
                  {msg.role === 'assistant' ? 'FieldInsight AI' : 'Customer'}
                </span>
                <span className="tl-ts">{msg.ts ? fmtTime(msg.ts) : ''}</span>
                <div className="tl-text">{msg.content}</div>
              </div>
            ))}

            {isLoading && (
              <div className="transcript-line assistant">
                <span className="tl-speaker">FieldInsight AI</span>
                <div className="tl-text typing"><span /><span /><span /></div>
              </div>
            )}

            {lastBooking && (
              <div className="booking-confirmed-banner">
                ✦ Job booked — {lastBooking.customer} · {lastBooking.type} · {lastBooking.date}
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {callState === 'connected' && (
            <div className="voip-speak-row">
              <div className="voip-mic-icon">🎙</div>
              <input
                className="ch-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSpeak()}
                placeholder="Speak (type your response)…"
                disabled={isLoading}
              />
              <button className={`ch-send-btn${input.trim() ? ' active' : ''}`} onClick={handleSpeak} disabled={!input.trim() || isLoading}>↑</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
