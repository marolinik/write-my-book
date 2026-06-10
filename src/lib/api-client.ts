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
