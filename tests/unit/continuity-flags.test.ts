// tests/unit/continuity-flags.test.ts
import { describe, it, expect } from "vitest";
import { continuityIssueSignature, toContinuityFlags, shouldExtract } from "@/lib/continuity/continuity-flags";
import type { ConsistencyIssue } from "@/lib/graph/types";

function issue(over: Partial<ConsistencyIssue> = {}): ConsistencyIssue {
  return {
    type: "dead_character_reappears",
    severity: "critical",
    description: 'Character "Ana" dies in chapter 12 but participates in events in chapters 18, 20.',
    entities: ["Ana"],
    chapters: [12, 18, 20],
    ...over,
  };
}

describe("continuityIssueSignature", () => {
  it("is deterministic and stable for the same issue", () => {
    expect(continuityIssueSignature(issue())).toBe(continuityIssueSignature(issue()));
  });
  it("is invariant to entity/chapter ORDER (fixes collect()/id() nondeterminism)", () => {
    const a = continuityIssueSignature(issue({ entities: ["Ana"], chapters: [20, 12, 18] }));
    const b = continuityIssueSignature(issue({ entities: ["Ana"], chapters: [12, 18, 20] }));
    expect(a).toBe(b);
  });
  it("is invariant to description wording (signature ignores description text)", () => {
    const a = continuityIssueSignature(issue({ description: "phrased one way" }));
    const b = continuityIssueSignature(issue({ description: "phrased another way" }));
    expect(a).toBe(b); // same type + entities + chapters
  });
  it("differs by type, entities, and identity chapters", () => {
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ type: "timeline_violation" })));
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ entities: ["Bob"] })));
    // D-79: for dead_character_reappears the signature is anchored to the DEATH
    // chapter (the earliest), so a different death chapter is a distinct
    // contradiction and still differs...
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ chapters: [11, 18, 20] })));
  });

  it("dead_character_reappears: signature is INVARIANT when only the reappearance list grows (D-79 death-anchor)", () => {
    // Same character, same death chapter (12); later reappearances differ/grow.
    // This is the SAME resurrection arc, so [Intentional] suppression must stick.
    expect(continuityIssueSignature(issue({ chapters: [12, 18] }))).toBe(
      continuityIssueSignature(issue({ chapters: [12, 18, 20] }))
    );
    // Other (bounded) flag types are NOT anchored — full chapter set still counts.
    const tl = (chapters: number[]): ConsistencyIssue =>
      issue({ type: "timeline_violation", entities: ["Later", "Earlier"], chapters });
    expect(continuityIssueSignature(tl([4, 9]))).not.toBe(continuityIssueSignature(tl([4, 10])));
  });
});

describe("toContinuityFlags", () => {
  const NONE = new Set<string>();

  it("produces flags for ALL chapters (book-wide, not filtered)", () => {
    const flags = toContinuityFlags({
      issues: [issue({ chapters: [12, 18] }), issue({ entities: ["Bob"], chapters: [3, 5] })],
      intentionalSignatures: NONE,
    });
    expect(flags).toHaveLength(2);
  });

  it("dead_character_reappears: chapterNumber = earliest reappearance, jumpChapter = death chapter, anchor = character", () => {
    const [f] = toContinuityFlags({ issues: [issue({ chapters: [12, 18, 20] })], intentionalSignatures: NONE });
    expect(f.chapterNumber).toBe(18); // earliest post-death reappearance (second-smallest)
    expect(f.jumpChapter).toBe(12);   // death chapter (smallest)
    expect(f.anchor).toBe("Ana");
  });

  it("timeline_violation: chapterNumber = later chapter (anchor lives there), jumpChapter = earlier", () => {
    const [f] = toContinuityFlags({
      issues: [issue({ type: "timeline_violation", severity: "critical", entities: ["Later Event", "Earlier Event"], chapters: [4, 9], description: "d" })],
      intentionalSignatures: NONE,
    });
    expect(f.chapterNumber).toBe(9);
    expect(f.jumpChapter).toBe(4);
    expect(f.anchor).toBe("Later Event");
  });

  it("location_conflict: single chapter, no jump target", () => {
    const [f] = toContinuityFlags({
      issues: [issue({ type: "location_conflict", severity: "major", entities: ["Milan"], chapters: [7], description: "d" })],
      intentionalSignatures: NONE,
    });
    expect(f.chapterNumber).toBe(7);
    expect(f.jumpChapter).toBeNull();
    expect(f.anchor).toBe("Milan");
  });

  it("relationship_contradiction: book-level (chapterNumber 0, no anchor, no jump)", () => {
    const [f] = toContinuityFlags({
      issues: [issue({ type: "relationship_contradiction", severity: "major", entities: ["A", "B"], chapters: [], description: "d" })],
      intentionalSignatures: NONE,
    });
    expect(f.chapterNumber).toBe(0);
    expect(f.anchor).toBeNull();
    expect(f.jumpChapter).toBeNull();
  });

  it("excludes orphan_plot_thread and character_undocumented", () => {
    const flags = toContinuityFlags({
      issues: [
        issue({ type: "orphan_plot_thread", severity: "major", chapters: [7], description: "d" }),
        issue({ type: "character_undocumented", severity: "minor", chapters: [7], description: "d" }),
      ],
      intentionalSignatures: NONE,
    });
    expect(flags).toEqual([]);
  });

  it("drops flags whose signature is marked intentional", () => {
    const sig = continuityIssueSignature(issue());
    const flags = toContinuityFlags({ issues: [issue()], intentionalSignatures: new Set([sig]) });
    expect(flags).toEqual([]);
  });
});

describe("shouldExtract", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  it("extracts when never extracted", () => { expect(shouldExtract(null, now, 90_000)).toBe(true); });
  it("skips within the min interval", () => { expect(shouldExtract(new Date(now.getTime() - 30_000), now, 90_000)).toBe(false); });
  it("extracts at exactly the min interval (boundary)", () => { expect(shouldExtract(new Date(now.getTime() - 90_000), now, 90_000)).toBe(true); });
  it("extracts after the min interval", () => { expect(shouldExtract(new Date(now.getTime() - 120_000), now, 90_000)).toBe(true); });
});
