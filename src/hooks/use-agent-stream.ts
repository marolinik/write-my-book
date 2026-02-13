"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentStore, type SessionState } from "@/stores/agent-store";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents/types";

/**
 * Manages SSE connections for all running agent sessions.
 * Creates one EventSource per running session, routes messages
 * to the correct session in the store, and invalidates caches on completion.
 */
export function useAgentStream(bookId: string | null) {
  const [connectedSessions, setConnectedSessions] = useState<Set<string>>(
    new Set()
  );
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const sessions = useAgentStore((s) => s.sessions);
  const addMessage = useAgentStore((s) => s.addMessage);
  const setSessionComplete = useAgentStore((s) => s.setSessionComplete);
  const setSessionError = useAgentStore((s) => s.setSessionError);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!bookId) return;

    const currentSources = eventSourcesRef.current;

    // Find running sessions that need an EventSource
    const runningSessions = Object.values(sessions).filter(
      (s: SessionState) => s.status === "running" && s.bookId === bookId
    );

    // Create EventSources for new running sessions
    for (const session of runningSessions) {
      if (currentSources.has(session.sessionId)) continue;

      const url = `/api/books/${bookId}/agent/${session.sessionId}/stream`;
      const es = new EventSource(url);
      currentSources.set(session.sessionId, es);

      const sid = session.sessionId;

      es.onopen = () => {
        setConnectedSessions((prev) => new Set([...prev, sid]));
      };

      es.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as AgentStreamMessage;

          if (message.type === "complete") {
            const result = message.metadata as unknown as AgentResult;
            const suggestedNext =
              (message.metadata?.suggestedNext as string[]) ?? [];
            setSessionComplete(sid, result, suggestedNext);
            es.close();
            currentSources.delete(sid);
            setConnectedSessions((prev) => {
              const next = new Set(prev);
              next.delete(sid);
              return next;
            });

            // Invalidate caches
            queryClient.invalidateQueries({
              queryKey: ["book-documents", bookId],
            });
            queryClient.invalidateQueries({
              queryKey: ["style-profile", bookId],
            });
            queryClient.invalidateQueries({
              queryKey: ["editorial-summary", bookId],
            });
            queryClient.invalidateQueries({
              queryKey: ["books", bookId],
            });
            queryClient.invalidateQueries({
              queryKey: ["continuity-findings", bookId],
            });
            return;
          }

          if (message.type === "error") {
            setSessionError(sid, message.content);
            return;
          }

          addMessage(sid, message);
        } catch {
          // Ignore parse errors
        }
      };

      es.onerror = () => {
        setConnectedSessions((prev) => {
          const next = new Set(prev);
          next.delete(sid);
          return next;
        });
        es.close();
        currentSources.delete(sid);

        // IMPORTANT: Read FRESH state from the store, not the stale closure.
        // The onmessage handler may have already set the real error before
        // the SSE connection closed, so we only set a generic fallback
        // if no error was already recorded.
        const currentState = useAgentStore.getState();
        const s = currentState.sessions[sid];
        if (s && s.status === "running") {
          setSessionError(
            sid,
            "Connection to agent lost. The agent may have crashed or the server restarted. Try starting a new workflow."
          );
        }
      };
    }

    // Close EventSources for sessions that are no longer running
    for (const [sid, es] of currentSources) {
      const session = sessions[sid];
      if (!session || session.status !== "running") {
        es.close();
        currentSources.delete(sid);
      }
    }

    return () => {
      // Cleanup all on unmount
      for (const [, es] of currentSources) {
        es.close();
      }
      currentSources.clear();
      setConnectedSessions(new Set());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, Object.entries(sessions).map(([id, s]) => `${id}:${s.status}`).join(",")]);

  return { connectedSessions };
}
