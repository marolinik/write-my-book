import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Dev editor v2, phase A — the delegation that ends a restructure pass.
 *
 * Live baseline: the architect filed moves but never wrote STRUCTURE_PROPOSAL,
 * so the conductor took the pass for unfinished and delegated twice more; each
 * delegation filed anew. The moves ARE the deliverable. When they exist and the
 * document does not, the app writes the document from them and tells the
 * conductor the pass is complete.
 */

const h = vi.hoisted(() => ({
  db: {
    structureMove: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
  },
  findByType: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: vi.fn().mockImplementation(() => ({
    findByType: h.findByType,
    create: h.create,
    update: h.update,
  })),
}));

import {
  composeStructureProposal,
  finishRestructureDelegation,
  type ProposalMove,
} from "@/lib/structure/proposal-doc";

const primary: ProposalMove = {
  id: "p1",
  kind: "merge",
  payload: JSON.stringify({ kind: "merge", chapterNumbers: [24, 25] }),
  reason: "Dve polovine iste večeri, šestog aprila.",
  evidence: "24 = 956 reči, 25 = 955 reči (medijan 1.800).",
  confidence: 0.68,
  alternativeToId: null,
  status: "pending",
};
const alternative: ProposalMove = {
  id: "a1",
  kind: "merge",
  payload: JSON.stringify({ kind: "merge", chapterNumbers: [25, 26] }),
  reason: "Ako odbiješ 24+25, spoji 25 i 26.",
  evidence: null,
  confidence: 0.5,
  alternativeToId: "p1",
  status: "pending",
};
const split: ProposalMove = {
  id: "p2",
  kind: "split",
  payload: JSON.stringify({ kind: "split", chapterNumber: 28, anchorQuote: "U staroj kući" }),
  reason: "Pismo se čita dvaput.",
  evidence: null,
  confidence: 0.6,
  alternativeToId: null,
  status: "pending",
};

describe("composeStructureProposal", () => {
  const doc = composeStructureProposal({
    bookName: "Legat - Zavet",
    language: "sr",
    moves: [primary, alternative, split],
  });

  it("names every move with its chapters, reason and evidence", () => {
    expect(doc).toContain("24 + 25");
    expect(doc).toContain("Dve polovine iste večeri");
    expect(doc).toContain("956 reči");
    expect(doc).toContain("28");
    expect(doc).toContain("U staroj kući");
  });

  it("nests an alternative right under its primary", () => {
    const p1 = doc.indexOf("Dve polovine");
    const a1 = doc.indexOf("Ako odbiješ");
    const p2 = doc.indexOf("Pismo se čita");
    expect(p1).toBeLessThan(a1);
    expect(a1).toBeLessThan(p2);
  });

  it("speaks the book's language", () => {
    expect(doc).toMatch(/Legat - Zavet/);
    expect(doc).toMatch(/Spajanje|spajanje/);
    expect(doc).toMatch(/Alternativa|alternativa/);
    expect(doc).not.toMatch(/\bMerge\b/);
  });

  it("quotes a split point the way the language does", () => {
    const en = composeStructureProposal({ bookName: "B", language: "en", moves: [split] });
    expect(en).toContain("“U staroj kući”");
  });

  it("is a structured document, not a line", () => {
    expect((doc.match(/^#{1,3} /gm) ?? []).length).toBeGreaterThanOrEqual(3);
  });
});

describe("finishRestructureDelegation", () => {
  const base = {
    bookId: "b1",
    userId: "u1",
    passId: "root",
    language: "sr",
    bookName: "Legat - Zavet",
    specialistDocumentIds: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.db.structureMove.findMany.mockResolvedValue([primary, alternative, split]);
    h.db.document.findMany.mockResolvedValue([]);
    h.findByType.mockResolvedValue(null);
    h.create.mockResolvedValue({ id: "d-new" });
    h.update.mockResolvedValue({ id: "d-old" });
  });

  it("lists only what still waits for the writer, never a move already applied", async () => {
    await finishRestructureDelegation(base);
    expect(h.db.structureMove.findMany.mock.calls[0][0].where.status).toBe("pending");
  });

  it("reads only this pass's live moves", async () => {
    await finishRestructureDelegation(base);
    const where = h.db.structureMove.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ bookId: "b1", sessionId: "root" });
  });

  it("writes the document from the moves when the architect did not", async () => {
    const out = await finishRestructureDelegation(base);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0]).toBe("STRUCTURE_PROPOSAL");
    expect(h.create.mock.calls[0][1]).toContain("Dve polovine");
    expect(out).toMatch(/2\/7/);
    expect(out).toMatch(/do not delegate again/i);
  });

  it("replaces a stale proposal from an older pass instead of adding a second one", async () => {
    h.findByType.mockResolvedValue({ id: "d-old" });
    await finishRestructureDelegation(base);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update.mock.calls[0][0]).toBe("d-old");
  });

  it("leaves the document alone when the architect wrote it in this delegation", async () => {
    h.db.document.findMany.mockResolvedValue([{ id: "d1", type: "STRUCTURE_PROPOSAL" }]);
    const out = await finishRestructureDelegation({ ...base, specialistDocumentIds: ["d1"] });
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(out).toMatch(/do not delegate again/i);
  });

  it("says nothing is complete when the pass filed no move", async () => {
    h.db.structureMove.findMany.mockResolvedValue([]);
    const out = await finishRestructureDelegation(base);
    expect(h.create).not.toHaveBeenCalled();
    expect(out).toMatch(/no move/i);
  });

  it("never fails the delegation when writing the document fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.create.mockRejectedValue(new Error("storage down"));
    const out = await finishRestructureDelegation(base);
    expect(out).toMatch(/2\/7/);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
