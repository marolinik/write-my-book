/**
 * Shared fetch utility for client-side API calls.
 * Extracts the duplicated fetchJson pattern from 10+ hook files.
 */

/**
 * Error thrown by fetchJson on non-OK responses. Subclasses Error with the
 * same message as before (body.error), so existing `.message` checks keep
 * working; callers needing the HTTP status or full body (e.g. 409
 * version-conflict payloads) can narrow with `instanceof ApiError`.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    if (res.status === 401) {
      // Redirect to login on auth failure
      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
      throw new Error("Unauthorized");
    }
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? `Request failed: ${res.status}`,
      res.status,
      body
    );
  }
  return res.json();
}

/**
 * Classifies a fetchJson failure as network-level (offline, DNS failure,
 * connection refused/aborted — the request never produced an HTTP response)
 * vs HTTP-level. `fetchJson` throws exactly two non-network shapes: ApiError
 * for any non-OK response, and the plain `Error("Unauthorized")` for 401 —
 * both mean the server WAS reached. Everything else (typically the TypeError
 * `fetch` rejects with) is classified network. Deliberately broad (spec
 * Tier 2.2 R2): misclassifying toward "network" only softens error UX to
 * "Sync pending" while the existing backoff retry keeps running.
 */
export function isNetworkError(e: unknown): boolean {
  if (e instanceof ApiError) return false;
  if (e instanceof Error && e.message === "Unauthorized") return false;
  return true;
}
