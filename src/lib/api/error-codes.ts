/**
 * P1-26: the stable codes a failed request can carry. The server puts one in
 * the body next to its English `error` (kept for logs); the client turns the
 * code, or failing that the HTTP status, into the writer's language through
 * `t.apiErrors`. A code not listed here falls back to its status family.
 */
export const API_ERROR_CODES = [
  // Status families and transport.
  "GENERIC",
  "NETWORK",
  "INVALID_REQUEST",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "TOO_LARGE",
  "UNPROCESSABLE",
  "RATE_LIMITED",
  "PLAN_LIMIT",
  "SERVER_ERROR",
  "SERVICE_UNAVAILABLE",
  // Specific failures routes report today.
  "CONVERSION_FAILED",
  "EXPORT_FAILED",
  "ARCHIVE_TOO_LARGE",
  "TOO_MANY_ENTRIES",
  "CONVERSION_TIMEOUT",
  "UPLOAD_TOO_LARGE",
  "UPLOAD_UNREADABLE",
  "TURN_IN_PROGRESS",
  "QUEUE_UNAVAILABLE",
  "NO_PROVIDER_KEY",
  "DIRECT_KEY_UNSUPPORTED",
  "AI_RESPONSE_INVALID",
  "AI_GENERATION_FAILED",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

const CODES: ReadonlySet<string> = new Set(API_ERROR_CODES);

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && CODES.has(value);
}

/** The code a response stands for when its body names none. */
export function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) return "INVALID_REQUEST";
  if (status === 401 || status === 403) return "FORBIDDEN";
  if (status === 402) return "PLAN_LIMIT";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "TOO_LARGE";
  if (status === 422) return "UNPROCESSABLE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502 || status === 503 || status === 504) return "SERVICE_UNAVAILABLE";
  if (status >= 500) return "SERVER_ERROR";
  return "GENERIC";
}
