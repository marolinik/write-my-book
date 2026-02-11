"use client";

import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/agent-store";
import type { AgentStreamMessage, AgentResult } from "@/lib/agents/types";

/**
 * Connects to the SSE stream for an active agent session.
 * Parses events and pushes them to the agent store.
 */
export function useAgentStream(
  bookId: string | null,
  sessionId: string | null
) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const addMessage = useAgentStore((s) => s.addMessage);
  const setComplete = useAgentStore((s) => s.setComplete);
  const setError = useAgentStore((s) => s.setError);

  useEffect(() => {
    if (!bookId || !sessionId) {
      setIsConnected(false);
      return;
    }

    const url = `/api/books/${bookId}/agent/${sessionId}/stream`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as AgentStreamMessage;

        if (message.type === "complete") {
          const result = message.metadata as unknown as AgentResult;
          const suggestedNext =
            (message.metadata?.suggestedNext as string[]) ?? [];
          setComplete(result, suggestedNext);
          es.close();
          setIsConnected(false);
          return;
        }

        if (message.type === "error") {
          setError(message.content);
          return;
        }

        addMessage(message);
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setIsConnected(false);
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [bookId, sessionId, addMessage, setComplete, setError]);

  return { isConnected };
}
