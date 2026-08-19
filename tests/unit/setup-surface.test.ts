// tests/unit/setup-surface.test.ts
//
// D-160 / D-161 — one accounting for setup progress across every surface, and
// a resolvable "Start Writing" target out of the wizard.
import { describe, it, expect } from "vitest";
import {
  SETUP_STEP_TOTAL,
  countSetupStepsDone,
  setupSurfaceStatus,
  nextSetupWorkflow,
  isSetupPhaseNavKey,
  showNextStepBadge,
  pickStartWritingChapter,
  type SetupStepFlags,
} from "@/lib/onboarding/setup-surface";

const NONE: SetupStepFlags = {
  basicsComplete: false,
  importComplete: false,
  styleComplete: false,
  bibleComplete: false,
  archComplete: false,
};

const ALL: SetupStepFlags = {
  basicsComplete: true,
  importComplete: true,
  styleComplete: true,
  bibleComplete: true,
  archComplete: true,
};

/** The 41-series Owen state: basics saved, import skipped, style/bible/arch skipped. */
const OWEN: SetupStepFlags = { ...NONE, basicsComplete: true, importComplete: true };

describe("setup step accounting (D-160)", () => {
  it("has exactly 5 substantive steps — the Done confirmation is not counted", () => {
    expect(SETUP_STEP_TOTAL).toBe(5);
  });

  it("counts nothing done on a fresh book", () => {
    expect(countSetupStepsDone(NONE)).toBe(0);
  });

  it("counts every substantive step", () => {
    expect(countSetupStepsDone(ALL)).toBe(5);
  });

  it("reports the Owen skip-only walk as 2 of 5 — the SAME number the banner shows", () => {
    expect(countSetupStepsDone(OWEN)).toBe(2);
  });

  it("treats a resolved (skipped) import as a completed step, like the wizard step bar does", () => {
    expect(countSetupStepsDone({ ...NONE, importComplete: true })).toBe(1);
  });
});

describe("setupSurfaceStatus (D-160 sidebar)", () => {
  it("is none on a fresh, unfinished book", () => {
    expect(setupSurfaceStatus(NONE, false)).toBe("none");
  });

  it("is partial while steps are outstanding and the flow is unfinished", () => {
    expect(setupSurfaceStatus(OWEN, false)).toBe("partial");
  });

  it("is done once the writer finishes the wizard, even with steps skipped", () => {
    expect(setupSurfaceStatus(OWEN, true)).toBe("done");
  });

  it("is done when every step is complete even if the wizard flag was never set", () => {
    expect(setupSurfaceStatus(ALL, false)).toBe("done");
  });
});

describe("nextSetupWorkflow (D-160 nag gating)", () => {
  it("recommends style capture first on a fresh book", () => {
    expect(
      nextSetupWorkflow({
        setupComplete: false,
        hasFingerprint: false,
        hasStoryBible: false,
        hasArchitecture: false,
      })
    ).toBe("capture-style");
  });

  it("walks bible then architecture as artifacts land", () => {
    expect(
      nextSetupWorkflow({
        setupComplete: false,
        hasFingerprint: true,
        hasStoryBible: false,
        hasArchitecture: false,
      })
    ).toBe("create-story-bible");
    expect(
      nextSetupWorkflow({
        setupComplete: false,
        hasFingerprint: true,
        hasStoryBible: true,
        hasArchitecture: false,
      })
    ).toBe("build-architecture");
  });

  it("returns null once all setup artifacts exist", () => {
    expect(
      nextSetupWorkflow({
        setupComplete: false,
        hasFingerprint: true,
        hasStoryBible: true,
        hasArchitecture: true,
      })
    ).toBeNull();
  });

  it("stops soliciting setup once the writer declared setup complete", () => {
    expect(
      nextSetupWorkflow({
        setupComplete: true,
        hasFingerprint: false,
        hasStoryBible: false,
        hasArchitecture: false,
      })
    ).toBeNull();
  });
});

describe("Next-Step badge gating (D-160)", () => {
  it("marks setup and style as setup-phase surfaces", () => {
    expect(isSetupPhaseNavKey("setup")).toBe(true);
    expect(isSetupPhaseNavKey("style")).toBe(true);
    expect(isSetupPhaseNavKey("chapters")).toBe(false);
    expect(isSetupPhaseNavKey("editorial")).toBe(false);
  });

  it("shows the badge on the recommended surface before setup is finished", () => {
    expect(showNextStepBadge("style", "style", false)).toBe(true);
  });

  it("never shows the badge on a surface that is not the recommendation", () => {
    expect(showNextStepBadge("style", "chapters", false)).toBe(false);
    expect(showNextStepBadge("style", null, false)).toBe(false);
  });

  it("suppresses the setup-phase badge once setup is complete", () => {
    expect(showNextStepBadge("style", "style", true)).toBe(false);
    expect(showNextStepBadge("setup", "setup", true)).toBe(false);
  });

  it("keeps non-setup badges after setup completes", () => {
    expect(showNextStepBadge("chapters", "chapters", true)).toBe(true);
    expect(showNextStepBadge("editorial", "editorial", true)).toBe(true);
  });
});

describe("pickStartWritingChapter (D-161)", () => {
  it("returns null when there is no chapter to open", () => {
    expect(pickStartWritingChapter([])).toBeNull();
  });

  it("opens the lowest-numbered chapter regardless of array order", () => {
    const picked = pickStartWritingChapter([
      { id: "c3", chapterNumber: 3 },
      { id: "c1", chapterNumber: 1 },
      { id: "c2", chapterNumber: 2 },
    ]);
    expect(picked?.id).toBe("c1");
  });

  it("is stable for duplicate chapter numbers (first wins, no mutation of input)", () => {
    const input = [
      { id: "b", chapterNumber: 1 },
      { id: "a", chapterNumber: 1 },
    ];
    expect(pickStartWritingChapter(input)?.id).toBe("b");
    expect(input.map((c) => c.id)).toEqual(["b", "a"]);
  });
});
