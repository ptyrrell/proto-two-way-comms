import { useState } from 'react';
import WebChat from './WebChat';
import SmsChannel from './SmsChannel';
import EmailChannel from './EmailChannel';
import VoipChannel from './VoipChannel';
import FormChannel from './FormChannel';
import TechSettings from './TechSettings';

const TABS = [
  { id: 'form',  icon: '📋', label: 'Form' },
  { id: 'web',   icon: '💬', label: 'Web' },
  { id: 'sms',   icon: '📱', label: 'SMS' },
  { id: 'email', icon: '✉️', label: 'Email' },
  { id: 'voip',  icon: '📞', label: 'VOIP' },
];

export default function ChannelPanel() {
  const [active, setActive] = useState('web');
  const [showSettings, setShowSettings] = useState(false);

  return (
    <div className="channel-panel">
      <div className="panel-header">
        <div className="panel-title">Customer Channels</div>
        <div className="panel-header-right">
          <div className="panel-ai-badge">
            <span className="ai-pill claude">Claude</span>
            <span className="ai-swap">⇄</span>
            <span className="ai-pill grok">Grok</span>
          </div>
          <button
            className="settings-gear-btn"
            onClick={() => setShowSettings(true)}
            title="Technician Settings"
          >
            ⚙
          </button>
        </div>
      </div>

      <div className="panel-tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`panel-tab${active === t.id ? ' active' : ''}`}
            onClick={() => setActive(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="panel-body">
        {active === 'form'  && <FormChannel key="form" />}
        {active === 'web'   && <WebChat key="web" />}
        {active === 'sms'   && <SmsChannel key="sms" />}
        {active === 'email' && <EmailChannel key="email" />}
        {active === 'voip'  && <VoipChannel key="voip" />}
      </div>

      {showSettings && <TechSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
