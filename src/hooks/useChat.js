import { useState, useCallback, useRef } from 'react';
import { useSchedule } from '../context/ScheduleContext';

export function useChat(channel) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastBooking, setLastBooking] = useState(null);
  const initiated = useRef(false);
  const { addJob } = useSchedule();

  const callApi = useCallback(async (msgs) => {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: msgs.filter(m => !m.hidden),
        channel,
      }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, [channel]);

  const initiate = useCallback(async () => {
    if (initiated.current) return;
    initiated.current = true;
    setIsLoading(true);
    try {
      const data = await callApi([{ role: 'user', content: 'Hello' }]);
      setMessages([
        { role: 'user', content: 'Hello', hidden: true },
        { role: 'assistant', content: data.text, ts: new Date() },
      ]);
    } catch {
      setMessages([{
        role: 'assistant',
        content: "Hi! 👋 Welcome to FieldInsight. Would you like to book a service job today?",
        ts: new Date(),
      }]);
    }
    setIsLoading(false);
  }, [callApi]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;
    const userMsg = { role: 'user', content: text, ts: new Date() };
    const next = [...messages, userMsg];
    setMessages(next);
    setIsLoading(true);

    try {
      const data = await callApi(next);
      const assistantMsg = { role: 'assistant', content: data.text, ts: new Date() };
      setMessages(prev => [...prev, assistantMsg]);

      if (data.booking) {
        addJob(data.booking);
        setLastBooking(data.booking);
      }
      setIsLoading(false);
      return data;
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I had trouble with that. Please try again.",
        ts: new Date(),
      }]);
      setIsLoading(false);
    }
  }, [messages, isLoading, callApi, addJob]);

  return { messages, isLoading, sendMessage, initiate, lastBooking };
}
