// tests/unit/flag-annotations.test.ts
import { describe, it, expect } from "vitest";
import { continuityFlagsToAnnotations } from "@/lib/continuity/flag-annotations";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

type ScanFlag = ContinuityFlagInput & { id: string };
function flag(over: Partial<ScanFlag> = {}): ScanFlag {
  return { id: "f1", signature: "s1", type: "dead_character_reappears", severity: "critical", description: "Ana died Ch12", entities: ["Ana"], chapterNumber: 18, jumpChapter: 12, anchor: "Ana", ...over };
}

describe("continuityFlagsToAnnotations", () => {
  it("maps an anchored current-chapter flag to a continuity annotation on the entity name", () => {
    const a = continuityFlagsToAnnotations([flag()], 18);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "continuity", text: "Ana", description: "Ana died Ch12", findingId: "f1" });
    expect(a[0].id).toBe("continuity-f1");
  });
  it("skips flags whose primary chapter is not the current chapter (they show in the indicator)", () => {
    expect(continuityFlagsToAnnotations([flag({ chapterNumber: 7 })], 18)).toEqual([]);
  });
  it("skips book-level flags with no anchor", () => {
    expect(continuityFlagsToAnnotations([flag({ chapterNumber: 0, anchor: null })], 0)).toEqual([]);
  });
});
