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
/**
 * Client-side backstop for a worker outage: if no message (not even a replayed
 * one) arrives within this bound after connecting, the job is almost certainly
 * stuck with no consumer, so we surface a real error instead of spinning
 * forever. The server-side watchdog normally fires first (~10s) with a more
 * specific message; this covers the case where the SSE stream itself can't be
 * established. Generous enough not to false-positive on a slow-but-present
 * worker picking the job up.
 */
const MAX_QUEUE_WAIT_MS = 45_000;

export function useAgentStream(bookId: string | null) {
  const [connectedSessions, setConnectedSessions] = useState<Set<string>>(
    new Set()
  );
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  // Per-session "first message" timers guarding against a silent queue wait.
  const queueWaitTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const sessions = useAgentSessionStore((s) => s.sessions);
  const addMessage = useAgentSessionStore((s) => s.addMessage);
  const setSessionComplete = useAgentSessionStore((s) => s.setSessionComplete);
  const setSessionError = useAgentSessionStore((s) => s.setSessionError);
  const updateSessionCost = useAgentSessionStore((s) => s.updateSessionCost);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!bookId) return;

    const currentSources = eventSourcesRef.current;
    const queueWaitTimers = queueWaitTimersRef.current;

    // Clear a pending queue-wait timer for a session (message arrived / closing).
    const clearQueueWaitTimer = (sid: string) => {
      const timer = queueWaitTimers.get(sid);
      if (timer) {
        clearTimeout(timer);
        queueWaitTimers.delete(sid);
      }
    };

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

      // Arm the queue-wait backstop: if nothing arrives before the bound and the
      // session is still running, surface a worker-down error to the UI.
      queueWaitTimers.set(
        sid,
        setTimeout(() => {
          queueWaitTimers.delete(sid);
          const st = useAgentSessionStore.getState().sessions[sid];
          if (!st || st.status !== "running") return;
          setSessionError(
            sid,
            "Still waiting for background processing to start — no worker appears to be available. Please try again in a moment."
          );
          es.close();
          currentSources.delete(sid);
          setConnectedSessions((prev) => {
            const next = new Set(prev);
            next.delete(sid);
            return next;
          });
        }, MAX_QUEUE_WAIT_MS)
      );

      es.onopen = () => {
        setConnectedSessions((prev) => new Set([...prev, sid]));
      };

      es.onmessage = (event) => {
        // First byte from the stream means the worker is consuming — stand down.
        clearQueueWaitTimer(sid);
        try {
          const message = JSON.parse(event.data) as AgentStreamMessage;

          if (message.type === "complete") {
            // D-36: inline sessions replay a trailing 'complete' whose
            // metadata spreads the AgentResult — when that result says
            // success:false (provider failure), marking the session
            // "completed" would resurrect a failed run as a clean one. The
            // terminal SSE 'error' (already handled below) owns the UX; just
            // close the stream. Background completes never carry success:false
            // (the worker publishes no 'complete' for failed sessions).
            if (message.metadata?.success === false) {
              setSessionError(
                sid,
                typeof message.content === "string" && message.content
                  ? message.content
                  : "Session failed"
              );
              es.close();
              currentSources.delete(sid);
              setConnectedSessions((prev) => {
                const next = new Set(prev);
                next.delete(sid);
                return next;
              });
              return;
            }
            const result = message.metadata as unknown as AgentResult;
            const suggestedNext =
              (message.metadata?.suggestedNext as string[]) ?? [];
            // Extract post-session result metadata for the session results UI.
            // Two shapes exist: inline sessions nest it under metadata.resultMeta;
            // background sessions flatten it onto metadata directly.
            // endReason/wrapUpSummary are always top-level on metadata.
            const meta = (message.metadata ?? {}) as Record<string, unknown>;
            const rawMeta = meta.resultMeta as SessionResultMeta | undefined;
            const endReason =
              typeof meta.endReason === "string" ? meta.endReason : undefined;
            const wrapUpSummary =
              typeof meta.wrapUpSummary === "string" ? meta.wrapUpSummary : undefined;
            const hasMeta =
              rawMeta !== undefined ||
              typeof meta.findingsCreated === "number" ||
              endReason !== undefined ||
              wrapUpSummary !== undefined;
            const resultMeta: SessionResultMeta | undefined = hasMeta
              ? {
                  findingsCreated:
                    rawMeta?.findingsCreated ??
                    (typeof meta.findingsCreated === "number"
                      ? meta.findingsCreated
                      : 0),
                  statusAdvanced:
                    rawMeta?.statusAdvanced ?? meta.statusAdvanced === true,
                  newStatus:
                    rawMeta?.newStatus ??
                    (typeof meta.newStatus === "string" ? meta.newStatus : undefined),
                  betaGateResult:
                    rawMeta?.betaGateResult ??
                    (typeof meta.betaGateResult === "string"
                      ? meta.betaGateResult
                      : undefined),
                  endReason,
                  wrapUpSummary,
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
            const budgetUsd = message.metadata?.budgetUsd as number | undefined;
            if (costUsd != null) {
              updateSessionCost(sid, costUsd, budgetUsd);
            }
            // Don't add cost_update to messages array (it's metadata, not UI content)
            return;
          }

          // Budget/time warnings are informational — render in the stream but
          // NEVER treat as a session error (the session is still completing).
          if (message.type === "budget_warning") {
            addMessage(sid, message);
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
        clearQueueWaitTimer(sid);
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
        clearQueueWaitTimer(sid);
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
      for (const timer of queueWaitTimers.values()) {
        clearTimeout(timer);
      }
      queueWaitTimers.clear();
      setConnectedSessions(new Set());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId, Object.entries(sessions).map(([id, s]) => `${id}:${s.status}`).join(",")]);

  return { connectedSessions };
}
