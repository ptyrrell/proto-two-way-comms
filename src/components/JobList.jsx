import { emailThreads, smsThreads } from "../data/mockData";

function getUnreadCount(jobId, emailThreads, smsThreads) {
  const emailUnread = (emailThreads[jobId] || []).filter(
    (m) => !m.read && m.direction === "inbound"
  ).length;
  const smsUnread = 0; // placeholder
  return emailUnread + smsUnread;
}

function lastMessage(jobId, emailThreads, smsThreads) {
  const all = [
    ...(emailThreads[jobId] || []).map((m) => ({ ...m, type: "email" })),
    ...(smsThreads[jobId] || []).map((m) => ({ ...m, type: "sms" })),
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return all[0] || null;
}

function relativeTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function JobList({ jobs, selectedId, onSelect }) {
  return (
    <div className="job-list">
      <div className="job-list-title">Jobs</div>
      {jobs.map((job) => {
        const unread = getUnreadCount(job.id, emailThreads, smsThreads);
        const last = lastMessage(job.id, emailThreads, smsThreads);
        return (
          <button
            key={job.id}
            className={`job-item ${selectedId === job.id ? "selected" : ""}`}
            onClick={() => onSelect(job)}
          >
            <div className="job-item-top">
              <span className="job-item-id">{job.id}</span>
              {last && (
                <span className="job-item-time">{relativeTime(last.timestamp)}</span>
              )}
              {unread > 0 && <span className="unread-badge">{unread}</span>}
            </div>
            <div className="job-item-customer">{job.customer}</div>
            <div className="job-item-title">{job.title}</div>
            {last && (
              <div className="job-item-preview">
                {last.type === "email" ? "✉" : "💬"}{" "}
                {(last.body || "").slice(0, 55)}…
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
