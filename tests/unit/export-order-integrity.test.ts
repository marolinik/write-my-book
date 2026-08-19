import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorageAdapter } from "@/lib/storage/types";

/**
 * D-03 regression lock: export assembly must pair each DB chapter title with
 * ITS OWN body, in DB chapterNumber order. Pre-fix the pipeline listed
 * manuscript files from storage, sorted by file path, and derived the chapter
 * number from the `chapter-NN` path segment — but reorder renumbers the DB
 * (chapters AND documents) while storage files are deliberately never renamed,
 * so post-reorder exports stamped DB titles onto the wrong bodies (SHA-proven
 * body swap in docx; the assembled markdown feeds docx/pdf/epub alike).
 *
 * Simulated reorder: DB says chapter 1 = "B" and chapter 2 = "A", while the
 * storage paths still say chapter-01.md holds A's body and chapter-02.md
 * holds B's body.
 */

const h = vi.hoisted(() => ({
  db: { chapter: { findMany: vi.fn() } },
  findByType: vi.fn(),
  readPinned: vi.fn(),
  storage: { list: vi.fn(), read: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));

import { assembleChapterSections } from "@/lib/import-export/export-pipeline";

const storage = h.storage as unknown as StorageAdapter;

/** Post-reorder DB state: former chapter 2 ("B") is now first. */
const docByNumber: Record<number, { id: string; storageKey: string }> = {
  1: { id: "doc-b", storageKey: "manuscript/act-1/chapter-02.md" },
  2: { id: "doc-a", storageKey: "manuscript/act-2/chapter-01.md" },
};
const bodyByDocId: Record<string, string> = {
  "doc-b": "Beta body: the storm broke over the harbour.",
  "doc-a": "Alpha body: first light on the water.",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.db.chapter.findMany.mockResolvedValue([
    { chapterNumber: 1, actNumber: 1 },
    { chapterNumber: 2, actNumber: 2 },
  ]);
  h.findByType.mockImplementation(async (_type: unknown, n: number) => docByNumber[n] ?? null);
  h.readPinned.mockImplementation(async (id: string) =>
    bodyByDocId[id] !== undefined ? { content: bodyByDocId[id] } : null
  );
  // Path-sorted storage still holds the PRE-reorder layout — reading it by
  // path would reproduce the body swap the fix eliminates.
  h.storage.list.mockResolvedValue([
    "manuscript/act-1/chapter-02.md",
    "manuscript/act-2/chapter-01.md",
  ]);
  h.storage.read.mockResolvedValue(null);
});

describe("assembleChapterSections (D-03 export order integrity)", () => {
  it("pairs each DB title with its own body, in DB chapterNumber order", async () => {
    const chapterTitles = new Map([
      [1, "Beta Rises"],
      [2, "Alpha Dawn"],
    ]);
    const { chapterContent, chapterCount } = await assembleChapterSections({
      bookId: "b1",
      userId: "u1",
      storage,
      chapterTitles,
    });

    // Title↔body pairing comes from the DB document row, never the path.
    expect(chapterContent).toContain(
      "# Beta Rises\n\nBeta body: the storm broke over the harbour."
    );
    expect(chapterContent).toContain(
      "# Alpha Dawn\n\nAlpha body: first light on the water."
    );
    // DB order: chapter 1 (Beta) before chapter 2 (Alpha), despite path sort.
    expect(chapterContent.indexOf("# Beta Rises")).toBeLessThan(
      chapterContent.indexOf("# Alpha Dawn")
    );
    // Act dividers derive from the DB act field, not the act-NN path segment.
    expect(chapterContent).toContain("## Act 2");
    expect(chapterCount).toBe(2);
    // The path listing is never consulted when DB chapters exist.
    expect(h.storage.list).not.toHaveBeenCalled();
  });

  it("strips YAML front matter before applying the DB heading", async () => {
    bodyByDocId["doc-b"] = "---\ntitle: stale\n---\nBeta body after yaml.";
    const { chapterContent } = await assembleChapterSections({
      bookId: "b1",
      userId: "u1",
      storage,
      chapterTitles: new Map([[1, "Beta Rises"]]),
    });
    expect(chapterContent).toContain("# Beta Rises\n\nBeta body after yaml.");
    expect(chapterContent).not.toContain("title: stale");
    bodyByDocId["doc-b"] = "Beta body: the storm broke over the harbour.";
  });

  it("skips chapters with a missing document or empty content without crashing", async () => {
    h.db.chapter.findMany.mockResolvedValue([
      { chapterNumber: 1, actNumber: 1 },
      { chapterNumber: 2, actNumber: 1 },
      { chapterNumber: 3, actNumber: 1 },
    ]);
    h.findByType.mockImplementation(async (_type: unknown, n: number) => {
      if (n === 1) return docByNumber[1];
      if (n === 3) return { id: "doc-empty", storageKey: "manuscript/act-1/chapter-03.md" };
      return null; // chapter 2 has no content document at all
    });
    h.readPinned.mockImplementation(async (id: string) =>
      id === "doc-empty" ? { content: "" } : { content: bodyByDocId[id] }
    );

    const { chapterContent, chapterCount } = await assembleChapterSections({
      bookId: "b1",
      userId: "u1",
      storage,
    });
    expect(chapterContent).toContain("Beta body: the storm broke over the harbour.");
    expect(chapterContent).not.toContain("Chapter 3");
    // Mirrors the old files-found semantics: documents that exist count, even
    // when their content is empty; chapters with no document do not.
    expect(chapterCount).toBe(2);
  });

  // D-190: a deleted chapter's CHAPTER_CONTENT row survives the delete and is
  // resolved by (book, type, chapter_number), so a brand-new chapter that
  // inherits the freed number would EXPORT the deleted prose. Export resolves
  // content exactly like the editor's GET, so it must honour the same guard.
  it("never exports a deleted chapter's prose into a brand-new empty chapter", async () => {
    const chapterCreated = new Date("2026-07-02T09:00:00Z");
    h.db.chapter.findMany.mockResolvedValue([
      {
        chapterNumber: 1,
        actNumber: 1,
        wordCount: 8,
        createdAt: new Date("2026-07-01T09:00:00Z"),
      },
      // Recreated after the original chapter 2 was deleted; never written to.
      { chapterNumber: 2, actNumber: 1, wordCount: 0, createdAt: chapterCreated },
    ]);
    h.findByType.mockImplementation(async (_type: unknown, n: number) =>
      n === 1
        ? { ...docByNumber[1], createdAt: new Date("2026-07-01T09:30:00Z") }
        : {
            id: "doc-orphan",
            storageKey: "manuscript/act-1/chapter-02.md",
            createdAt: new Date("2026-07-01T11:00:00Z"),
          }
    );
    h.readPinned.mockImplementation(async (id: string) =>
      id === "doc-orphan"
        ? { content: "Deleted words. GHOST_SECRET_9f3a" }
        : { content: bodyByDocId[id] }
    );

    const { chapterContent, chapterCount } = await assembleChapterSections({
      bookId: "b1",
      userId: "u1",
      storage,
    });

    expect(chapterContent).not.toContain("GHOST_SECRET_9f3a");
    expect(chapterContent).toContain("Beta body: the storm broke over the harbour.");
    expect(chapterCount).toBe(1);
  });
});
