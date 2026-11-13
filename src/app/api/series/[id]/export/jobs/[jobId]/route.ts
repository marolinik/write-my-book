import type { NextRequest } from "next/server";
import { exportJobStatus } from "@/lib/import-export/export-job-status";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; jobId: string }> };

/** GET /api/series/:id/export/jobs/:jobId — the status of a queued series omnibus export (Wave 7). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id, jobId } = await params;
  return exportJobStatus("series", id, jobId);
}
