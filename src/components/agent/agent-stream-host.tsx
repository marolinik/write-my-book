"use client";

/**
 * Keeps the live agent streams open for the book (or series) on screen,
 * whatever the agent panel is doing.
 *
 * P5-S12: the streams used to live inside AgentPanel, which unmounts whenever
 * the panel is collapsed to the bubble — the default while writing. A run that
 * asked for approval then streamed into nothing: no message reached the store,
 * so ApprovalNotifier had nothing to announce, and the gate expired as a
 * rejection ten minutes later. Mounted once in the app shell, next to
 * ApprovalNotifier, so the two work in every panel mode.
 */

import { useParams } from "next/navigation";
import { useAgentStream } from "@/hooks/use-agent-stream";

export function AgentStreamHost() {
  const params = useParams();
  const bookId = typeof params?.bookId === "string" ? params.bookId : null;
  const seriesId = typeof params?.seriesId === "string" ? params.seriesId : null;
  useAgentStream(bookId, seriesId);
  return null;
}
