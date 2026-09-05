import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Cross-tab non-clobber guard on putDraft (review finding: "two offline tabs
 * overwrite the same saved draft record"). putDraft must NOT let a stale,
 * less-synced tab silently destroy a different tab's fresher offline draft
 * when both target the same chapter.
 *
 * The real store is IndexedDB keyed by chapterId, so this runs against a
 * minimal in-memory `idb` mock that exercises the actual guard branch inside
 * putDraft. Each test gets its own freshly-imported draft-store module (and
 * therefore its own cached clientId) so "same tab" vs "foreign tab" is a real
 * distinction rather than a cross-test leak.
 */

const memoryStore = new Map<string, any>();

vi.mock("idb", () => ({
  openDB: vi.fn(async () => ({
    transaction: vi.fn(() => ({
      store: {
        get: vi.fn(async (key: string) => memoryStore.get(key) ?? undefined),
        put: vi.fn(async (value: any) => {
          memoryStore.set(value.chapterId, value);
          return value.chapterId;
        }),
        delete: vi.fn(async (key: string) => {
          memoryStore.delete(key);
        }),
        index: vi.fn(),
      },
      done: Promise.resolve(),
    })),
    put: vi.fn(),
  })),
}));

let put: (typeof import("@/lib/offline/draft-store"))["putDraft"] | undefined;
let myClientId: (() => string) | undefined;

// Fresh module per test: gives a clean cached clientId and a fresh dbPromise,
// so each test genuinely starts as "a different tab" from the one before.
beforeEach(async () => {
  memoryStore.clear();
  // isDraftStoreAvailable() gates getDb() on a global `indexedDB`. Stub it so
  // the mocked `idb.openDB` path is exercised (real IDB is absent in node env).
  vi.stubGlobal("indexedDB", {});
  vi.resetModules();
  const mod = await import("@/lib/offline/draft-store");
  put = mod.putDraft;
  myClientId = mod.getClientId;
});

describe("putDraft — cross-tab non-clobber guard", () => {
  it("empty store: first tab writes normally", async () => {
    const ok = await put!({
      chapterId: "ch1",
      bookId: "b1",
      markdown: "draft from tab A at base 3",
      baseVersion: 3,
    });
    expect(ok).toBe(true);
    expect(memoryStore.get("ch1").markdown).toContain("tab A");
  });

  it("same tab overwrites its own existing draft freely", async () => {
    // The CURRENT tab already wrote this chapter (its own clientId in store).
    memoryStore.set("ch1", {
      chapterId: "ch1",
      bookId: "b1",
      markdown: "old A",
      baseVersion: 3,
      clientId: myClientId!(),
      updatedAt: Date.now(),
    });
    const ok = await put!({
      chapterId: "ch1",
      bookId: "b1",
      markdown: "new A",
      baseVersion: 3,
    });
    expect(ok).toBe(true);
    expect(memoryStore.get("ch1").markdown).toContain("new A");
  });

  it("REJECTS a stale tab clobbering a different tab that is synced further ahead", async () => {
    // Foreign tab (different clientId) is synced further ahead (baseVersion 8).
    memoryStore.set("ch1", {
      chapterId: "ch1",
      bookId: "b1",
      markdown: "foreign tab B newer",
      baseVersion: 8,
      clientId: "foreign-tab-b",
      updatedAt: Date.now(),
    });
    const ok = await put!({
      chapterId: "ch1",
      bookId: "b1",
      markdown: "stale tab A",
      baseVersion: 3,
    });
    expect(ok).toBe(false);
    expect(memoryStore.get("ch1").markdown).toContain("foreign tab B newer");
  });

  it("ALLOWS overwrite when this tab is synced as far as the foreign draft", async () => {
    memoryStore.set("ch1", {
      chapterId: "ch1",
      bookId: "b1",
      markdown: "foreign tab B at 5",
      baseVersion: 5,
      clientId: "foreign-tab-b",
      updatedAt: Date.now(),
    });
    const ok = await put!({
      chapterId: "ch1",
      bookId: "b1",
      markdown: "tab A at 5 with edits",
      baseVersion: 5,
    });
    expect(ok).toBe(true);
    expect(memoryStore.get("ch1").markdown).toContain("tab A at 5 with edits");
  });
});