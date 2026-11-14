import { db } from "@/lib/db";
import { agentQueue, enqueueAgentJob, type AgentJobData } from "@/lib/queue/agent-queue";
import { utcDayKey } from "@/lib/billing/free-tier";

/**
 * The 1-based place in line of a waiting agent job, or null once it runs (or
 * is gone). Streamed to the writer so a job queued behind a busy worker reads
 * as "waiting", not as an outage (P1-16).
 */
export async function queuePosition(jobId: string): Promise<number | null> {
  // Wave 7: read the place in Redis. The wait list holds job ids with the
  // newest at the head (the worker takes from the tail); loading every
  // waiting job per stream every 10 s was O(N^2) under a backlog. A job that
  // is running, finished or gone is not in the list.
  const client = await agentQueue.client;
  const [index, length] = await Promise.all([client.lpos(agentQueue.keys.wait, jobId), client.llen(agentQueue.keys.wait)]);
  return index === null ? null : length - index;
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`enqueue timed out after ${ms} ms`)), ms));
}

/**
 * Enqueue a background session; if Redis is down or slow, undo the start
 * (P2-32): delete the session row (a "running" row with no job held the
 * writer's concurrency slot for two hours) and give back the Free session the
 * start recorded. The caller answers 503.
 */
export async function enqueueOrRollback(input: {
  sessionId: string;
  userId: string;
  jobData: AgentJobData;
  timeoutMs?: number;
}): Promise<{ ok: true; jobId: string } | { ok: false }> {
  try {
    const job = await Promise.race([enqueueAgentJob(input.jobData), timeout(input.timeoutMs ?? 5_000)]);
    const jobId = String(job.id);
    await db.agentSession.update({ where: { id: input.sessionId }, data: { jobId } });
    return { ok: true, jobId };
  } catch (error) {
    console.error(`[agent] enqueue failed for session ${input.sessionId}; rolling the start back:`, error);
    try {
      await db.agentSession.delete({ where: { id: input.sessionId } });
    } catch (deleteError) {
      console.error(`[agent] could not delete the unqueued session ${input.sessionId}:`, deleteError);
    }
    try {
      await db.freeTierUsage.updateMany({
        where: { userId: input.userId, day: utcDayKey(), agentSessions: { gt: 0 } },
        data: { agentSessions: { decrement: 1 } },
      });
    } catch (meterError) {
      console.error(`[agent] could not give back the Free session of ${input.userId}:`, meterError);
    }
    return { ok: false };
  }
}
