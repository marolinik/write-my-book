import { describe, it, expect, vi, beforeEach } from "vitest";
import type { StorageAdapter } from "@/lib/storage/types";

// Hoisted fake interactive-transaction client, shared by the mock factory and
// the tests. Prisma's $transaction(cb) is emulated by invoking cb(tx).
const h = vi.hoisted(() => ({
  tx: {
    document: {
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    documentVersion: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(h.tx)),
  },
}));

import {
  VersionManager,
  computeLineDiff,
} from "@/lib/documents/version-manager";
import { VersionConflictError } from "@/lib/documents/errors";
import { getVersionStoragePath } from "@/lib/documents/storage-keys";

function makeStorage() {
  return {
    write: vi.fn(async () => {}),
    read: vi.fn(async () => null),
    delete: vi.fn(async () => {}),
    exists: vi.fn(async () => false),
  };
}

const asAdapter = (s: ReturnType<typeof makeStorage>) =>
  s as unknown as StorageAdapter;

describe("VersionManager.createVersion — optimistic locking (CAS)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws VersionConflictError and persists NOTHING when the guarded version is stale", async () => {
    // Stale CAS: updateMany matched 0 rows because currentVersion moved on.
    h.tx.document.updateMany.mockResolvedValue({ count: 0 });
    const storage = makeStorage();
    const vm = new VersionManager("doc-1", asAdapter(storage));

    await expect(
      vm.createVersion("new content", "autosave", "user", 5)
    ).rejects.toBeInstanceOf(VersionConflictError);

    // The whole point of the guard: a losing CAS must not write content or a row.
    expect(storage.write).not.toHaveBeenCalled();
    expect(h.tx.document.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(h.tx.documentVersion.create).not.toHaveBeenCalled();
  });

  it("guards the update with currentVersion and writes the new version on a winning CAS", async () => {
    h.tx.document.updateMany.mockResolvedValue({ count: 1 });
    h.tx.document.findUniqueOrThrow.mockResolvedValue({ currentVersion: 6 });
    h.tx.documentVersion.create.mockResolvedValue({ id: "v6", version: 6 });
    const storage = makeStorage();
    const vm = new VersionManager("doc-1", asAdapter(storage));

    const result = await vm.createVersion("hello world", "autosave", "user", 5);

    // CAS where-clause pins the expected version.
    expect(h.tx.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1", currentVersion: 5 },
      data: { currentVersion: { increment: 1 } },
    });
    // Content written under the NEW version's storage path.
    expect(storage.write).toHaveBeenCalledWith(
      getVersionStoragePath("doc-1", 6),
      "hello world"
    );
    // Version row created with the computed word count.
    expect(h.tx.documentVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: "doc-1",
        version: 6,
        storageKey: getVersionStoragePath("doc-1", 6),
        changeType: "autosave",
        changeSource: "user",
        wordCount: 2,
      }),
    });
    expect(result).toEqual({ id: "v6", version: 6 });
  });

  it("stays last-write-wins (no version guard) when expectedVersion is omitted", async () => {
    h.tx.document.updateMany.mockResolvedValue({ count: 1 });
    h.tx.document.findUniqueOrThrow.mockResolvedValue({ currentVersion: 3 });
    h.tx.documentVersion.create.mockResolvedValue({ id: "v3", version: 3 });
    const storage = makeStorage();
    const vm = new VersionManager("doc-1", asAdapter(storage));

    await vm.createVersion("content", "agent", "dev-editor");

    // Unguarded callers must NOT include currentVersion in the where clause.
    expect(h.tx.document.updateMany).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { currentVersion: { increment: 1 } },
    });
  });

  it("does NOT raise a conflict for an unguarded caller when 0 rows match (missing doc, not a stale CAS)", async () => {
    // count:0 without expectedVersion means the document row is missing → the
    // code proceeds to findUniqueOrThrow (P2025 in prod), NOT a conflict.
    h.tx.document.updateMany.mockResolvedValue({ count: 0 });
    h.tx.document.findUniqueOrThrow.mockRejectedValue(new Error("P2025"));
    const storage = makeStorage();
    const vm = new VersionManager("doc-1", asAdapter(storage));

    const err = await vm
      .createVersion("content", "agent", "dev-editor")
      .catch((e) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(VersionConflictError);
    expect((err as Error).message).toBe("P2025");
  });
});

describe("computeLineDiff", () => {
  it("marks identical text as all unchanged", () => {
    const diff = computeLineDiff("a\nb\nc", "a\nb\nc");
    expect(diff).toHaveLength(3);
    expect(diff.every((d) => d.type === "unchanged")).toBe(true);
  });

  it("detects a single added line", () => {
    const added = computeLineDiff("a\nb", "a\nX\nb").filter(
      (d) => d.type === "added"
    );
    expect(added).toHaveLength(1);
    expect(added[0].content).toBe("X");
  });

  it("detects a single removed line", () => {
    const removed = computeLineDiff("a\nb\nc", "a\nc").filter(
      (d) => d.type === "removed"
    );
    expect(removed).toHaveLength(1);
    expect(removed[0].content).toBe("b");
  });

  it("property: unchanged+added lines reconstruct the new text exactly", () => {
    const oldText = "one\ntwo\nthree";
    const newText = "one\ntwo-edited\nthree\nfour";
    const rebuilt = computeLineDiff(oldText, newText)
      .filter((d) => d.type !== "removed")
      .map((d) => d.content)
      .join("\n");
    expect(rebuilt).toBe(newText);
  });
});
