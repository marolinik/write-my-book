import { randomUUID } from "node:crypto";
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

/**
 * How long a queued export holds the writer's slot (it may wait behind other
 * writers' conversions), and how long once it runs (the converter is capped
 * well below this). A worker that dies mid-run frees the slot after the
 * running TTL. The client waits at least the queued TTL (await-export-job).
 */
export const EXPORT_SLOT_QUEUED_TTL_SECONDS = 30 * 60;
export const EXPORT_SLOT_RUNNING_TTL_SECONDS = 10 * 60;

const slotKey = (userId: string) => `export:running:${userId}`;

// Compare-and-act: only the job that owns the slot (its id is the value) may
// free or refresh it, so a stale job finishing late cannot free a newer one.
const RELEASE_IF_OWNER = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
const REFRESH_IF_OWNER = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("expire", KEYS[1], ARGV[2]) else return 0 end`;

/**
 * One export per writer at a time, across every web and worker process: the
 * slot is a Redis key set with NX whose value is the job's id. The id is a
 * random UUID (not BullMQ's sequential counter). Returns the job id, or null
 * when the writer already has an export queued or running.
 */
export async function enqueueExport(data: ExportJobData): Promise<{ jobId: string } | null> {
  const redis = getAppConnection();
  const jobId = randomUUID();
  const taken = await redis.set(slotKey(data.userId), jobId, "EX", EXPORT_SLOT_QUEUED_TTL_SECONDS, "NX");
  if (taken !== "OK") return null;
  try {
    await exportQueue.add("export", data, { jobId });
    return { jobId };
  } catch (error) {
    await releaseExportSlot(data.userId, jobId).catch(() => undefined);
    throw error;
  }
}

/** The worker, starting a job: the slot now lasts as long as one run may. */
export async function refreshExportSlot(userId: string, jobId: string): Promise<void> {
  await getAppConnection().eval(REFRESH_IF_OWNER, 1, slotKey(userId), jobId, EXPORT_SLOT_RUNNING_TTL_SECONDS);
}

/** Frees the writer's slot, only if this job still holds it. */
export async function releaseExportSlot(userId: string, jobId: string): Promise<void> {
  await getAppConnection().eval(RELEASE_IF_OWNER, 1, slotKey(userId), jobId);
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
