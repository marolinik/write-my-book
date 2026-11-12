import { ApiError } from "@/lib/api-client";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { codeForStatus, isApiErrorCode, type ApiErrorCode } from "./error-codes";

/**
 * P1-26: the one place a failed request becomes a sentence for the writer.
 * A body `code` wins; a plan or quota wall (`upgradeToTier`) is a plan limit
 * whatever its status; otherwise the HTTP status picks the family. The
 * server's English `error` is never returned.
 */

interface FailureShape {
  status: number;
  body: unknown;
}

function isFailureShape(value: unknown): value is FailureShape {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { status?: unknown }).status === "number" &&
    "body" in value
  );
}

function codeForFailure(status: number, body: unknown): ApiErrorCode {
  const fields = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  if (typeof fields.upgradeToTier === "string") return "PLAN_LIMIT";
  if (isApiErrorCode(fields.code)) return fields.code;
  return codeForStatus(status);
}

/** `fetch` rejects with a TypeError when the request never got a response. */
function isTransportFailure(error: unknown): boolean {
  return error instanceof TypeError && /fetch|network|load failed/i.test(error.message);
}

/**
 * A failure the client already said in the writer's language (a missing
 * prerequisite, a plan gate it explains itself). describeApiError shows its
 * message as it is instead of a family sentence.
 */
export class LocalizedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalizedError";
  }
}

export function describeApiError(error: unknown, t: UIStrings): string {
  if (error instanceof LocalizedError) return error.message;
  if (error instanceof ApiError || isFailureShape(error)) {
    return t.apiErrors[codeForFailure(error.status, error.body)];
  }
  if (isTransportFailure(error)) return t.apiErrors.NETWORK;
  // A plan wall thrown as a plain Error that only carries the tier to offer.
  if (error instanceof Error && typeof (error as { upgradeToTier?: unknown }).upgradeToTier === "string") {
    return t.apiErrors.PLAN_LIMIT;
  }
  return t.apiErrors.GENERIC;
}

/** An ApiError whose message is already the writer's sentence. */
export function apiFailure(status: number, body: unknown, t: UIStrings): ApiError {
  return new ApiError(t.apiErrors[codeForFailure(status, body)], status, body);
}

/**
 * The ApiError for a non-OK response, for hooks that call fetch directly.
 * Its message is the server's English text, for logs; show it to the writer
 * through describeApiError.
 */
export async function responseError(res: Response, body?: unknown): Promise<ApiError> {
  let payload = body;
  if (payload === undefined) {
    try {
      payload = typeof res.json === "function" ? await res.json() : {};
    } catch {
      payload = {};
    }
  }
  const fields = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
  const message = typeof fields.error === "string" ? fields.error : `Request failed: ${res.status}`;
  return new ApiError(message, res.status, payload);
}
