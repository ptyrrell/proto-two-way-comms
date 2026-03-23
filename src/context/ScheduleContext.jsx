import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ScheduleContext = createContext(null);

export function ScheduleProvider({ children }) {
  const [jobs, setJobs] = useState([]);
  const [techs, setTechs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newJobId, setNewJobId] = useState(null);

  useEffect(() => {
    fetch('/api/schedule')
      .then(r => r.json())
      .then(data => {
        setJobs(data.jobs);
        setTechs(data.techs);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const addJob = useCallback((job) => {
    setJobs(prev => [...prev.filter(j => j.id !== job.id), job]);
    setNewJobId(job.id);
    setTimeout(() => setNewJobId(null), 4000);
  }, []);

  return (
    <ScheduleContext.Provider value={{ jobs, techs, loading, addJob, newJobId }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export const useSchedule = () => useContext(ScheduleContext);
