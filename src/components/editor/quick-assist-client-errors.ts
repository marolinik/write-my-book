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
  /**
   * True when the server returned a non-empty `upgradeToTier` (the plan cap
   * wall) — offer the billing deep-link instead of settings.
   */
  upgrade: boolean;
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
  const upgrade =
    typeof rec.upgradeToTier === "string" &&
    rec.upgradeToTier.trim().length > 0;
  return {
    message: serverMessage ?? QUICK_ASSIST_FALLBACK_MESSAGE,
    openSettings: rec.code === MODEL_NO_QUICK_SUGGEST_CODE,
    upgrade,
  };
}

/**
 * Ghost text retriggers on every 1.5s typing pause — at the cap wall each
 * pause would re-toast the same 429 copy. `lastShown` maps each surfaced
 * message to the time it was last shown, so every distinct message keeps its
 * OWN cooldown. A single shared slot re-showed message A whenever a different
 * message B appeared between two A's; the per-message map suppresses that.
 * Surface a message when it has never been shown or its own cooldown elapsed.
 */
export const GHOST_ERROR_COOLDOWN_MS = 60_000;

export function shouldSurfaceGhostError(
  lastShown: ReadonlyMap<string, number>,
  message: string,
  now: number
): boolean {
  const last = lastShown.get(message);
  if (last === undefined) return true;
  return now - last >= GHOST_ERROR_COOLDOWN_MS;
}
