import { describe, it, expect } from "vitest";
import { groupMoves } from "@/lib/structure/group";
import type { StructureMove } from "@/lib/structure/types";

/**
 * Dev editor v2 — the panel lists the pass the way the chat presents it:
 * primaries numbered in filing order, each alternative right under its move.
 */

function move(id: string, createdAt: string, extra: Partial<StructureMove> = {}): StructureMove {
  return {
    id,
    kind: "merge",
    status: "pending",
    reason: id,
    evidence: null,
    confidence: 0.6,
    resultSummary: null,
    rejectionReason: null,
    createdAt,
    appliedAt: null,
    alternativeToId: null,
    payload: { kind: "merge", chapterNumbers: [1, 2] },
    ...extra,
  };
}

describe("groupMoves", () => {
  it("orders primaries by filing time, oldest first (the API returns newest first)", () => {
    const groups = groupMoves([
      move("p2", "2026-10-08T13:02:00Z"),
      move("p1", "2026-10-08T13:01:00Z"),
    ]);
    expect(groups.map((g) => g.move.id)).toEqual(["p1", "p2"]);
  });

  it("nests an alternative under its primary instead of listing it as a move", () => {
    const groups = groupMoves([
      move("a1", "2026-10-08T13:03:00Z", { alternativeToId: "p1" }),
      move("p2", "2026-10-08T13:02:00Z"),
      move("p1", "2026-10-08T13:01:00Z"),
    ]);
    expect(groups.map((g) => g.move.id)).toEqual(["p1", "p2"]);
    expect(groups[0].alternatives.map((a) => a.id)).toEqual(["a1"]);
  });

  it("promotes an alternative whose primary the writer rejected: it is now the choice", () => {
    const groups = groupMoves([move("a1", "2026-10-08T13:03:00Z", { alternativeToId: "gone" })]);
    expect(groups.map((g) => g.move.id)).toEqual(["a1"]);
  });

  it("does not mutate its input", () => {
    const input = [move("p2", "2026-10-08T13:02:00Z"), move("p1", "2026-10-08T13:01:00Z")];
    groupMoves(input);
    expect(input.map((m) => m.id)).toEqual(["p2", "p1"]);
  });
});
