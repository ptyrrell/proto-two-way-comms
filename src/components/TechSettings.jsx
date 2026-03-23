import { useState, useEffect } from 'react';

export default function TechSettings({ onClose }) {
  const [techSettings, setTechSettings] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings/techs')
      .then(r => r.json())
      .then(d => setTechSettings(d));
  }, []);

  const toggle = async (tech) => {
    const newVal = !techSettings[tech]?.availableForBooking;
    setTechSettings(prev => ({ ...prev, [tech]: { ...prev[tech], availableForBooking: newVal } }));
    setSaving(true);
    await fetch('/api/settings/techs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tech, availableForBooking: newVal }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const TECH_META = {
    'Jake Morrison': { role: 'HVAC Specialist',       icon: '❄️' },
    'Sam Peters':    { role: 'Electrical Specialist',  icon: '⚡' },
    'Brad Kim':      { role: 'Plumbing Specialist',    icon: '🔧' },
    'Amy Chen':      { role: 'HVAC & General',         icon: '🔨' },
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <div>
            <div className="settings-title">Technician Settings</div>
            <div className="settings-sub">Control which technicians appear for customer self-booking</div>
          </div>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section-label">Self-Booking Availability</div>

        <div className="tech-list">
          {Object.entries(techSettings).map(([tech, cfg]) => {
            const meta = TECH_META[tech] || { role: 'Technician', icon: '👷' };
            const on = cfg?.availableForBooking ?? true;
            return (
              <div key={tech} className={`tech-row${on ? '' : ' off'}`}>
                <div className="tech-row-icon">{meta.icon}</div>
                <div className="tech-row-info">
                  <div className="tech-row-name">{tech}</div>
                  <div className="tech-row-role">{meta.role}</div>
                </div>
                <div className="tech-row-right">
                  <span className={`avail-pill${on ? ' on' : ' off'}`}>
                    {on ? 'Available' : 'Hidden'}
                  </span>
                  <button
                    className={`toggle-btn${on ? ' on' : ' off'}`}
                    onClick={() => toggle(tech)}
                  >
                    <span className="toggle-thumb" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="settings-footer">
          <span className="settings-note">
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Changes apply to new AI conversations immediately'}
          </span>
        </div>
      </div>
    </div>
  );
}
