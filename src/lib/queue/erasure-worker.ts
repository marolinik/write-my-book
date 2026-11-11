import type { Job } from "bullmq";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteBookChunks } from "@/lib/vector";
import { clearBookGraph } from "@/lib/graph";
import { getStorage } from "@/lib/storage";
import { purgeStorage } from "@/lib/storage/purge";
import { stripe } from "@/lib/billing";
import { getAppConnection } from "@/lib/queue/connection";
import { agentQueue } from "@/lib/queue/agent-queue";
import type { ErasureJobData } from "@/lib/queue/erasure-queue";

interface ErasureRow {
  id: string;
  userId: string;
  bookIds: string[];
  sessionIds: string[];
  stripeCustomerId: string | null;
  doneStores: string[];
  status: string;
  attempts: number;
}

type Step = { store: string; run: () => Promise<void> };

function isMissing(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === "resource_missing";
}

/** Every store a deleted account leaves data in, keyed so a retry can skip what is done. */
function stepsFor(row: ErasureRow): Step[] {
  const steps: Step[] = [];
  for (const bookId of row.bookIds) {
    steps.push({ store: `chunks:${bookId}`, run: () => deleteBookChunks(bookId) });
    steps.push({ store: `graph:${bookId}`, run: () => clearBookGraph(bookId) });
  }
  steps.push({
    store: "storage",
    run: async () => {
      // An empty prefix would be the whole bucket.
      if (!row.userId) throw new Error("refused an empty user id");
      const { failed } = await purgeStorage(getStorage(row.userId));
      if (failed > 0) throw new Error(`${failed} stored object(s) could not be removed`);
    },
  });
  steps.push({
    // P2-33: streamed prose and the writer's message text live in Redis keys
    // and in retained queue jobs; neither is reached by the database cascade.
    store: "redis",
    run: async () => {
      const redis = getAppConnection();
      for (const sessionId of row.sessionIds) {
        const keys = await redis.keys(`session:${sessionId}:*`);
        await redis.del(...keys, `approval:${sessionId}`);
        const job = await agentQueue.getJob(sessionId);
        if (job) await job.remove();
      }
    },
  });
  steps.push({
    // P2-39: the customer holds the name, email and card fingerprint.
    store: "stripe",
    run: async () => {
      if (!row.stripeCustomerId || !stripe) return;
      try {
        await stripe.customers.del(row.stripeCustomerId);
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
    },
  });
  return steps;
}

/**
 * Erase a deleted account's data from every store the database cascade does
 * not reach (P1-3). Each store that succeeds is recorded, so a retry only
 * redoes what failed; any failure throws, and BullMQ retries the job.
 */
export async function processErasureJob(job: Job<ErasureJobData>): Promise<void> {
  const { erasureId } = job.data;
  const row = (await db.accountErasure.findUnique({ where: { id: erasureId } })) as ErasureRow | null;
  if (!row || row.status === "done") return;

  const done = new Set(row.doneStores);
  const failures: string[] = [];
  for (const step of stepsFor(row)) {
    if (done.has(step.store)) continue;
    try {
      await step.run();
      done.add(step.store);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${step.store}: ${message}`);
      logger.error(`[erasure] ${step.store} not erased for user ${row.userId}`, error);
    }
  }

  if (failures.length > 0) {
    await db.accountErasure.update({
      where: { id: erasureId },
      data: { doneStores: [...done], attempts: row.attempts + 1, lastError: failures.join("; ") },
    });
    throw new Error(`Erasure ${erasureId} incomplete: ${failures.join("; ")}`);
  }

  await db.accountErasure.update({
    where: { id: erasureId },
    data: {
      doneStores: [...done],
      attempts: row.attempts + 1,
      lastError: null,
      status: "done",
      completedAt: new Date(),
    },
  });
}

/**
 * Re-queue erasures still pending after `olderThanMs`: an enqueue lost to a
 * Redis outage, or a job that used up its attempts. Run by the worker.
 */
export async function reapPendingErasures(
  enqueue: (erasureId: string) => Promise<void>,
  olderThanMs = 10 * 60_000
): Promise<number> {
  const stale = await db.accountErasure.findMany({
    where: { status: "pending", createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    select: { id: true },
  });
  for (const { id } of stale) await enqueue(id);
  return stale.length;
}
