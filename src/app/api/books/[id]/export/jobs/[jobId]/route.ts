import type { NextRequest } from "next/server";
import { exportJobStatus } from "@/lib/import-export/export-job-status";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string; jobId: string }> };

/** GET /api/books/:id/export/jobs/:jobId — the status of a queued book export (Wave 7). */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id, jobId } = await params;
  return exportJobStatus("book", id, jobId);
}
