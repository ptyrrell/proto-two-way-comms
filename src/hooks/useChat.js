import { useState, useCallback, useRef } from 'react';
import { useSchedule } from '../context/ScheduleContext';

export function useChat(channel) {
  const [messages,          setMessages]          = useState([]);
  const [isLoading,         setIsLoading]         = useState(false);
  const [lastBooking,       setLastBooking]        = useState(null);
  const [needsAddress,      setNeedsAddress]      = useState(false);
  const [needsContact,      setNeedsContact]      = useState(false);
  const [addressValidation, setAddressValidation] = useState(null);
  const initiated = useRef(false);
  const { addJob } = useSchedule();

  const callApi = useCallback(async (msgs) => {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: msgs.filter(m => !m.hidden), channel }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, [channel]);

  const handleData = useCallback((data) => {
    setNeedsAddress(!!data.needsAddress);
    setNeedsContact(!!data.needsContact);
    if (data.addressValidation) {
      setAddressValidation(data.addressValidation);
      // Auto-clear after 8 seconds
      setTimeout(() => setAddressValidation(null), 8000);
    }
    if (data.booking) {
      addJob(data.booking);
      setLastBooking(data.booking);
      setNeedsAddress(false);
      setNeedsContact(false);
    }
  }, [addJob]);

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
      handleData(data);
    } catch {
      setMessages([{
        role: 'assistant',
        content: "Hi! Welcome to FieldInsight. How can I help you today?",
        ts: new Date(),
      }]);
    }
    setIsLoading(false);
  }, [callApi, handleData]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;
    // Clear smart input state as soon as user responds
    setNeedsAddress(false);
    setNeedsContact(false);

    const userMsg = { role: 'user', content: text, ts: new Date() };
    const next = [...messages, userMsg];
    setMessages(next);
    setIsLoading(true);

    try {
      const data = await callApi(next);
      const assistantMsg = { role: 'assistant', content: data.text, ts: new Date() };
      setMessages(prev => [...prev, assistantMsg]);
      handleData(data);
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
  }, [messages, isLoading, callApi, handleData]);

  return { messages, isLoading, sendMessage, initiate, lastBooking, needsAddress, needsContact, addressValidation };
}
