import { useState } from "react";
import EmailThread from "./EmailThread";
import SmsThread from "./SmsThread";

export default function ThreadPanel({ mode, job, emails, smsMessages }) {
  if (mode === "email") {
    return <EmailThread job={job} messages={emails} />;
  }
  return <SmsThread job={job} messages={smsMessages} />;
}
