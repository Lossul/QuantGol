import React, { useState, useRef, useEffect } from 'react';
import { BrainCircuit, Send } from 'lucide-react';
import type { MatchEvent } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Props {
  recentEvents: MatchEvent[];
}

export function InteractiveAnalyst({ recentEvents }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAiOnline, setIsAiOnline] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const apiBaseUrl =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    let isCancelled = false;
    const checkAiStatus = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/ai-status/`);
        if (!response.ok) {
          if (!isCancelled) setIsAiOnline(false);
          return;
        }
        const payload = (await response.json()) as { is_ready?: boolean };
        if (!isCancelled) {
          setIsAiOnline(Boolean(payload.is_ready));
        }
      } catch {
        if (!isCancelled) setIsAiOnline(false);
      }
    };

    void checkAiStatus();
    const intervalId = window.setInterval(checkAiStatus, 30000);
    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiBaseUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await fetch(`${apiBaseUrl}/api/analyze-tactics/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recentEvents: recentEvents.slice(-20),
          query: userMsg
        })
      });

      if (!response.ok) {
        setIsAiOnline(false);
        throw new Error('Analysis failed');
      }

      const data = await response.json();
      const assistantText = data.insight || data.analysis || 'No insight returned.';
      setIsAiOnline(!assistantText.toLowerCase().includes("ai offline"));
      setMessages(prev => [...prev, { role: 'assistant', content: assistantText }]);
    } catch (err) {
      console.error('Error fetching insight:', err);
      setIsAiOnline(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I could not analyze the game state right now. Please try again.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[420px] rounded-3xl border border-cyan-300/15 bg-[#07122b]/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-cyan-300/15 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-cyan-50 flex items-center gap-2">
          <BrainCircuit className="text-cyan-300" size={18} />
          Interactive Analyst
        </h3>
        <span
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            isAiOnline === false
              ? "bg-rose-500/20 text-rose-300"
              : isAiOnline === true
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-cyan-500/15 text-cyan-200"
          }`}
        >
          {isAiOnline === false ? "Offline" : isAiOnline === true ? "Online" : "Unknown"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-cyan-100/50 space-y-3">
            <BrainCircuit size={36} className="text-cyan-300/40" />
            <div className="text-center">
              <p className="font-medium text-cyan-100/70">Ask me anything about the match</p>
              <p className="text-sm mt-1 text-cyan-100/40">
                Example: &quot;Why is the home team dominating possession?&quot;
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-cyan-500/25 text-cyan-50 rounded-tr-sm'
                    : 'bg-[#061530] border border-cyan-300/15 text-cyan-100/90 rounded-tl-sm'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#061530] border border-cyan-300/15 text-cyan-100/50 px-4 py-3 rounded-2xl rounded-tl-sm flex space-x-2">
              <div className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce [animation-delay:150ms]" />
              <div className="w-2 h-2 bg-cyan-400/50 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      <form onSubmit={handleSubmit} className="p-3 border-t border-cyan-300/15">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={isLoading ? "Analyzing…" : "Ask about tactics, momentum, or players…"}
            className="flex-1 rounded-xl border border-cyan-300/20 bg-[#041028] px-4 py-2.5 text-sm text-cyan-100 placeholder:text-cyan-100/40 focus:outline-none focus:border-cyan-400/40 disabled:opacity-50 transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl border border-cyan-300/25 bg-cyan-500/20 px-4 py-2.5 text-cyan-50 hover:bg-cyan-500/30 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            aria-label="Send message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
