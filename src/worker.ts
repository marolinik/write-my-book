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

const worker = new Worker(QUEUE_NAME, processAgentJob, {
  connection,
  concurrency: 2,
  stalledInterval: 60_000, // Check for stalled jobs every 60s
  lockDuration: 300_000, // 5 min lock before considering stalled
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
});

// ── Graceful shutdown ────────────────────────────────────────────────

const shutdown = async (signal: string) => {
  console.log(`[Worker] ${signal} received, closing gracefully...`);
  await worker.close();
  connection.disconnect();
  console.log("[Worker] Shutdown complete");
  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

console.log(`[Worker] Listening on queue: ${QUEUE_NAME} (concurrency: 2)`);
