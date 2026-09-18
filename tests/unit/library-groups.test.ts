/**
 * The library's groups are the writer's map of his own book, so they have to
 * read as the flow he actually walks — and every document has to be somewhere
 * he would think to look.
 *
 * S3-2: four real types (SYNOPSIS, BOOK_PLAN, WORLD_RESEARCH, TOPIC_RESEARCH)
 * were in no group at all, so the catch-all filed the spine of his book under
 * a gear icon labelled "Other". The enum is the source of truth here: a type
 * added later must fail this test rather than quietly reappear in "Other".
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DOCUMENT_GROUPS,
  SERIES_LEVEL_TYPES,
  groupDocuments,
} from "@/lib/documents/library-groups";

/** Every DocumentType the Prisma enum declares, in declaration order. */
function enumTypes(): string[] {
  const schema = readFileSync(
    join(__dirname, "..", "..", "prisma", "schema.prisma"),
    "utf-8"
  );
  const block = schema.match(/enum DocumentType \{([\s\S]*?)\n\}/);
  if (!block) throw new Error("DocumentType enum not found in schema.prisma");
  return block[1]
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, "").trim())
    .filter((line) => /^[A-Z_]+$/.test(line));
}

describe("library groups", () => {
  const claimed = DOCUMENT_GROUPS.flatMap((g) => g.types);

  it("claims every book-level document type exactly once", () => {
    const bookTypes = enumTypes().filter(
      (type) => !SERIES_LEVEL_TYPES.includes(type)
    );

    expect([...claimed].sort()).toEqual([...bookTypes].sort());
  });

  it("puts no type in two groups", () => {
    expect(claimed).toHaveLength(new Set(claimed).size);
  });

  it("claims no series-level type", () => {
    expect(claimed.filter((t) => SERIES_LEVEL_TYPES.includes(t))).toEqual([]);
  });

  it("orders the groups the way the boards order the work", () => {
    // development-stages.ts: idea -> synopsis -> structure -> research -> plan -> draft
    // manuscript-stages.ts:  read -> style -> bible -> architecture -> analyze
    //                        -> restructure -> edit
    // Both put analysis ahead of editorial; the library used to invert it.
    expect(DOCUMENT_GROUPS.map((g) => g.key)).toEqual([
      "foundation",
      "structure",
      "research",
      "chapters",
      "analysis",
      "editorial",
      "publishing",
      "notes",
    ]);
  });

  it("files the synopsis under structure, not with the leftovers", () => {
    const structure = DOCUMENT_GROUPS.find((g) => g.key === "structure");
    expect(structure?.types).toContain("SYNOPSIS");
    expect(structure?.types).toContain("BOOK_PLAN");
  });

  describe("groupDocuments", () => {
    const docs = [
      { id: "a", type: "SYNOPSIS" },
      { id: "b", type: "DEV_EDIT_REPORT" },
      { id: "c", type: "ANALYSIS_REPORT" },
    ];

    it("puts each document in its own group, in flow order", () => {
      const groups = groupDocuments(docs);
      const filled = groups.filter((g) => g.docs.length > 0).map((g) => g.key);
      expect(filled).toEqual(["structure", "analysis", "editorial"]);
    });

    it("keeps an unrecognised type visible instead of dropping it", () => {
      const groups = groupDocuments([{ id: "x", type: "NOT_A_REAL_TYPE" }]);
      const notes = groups.find((g) => g.key === "notes");
      expect(notes?.docs.map((d) => d.id)).toEqual(["x"]);
    });

    it("returns every group, so empty-state CTAs can still render", () => {
      expect(groupDocuments([])).toHaveLength(DOCUMENT_GROUPS.length);
    });
  });
});
