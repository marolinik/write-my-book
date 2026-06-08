"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAgentSessionStore, type SessionState, type SessionResultMeta } from "@/stores/agent-session-store";
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
  const sessions = useAgentSessionStore((s) => s.sessions);
  const addMessage = useAgentSessionStore((s) => s.addMessage);
  const setSessionComplete = useAgentSessionStore((s) => s.setSessionComplete);
  const setSessionError = useAgentSessionStore((s) => s.setSessionError);
  const updateSessionCost = useAgentSessionStore((s) => s.updateSessionCost);
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
            // Extract post-session result metadata for the session results UI
            const rawMeta = (message.metadata as Record<string, unknown>)?.resultMeta as SessionResultMeta | undefined;
            const resultMeta: SessionResultMeta | undefined = rawMeta
              ? {
                  findingsCreated: rawMeta.findingsCreated ?? 0,
                  statusAdvanced: rawMeta.statusAdvanced ?? false,
                  newStatus: rawMeta.newStatus,
                  betaGateResult: rawMeta.betaGateResult,
                }
              : undefined;
            setSessionComplete(sid, result, suggestedNext, resultMeta);
            es.close();
            currentSources.delete(sid);
            setConnectedSessions((prev) => {
              const next = new Set(prev);
              next.delete(sid);
              return next;
            });

            // Invalidate caches — use keys that match actual useQuery definitions
            queryClient.invalidateQueries({ queryKey: ["book-documents", bookId] });
            queryClient.invalidateQueries({ queryKey: ["style-profile", bookId] });
            queryClient.invalidateQueries({ queryKey: ["editorial", bookId] });
            queryClient.invalidateQueries({ queryKey: ["books", bookId] });
            queryClient.invalidateQueries({ queryKey: ["chapters", bookId] });
            queryClient.invalidateQueries({ queryKey: ["chapter-content", bookId] });
            queryClient.invalidateQueries({ queryKey: ["document-content", bookId] });
            queryClient.invalidateQueries({ queryKey: ["wiki", bookId] });
            queryClient.invalidateQueries({ queryKey: ["insights", bookId] });
            queryClient.invalidateQueries({ queryKey: ["writing-stats", bookId] });
            return;
          }

          if (message.type === "cost_update") {
            const costUsd = message.metadata?.costUsd as number | undefined;
            if (costUsd != null) {
              updateSessionCost(sid, costUsd);
            }
            // Don't add cost_update to messages array (it's metadata, not UI content)
            return;
          }

          if (message.type === "error") {
            const content = message.content ?? "";

            // Detect key revocation/invalidation from error messages.
            // error-translator.ts produces messages containing these patterns
            // when an LLM provider rejects the API key mid-session.
            const isKeyError =
              /API key.*(invalid|revoked|expired|no longer valid)/i.test(content) ||
              /check your key|update.*in Settings|authentication.*failed/i.test(content) ||
              /401|Unauthorized/i.test(content);

            if (isKeyError) {
              // Invalidate API keys cache so settings page refreshes key status
              queryClient.invalidateQueries({ queryKey: ["api-keys"] });
            }

            setSessionError(sid, content);
            // Still add to messages for display in message stream
            addMessage(sid, message);
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
        const currentState = useAgentSessionStore.getState();
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
