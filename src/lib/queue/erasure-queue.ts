import { Queue } from "bullmq";
import { getAppConnection } from "@/lib/queue/connection";

export const ERASURE_QUEUE_NAME = "account-erasure";

export interface ErasureJobData {
  erasureId: string;
}

export const erasureQueue = new Queue<ErasureJobData>(ERASURE_QUEUE_NAME, {
  connection: getAppConnection(),
  defaultJobOptions: {
    // About a day of retries (1 min doubling, capped by attempts); the worker's
    // reaper re-queues anything still pending after that.
    attempts: 12,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { age: 86_400, count: 100 },
    removeOnFail: { age: 30 * 86_400 },
  },
});

/**
 * Queue the erasure of a deleted account. The job id is the erasure row id,
 * so a Clerk redelivery or the reaper never runs it twice side by side. A job
 * that used up its attempts is retried rather than left failed.
 */
export async function enqueueErasure(erasureId: string): Promise<void> {
  const existing = await erasureQueue.getJob(erasureId);
  if (existing) {
    if (await existing.isFailed()) await existing.retry();
    return;
  }
  await erasureQueue.add("erase", { erasureId }, { jobId: erasureId });
}
