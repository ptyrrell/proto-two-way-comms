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

  const addJob = useCallback((job) => {
    setJobs(prev => [...prev.filter(j => j.id !== job.id), job]);
    setNewJobId(job.id);
    setTimeout(() => setNewJobId(null), 4000);
  }, []);

  const refreshBookingSettings = useCallback(() => {
    fetch('/api/settings/booking')
      .then(r => r.json())
      .then(d => setBookingSettings(d));
  }, []);

  return (
    <ScheduleContext.Provider value={{
      jobs, techs, techSettings, bookingSettings,
      loading, addJob, newJobId, refreshBookingSettings,
    }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export const useSchedule = () => useContext(ScheduleContext);
