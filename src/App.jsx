import { ScheduleProvider } from './context/ScheduleContext';
import Schedule from './components/Schedule';
import ChannelPanel from './components/ChannelPanel';
import './App.css';

export default function App() {
  return (
    <ScheduleProvider>
      <div className="app-root">
        <div className="schedule-pane">
          <Schedule />
        </div>
        <ChannelPanel />
      </div>
    </ScheduleProvider>
  );
}
