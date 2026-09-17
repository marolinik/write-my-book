import { describe, it, expect } from "vitest";
import {
  planMove,
  mergeContent,
  splitContent,
  type ChapterRef,
} from "@/lib/structure/moves";

/**
 * O12 — structural revision pass. These are the pure planners the apply engine
 * runs BEFORE it touches the database: every move is resolved into an explicit
 * renumbering (and, for merge/split, the exact prose transformation) so the
 * writer sees a before/after and the transaction has nothing left to decide.
 */

const chapters: ChapterRef[] = [
  { id: "c1", chapterNumber: 1, title: "Zakletva", wordCount: 2100, actNumber: 1 },
  { id: "c2", chapterNumber: 2, title: "Pismo", wordCount: 1800, actNumber: 1 },
  { id: "c3", chapterNumber: 3, title: "Put", wordCount: 900, actNumber: 1 },
  { id: "c4", chapterNumber: 4, title: "Kuća", wordCount: 2400, actNumber: 2 },
  { id: "c5", chapterNumber: 5, title: "Noć", wordCount: 2000, actNumber: 2 },
];

function numbersOf(ordering: Array<{ chapterId: string; chapterNumber: number }>) {
  return ordering.map((o) => `${o.chapterId}:${o.chapterNumber}`).join(" ");
}

describe("planMove — reorder", () => {
  it("moves a later chapter earlier and shifts the displaced ones down", () => {
    const res = planMove(chapters, {
      kind: "reorder",
      chapterNumber: 4,
      targetPosition: 2,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(numbersOf(res.plan.ordering)).toBe("c1:1 c4:2 c2:3 c3:4 c5:5");
    expect(res.plan.removedChapterIds).toEqual([]);
  });

  it("moves an earlier chapter later and shifts the passed-over ones up", () => {
    const res = planMove(chapters, {
      kind: "reorder",
      chapterNumber: 2,
      targetPosition: 5,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(numbersOf(res.plan.ordering)).toBe("c1:1 c3:2 c4:3 c5:4 c2:5");
  });

  it("keeps every chapter and leaves the numbering contiguous 1..n", () => {
    const res = planMove(chapters, {
      kind: "reorder",
      chapterNumber: 5,
      targetPosition: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const nums = res.plan.ordering.map((o) => o.chapterNumber).sort((a, b) => a - b);
    expect(nums).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(res.plan.ordering.map((o) => o.chapterId)).size).toBe(5);
  });

  it("rejects an unknown chapter, an out-of-range target, and a no-op", () => {
    expect(
      planMove(chapters, { kind: "reorder", chapterNumber: 9, targetPosition: 2 })
    ).toMatchObject({ ok: false, error: { code: "chapter_not_found" } });
    expect(
      planMove(chapters, { kind: "reorder", chapterNumber: 2, targetPosition: 6 })
    ).toMatchObject({ ok: false, error: { code: "target_out_of_range" } });
    expect(
      planMove(chapters, { kind: "reorder", chapterNumber: 2, targetPosition: 0 })
    ).toMatchObject({ ok: false, error: { code: "target_out_of_range" } });
    expect(
      planMove(chapters, { kind: "reorder", chapterNumber: 2, targetPosition: 2 })
    ).toMatchObject({ ok: false, error: { code: "no_op" } });
  });

  it("does not mutate the chapter list it was given", () => {
    const snapshot = JSON.stringify(chapters);
    planMove(chapters, { kind: "reorder", chapterNumber: 4, targetPosition: 1 });
    expect(JSON.stringify(chapters)).toBe(snapshot);
  });
});

describe("planMove — merge", () => {
  it("keeps the first chapter, removes the absorbed one, closes the gap", () => {
    const res = planMove(chapters, { kind: "merge", chapterNumbers: [2, 3] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.survivorChapterId).toBe("c2");
    expect(res.plan.removedChapterIds).toEqual(["c3"]);
    expect(numbersOf(res.plan.ordering)).toBe("c1:1 c2:2 c4:3 c5:4");
  });

  it("accepts the chapter numbers in any order and merges three in a row", () => {
    const res = planMove(chapters, { kind: "merge", chapterNumbers: [4, 3, 2] });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.survivorChapterId).toBe("c2");
    expect(res.plan.removedChapterIds).toEqual(["c3", "c4"]);
    expect(numbersOf(res.plan.ordering)).toBe("c1:1 c2:2 c5:3");
  });

  it("refuses non-adjacent chapters, a single chapter, and unknown numbers", () => {
    expect(
      planMove(chapters, { kind: "merge", chapterNumbers: [2, 4] })
    ).toMatchObject({ ok: false, error: { code: "not_adjacent" } });
    expect(
      planMove(chapters, { kind: "merge", chapterNumbers: [2] })
    ).toMatchObject({ ok: false, error: { code: "needs_two_chapters" } });
    expect(
      planMove(chapters, { kind: "merge", chapterNumbers: [2, 99] })
    ).toMatchObject({ ok: false, error: { code: "chapter_not_found" } });
    expect(
      planMove(chapters, { kind: "merge", chapterNumbers: [2, 2] })
    ).toMatchObject({ ok: false, error: { code: "needs_two_chapters" } });
  });
});

describe("planMove — split", () => {
  it("opens a hole after the split chapter and shifts the tail up", () => {
    const res = planMove(chapters, {
      kind: "split",
      chapterNumber: 3,
      anchorQuote: "Kad je pao mrak",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.newChapterNumber).toBe(4);
    // c4 and c5 move up one; the freed number 4 is where the new chapter lands.
    expect(numbersOf(res.plan.ordering)).toBe("c1:1 c2:2 c3:3 c4:5 c5:6");
  });

  it("splitting the last chapter needs no renumbering at all", () => {
    const res = planMove(chapters, {
      kind: "split",
      chapterNumber: 5,
      anchorQuote: "Kad je pao mrak",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.plan.newChapterNumber).toBe(6);
    expect(res.plan.ordering).toEqual([]);
  });

  it("rejects an unknown chapter and a missing anchor", () => {
    expect(
      planMove(chapters, { kind: "split", chapterNumber: 42, anchorQuote: "x" })
    ).toMatchObject({ ok: false, error: { code: "chapter_not_found" } });
    expect(
      planMove(chapters, { kind: "split", chapterNumber: 3, anchorQuote: "  " })
    ).toMatchObject({ ok: false, error: { code: "anchor_required" } });
  });
});

describe("mergeContent", () => {
  const a = "# Treće poglavlje\n\nMarko je stajao pred kućom.\n\nVrata su bila otvorena.";
  const b = "# Četvrto poglavlje\n\nUnutra je mirisalo na dim.";

  it("joins the bodies with a scene break and keeps every paragraph", () => {
    const merged = mergeContent([a, b]);
    expect(merged).toContain("Marko je stajao pred kućom.");
    expect(merged).toContain("Vrata su bila otvorena.");
    expect(merged).toContain("Unutra je mirisalo na dim.");
    expect(merged).toContain("* * *");
  });

  it("keeps only the first chapter's title heading", () => {
    const merged = mergeContent([a, b]);
    expect(merged).toContain("# Treće poglavlje");
    expect(merged).not.toContain("# Četvrto poglavlje");
    expect(merged.match(/^# /gm)?.length).toBe(1);
  });

  it("uses an explicit title when one is given", () => {
    const merged = mergeContent([a, b], { title: "Kuća i dim" });
    expect(merged.startsWith("# Kuća i dim")).toBe(true);
    expect(merged.match(/^# /gm)?.length).toBe(1);
  });

  it("survives a part with no heading and drops empty parts", () => {
    const merged = mergeContent(["Samo tekst.", "", "Drugi deo."]);
    expect(merged).toBe("Samo tekst.\n\n* * *\n\nDrugi deo.");
  });
});

describe("splitContent", () => {
  const body = [
    "# Trideset prvo poglavlje",
    "",
    "Prvi pasus priče.",
    "",
    "Drugi pasus priče.",
    "",
    "Kad je pao mrak, kuća je utihnula.",
    "",
    "Poslednji pasus.",
  ].join("\n");

  it("cuts at the paragraph the anchor starts, anchor opening the second half", () => {
    const res = splitContent(body, "Kad je pao mrak");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.first).toContain("Drugi pasus priče.");
    expect(res.first).not.toContain("Kad je pao mrak");
    expect(res.second.startsWith("Kad je pao mrak")).toBe(true);
    expect(res.second).toContain("Poslednji pasus.");
  });

  it("cuts at the paragraph boundary even when the anchor sits mid-paragraph", () => {
    const res = splitContent(body, "kuća je utihnula");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.second.startsWith("Kad je pao mrak")).toBe(true);
  });

  it("loses no prose — first + second contain every source paragraph", () => {
    const res = splitContent(body, "Kad je pao mrak");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    for (const p of ["Prvi pasus priče.", "Drugi pasus priče.", "Poslednji pasus."]) {
      expect(`${res.first}\n\n${res.second}`).toContain(p);
    }
  });

  it("refuses an anchor that is missing, ambiguous, or in the opening paragraph", () => {
    expect(splitContent(body, "nema ovoga")).toMatchObject({
      ok: false,
      error: { code: "anchor_not_found" },
    });
    expect(splitContent("Isti tekst.\n\nIsti tekst.", "Isti tekst.")).toMatchObject({
      ok: false,
      error: { code: "anchor_ambiguous" },
    });
    expect(splitContent(body, "Prvi pasus priče.")).toMatchObject({
      ok: false,
      error: { code: "anchor_too_early" },
    });
  });

  it("ignores the leading heading when deciding what is 'too early'", () => {
    const res = splitContent(body, "Drugi pasus priče.");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.first).toContain("Prvi pasus priče.");
    expect(res.second.startsWith("Drugi pasus priče.")).toBe(true);
  });
});
