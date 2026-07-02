// tests/unit/flag-sync.test.ts
import { describe, it, expect } from "vitest";
import { planFlagSync } from "@/lib/continuity/flag-sync";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

function flag(sig: string): ContinuityFlagInput {
  return { signature: sig, type: "dead_character_reappears", severity: "critical", description: "d", entities: ["Ana"], chapterNumber: 18, jumpChapter: 12, anchor: "Ana" };
}

describe("planFlagSync", () => {
  it("creates newly detected flags", () => {
    const r = planFlagSync({ detected: [flag("s1")], existing: [] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s1"]);
    expect(r.toDelete).toEqual([]);
  });
  it("deletes existing flags no longer detected (resolve = delete)", () => {
    const r = planFlagSync({ detected: [], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
    expect(r.toDelete).toEqual(["f1"]);
  });
  it("no-ops a still-detected flag", () => {
    const r = planFlagSync({ detected: [flag("s1")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
    expect(r.toDelete).toEqual([]);
  });
  it("handles mixed create + delete", () => {
    const r = planFlagSync({ detected: [flag("s2")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s2"]);
    expect(r.toDelete).toEqual(["f1"]);
  });
  it("does not duplicate on an identical re-scan", () => {
    const r = planFlagSync({ detected: [flag("s1"), flag("s1")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
  });
  it("re-creates a previously-deleted (re-introduced) contradiction — no tombstone", () => {
    // existing is empty (the row was deleted when the writer fixed it); re-detecting → create again
    const r = planFlagSync({ detected: [flag("s1")], existing: [] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s1"]);
  });
  it("is a no-op on empty/empty", () => {
    expect(planFlagSync({ detected: [], existing: [] })).toEqual({ toCreate: [], toDelete: [] });
  });
});
