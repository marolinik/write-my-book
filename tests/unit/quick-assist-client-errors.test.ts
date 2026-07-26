import { describe, it, expect } from "vitest";
import {
  quickAssistErrorNotice,
  shouldSurfaceGhostError,
  isWallSuppressionActive,
  QUICK_ASSIST_FALLBACK_MESSAGE,
  QUICK_ASSIST_DISCLOSURE,
  GHOST_ERROR_COOLDOWN_MS,
  WALL_RETRY_MS,
} from "@/components/editor/quick-assist-client-errors";
import { MODEL_NO_QUICK_SUGGEST_CODE } from "@/lib/llm/quick-assist";

/**
 * D-129 — both quick-assist clients discarded every non-200 response, so the
 * server's honest 429 cap-wall copy, the D-118 422 backstop copy, and all 5xx
 * messages died before reaching the writer. These helpers map an error
 * response body to the writer-facing notice the clients now surface.
 */
describe("quickAssistErrorNotice — D-129 server copy reaches the writer", () => {
  it("surfaces the server's 429 cap-wall copy verbatim", () => {
    const notice = quickAssistErrorNotice({
      error:
        "Free plan includes 100 ghost-text completions per day. Resets at midnight UTC.",
      upgradeToTier: "indie",
      remainingToday: 0,
    });
    expect(notice.message).toBe(
      "Free plan includes 100 ghost-text completions per day. Resets at midnight UTC."
    );
    expect(notice.openSettings).toBe(false);
  });

  it("flags the MODEL_NO_QUICK_SUGGEST 422 for the settings deep-link", () => {
    const notice = quickAssistErrorNotice({
      error:
        "This model returns only internal reasoning at ghost-text's tiny budget, so it can't produce autocomplete suggestions.",
      code: MODEL_NO_QUICK_SUGGEST_CODE,
    });
    expect(notice.message).toContain("internal reasoning");
    expect(notice.openSettings).toBe(true);
  });

  it("falls back to generic copy when the body has no usable error string", () => {
    expect(quickAssistErrorNotice({}).message).toBe(
      QUICK_ASSIST_FALLBACK_MESSAGE
    );
    expect(quickAssistErrorNotice({ error: "   " }).message).toBe(
      QUICK_ASSIST_FALLBACK_MESSAGE
    );
    expect(quickAssistErrorNotice({ error: 42 }).message).toBe(
      QUICK_ASSIST_FALLBACK_MESSAGE
    );
  });

  it("falls back to generic copy for non-object bodies (failed JSON parse, null)", () => {
    expect(quickAssistErrorNotice(null).message).toBe(
      QUICK_ASSIST_FALLBACK_MESSAGE
    );
    expect(quickAssistErrorNotice(undefined).message).toBe(
      QUICK_ASSIST_FALLBACK_MESSAGE
    );
    expect(quickAssistErrorNotice("boom").message).toBe(
      QUICK_ASSIST_FALLBACK_MESSAGE
    );
  });

  it("never deep-links to settings without the machine-readable code", () => {
    expect(
      quickAssistErrorNotice({ error: "Failed to generate suggestion" })
        .openSettings
    ).toBe(false);
    expect(quickAssistErrorNotice(null).openSettings).toBe(false);
  });

  it("flags a cap-wall 429 (non-empty upgradeToTier) for the billing deep-link", () => {
    const notice = quickAssistErrorNotice({
      error: "Free plan includes 100 ghost-text completions per day.",
      upgradeToTier: "indie",
      remainingToday: 0,
    });
    expect(notice.upgrade).toBe(true);
    // The upgrade wall is distinct from the 422 settings deep-link.
    expect(notice.openSettings).toBe(false);
  });

  it("does not flag upgrade when upgradeToTier is empty, blank, or non-string", () => {
    expect(quickAssistErrorNotice({ error: "boom" }).upgrade).toBe(false);
    expect(
      quickAssistErrorNotice({ error: "boom", upgradeToTier: "   " }).upgrade
    ).toBe(false);
    expect(
      quickAssistErrorNotice({ error: "boom", upgradeToTier: 3 }).upgrade
    ).toBe(false);
    expect(quickAssistErrorNotice(null).upgrade).toBe(false);
  });
});

/**
 * Ghost text fires on every 1.5s typing pause — at the cap wall every pause
 * would re-toast the same 429 copy. `lastShown` maps each surfaced message to
 * the time it last appeared, so every distinct message keeps its OWN cooldown:
 * a single shared slot re-showed message A whenever a different message B
 * appeared between two A's. The gate shows a message once, then again only
 * after its own cooldown elapses.
 */
describe("shouldSurfaceGhostError — per-message toast throttle", () => {
  const t0 = 1_000_000;

  it("always surfaces the first error (empty map)", () => {
    expect(shouldSurfaceGhostError(new Map(), "cap wall", t0)).toBe(true);
  });

  it("suppresses an identical message inside the cooldown window", () => {
    const map = new Map([["cap wall", t0]]);
    expect(shouldSurfaceGhostError(map, "cap wall", t0 + 5_000)).toBe(false);
    expect(
      shouldSurfaceGhostError(map, "cap wall", t0 + GHOST_ERROR_COOLDOWN_MS - 1)
    ).toBe(false);
  });

  it("surfaces the same message again after the cooldown", () => {
    const map = new Map([["cap wall", t0]]);
    expect(
      shouldSurfaceGhostError(map, "cap wall", t0 + GHOST_ERROR_COOLDOWN_MS)
    ).toBe(true);
  });

  it("surfaces a different message immediately", () => {
    const map = new Map([["cap wall", t0]]);
    expect(shouldSurfaceGhostError(map, "server down", t0 + 1)).toBe(true);
  });

  it("keeps each message's cooldown independent — no single-slot re-show (alternating case)", () => {
    const map = new Map<string, number>();
    // Message A surfaced at t0.
    expect(shouldSurfaceGhostError(map, "A", t0)).toBe(true);
    map.set("A", t0);
    // Different message B surfaced at t0+2s.
    expect(shouldSurfaceGhostError(map, "B", t0 + 2_000)).toBe(true);
    map.set("B", t0 + 2_000);
    // A again at t0+3s: the OLD single slot (now holding B) would have re-shown
    // A; the per-message map keeps A's own cooldown, so it stays suppressed.
    expect(shouldSurfaceGhostError(map, "A", t0 + 3_000)).toBe(false);
  });
});

/**
 * D-134 (F4+F10) — at the plan cap wall, ghost text re-fired a doomed 429 on
 * every 1.5s typing pause (honest-server load + writer-visible churn) and the
 * Dismiss was inert. `isWallSuppressionActive` gates ghost fetches while a cap
 * wall was seen within the last WALL_RETRY_MS; after that the next pause is
 * allowed to re-probe (re-showing the banner if still capped, clearing it on
 * success).
 */
describe("isWallSuppressionActive — D-134 doomed-loop suppression with expiry", () => {
  const t0 = 5_000_000;

  it("exports a five-minute retry window", () => {
    expect(WALL_RETRY_MS).toBe(5 * 60_000);
  });

  it("is inactive when no wall has been seen (null)", () => {
    expect(isWallSuppressionActive(null, t0)).toBe(false);
  });

  it("is active from the instant the wall is seen", () => {
    expect(isWallSuppressionActive(t0, t0)).toBe(true);
  });

  it("stays active for the whole window (just before expiry)", () => {
    expect(isWallSuppressionActive(t0, t0 + WALL_RETRY_MS - 1)).toBe(true);
  });

  it("expires exactly at WALL_RETRY_MS so the next pause can re-probe", () => {
    expect(isWallSuppressionActive(t0, t0 + WALL_RETRY_MS)).toBe(false);
    expect(isWallSuppressionActive(t0, t0 + WALL_RETRY_MS + 1)).toBe(false);
  });
});

/**
 * D-127 — quick suggestions can silently run on a different (faster) model
 * than the writer's default. The point-of-use disclosure line must exist and
 * say so; both quick-assist surfaces render it.
 */
describe("QUICK_ASSIST_DISCLOSURE — D-127 point-of-use copy", () => {
  it("names the substitution in writer-facing terms", () => {
    expect(QUICK_ASSIST_DISCLOSURE.toLowerCase()).toContain("faster model");
    expect(QUICK_ASSIST_DISCLOSURE.length).toBeGreaterThan(20);
  });
});
