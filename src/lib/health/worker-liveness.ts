/**
 * Worker-liveness probes.
 *
 * The web process enqueues background AI jobs (write-chapter, dev-edit, …) onto
 * a BullMQ queue, but a SEPARATE process (`npm run worker:start`) must be
 * running to consume them. If that process is down, jobs sit in `waiting`
 * forever with no error — a silent infinite spinner. These helpers let both the
 * readiness probe and the SSE stream detect a worker outage and surface it.
 */

import { agentQueue } from "@/lib/queue";

/** User-facing copy emitted when no worker is consuming jobs. */
export const WORKER_ABSENT_MESSAGE =
  "Background processing is unavailable — no worker is consuming jobs. Please try again once the worker is running.";

/** Number of BullMQ workers currently attached to the agent queue. */
export async function getActiveWorkerCount(): Promise<number> {
  const workers = await agentQueue.getWorkers();
  return workers.length;
}

/**
 * Readiness assertion: throws when no worker is attached to the queue, so
 * `/api/health/dependencies` returns 503 (monitoring goes red) on worker-down.
 */
export async function assertWorkerLiveness(): Promise<void> {
  const count = await getActiveWorkerCount();
  if (count === 0) {
    throw new Error(
      "No BullMQ worker is consuming agent jobs — start the worker process (npm run worker:start)"
    );
  }
}

/**
 * Stream watchdog decision: is this enqueued job stuck because nothing is
 * consuming it? True only when the job still exists, is `waiting`/`delayed`,
 * AND there are zero attached workers. A slow-but-present worker (workers > 0)
 * or an already-`active` job returns false, so we never false-positive on a
 * legitimately long-running tool call.
 */
export async function isJobStuckWithoutWorker(jobId: string): Promise<boolean> {
  const [job, workers] = await Promise.all([
    agentQueue.getJob(jobId),
    agentQueue.getWorkers(),
  ]);
  if (!job) return false;
  if (workers.length > 0) return false;
  const state = await job.getState();
  return state === "waiting" || state === "delayed";
}
