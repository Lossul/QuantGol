import { useState, useEffect } from "react";
import type { MatchEvent } from "../types";

export function useMatchStream(matchId: string) {
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);

  useEffect(() => {
    // Reset state when matchId changes
    setEvents([]);
    setIsConnected(false);
    setConnectionMessage(null);

    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
    let eventSource: EventSource | null = null;
    let isCancelled = false;

    const loadMatchData = async () => {
      try {
        const matchRes = await fetch(`${apiBase}/api/matches/${matchId}/`);
        if (!matchRes.ok) {
          throw new Error("Could not load match details");
        }

        const match = await matchRes.json();

        // Completed matches: load full historical snapshot, no stream needed.
        if (match?.status === "completed") {
          const eventsRes = await fetch(`${apiBase}/api/events/?match_id=${matchId}&limit=200`);
          if (!eventsRes.ok) {
            throw new Error("Could not load match events");
          }

          const payload = await eventsRes.json();
          const items = Array.isArray(payload) ? payload : [];
          if (!isCancelled) {
            setEvents(items);
            setIsConnected(true);
            setConnectionMessage("Loaded final match timeline.");
          }
          return;
        }

        // Scheduled matches have no events yet — don't open a stream or the
        // demo backend will generate fake goal events and corrupt the DB score.
        if (match?.status === "scheduled") {
          if (!isCancelled) {
            setEvents([]);
            setIsConnected(false);
            setConnectionMessage(null);
          }
          return;
        }

        // Live matches: real-time SSE stream.
        eventSource = new EventSource(`${apiBase}/api/stream/${matchId}/`);

        eventSource.onopen = () => {
          setIsConnected(true);
          setConnectionMessage(null);
        };

        eventSource.onerror = () => {
          setIsConnected(false);
          setConnectionMessage("Connection lost — retrying…");
        };

        eventSource.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data && data.event_type) {
              setEvents((prev) => [...prev, data]);
            }
          } catch (err) {
            console.error("SSE parse error", err);
          }
        };
      } catch {
        if (!isCancelled) {
          setIsConnected(false);
          setConnectionMessage("Could not load match stream.");
        }
      }
    };

    void loadMatchData();

    return () => {
      isCancelled = true;
      eventSource?.close();
    };
  }, [matchId]);

  return { events, isConnected, connectionMessage };
}
