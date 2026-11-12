import type { UIStrings } from "@/lib/i18n/ui-strings/types";

/** The body POST /api/memory/rebuild answers with on a 200. */
export interface RebuildResponse {
  success?: boolean;
  chunksIndexed?: number;
  failedDocuments?: number;
}

export interface RebuildOutcome {
  ok: boolean;
  text: string;
}

/**
 * P2-42 / review I-3: a rebuild that could not embed some documents answers
 * 200 with success:false. It is said as a failure, with the count, so the
 * writer does not read "rebuilt successfully" over a half-empty memory.
 */
export function rebuildOutcome(data: RebuildResponse, t: UIStrings): RebuildOutcome {
  if (data.success === true) return { ok: true, text: t.toasts.memoryIndexRebuilt };
  const failed = typeof data.failedDocuments === "number" && data.failedDocuments > 0 ? data.failedDocuments : 1;
  return { ok: false, text: t.toasts.memoryIndexRebuildPartial.replace("{count}", String(failed)) };
}
