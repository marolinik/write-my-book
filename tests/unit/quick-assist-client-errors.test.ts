import { describe, it, expect } from "vitest";
import {
  quickAssistErrorNotice,
  shouldSurfaceGhostError,
  QUICK_ASSIST_FALLBACK_MESSAGE,
  QUICK_ASSIST_DISCLOSURE,
  GHOST_ERROR_COOLDOWN_MS,
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
});

/**
 * Ghost text fires on every 1.5s typing pause — at the cap wall every pause
 * would re-toast the same 429 copy. The gate shows a message once, then again
 * only after the cooldown or when the message changes.
 */
describe("shouldSurfaceGhostError — toast throttle", () => {
  const t0 = 1_000_000;

  it("always surfaces the first error", () => {
    expect(shouldSurfaceGhostError(null, "cap wall", t0)).toBe(true);
  });

  it("suppresses an identical message inside the cooldown window", () => {
    const prev = { message: "cap wall", at: t0 };
    expect(shouldSurfaceGhostError(prev, "cap wall", t0 + 5_000)).toBe(false);
    expect(
      shouldSurfaceGhostError(prev, "cap wall", t0 + GHOST_ERROR_COOLDOWN_MS - 1)
    ).toBe(false);
  });

  it("surfaces the same message again after the cooldown", () => {
    const prev = { message: "cap wall", at: t0 };
    expect(
      shouldSurfaceGhostError(prev, "cap wall", t0 + GHOST_ERROR_COOLDOWN_MS)
    ).toBe(true);
  });

  it("surfaces a different message immediately", () => {
    const prev = { message: "cap wall", at: t0 };
    expect(shouldSurfaceGhostError(prev, "server down", t0 + 1)).toBe(true);
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
