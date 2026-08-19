import { describe, it, expect } from "vitest";
import {
  continuityIssueSignature,
  toContinuityFlags,
} from "@/lib/continuity/continuity-flags";
import type { ConsistencyIssue } from "@/lib/graph/types";

/**
 * D-79: dead_character_reappears suppression key churned so [Intentional] never
 * stuck for a legitimate resurrection arc.
 *
 * Root cause: runConsistencyChecks returns chapters = [deathChapter,
 * ...postDeathChapters], and postDeathChapters GROWS by one every chapter the
 * resurrected character keeps acting. continuityIssueSignature hashed
 * `type|entities|chapters`, so the signature changed every chapter. The writer's
 * [Intentional] dismissal stored the OLD signature, so the NEW signature never
 * matched intentionalSignatures — a fresh, un-dismissable CRITICAL inline flag
 * fired every single chapter, forever.
 *
 * Fix (continuity-flags.ts): the IDENTITY of this contradiction is the death
 * anchor (which character, which death chapter) — the ever-growing reappearance
 * list is EVIDENCE, not identity. Anchor the signature to the earliest chapter
 * (the death) for dead_character_reappears only; every other flag type keeps the
 * full (bounded) chapter set. Display / [Go to Ch N] still use the full list.
 */

function deadReappear(
  character: string,
  deathChapter: number,
  reappearChapters: number[]
): ConsistencyIssue {
  return {
    type: "dead_character_reappears",
    severity: "critical",
    description: `Character "${character}" dies in chapter ${deathChapter} but participates in events in chapters ${reappearChapters.join(", ")}.`,
    entities: [character],
    chapters: [deathChapter, ...reappearChapters],
  };
}

describe("D-79: dead_character_reappears suppression identity is stable across a growing arc", () => {
  it("signature is INVARIANT as the reappearance list grows (death anchor only)", () => {
    const ch6 = deadReappear("Corvin", 4, [6]);
    const ch7 = deadReappear("Corvin", 4, [6, 7]);
    const ch8 = deadReappear("Corvin", 4, [6, 7, 8]);

    const sig = continuityIssueSignature(ch6);
    expect(continuityIssueSignature(ch7)).toBe(sig);
    expect(continuityIssueSignature(ch8)).toBe(sig);
  });

  it("an [Intentional] dismissal at ch6 STILL suppresses the same arc at ch7 (no new active flag)", () => {
    const dismissedAt6 = continuityIssueSignature(deadReappear("Corvin", 4, [6]));
    const intentionalSignatures = new Set([dismissedAt6]);

    // Later scan: Corvin keeps appearing (ch7 added). Must remain suppressed.
    const flags = toContinuityFlags({
      issues: [deadReappear("Corvin", 4, [6, 7])],
      intentionalSignatures,
    });
    expect(flags).toHaveLength(0);
  });

  it("a DIFFERENT character's death is NOT suppressed by another arc's dismissal", () => {
    const dismissed = continuityIssueSignature(deadReappear("Corvin", 4, [6]));
    const flags = toContinuityFlags({
      issues: [deadReappear("Mara", 5, [7])],
      intentionalSignatures: new Set([dismissed]),
    });
    expect(flags).toHaveLength(1);
    expect(flags[0].type).toBe("dead_character_reappears");
    expect(flags[0].entities).toEqual(["Mara"]);
  });

  it("a DIFFERENT death chapter for the same character is a distinct contradiction (own flag)", () => {
    const dismissed = continuityIssueSignature(deadReappear("Corvin", 4, [6]));
    const redeath = deadReappear("Corvin", 9, [11]);
    expect(continuityIssueSignature(redeath)).not.toBe(dismissed);

    const flags = toContinuityFlags({
      issues: [redeath],
      intentionalSignatures: new Set([dismissed]),
    });
    expect(flags).toHaveLength(1);
  });

  it("the flag still carries the FULL reappearance list for display + [Go to Ch N]", () => {
    const flags = toContinuityFlags({
      issues: [deadReappear("Corvin", 4, [6, 7])],
      intentionalSignatures: new Set<string>(),
    });
    expect(flags).toHaveLength(1);
    // siteFor(): anchor on earliest reappearance (6), jump to the death (4).
    expect(flags[0].chapterNumber).toBe(6);
    expect(flags[0].jumpChapter).toBe(4);
    // display description still names every reappearance chapter
    expect(flags[0].description).toContain("6, 7");
  });

  it("OTHER flag types keep the full chapter set in the signature (suppression NOT weakened)", () => {
    const tl = (chapters: number[]): ConsistencyIssue => ({
      type: "timeline_violation",
      severity: "critical",
      description: "…",
      entities: ["Battle of X", "The Council"],
      chapters,
    });
    // A different chapter pair is a genuinely different timeline_violation — its
    // signature must differ (we did not collapse non-growing types to an anchor).
    expect(continuityIssueSignature(tl([3, 5]))).not.toBe(
      continuityIssueSignature(tl([3, 7]))
    );
  });
});
