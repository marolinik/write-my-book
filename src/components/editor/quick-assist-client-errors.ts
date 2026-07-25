/**
 * D-129 — both quick-assist clients (ghost text, inline edit) discarded every
 * non-200 response, so the server's honest 429 cap-wall copy, the D-118 422
 * backstop copy, and 5xx messages never reached the writer: honest server,
 * mute client. These helpers turn an error-response body into the
 * writer-facing notice the clients surface.
 */
import { MODEL_NO_QUICK_SUGGEST_CODE } from "@/lib/llm/quick-assist";

export interface QuickAssistErrorNotice {
  /** Writer-facing copy — the server's own `error` string when present. */
  message: string;
  /** True for the MODEL_NO_QUICK_SUGGEST 422 — offer the settings deep-link. */
  openSettings: boolean;
}

export const QUICK_ASSIST_FALLBACK_MESSAGE =
  "AI suggestions are unavailable right now. Please try again in a moment.";

/**
 * D-127 — quick suggestions can run on a different model than the writer's
 * default (reasoning models are routed around at quick-assist budgets).
 * Point-of-use disclosure rendered by both quick-assist surfaces.
 */
export const QUICK_ASSIST_DISCLOSURE =
  "Quick suggestions may use a faster model than your default.";

export function quickAssistErrorNotice(body: unknown): QuickAssistErrorNotice {
  const rec =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const serverMessage =
    typeof rec.error === "string" && rec.error.trim().length > 0
      ? rec.error
      : null;
  return {
    message: serverMessage ?? QUICK_ASSIST_FALLBACK_MESSAGE,
    openSettings: rec.code === MODEL_NO_QUICK_SUGGEST_CODE,
  };
}

/**
 * Ghost text retriggers on every 1.5s typing pause — at the cap wall each
 * pause would re-toast the same 429 copy. Surface a message once, then again
 * only after the cooldown or when the message changes.
 */
export const GHOST_ERROR_COOLDOWN_MS = 60_000;

export interface GhostErrorMark {
  message: string;
  at: number;
}

export function shouldSurfaceGhostError(
  prev: GhostErrorMark | null,
  message: string,
  now: number
): boolean {
  if (!prev || prev.message !== message) return true;
  return now - prev.at >= GHOST_ERROR_COOLDOWN_MS;
}
