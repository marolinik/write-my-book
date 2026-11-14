import { UnrecoverableError, type Job } from "bullmq";
import { ExportConversionError } from "@/lib/import-export/export-pipeline";
import { runBookExport, runSeriesExport, type ExportResult } from "@/lib/import-export/run-export";
import { refreshExportSlot, releaseExportSlot, type ExportJobData } from "@/lib/queue/export-queue";

/** The failure codes a job reports; its reason never carries internal text. */
export const EXPORT_FAILURE_CODES = ["CONVERSION_FAILED", "EXPORT_FAILED"] as const;
export type ExportFailureCode = (typeof EXPORT_FAILURE_CODES)[number];

/**
 * Wave 7 / D22: one export job. The conversion runs here (pandoc/Typst in the
 * worker image), the file lands in the writer's storage as before, and the
 * job's return value is what the route used to answer. The writer's export
 * slot is freed whatever happens.
 */
export async function processExportJob(job: Job<ExportJobData>): Promise<ExportResult> {
  const { kind, userId, targetId, request } = job.data;
  const jobId = String(job.id);
  try {
    // The slot was sized for waiting in the queue; running, it lasts one run.
    await refreshExportSlot(userId, jobId).catch((error) =>
      console.error(`[ExportWorker] could not refresh the export slot of ${userId}:`, error)
    );
    return kind === "book"
      ? await runBookExport(userId, targetId, request)
      : await runSeriesExport(userId, targetId, request);
  } catch (error) {
    const code: ExportFailureCode = error instanceof ExportConversionError ? "CONVERSION_FAILED" : "EXPORT_FAILED";
    // The cause stays in the worker log; the job's reason is the code only.
    console.error(`[ExportWorker] ${kind} export ${job.id} failed (${code}):`, error);
    throw new UnrecoverableError(code);
  } finally {
    await releaseExportSlot(userId, jobId).catch((error) =>
      console.error(`[ExportWorker] could not free the export slot of ${userId}:`, error)
    );
  }
}

/** The code a failed job reports, from its failure reason. */
export function exportFailureCode(failedReason: string | undefined): ExportFailureCode {
  return failedReason === "CONVERSION_FAILED" ? "CONVERSION_FAILED" : "EXPORT_FAILED";
}
