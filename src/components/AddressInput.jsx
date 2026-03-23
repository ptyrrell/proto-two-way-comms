import { useState, useEffect, useRef, useCallback } from 'react';

let mapsLoadPromise = null;

function loadGoogleMaps(apiKey) {
  if (window.google?.maps?.places) return Promise.resolve();
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    window.__googleMapsReady = resolve;
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&callback=__googleMapsReady`;
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return mapsLoadPromise;
}

export default function AddressInput({ onSubmit, label = 'Service address' }) {
  const [value,       setValue]      = useState('');
  const [status,      setStatus]     = useState('idle'); // idle | validating | ok | warn
  const [formatted,   setFormatted]  = useState('');
  const [message,     setMessage]    = useState('');
  const [apiKey,      setApiKey]     = useState(null);
  const [mapsReady,   setMapsReady]  = useState(false);
  const inputRef = useRef(null);
  const acRef    = useRef(null);

  // Fetch Google Maps API key from server
  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(d => {
      if (d.googleMapsApiKey) setApiKey(d.googleMapsApiKey);
    }).catch(() => {});
  }, []);

  // Load Google Maps SDK and attach Places Autocomplete
  useEffect(() => {
    if (!apiKey || !inputRef.current) return;
    loadGoogleMaps(apiKey).then(() => {
      setMapsReady(true);
      if (!inputRef.current) return;

      acRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'au' },
        fields: ['formatted_address', 'geometry', 'address_components'],
        types: ['address'],
      });

      acRef.current.addListener('place_changed', () => {
        const place = acRef.current.getPlace();
        if (place?.formatted_address) {
          setValue(place.formatted_address);
          setFormatted(place.formatted_address);
          setStatus('ok');
          setMessage('✓ Address validated via Google Maps');
        }
      });
    }).catch(() => {
      setMapsReady(false);
    });
    return () => {
      if (acRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(acRef.current);
      }
    };
  }, [apiKey, inputRef.current]); // eslint-disable-line

  // Server-side validation fallback (fires on blur when no Google selection was made)
  const validateServerSide = useCallback(async (addr) => {
    if (!addr.trim() || status === 'ok') return;
    setStatus('validating');
    try {
      const r = await fetch('/api/validate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr }),
      });
      const d = await r.json();
      if (d.validated) {
        setFormatted(d.formattedAddress);
        setValue(d.formattedAddress);
        setStatus('ok');
        setMessage(`✓ ${d.formattedAddress}`);
      } else if (d.ok) {
        // Accepted as-is (no API key)
        setFormatted(addr);
        setStatus('warn');
        setMessage(d.message || 'Address accepted — validation not configured');
      } else {
        setStatus('warn');
        setMessage(d.message || 'Address not found — please double-check');
      }
    } catch {
      setFormatted(addr);
      setStatus('warn');
      setMessage('Could not validate — address accepted as entered');
    }
  }, [status]);

  const handleSubmit = async () => {
    const addr = formatted || value;
    if (!addr.trim()) return;
    if (status !== 'ok' && status !== 'warn') {
      await validateServerSide(value);
    }
    onSubmit(formatted || value);
  };

  const statusIcon = { idle: '📍', validating: '⏳', ok: '✅', warn: '⚠️' }[status];

  return (
    <div className="address-input-widget">
      <div className="addr-label">{statusIcon} {label}</div>

      <div className={`addr-field-wrap${status === 'ok' ? ' addr-ok' : status === 'warn' ? ' addr-warn' : ''}`}>
        <input
          ref={inputRef}
          className="addr-input"
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); setStatus('idle'); setFormatted(''); setMessage(''); }}
          onBlur={() => { if (status === 'idle' && value.trim()) validateServerSide(value); }}
          placeholder="Start typing an address…"
          autoComplete="off"
        />
        {status === 'validating' && <span className="addr-spinner" />}
      </div>

      {message && (
        <div className={`addr-message ${status}`}>{message}</div>
      )}

      {!mapsReady && apiKey && (
        <div className="addr-note">Loading Google Places…</div>
      )}
      {!apiKey && (
        <div className="addr-note">Server-side validation only — Google Maps not configured</div>
      )}

      <button
        className={`addr-submit-btn${(value.trim()) ? ' ready' : ''}`}
        onClick={handleSubmit}
        disabled={!value.trim() || status === 'validating'}
      >
        Use this address →
      </button>
    </div>
  );
}
