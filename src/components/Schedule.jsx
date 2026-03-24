import { useMemo, useState } from 'react';
import { useSchedule } from '../context/ScheduleContext';
import ClientSchedule from './ClientSchedule';

const HOUR_HEIGHT = 44;
const START_HOUR  = 7;
const END_HOUR    = 19;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const DAY_WIDTH   = 128;
const TECH_COL_W  = 148;
const DAYS_AHEAD  = 14;

const TYPE_STYLE = {
  HVAC:       { bg: '#0f2d4a', border: '#2563eb', text: '#93c5fd', label: 'HVAC' },
  Electrical: { bg: '#1e1040', border: '#7c3aed', text: '#c4b5fd', label: 'Elec' },
  Plumbing:   { bg: '#071e2a', border: '#0891b2', text: '#67e8f9', label: 'Plmb' },
  General:    { bg: '#072218', border: '#059669', text: '#6ee7b7', label: 'Gen' },
  pending:    { bg: '#2a1800', border: '#f59e0b', text: '#fcd34d', label: 'NEW' },
};

function getDates() {
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      iso:        d.toISOString().split('T')[0],
      weekday:    d.toLocaleDateString('en-AU', { weekday: 'short' }),
      dayNum:     d.getDate(),
      monthShort: d.toLocaleDateString('en-AU', { month: 'short' }),
      isWeekend:  d.getDay() === 0 || d.getDay() === 6,
      isToday:    i === 0,
    };
  });
}

function fmtTime(h) {
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

// Vivid bright-green override for freshly booked jobs
const NEW_STYLE = {
  bg:     '#166534',
  border: '#4ade80',
  text:   '#ffffff',
  label:  'NEW',
};

function JobBlock({ job, isNew }) {
  const [hovered, setHovered] = useState(false);
  const style = isNew
    ? NEW_STYLE
    : job.status === 'pending'
      ? TYPE_STYLE.pending
      : (TYPE_STYLE[job.type] || TYPE_STYLE.General);
  const top    = (job.startHour - START_HOUR) * HOUR_HEIGHT;
  const height = Math.max(job.duration * HOUR_HEIGHT - 3, 24);

  return (
    <div
      className={`job-block${isNew ? ' job-new' : ''}`}
      style={{
        top,
        height,
        background:  isNew ? `linear-gradient(135deg, #15803d, #166534)` : style.bg,
        borderLeft:  `3px solid ${style.border}`,
        boxShadow:   isNew
          ? `0 0 0 2px ${style.border}, 0 0 18px ${style.border}88`
          : hovered ? `0 2px 12px ${style.border}44` : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="jb-type" style={{ color: isNew ? '#bbf7d0' : style.border, background: `${style.border}${isNew ? '33' : '22'}` }}>
        {style.label} {isNew && '✦'}
      </div>
      <div className={`jb-customer${isNew ? ' jb-customer-new' : ''}`} style={{ color: style.text }}>
        {job.customer}
      </div>
      {height > 60 && (
        <div className="jb-meta" style={{ color: isNew ? '#86efac' : `${style.text}aa` }}>
          {fmtTime(job.startHour)}–{fmtTime(job.startHour + job.duration)}
          {job.amount > 0 && ` · $${job.amount}`}
        </div>
      )}
    </div>
  );
}

export default function Schedule() {
  const { jobs, techs, loading, newJobId } = useSchedule();
  const [viewMode, setViewMode] = useState('internal'); // 'internal' | 'client'
  const dates = useMemo(() => getDates(), []);

  const hours  = Array.from({ length: TOTAL_HOURS }, (_, i) => START_HOUR + i);
  const totalH = TOTAL_HOURS * HOUR_HEIGHT;

  if (loading) {
    return (
      <div className="schedule-loading">
        <div className="loading-spinner" />
        <span>Loading schedule…</span>
      </div>
    );
  }

  return (
    <div className="schedule-wrap">
      {/* ── Nav bar ─────────────────────────────────── */}
      <div className="sched-nav">
        <div className="sched-nav-left">
          <span className="sched-title">Schedule</span>
          <span className="sched-range">
            {dates[0].dayNum} {dates[0].monthShort} – {dates[DAYS_AHEAD-1].dayNum} {dates[DAYS_AHEAD-1].monthShort}
          </span>
        </div>
        <div className="sched-nav-right">
          {/* View mode toggle */}
          <div className="view-toggle">
            <button
              className={`vt-btn${viewMode === 'internal' ? ' active' : ''}`}
              onClick={() => setViewMode('internal')}
            >
              Internal
            </button>
            <button
              className={`vt-btn${viewMode === 'client' ? ' active' : ''}`}
              onClick={() => setViewMode('client')}
            >
              Client View
            </button>
          </div>

          {viewMode === 'internal' && (
            <>
              <span className="sched-chip">2 weeks</span>
              <span className="sched-chip active-chip">Technicians</span>
              <span className="sched-legend">
                {Object.entries(TYPE_STYLE).filter(([k]) => k !== 'pending').map(([k, s]) => (
                  <span key={k} className="legend-dot" style={{ background: s.border }} title={k} />
                ))}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Views ─────────────────────────────────────── */}
      {viewMode === 'client' ? (
        <ClientSchedule />
      ) : (
        <div className="schedule-scroll">
          <div className="sched-grid" style={{ width: TECH_COL_W + DAYS_AHEAD * DAY_WIDTH }}>

            {/* Corner + date headers */}
            <div className="sched-header-row" style={{ paddingLeft: TECH_COL_W }}>
              {dates.map(d => (
                <div
                  key={d.iso}
                  className={`sched-date-hdr${d.isWeekend ? ' weekend' : ''}${d.isToday ? ' today' : ''}`}
                  style={{ width: DAY_WIDTH }}
                >
                  <span className="dh-weekday">{d.weekday}</span>
                  <span className={`dh-num${d.isToday ? ' today-num' : ''}`}>{d.dayNum}</span>
                  <span className="dh-month">{d.monthShort}</span>
                </div>
              ))}
            </div>

            {/* Tech rows */}
            {techs.map(tech => (
              <div key={tech} className="sched-row">
                <div className="sched-tech-label" style={{ width: TECH_COL_W, height: totalH }}>
                  <div className="tech-name-block">
                    <span className="tech-first">{tech.split(' ')[0]}</span>
                    <span className="tech-last">{tech.split(' ')[1]}</span>
                  </div>
                  <div className="time-rulers">
                    {hours.map(h => (
                      <div key={h} className="time-ruler" style={{ height: HOUR_HEIGHT }}>
                        <span className="time-lbl">{fmtTime(h)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {dates.map(d => {
                  const dayJobs = jobs.filter(j => j.tech === tech && j.date === d.iso);
                  return (
                    <div
                      key={d.iso}
                      className={`sched-cell${d.isWeekend ? ' weekend' : ''}${d.isToday ? ' today-col' : ''}`}
                      style={{ width: DAY_WIDTH, height: totalH }}
                    >
                      {hours.map(h => (
                        <div
                          key={h}
                          className={`hour-line${h % 2 === 0 ? ' even' : ''}`}
                          style={{ top: (h - START_HOUR) * HOUR_HEIGHT }}
                        />
                      ))}
                      {dayJobs.map(job => (
                        <JobBlock key={job.id} job={job} isNew={job.id === newJobId} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}

          </div>
        </div>
      )}
    </div>
  );
}
