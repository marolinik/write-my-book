import { ApiError } from "@/lib/api-client";

/** How often the client asks, and how long it waits before giving up. */
export const EXPORT_POLL_INTERVAL_MS = 2_000;
export const EXPORT_POLL_TIMEOUT_MS = 10 * 60_000;

/**
 * Wave 7 / D22: an export is a job; this waits for it the way the old POST
 * did, so the export screens keep their promise: it resolves with the export
 * result, or rejects with an ApiError carrying the code (CONVERSION_FAILED,
 * EXPORT_FAILED) that describeApiError renders in the writer's language.
 */
export async function awaitExportJob<T>(
  statusUrl: string,
  options: { intervalMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {}
): Promise<T> {
  const intervalMs = options.intervalMs ?? EXPORT_POLL_INTERVAL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? EXPORT_POLL_TIMEOUT_MS);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  while (Date.now() < deadline) {
    const res = await fetch(statusUrl, { cache: "no-store" });
    const body = (await res.json().catch(() => null)) as
      | { state?: string; result?: T; code?: string; error?: string }
      | null;
    if (!res.ok) throw new ApiError(body?.error ?? "Export failed", res.status, body);
    if (body?.state === "completed") return body.result as T;
    if (body?.state === "failed") {
      throw new ApiError("Export failed", 502, { code: body.code ?? "EXPORT_FAILED" });
    }
    await sleep(intervalMs);
  }
  throw new ApiError("Export timed out", 504, { code: "EXPORT_FAILED" });
}
