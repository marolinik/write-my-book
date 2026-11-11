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

import "./worker-env";
import "dotenv/config";
import { createServer } from "node:http";
import * as Sentry from "@sentry/node";
import { Worker } from "bullmq";
import { createRedisConnection } from "@/lib/queue/connection";
import { createErrorLogThrottle } from "@/lib/queue/error-log-throttle";
import { processAgentJob } from "@/lib/queue/agent-worker";
import { QUEUE_NAME } from "@/lib/queue/agent-queue";
import { processBatchDigestJob } from "@/lib/queue/batch-digest";
import { BATCH_DIGEST_QUEUE_NAME } from "@/lib/queue/batch-flow";
import { ERASURE_QUEUE_NAME, enqueueErasure } from "@/lib/queue/erasure-queue";
import { processErasureJob, reapPendingErasures } from "@/lib/queue/erasure-worker";
import { isFinalFailure, markSessionTerminal, reapStrandedSessions } from "@/lib/queue/session-terminal";
import { assertEnvReady } from "@/lib/env";
import { initGraphSchema } from "@/lib/graph";

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

// P1-20: the story graph's MERGEs rely on these uniqueness constraints;
// nothing created them before. Idempotent (IF NOT EXISTS).
initGraphSchema().catch((error: unknown) =>
  reportWorkerError("[Worker] graph schema init failed:", error as Error)
);

const connection = createRedisConnection();

// O6: while Docker was down this worker wrote ~80k identical ECONNREFUSED
// lines and would have sent the same flood to Sentry. One line per minute per
// distinct failure, with the swallowed count attached, keeps an outage legible
// without hiding a NEW error behind an old one.
const CONNECTION_LOG_WINDOW_MS = 60_000;
const errorLog = createErrorLogThrottle(CONNECTION_LOG_WINDOW_MS);

function reportWorkerError(label: string, error: Error) {
  const message = error.message ?? String(error);
  const suppressed = errorLog.suppressedCount(message);
  if (!errorLog.shouldLog(message, Date.now())) return;
  Sentry.captureException(error);
  console.error(
    `${label} ${message}` +
      (suppressed > 0 ? ` (${suppressed} identical since the last line)` : "")
  );
}

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
  reportWorkerError("[DigestWorker] Error:", error as Error);
});

digestWorker.on("failed", (job, error) => {
  Sentry.captureException(error, {
    extra: { jobId: job?.id, batchId: job?.data?.batchId },
  });
  console.error(`[DigestWorker] Job ${job?.id} failed:`, error.message);
});

// ── Account erasure Worker (P1-3) ────────────────────────────────────
// Retries each store of a deleted account until all are erased. Concurrency 1:
// erasures are rare and should not compete with writers' sessions.
const erasureWorker = new Worker(ERASURE_QUEUE_NAME, processErasureJob, {
  connection: createRedisConnection(),
  concurrency: 1,
});

erasureWorker.on("failed", (job, error) => {
  Sentry.captureException(error, { extra: { jobId: job?.id, attemptsMade: job?.attemptsMade } });
  console.error(`[ErasureWorker] Job ${job?.id} failed:`, error.message);
});

// The reaper re-queues erasures still pending: an enqueue lost to a Redis
// outage, or a job that used up its attempts.
const ERASURE_REAP_MS = 15 * 60_000;
const reapErasures = () =>
  reapPendingErasures(enqueueErasure).catch((error: unknown) =>
    reportWorkerError("[ErasureReaper] Error:", error as Error)
  );
void reapErasures();
const erasureReaper = setInterval(reapErasures, ERASURE_REAP_MS);

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
  // P1-15: a failure outside the processor (stall limit, crash) left the
  // session "running" forever with no terminal event. When BullMQ will not
  // retry, end the session here.
  if (job?.data?.sessionId && isFinalFailure(job, error)) {
    markSessionTerminal(
      job.data.sessionId,
      "failed",
      "This session could not finish in the background. Start it again to continue."
    ).catch((markError: unknown) =>
      reportWorkerError("[Worker] could not mark the failed session:", markError as Error)
    );
  }
});

// P1-15: sessions whose job vanished (a crash between attempts, a lost
// enqueue) are failed by a periodic reaper so no writer waits forever.
const STRANDED_REAP_MS = 5 * 60_000;
const strandedReaper = setInterval(() => {
  reapStrandedSessions().catch((error: unknown) =>
    reportWorkerError("[SessionReaper] Error:", error as Error)
  );
}, STRANDED_REAP_MS);

worker.on("error", (error) => {
  reportWorkerError("[Worker] Error:", error as Error);
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled — will be retried`);
});

// ── Liveness HTTP endpoint ───────────────────────────────────────────
// Docker has no window into BullMQ's process state, so when
// WORKER_HEALTH_PORT is set the worker serves a trivial HTTP probe: if this
// process can still answer, its event loop is alive and compose keeps it.
// Unset (local dev runs, unit tests) → no server, zero behavior change.
const WORKER_HEALTH_PORT = parsePositiveInt(process.env.WORKER_HEALTH_PORT, 0);
const healthServer = WORKER_HEALTH_PORT
  ? createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          status: "ok",
          queues: [QUEUE_NAME, BATCH_DIGEST_QUEUE_NAME],
        })
      );
    })
  : null;
if (healthServer) {
  healthServer.listen(WORKER_HEALTH_PORT, "0.0.0.0", () => {
    console.log(`[Worker] Health endpoint listening on :${WORKER_HEALTH_PORT}`);
  });
}

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
  clearInterval(erasureReaper);
  clearInterval(strandedReaper);
  await Promise.all([worker.close(), digestWorker.close(), erasureWorker.close()]);
  if (healthServer) {
    await new Promise<void>((resolve) => healthServer.close(() => resolve()));
  }
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
