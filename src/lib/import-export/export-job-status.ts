import { NextResponse } from "next/server";
import { readOwnExportJob, type ExportJobData } from "@/lib/queue/export-queue";
import { exportFailureCode } from "@/lib/queue/export-worker";
import { legacyRouteErrorResponse } from "@/lib/api/legacy-route-errors";
import { requireUser } from "@/lib/auth";

/**
 * Wave 7 / D22: the status of one export job, for the client that queued it.
 * Another writer's job, or a job of another book or series, is a 404. A
 * finished job answers the export result the POST used to answer; a failed
 * one answers its code only (never the converter's output).
 */
export async function exportJobStatus(kind: ExportJobData["kind"], targetId: string, jobId: string): Promise<NextResponse> {
  try {
    const user = await requireUser();
    const job = await readOwnExportJob(jobId, user.id, kind, targetId);
    if (!job) return NextResponse.json({ error: "Export not found", code: "EXPORT_FAILED" }, { status: 404 });

    const state = await job.getState();
    // Removed between the lookup and the state read: gone, not "queued".
    if (state === "unknown") return NextResponse.json({ error: "Export not found", code: "EXPORT_FAILED" }, { status: 404 });
    if (state === "completed") return NextResponse.json({ state, result: job.returnvalue });
    if (state === "failed") {
      return NextResponse.json({ state, code: exportFailureCode(job.failedReason) });
    }
    return NextResponse.json({ state: state === "active" ? "running" : "queued" });
  } catch (error) {
    return legacyRouteErrorResponse(error, `GET export job ${kind}`, "Failed to read the export");
  }
}
