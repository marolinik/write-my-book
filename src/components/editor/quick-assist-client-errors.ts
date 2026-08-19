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

/**
 * D-134 (F4+F10) — once the plan cap wall answers a 429, the writer is capped
 * for the rest of the window, so re-firing ghost text on every 1.5s pause only
 * loads the honest server and churns the UI for nothing (and the old Dismiss
 * was inert: the next pause re-hit the 429 and re-showed the banner). We record
 * the timestamp of the most recent 429 upgrade notice as `wallSince` and
 * suppress ghost fetches while this predicate holds. The suppression self-
 * expires after WALL_RETRY_MS so exactly one honest re-probe happens per
 * window: if still capped the banner re-shows (D-134's wall re-entry), if it
 * succeeds the banner + wall state clear. Dismiss hides the banner but leaves
 * `wallSince` set, so a dismiss can't re-arm the doomed loop.
 */
export const WALL_RETRY_MS = 5 * 60_000;

export function isWallSuppressionActive(
  wallSince: number | null,
  now: number
): boolean {
  if (wallSince === null) return false;
  return now - wallSince < WALL_RETRY_MS;
}
