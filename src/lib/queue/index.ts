/**
 * Queue module barrel exports.
 *
 * Provides Redis connection factory, BullMQ queue, job data types,
 * and the worker processor function for background agent sessions.
 */

// ── Connection ────────────────────────────────────────────────────────
export {
  createRedisConnection,
  getAppConnection,
  getSubscriberConnection,
} from "./connection";

// ── Queue ─────────────────────────────────────────────────────────────
export {
  agentQueue,
  QUEUE_NAME,
  enqueueAgentJob,
} from "./agent-queue";
export type { AgentJobData } from "./agent-queue";

// ── Worker ────────────────────────────────────────────────────────────
export { processAgentJob } from "./agent-worker";
