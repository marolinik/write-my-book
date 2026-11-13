import { Queue, type Job } from "bullmq";
import { getAppConnection } from "@/lib/queue/connection";
import type { ExportRequest } from "@/lib/import-export/run-export";

/**
 * Wave 7 / D22 (P2-76): exports run on the worker, not inside the HTTP
 * request. The route enqueues and answers 202 with the job id; the client
 * polls the job's status route.
 */
export const EXPORT_QUEUE_NAME = "export";

export interface ExportJobData {
  kind: "book" | "series";
  userId: string;
  /** The book or the series the export belongs to. */
  targetId: string;
  request: ExportRequest;
}

export const exportQueue = new Queue<ExportJobData>(EXPORT_QUEUE_NAME, {
  connection: getAppConnection(),
  defaultJobOptions: {
    // A conversion that failed fails for a reason a retry does not fix.
    attempts: 1,
    removeOnComplete: { age: 86_400, count: 1000 },
    removeOnFail: { age: 7 * 86_400 },
  },
});

/** The longest an export may hold the writer's slot if its worker dies mid-run. */
export const EXPORT_SLOT_TTL_SECONDS = 10 * 60;

const slotKey = (userId: string) => `export:running:${userId}`;

/**
 * One export per writer at a time, across every web and worker process: the
 * slot is a Redis key set with NX. Returns the job id, or null when the writer
 * already has an export queued or running.
 */
export async function enqueueExport(data: ExportJobData): Promise<{ jobId: string } | null> {
  const redis = getAppConnection();
  const taken = await redis.set(slotKey(data.userId), "1", "EX", EXPORT_SLOT_TTL_SECONDS, "NX");
  if (taken !== "OK") return null;
  try {
    const job = await exportQueue.add("export", data);
    return { jobId: String(job.id) };
  } catch (error) {
    await redis.del(slotKey(data.userId)).catch(() => undefined);
    throw error;
  }
}

/** The worker frees the writer's slot when the export finishes either way. */
export async function releaseExportSlot(userId: string): Promise<void> {
  await getAppConnection().del(slotKey(userId));
}

/** The job, only if it belongs to this writer and this book or series. */
export async function readOwnExportJob(
  jobId: string,
  userId: string,
  kind: ExportJobData["kind"],
  targetId: string
): Promise<Job<ExportJobData> | null> {
  const job = await exportQueue.getJob(jobId);
  if (!job) return null;
  if (job.data.userId !== userId || job.data.kind !== kind || job.data.targetId !== targetId) return null;
  return job;
}
