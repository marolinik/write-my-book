/**
 * Two kinds of duplicate cost the owner his manuscript on 2026-09-18, and both
 * are prevented here rather than apologised for later.
 *
 * 1. A DUPLICATE STORAGE KEY. A chapter-scoped key is derived from the chapter
 *    number, and chapter numbers are recycled: splitting chapter 24 creates a
 *    new chapter 25 while the old chapter 25 — now 26 — still points at
 *    `chapter-25.md`. The new document was written straight over the other
 *    chapter's prose. Keys are opaque pointers that never move after creation,
 *    so a newcomer must be handed one nobody holds.
 *
 * The other half — a duplicate PROPOSAL, which is what let the same merge be
 * applied twice — is guarded in structure-propose-tool.test.ts, next to the
 * tool that files them.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  db: {
    document: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
    documentVersion: { create: vi.fn() },
  },
  storage: { write: vi.fn(), read: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => h.storage,
  getSeriesStorage: () => h.storage,
}));

import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

describe("a new document never takes a key another document holds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.db.document.create.mockImplementation(async ({ data }: { data: { storageKey: string } }) => ({
      id: "doc-new",
      storageKey: data.storageKey,
    }));
    h.db.documentVersion.create.mockResolvedValue({});
    h.storage.write.mockResolvedValue(undefined);
  });

  it("uses the canonical key when it is free", async () => {
    h.db.document.count.mockResolvedValue(0);

    const docs = new DocumentService("u1", "b1");
    await docs.create(DocumentType.CHAPTER_CONTENT, "Tekst.", "Poglavlje", 25, 1);

    const written = h.storage.write.mock.calls[0][0];
    expect(written).toBe("manuscript/act-1/chapter-25.md");
  });

  it("picks a free key when the canonical one is taken", async () => {
    // chapter-25.md already belongs to the chapter that used to be number 25.
    h.db.document.count.mockImplementation(async ({ where }: { where: { storageKey: string } }) =>
      where.storageKey === "manuscript/act-1/chapter-25.md" ? 1 : 0
    );

    const docs = new DocumentService("u1", "b1");
    await docs.create(DocumentType.CHAPTER_CONTENT, "Novi tekst.", "Zapisnik", 25, 1);

    const written = h.storage.write.mock.calls[0][0];
    expect(written).not.toBe("manuscript/act-1/chapter-25.md");
    expect(written).toMatch(/^manuscript\/act-1\/chapter-25-\d+\.md$/);

    const row = h.db.document.create.mock.calls[0][0].data;
    expect(row.storageKey).toBe(written);
  });

  it("keeps looking while the alternatives are taken too", async () => {
    const held = new Set([
      "manuscript/act-1/chapter-25.md",
      "manuscript/act-1/chapter-25-2.md",
    ]);
    h.db.document.count.mockImplementation(async ({ where }: { where: { storageKey: string } }) =>
      held.has(where.storageKey) ? 1 : 0
    );

    const docs = new DocumentService("u1", "b1");
    await docs.create(DocumentType.CHAPTER_CONTENT, "Tekst.", "Poglavlje", 25, 1);

    expect(h.storage.write.mock.calls[0][0]).toBe("manuscript/act-1/chapter-25-3.md");
  });
});

describe("a chapter-scoped report does not use the book-level key", () => {
  /**
   * S3-10: CONTINUITY_REPORT is written per chapter, but getStoragePath ignored
   * the chapter and handed every one of them `.planning/CONTINUITY-REPORT.md`.
   * Two reports meant one file; deleting the chapter that owned the second took
   * the first one's prose with it, and the tab rendered an empty report for a
   * pass that had run.
   */
  it("puts the chapter in the key when the report belongs to one", async () => {
    const { getStoragePath } = await import("@/lib/documents/storage-keys");
    const { DocumentType } = await import("@/generated/prisma/enums");

    const ch1 = getStoragePath(DocumentType.CONTINUITY_REPORT, 1);
    const ch31 = getStoragePath(DocumentType.CONTINUITY_REPORT, 31);

    expect(ch1).not.toBe(ch31);
    expect(ch1).toContain("01");
    expect(ch31).toContain("31");
  });

  it("keeps the book-level key for a book-level continuity report", async () => {
    const { getStoragePath } = await import("@/lib/documents/storage-keys");
    const { DocumentType } = await import("@/generated/prisma/enums");

    expect(getStoragePath(DocumentType.CONTINUITY_REPORT)).toBe(
      ".planning/CONTINUITY-REPORT.md"
    );
  });
});
