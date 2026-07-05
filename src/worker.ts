/**
 * Standalone BullMQ worker process for background agent sessions.
 *
 * Runs as a separate Node.js process from the Next.js app.
 * Provides resilience (server restart doesn't kill running workflows)
 * and isolation (worker crash doesn't take down the web app).
 *
 * Usage:
 *   Development: npx tsx src/worker.ts
 *   Production:  node dist-worker/src/worker.js
 */

import "dotenv/config";
import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import { createRedisConnection } from "@/lib/queue/connection";
import { processAgentJob } from "@/lib/queue/agent-worker";
import { QUEUE_NAME } from "@/lib/queue/agent-queue";
import { processBatchDigestJob } from "@/lib/queue/batch-digest";
import { BATCH_DIGEST_QUEUE_NAME } from "@/lib/queue/batch-flow";
import { assertEnvReady } from "@/lib/env";

// ── Error monitoring ─────────────────────────────────────────────────
// The worker is a separate Node process, uncovered by the Next.js
// instrumentation hook, so it needs its own Sentry.init. No-op unless a DSN
// is configured (enabled gate), so local/dev runs are unaffected.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});

assertEnvReady("worker");

const connection = createRedisConnection();

// Agent-session concurrency. Defaults to 2 (v1 keeps the overnight batch to
// ~2-at-a-time per BATCH-SPEC §1.4/§9.4) but is env-configurable for operators
// who want to widen throughput. A non-numeric / non-positive value falls back.
function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
const AGENT_CONCURRENCY = parsePositiveInt(process.env.AGENT_WORKER_CONCURRENCY, 2);

const worker = new Worker(QUEUE_NAME, processAgentJob, {
  connection,
  concurrency: AGENT_CONCURRENCY,
  stalledInterval: 60_000, // Check for stalled jobs every 60s
  lockDuration: 300_000, // 5 min lock before considering stalled
});

// ── Batch digest (fan-in) Worker ─────────────────────────────────────
// Second Worker on the NEW `batch-digest` queue for FlowProducer parent jobs.
// Shares this ONE process with the agent Worker above — the digest processor is
// defensively wrapped and never throws (BATCH-SPEC §3.5), so a bad digest can
// never trip the uncaughtException handler and take the agent Worker down.
const digestWorker = new Worker(BATCH_DIGEST_QUEUE_NAME, processBatchDigestJob, {
  connection: createRedisConnection(),
  concurrency: 2,
});

digestWorker.on("error", (error) => {
  Sentry.captureException(error);
  console.error("[DigestWorker] Error:", error);
});

digestWorker.on("failed", (job, error) => {
  Sentry.captureException(error, {
    extra: { jobId: job?.id, batchId: job?.data?.batchId },
  });
  console.error(`[DigestWorker] Job ${job?.id} failed:`, error.message);
});

worker.on("completed", (job) => {
  console.log(
    `[Worker] Job ${job.id} completed (session: ${job.data.sessionId})`
  );
});

worker.on("failed", (job, error) => {
  Sentry.captureException(error, {
    extra: {
      jobId: job?.id,
      sessionId: job?.data?.sessionId,
      attemptsMade: job?.attemptsMade,
    },
  });
  console.error(
    `[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
    error.message
  );
});

worker.on("error", (error) => {
  Sentry.captureException(error);
  console.error("[Worker] Error:", error);
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled — will be retried`);
});

// ── Process-level error capture ──────────────────────────────────────
// Without these, a rejected promise or thrown-outside-a-handler error would
// vanish (or crash) with no Sentry breadcrumb.

process.on("unhandledRejection", (reason) => {
  Sentry.captureException(reason);
  console.error("[Worker] Unhandled promise rejection:", reason);
});

process.on("uncaughtException", (error) => {
  Sentry.captureException(error);
  console.error("[Worker] Uncaught exception:", error);
  // The process state is now undefined. Flush Sentry, then EXIT so a supervisor
  // restarts a clean worker. Staying alive would leave a wedged process that is
  // still an attached BullMQ worker (getWorkers() > 0), silently defeating the
  // S8 liveness probe / SSE watchdog. Crash-and-restart is the safe choice.
  Sentry.close(2000).finally(() => process.exit(1));
});

// ── Graceful shutdown ────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  console.log(`[Worker] ${signal} received, closing gracefully...`);
  await Promise.all([worker.close(), digestWorker.close()]);
  connection.disconnect();
  console.log("[Worker] Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(
  `[Worker] Listening on queues: ${QUEUE_NAME} (concurrency: ${AGENT_CONCURRENCY}), ` +
    `${BATCH_DIGEST_QUEUE_NAME} (concurrency: 2)`
);
