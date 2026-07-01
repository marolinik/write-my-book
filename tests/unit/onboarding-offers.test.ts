// tests/unit/onboarding-offers.test.ts
import { describe, it, expect } from "vitest";
import { computeOnboardingOffers, ONBOARDING_OFFERS } from "@/lib/onboarding/offers";

const NONE = new Set<string>();
const base = {
  wordCount: 0,
  previousWordCount: null as number | null,
  existingArtifactTypes: NONE,
  dismissed: NONE,
  toasted: NONE,
  setupComplete: false,
};

describe("computeOnboardingOffers", () => {
  it("has three offers ordered by ascending threshold", () => {
    expect(ONBOARDING_OFFERS.map((o) => o.threshold)).toEqual([2000, 5000, 10000]);
  });

  it("toasts nothing on first eval (previousWordCount null), even past a threshold", () => {
    const r = computeOnboardingOffers({ ...base, wordCount: 2500, previousWordCount: null });
    expect(r.toast).toBeNull();
    expect(r.pending.map((o) => o.workflowId)).toEqual(["capture-style"]);
  });

  it("toasts on a live crossing of exactly the threshold", () => {
    const r = computeOnboardingOffers({ ...base, previousWordCount: 1999, wordCount: 2000 });
    expect(r.toast?.workflowId).toBe("capture-style");
  });

  it("does not toast below the threshold", () => {
    const r = computeOnboardingOffers({ ...base, previousWordCount: 1000, wordCount: 1999 });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });

  it("toasts the LOWEST-threshold offer when several cross at once; rest go to pending", () => {
    const r = computeOnboardingOffers({ ...base, previousWordCount: 0, wordCount: 12000 });
    expect(r.toast?.workflowId).toBe("capture-style");
    expect(r.pending.map((o) => o.workflowId)).toEqual([
      "capture-style", "build-architecture", "create-story-bible",
    ]);
  });

  it("does not re-toast an already-toasted offer even on dip-and-re-cross", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 1500, wordCount: 2100,
      toasted: new Set(["capture-style"]),
    });
    expect(r.toast).toBeNull();
    expect(r.pending.map((o) => o.workflowId)).toEqual(["capture-style"]); // still on badge
  });

  it("suppresses an offer whose artifact already exists (toast + pending)", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 1999, wordCount: 2000,
      existingArtifactTypes: new Set(["FINGERPRINT"]),
    });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });

  it("dismissed offers are excluded from pending (badge) and never toast", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 1999, wordCount: 2000,
      dismissed: new Set(["capture-style"]),
    });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });

  it("ignored (toasted, not dismissed) offers stay on the badge", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: null, wordCount: 3000,
      toasted: new Set(["capture-style"]),
    });
    expect(r.pending.map((o) => o.workflowId)).toEqual(["capture-style"]);
  });

  it("setupComplete suppresses everything", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 0, wordCount: 12000, setupComplete: true,
    });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });
});
