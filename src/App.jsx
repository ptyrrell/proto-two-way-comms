import { useState } from "react";
import { jobs, emailThreads, smsThreads } from "./data/mockData";
import JobList from "./components/JobList";
import ThreadPanel from "./components/ThreadPanel";
import "./App.css";

export default function App() {
  const [selectedJob, setSelectedJob] = useState(jobs[0]);
  const [activeTab, setActiveTab] = useState("email");

  const emailThread = emailThreads[selectedJob.id] || [];
  const smsThread = smsThreads[selectedJob.id] || [];

  const unreadEmail = (emailThreads[selectedJob.id] || []).filter(
    (m) => !m.read && m.direction === "inbound"
  ).length;
  const unreadSms = 0;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <span className="brand-dot" />
            FieldInsight
          </div>
          <div className="brand-sub">Two-Way Comms · Prototype</div>
        </div>
        <JobList
          jobs={jobs}
          selectedId={selectedJob.id}
          onSelect={setSelectedJob}
          emailThreads={emailThreads}
          smsThreads={smsThreads}
        />
      </aside>

      <main className="main">
        <div className="job-header">
          <div className="job-header-left">
            <div className="job-id">{selectedJob.id}</div>
            <div className="job-title">{selectedJob.title}</div>
            <div className="job-meta">
              <span>{selectedJob.customer}</span>
              <span className="dot">·</span>
              <span>{selectedJob.contact}</span>
              <span className="dot">·</span>
              <span className={`status-badge status-${selectedJob.status.toLowerCase().replace(" ", "-")}`}>
                {selectedJob.status}
              </span>
            </div>
          </div>
          <div className="job-header-right">
            <span className="tech-label">Tech:</span>
            <span className="tech-name">{selectedJob.tech}</span>
          </div>
        </div>

        <div className="tab-bar">
          <button
            className={`tab ${activeTab === "email" ? "active" : ""}`}
            onClick={() => setActiveTab("email")}
          >
            ✉ Email Thread
            {unreadEmail > 0 && <span className="unread-dot">{unreadEmail}</span>}
          </button>
          <button
            className={`tab ${activeTab === "sms" ? "active" : ""}`}
            onClick={() => setActiveTab("sms")}
          >
            💬 SMS Thread
            {unreadSms > 0 && <span className="unread-dot">{unreadSms}</span>}
          </button>
        </div>

        <ThreadPanel
          mode={activeTab}
          job={selectedJob}
          emails={emailThread}
          smsMessages={smsThread}
        />
      </main>
    </div>
  );
}
