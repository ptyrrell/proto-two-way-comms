import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ScheduleContext = createContext(null);

export function ScheduleProvider({ children }) {
  const [jobs,            setJobs]            = useState([]);
  const [techs,           setTechs]           = useState([]);
  const [techSettings,    setTechSettings]    = useState({});
  const [bookingSettings, setBookingSettings] = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [newJobId,        setNewJobId]        = useState(null);

  const reload = useCallback(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs);
        setTechs(data.techs);
        setTechSettings(data.techSettings || {});
        setBookingSettings(data.bookingSettings || null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const t = setInterval(reload, 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const addJob = useCallback((job) => {
    // Optimistically add to local state immediately so the schedule updates at once
    setJobs(prev => [...prev.filter(j => j.id !== job.id), job]);
    setNewJobId(job.id);
    // Re-fetch from server after a short delay to pick up the server-normalised tech name
    setTimeout(() => reload(), 800);
    setTimeout(() => setNewJobId(null), 8000);
  }, [reload]);

  const refreshBookingSettings = useCallback(() => {
    fetch('/api/settings/booking')
      .then(r => r.json())
      .then(d => setBookingSettings(d));
  }, []);

  return (
    <ScheduleContext.Provider value={{
      jobs, techs, techSettings, bookingSettings,
      loading, addJob, newJobId, refreshBookingSettings, reload,
    }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export const useSchedule = () => useContext(ScheduleContext);
