/**
 * BullMQ queue definition for background agent sessions.
 *
 * AgentJobData is fully serializable — no class instances, no callbacks,
 * no API keys. The worker re-fetches keys from the database using userId.
 */

import { Queue } from "bullmq";
import { getAppConnection } from "./connection";

// ── Job Data Type ─────────────────────────────────────────────────────

/**
 * Serializable data for an agent job.
 * CRITICAL: No API keys, no client objects, no callback functions.
 * The worker reconstructs everything from these plain values.
 */
export interface AgentJobData {
  /** The AgentSession ID in the database. */
  sessionId: string;
  /** Book being operated on. */
  bookId: string;
  /** User who initiated the session — used to re-fetch API keys. */
  userId: string;
  /** Workflow being executed (e.g. "dev-edit", "write-chapter"). */
  workflowId: string;
  /** Agent type string (e.g. "writing-coach"). */
  agentType: string;
  /** Chapter number for chapter-scoped workflows. */
  chapterNumber?: number;
  /** Registry ID for the coach model (e.g. "anthropic/opus"). */
  coachRegistryId: string;
  /** API model ID for the coach (e.g. "claude-opus-4-20250514"). */
  coachModelId: string;
  /** Provider key string for error translation (e.g. "anthropic"). */
  providerKey: string;
  /** Book language code (e.g. "en", "sr"). */
  language: string;
  /** Book name for context. */
  bookName: string;
  /** Optional initial user message. */
  message?: string;
  /** Serialized JSON string of PageContext (avoid nested objects in job data). */
  pageContext?: string;
  /** Per-session cost limit in USD. */
  sessionCostLimit: number;
  /** Wall-clock timeout in milliseconds. */
  serverCeilingMs: number;
  /** Whether this is a conversational workflow. */
  isConversational: boolean;
}

// ── Queue Definition ──────────────────────────────────────────────────

export const QUEUE_NAME = "agent-sessions";

export const agentQueue = new Queue<AgentJobData>(QUEUE_NAME, {
  connection: getAppConnection(),
  defaultJobOptions: {
    /** Retry failed jobs up to 3 times with exponential backoff. */
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 30_000, // 30s base delay: 30s -> 60s -> 120s
    },
    /** Keep the last 100 completed jobs for inspection. */
    removeOnComplete: { count: 100 },
    /** Keep the last 50 failed jobs for debugging. */
    removeOnFail: { count: 50 },
  },
});

// ── Enqueue Helper ────────────────────────────────────────────────────

/**
 * Enqueue an agent job for background processing.
 * Uses sessionId as the BullMQ jobId for built-in deduplication —
 * if a job with the same sessionId is already queued, BullMQ rejects the duplicate.
 */
export async function enqueueAgentJob(data: AgentJobData) {
  return agentQueue.add("agent-session", data, {
    jobId: data.sessionId,
  });
}
