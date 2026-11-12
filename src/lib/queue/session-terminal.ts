import { db } from "@/lib/db";
import { getAppConnection } from "@/lib/queue/connection";
import { agentQueue } from "@/lib/queue/agent-queue";
import { appendSessionEvent } from "@/lib/queue/session-stream";
import { agentErrorFrame } from "@/lib/agents/agent-error-frame";
import type { AgentErrorCode } from "@/lib/agents/agent-errors";

/** Rows in these states are finished; a retried job must not run them again. */
export const SESSION_TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "skipped"]);

const STATUS_TTL_SECONDS = 86_400;

/**
 * End a session the processor could not end itself (P1-15): a stall-limit
 * failure, a worker crash, a job that vanished. Flips a still-open row,
 * records the Redis status and publishes a terminal error, so the writer's
 * stream stops instead of spinning. Idempotent.
 */
export async function markSessionTerminal(
  sessionId: string,
  status: "failed",
  code: AgentErrorCode
): Promise<void> {
  await db.agentSession.updateMany({
    where: { id: sessionId, status: { in: ["queued", "running"] } },
    data: { status, completedAt: new Date() },
  });
  const redis = getAppConnection();
  await redis.set(`session:${sessionId}:status`, status, "EX", STATUS_TTL_SECONDS);
  await appendSessionEvent(
    redis,
    sessionId,
    JSON.stringify(agentErrorFrame(code)),
    STATUS_TTL_SECONDS
  );
}

/** BullMQ will not retry: the last attempt, or an error marked unrecoverable (stall limit). */
export function isFinalFailure(
  job: { attemptsMade: number; opts?: { attempts?: number } },
  error: Error
): boolean {
  if (error.name === "UnrecoverableError") return true;
  return job.attemptsMade >= (job.opts?.attempts ?? 1);
}

/** Running rows older than this whose job is not alive are stranded. */
const STRANDED_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * Fail sessions stuck in "running" whose BullMQ job is gone or no longer
 * active (P1-15). Returns the ids it failed. Run periodically by the worker.
 */
export async function reapStrandedSessions(now: Date = new Date()): Promise<string[]> {
  const stale = await db.agentSession.findMany({
    where: {
      status: "running",
      jobId: { not: null },
      startedAt: { lt: new Date(now.getTime() - STRANDED_AFTER_MS) },
    },
    select: { id: true, jobId: true },
  });
  const reaped: string[] = [];
  for (const row of stale) {
    const job = row.jobId ? await agentQueue.getJob(row.jobId) : undefined;
    const alive =
      job && ((await job.isActive()) || (await job.isWaiting()) || (await job.isDelayed()));
    if (alive) continue;
    await markSessionTerminal(
      row.id,
      "failed",
      "WORKER_RESTARTED"
    );
    reaped.push(row.id);
  }
  return reaped;
}
