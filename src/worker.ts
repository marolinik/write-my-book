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
import { Worker } from "bullmq";
import { createRedisConnection } from "@/lib/queue/connection";
import { processAgentJob } from "@/lib/queue/agent-worker";
import { QUEUE_NAME } from "@/lib/queue/agent-queue";

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
  console.error(
    `[Worker] Job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts?.attempts}):`,
    error.message
  );
});

worker.on("error", (error) => {
  console.error("[Worker] Error:", error);
});

worker.on("stalled", (jobId) => {
  console.warn(`[Worker] Job ${jobId} stalled — will be retried`);
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
