import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-199, update path — the routes that OVERWRITE a document badge every write
 * as the writer's own typing.
 *
 * `DocumentService.create()` hardcoding `manual_edit` was the registered root
 * cause, but the same untruth is reachable through `update()`: the parameter
 * exists, so two callers pass a literal `"manual_edit"` next to a
 * `change_source` that says something else entirely —
 *
 *   content PUT   → ("manual_edit", data.changeSource ?? "user")
 *                   an agent/system save through this route claimed to be typed
 *   import UPDATE  → ("manual_edit", "import")
 *                   re-importing over an existing chapter claimed to be typed
 *
 * and `update()`'s own default was `manual_edit` regardless of the source a
 * caller did state (`PATCH /documents/:id` takes an optional changeType).
 *
 * Asserted here as the EFFECTIVE badge — what the version row ends up with,
 * whether the route states it or lets the service derive it from the source —
 * so the contract survives either implementation.
 */

const h = vi.hoisted(() => {
  class VersionConflictError extends Error {
    documentId: string;
    constructor(documentId: string) {
      super("version_conflict");
      this.documentId = documentId;
      this.name = "VersionConflictError";
    }
  }
  const findByType = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const readPinned = vi.fn();
  // Declared inside vi.hoisted: a vi.mock factory runs before any top-level
  // const in this file exists.
  class DocumentServiceStub {
    findByType = findByType;
    create = create;
    update = update;
    readPinned = readPinned;
  }
  return {
    DocumentServiceStub,
    requireUser: vi.fn(),
    db: {
      book: { findFirst: vi.fn(), update: vi.fn() },
      chapter: {
        findFirst: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        upsert: vi.fn(),
        aggregate: vi.fn(),
      },
      document: { findFirst: vi.fn() },
    },
    findByType,
    create,
    update,
    readPinned,
    onDocumentChanged: vi.fn(),
    canIndexProseForUser: vi.fn(),
    indexBatch: vi.fn(),
    VersionConflictError,
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => ({ write: vi.fn(), read: vi.fn(), delete: vi.fn() }),
  getSeriesStorage: () => ({ write: vi.fn(), read: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/lib/vector", () => ({ indexBatch: (...a: unknown[]) => h.indexBatch(...a) }));
vi.mock("@/lib/vector/memory-manager", () => ({
  onDocumentChanged: h.onDocumentChanged,
}));
vi.mock("@/lib/vector/indexing-gate", () => ({
  canIndexProseForUser: h.canIndexProseForUser,
}));

vi.mock("@/lib/documents", () => ({
  DocumentService: h.DocumentServiceStub,
  VersionConflictError: h.VersionConflictError,
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: h.DocumentServiceStub,
}));

import { PUT as PUT_CONTENT } from "@/app/api/books/[id]/chapters/[chapterId]/content/route";
import { POST as IMPORT } from "@/app/api/books/[id]/import/route";
import { changeTypeForSource } from "@/lib/documents/change-type";

/**
 * The badge the version row actually receives for the last update(): the
 * changeType the caller stated, or — when it states only a source — the
 * service's derivation from that source.
 */
function effectiveBadge(): string {
  const args = h.update.mock.calls.at(-1) as unknown[] | undefined;
  if (!args) throw new Error("update() was never called");
  const changeType = args[3] as string | undefined;
  const changeSource = (args[4] as string | undefined) ?? "user";
  return changeType ?? changeTypeForSource(changeSource);
}

function contentPut(body: unknown) {
  return new Request("http://t/api/books/b1/chapters/ch1/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

function importPost(body: unknown) {
  return new Request("http://t/api/books/b1/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const ctxChapter = {
  params: Promise.resolve({ id: "b1", chapterId: "ch1" }),
} as never;
const ctxBook = { params: Promise.resolve({ id: "b1" }) } as never;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.book.update.mockResolvedValue({ id: "b1" });
  h.db.chapter.findFirst.mockResolvedValue({
    id: "ch1",
    bookId: "b1",
    chapterNumber: 1,
    wordCount: 100,
    // Older than the document below, so the orphan-reclaim branch stays shut.
    createdAt: new Date("2026-01-01T00:00:00Z"),
  });
  h.db.chapter.update.mockResolvedValue({});
  h.db.chapter.updateMany.mockResolvedValue({ count: 1 });
  h.db.chapter.upsert.mockResolvedValue({ id: "ch1", chapterNumber: 1 });
  h.db.chapter.aggregate.mockResolvedValue({
    _count: { _all: 1 },
    _sum: { wordCount: 100 },
  });
  h.findByType.mockResolvedValue({
    id: "doc1",
    currentVersion: 3,
    createdAt: new Date("2026-02-01T00:00:00Z"),
  });
  h.update.mockResolvedValue({
    document: { id: "doc1" },
    version: { version: 4 },
  });
  h.create.mockResolvedValue({ id: "doc1" });
  h.canIndexProseForUser.mockResolvedValue(false);
  h.onDocumentChanged.mockResolvedValue(undefined);
  h.indexBatch.mockResolvedValue(undefined);
});

describe("D-199: the content PUT badges the writer it was actually given", () => {
  it("a writer's own save is still a manual edit", async () => {
    const res = await PUT_CONTENT(
      contentPut({ markdown: "typed prose", expectedVersion: 3 }),
      ctxChapter
    );
    expect(res.status).toBe(200);
    expect(effectiveBadge()).toBe("manual_edit");
  });

  it("an agent-sourced save is badged AI, not Manual", async () => {
    // `changeSource` is a TRUSTED_VERSIONLESS_SOURCE here, so the save goes
    // through without a CAS stamp — the exact path that produced live
    // `manual_edit`/`agent` rows.
    const res = await PUT_CONTENT(
      contentPut({ markdown: "model prose", changeSource: "agent" }),
      ctxChapter
    );
    expect(res.status).toBe(200);
    expect(effectiveBadge()).toBe("agent_write");
  });

  it("a system-sourced save is not badged as the writer's typing", async () => {
    const res = await PUT_CONTENT(
      contentPut({ markdown: "migrated prose", changeSource: "system" }),
      ctxChapter
    );
    expect(res.status).toBe(200);
    expect(effectiveBadge()).not.toBe("manual_edit");
  });
});

describe("D-199: re-importing over an existing chapter is badged Import", () => {
  it("import UPDATE does not claim the writer typed it", async () => {
    const res = await IMPORT(
      importPost({
        actNumber: 1,
        chapters: [
          {
            number: 1,
            title: "One",
            content: "imported prose",
            action: "create",
          },
        ],
      }),
      ctxBook
    );
    expect(res.status).toBe(200);

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(effectiveBadge()).toBe("import");
  });
});
