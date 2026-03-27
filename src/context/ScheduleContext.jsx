import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const ScheduleContext = createContext(null);

export function ScheduleProvider({ children }) {
  const [jobs,            setJobs]            = useState([]);
  const [techs,           setTechs]           = useState([]);
  const [techSettings,    setTechSettings]    = useState({});
  const [bookingSettings, setBookingSettings] = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [newJobId,        setNewJobId]        = useState(null);
  const seenIdsRef = useRef(new Set());

  const reload = useCallback(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        // Detect brand-new jobs arriving via voice/server-side booking
        const incoming = data.jobs || [];
        const freshNew = incoming.find(
          j => !seenIdsRef.current.has(j.id) && j.status === 'pending'
        );
        incoming.forEach(j => seenIdsRef.current.add(j.id));

        setJobs(incoming);
        setTechs(data.techs);
        setTechSettings(data.techSettings || {});
        setBookingSettings(data.bookingSettings || null);
        setLoading(false);

        if (freshNew) {
          setNewJobId(freshNew.id);
          setTimeout(() => setNewJobId(null), 10_000);
        }
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  // Auto-refresh every 10 seconds so voice bookings appear promptly
  useEffect(() => {
    const t = setInterval(reload, 10_000);
    return () => clearInterval(t);
  }, [reload]);

  const addJob = useCallback((job) => {
    seenIdsRef.current.add(job.id);
    setJobs(prev => [...prev.filter(j => j.id !== job.id), job]);
    setNewJobId(job.id);
    setTimeout(() => reload(), 800);
    setTimeout(() => setNewJobId(null), 10_000);
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
