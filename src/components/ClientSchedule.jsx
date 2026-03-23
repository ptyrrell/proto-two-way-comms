import { useMemo } from 'react';
import { useSchedule } from '../context/ScheduleContext';

function fmtTime(h) {
  if (h < 12) return `${h}am`;
  if (h === 12) return '12pm';
  return `${h - 12}pm`;
}

function fmtDay(iso) {
  const d = new Date(iso);
  return {
    weekday:   d.toLocaleDateString('en-AU', { weekday: 'short' }),
    dayNum:    d.getDate(),
    month:     d.toLocaleDateString('en-AU', { month: 'short' }),
    isToday:   d.toDateString() === new Date().toDateString(),
    dayOfWeek: d.getDay(),
  };
}

export default function ClientSchedule() {
  const { jobs, techs, techSettings, bookingSettings, loading } = useSchedule();

  const { bufferHours = 4, workingDays = [1,2,3,4,5], startHour = 8, endHour = 17 } = bookingSettings || {};
  const activeTechs = techs.filter(t => techSettings?.[t]?.availableForBooking !== false);

  // Build 14-day window of working days only
  const dates = useMemo(() => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      if (workingDays.includes(d.getDay())) {
        out.push({
          iso: d.toISOString().split('T')[0],
          ...fmtDay(d.toISOString().split('T')[0]),
        });
      }
    }
    return out;
  }, [workingDays]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  // Per cell: 'past' | 'buffer' | 'busy' | 'partial' | 'open'
  function cellStatus(iso, hour) {
    const slotTime = new Date(iso);
    slotTime.setHours(hour, 0, 0, 0);
    const now = Date.now();

    if (slotTime.getTime() <= now) return 'past';
    if (slotTime.getTime() - now < bufferHours * 3600 * 1000) return 'buffer';

    const freeTechs = activeTechs.filter(tech =>
      !jobs.some(j => j.tech === tech && j.date === iso && j.startHour <= hour && hour < j.startHour + j.duration)
    );

    if (freeTechs.length === 0) return 'busy';
    if (freeTechs.length < activeTechs.length) return 'partial';
    return 'open';
  }

  if (loading) {
    return (
      <div className="schedule-loading">
        <div className="loading-spinner" />
        <span>Loading availability…</span>
      </div>
    );
  }

  const CELL_W  = 80;
  const CELL_H  = 44;
  const TIME_W  = 56;

  const STATUS_CFG = {
    past:    { cls: 'cs-past',    label: null },
    buffer:  { cls: 'cs-buffer',  label: 'Soon' },
    busy:    { cls: 'cs-busy',    label: 'Full' },
    partial: { cls: 'cs-partial', label: 'Partial' },
    open:    { cls: 'cs-open',    label: 'Avail' },
  };

  return (
    <div className="client-schedule-wrap">
      <div className="cs-legend">
        <span className="cs-key cs-key-open">Available</span>
        <span className="cs-key cs-key-partial">Partial</span>
        <span className="cs-key cs-key-buffer">Too soon ({bufferHours}h buffer)</span>
        <span className="cs-key cs-key-busy">Fully booked</span>
      </div>

      <div className="cs-scroll">
        <div className="cs-grid" style={{ width: TIME_W + dates.length * CELL_W }}>

          {/* Header row */}
          <div className="cs-header-row">
            <div className="cs-time-corner" style={{ width: TIME_W }} />
            {dates.map(d => (
              <div
                key={d.iso}
                className={`cs-date-hdr${d.isToday ? ' cs-today-hdr' : ''}`}
                style={{ width: CELL_W }}
              >
                <span className="cs-dh-wd">{d.weekday}</span>
                <span className={`cs-dh-num${d.isToday ? ' cs-today-num' : ''}`}>{d.dayNum}</span>
                <span className="cs-dh-mo">{d.month}</span>
              </div>
            ))}
          </div>

          {/* Hour rows */}
          {hours.map(hour => (
            <div key={hour} className="cs-hour-row">
              <div className="cs-time-lbl" style={{ width: TIME_W, height: CELL_H }}>
                {fmtTime(hour)}
              </div>
              {dates.map(d => {
                const status = cellStatus(d.iso, hour);
                const cfg = STATUS_CFG[status];
                return (
                  <div
                    key={d.iso}
                    className={`cs-cell ${cfg.cls}${d.isToday ? ' cs-today-col' : ''}`}
                    style={{ width: CELL_W, height: CELL_H }}
                    title={cfg.label ? `${fmtTime(hour)} – ${cfg.label}` : undefined}
                  >
                    {status === 'open' && <span className="cs-open-dot" />}
                    {status === 'partial' && (() => {
                      const free = activeTechs.filter(tech =>
                        !jobs.some(j => j.tech === tech && j.date === d.iso && j.startHour <= hour && hour < j.startHour + j.duration)
                      ).length;
                      const mins = Math.round((free / activeTechs.length) * 60);
                      return <span className="cs-partial-count">{mins}min</span>;
                    })()}
                  </div>
                );
              })}
            </div>
          ))}

        </div>
      </div>

      <div className="cs-footer">
        Showing working hours {fmtTime(startHour)}–{fmtTime(endHour)} · Next {dates.length} working days · {bufferHours}h advance notice required
      </div>
    </div>
  );
}
