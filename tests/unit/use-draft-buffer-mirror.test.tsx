// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "zustand";
import type { StoreApi } from "zustand";
import type { Editor } from "@tiptap/react";

import {
  useDraftBuffer,
  MIRROR_KEYSTROKE_THROTTLE_MS,
} from "@/hooks/use-draft-buffer";
import {
  lastChanceKeyFor,
  readLastChanceDraft,
  writeLastChanceDraft,
} from "@/lib/offline/last-chance-mirror";
import { getDraft, putDraft } from "@/lib/offline/draft-store";
import type { EditorPaneState } from "@/stores/editor-store";

/**
 * D-24 — hard crash loses 100% of unsaved typing: the IDB buffer's first
 * interval tick lands 2s after dirty and the unload flush needs an event
 * that a hard kill never fires. The hook must therefore:
 *
 *  1. persist SYNCHRONOUSLY on every editor update — no unload event, no
 *     timer advance, no awaited IDB write involved;
 *  2. prefer the newer of {IDB draft, last-chance mirror} on recovery;
 *  3. mirror synchronously in the unload flush (the async IDB put may never
 *     commit during teardown);
 *  4. drop the mirror alongside the IDB draft on save-success clearDraft.
 */

vi.mock("@/lib/offline/draft-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/offline/draft-store")>();
  return {
    ...actual,
    getDraft: vi.fn(async () => null),
    putDraft: vi.fn(async () => true),
    deleteDraft: vi.fn(async () => true),
  };
});

const CHAPTER = "ch-1";
const BOOK = "book-1";
const SERVER_MD = "Crash baseline.";
const SERVER_VERSION = 3;

function makePaneStore(): StoreApi<EditorPaneState> {
  return createStore<EditorPaneState>(
    (set) =>
      ({
        chapterId: CHAPTER,
        isDirty: false,
        documentVersion: SERVER_VERSION,
        markDirty: () => set({ isDirty: true } as Partial<EditorPaneState>),
      }) as unknown as EditorPaneState
  );
}

/**
 * Minimal tiptap double: markdown storage + the on/off("update") surface the
 * hook subscribes to. `type()` emulates a keystroke — tiptap's own onUpdate
 * (which marks the pane dirty) runs before external listeners, so the store
 * is marked dirty first, exactly like production registration order.
 */
function makeFakeEditor(store: StoreApi<EditorPaneState>, initial: string) {
  let markdown = initial;
  const handlers = new Set<() => void>();
  const editor = {
    isDestroyed: false,
    storage: { markdown: { getMarkdown: () => markdown } },
    on(event: string, handler: () => void) {
      if (event === "update") handlers.add(handler);
      return editor;
    },
    off(event: string, handler: () => void) {
      if (event === "update") handlers.delete(handler);
      return editor;
    },
  };
  return {
    editor: editor as unknown as Editor,
    type(next: string): void {
      markdown = next;
      store.getState().markDirty();
      handlers.forEach((h) => h());
    },
    setMarkdownSilently(next: string): void {
      markdown = next;
    },
  };
}

function renderBuffer(
  store: StoreApi<EditorPaneState>,
  editor: Editor | null
) {
  // Stable across re-renders, like the useRef the production editor passes —
  // a fresh object literal per render would churn the hook's callback
  // identities and reset its effect-local throttle state.
  const editorRef = { current: editor };
  return renderHook(() =>
    useDraftBuffer({
      paneStore: store,
      editorRef,
      editor,
      paneChapterId: CHAPTER,
      bookId: BOOK,
    })
  );
}

beforeEach(() => {
  localStorage.clear();
  (getDraft as unknown as Mock).mockReset();
  (getDraft as unknown as Mock).mockResolvedValue(null);
  (putDraft as unknown as Mock).mockClear();
});

describe("useDraftBuffer — D-24 synchronous last-chance persistence", () => {
  it("persists the first keystroke of a burst synchronously (leading edge) — no unload event", () => {
    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    renderBuffer(store, fake.editor);

    act(() => {
      fake.type(`${SERVER_MD} crash-mar`);
    });

    // Assert IMMEDIATELY: nothing awaited, no timer advanced, no unload
    // event dispatched — the words must already be durable.
    const row = readLastChanceDraft(CHAPTER);
    expect(row?.markdown).toBe(`${SERVER_MD} crash-mar`);
    expect(row?.baseVersion).toBe(SERVER_VERSION);
  });

  it("throttles a keystroke burst yet always lands the final content on the trailing edge", () => {
    vi.useFakeTimers();
    try {
      const store = makePaneStore();
      const fake = makeFakeEditor(store, SERVER_MD);
      renderBuffer(store, fake.editor);

      const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
      const mirrorWrites = () =>
        setItemSpy.mock.calls.filter(
          ([key]) => key === lastChanceKeyFor(CHAPTER)
        ).length;

      // 10 updates 10ms apart — one full ProseMirror serialize + stringify +
      // sync localStorage write per keystroke would be 10 writes.
      act(() => {
        for (let i = 1; i <= 10; i += 1) {
          fake.type(`${SERVER_MD} burst-${i}`);
          vi.advanceTimersByTime(10);
        }
      });
      // Leading write only so far — the rest of the burst is coalesced.
      expect(mirrorWrites()).toBe(1);
      expect(readLastChanceDraft(CHAPTER)?.markdown).toBe(
        `${SERVER_MD} burst-1`
      );

      // Trailing edge: the LAST keystroke of the burst always lands within
      // one throttle window.
      act(() => {
        vi.advanceTimersByTime(MIRROR_KEYSTROKE_THROTTLE_MS);
      });
      expect(mirrorWrites()).toBe(2);
      expect(readLastChanceDraft(CHAPTER)?.markdown).toBe(
        `${SERVER_MD} burst-10`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("unload flush bypasses the throttle — mirrors immediately mid-window", () => {
    vi.useFakeTimers();
    try {
      const store = makePaneStore();
      const fake = makeFakeEditor(store, SERVER_MD);
      renderBuffer(store, fake.editor);

      act(() => {
        fake.type(`${SERVER_MD} leading`); // leading write, window opens
        vi.advanceTimersByTime(10); // well inside the throttle window
        fake.setMarkdownSilently(`${SERVER_MD} tail-past-throttle`);
        window.dispatchEvent(new Event("pagehide"));
      });

      // No timer advance past the window — the flush itself must have
      // mirrored the newest words synchronously.
      expect(readLastChanceDraft(CHAPTER)?.markdown).toBe(
        `${SERVER_MD} tail-past-throttle`
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not mirror while the pane is clean", () => {
    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    renderBuffer(store, fake.editor);

    // Programmatic content application without dirtiness (e.g. initial load)
    // must not create a draft.
    act(() => {
      fake.setMarkdownSilently("server-applied content");
    });
    expect(readLastChanceDraft(CHAPTER)).toBeNull();
  });

  it("mirrors synchronously in the unload flush even if the IDB write never lands", () => {
    (putDraft as unknown as Mock).mockImplementation(
      () => new Promise(() => {}) // IDB put that never commits (teardown race)
    );
    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    renderBuffer(store, fake.editor);

    act(() => {
      store.getState().markDirty();
      fake.setMarkdownSilently(`${SERVER_MD} tail-words`);
      window.dispatchEvent(new Event("pagehide"));
    });

    expect(readLastChanceDraft(CHAPTER)?.markdown).toBe(
      `${SERVER_MD} tail-words`
    );
  });

  it("checkRecovery prefers the newer last-chance mirror over an older IDB draft and consumes it", async () => {
    (getDraft as unknown as Mock).mockResolvedValue({
      chapterId: CHAPTER,
      bookId: BOOK,
      markdown: `${SERVER_MD} older-idb-words`,
      baseVersion: SERVER_VERSION,
      updatedAt: Date.now() - 60_000,
      clientId: "crashed-tab",
    });
    writeLastChanceDraft({
      chapterId: CHAPTER,
      bookId: BOOK,
      markdown: `${SERVER_MD} newest-mirror-words`,
      baseVersion: SERVER_VERSION,
    });

    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    const { result } = renderBuffer(store, fake.editor);

    const decision = await result.current.checkRecovery(
      CHAPTER,
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({
      kind: "restore",
      markdown: `${SERVER_MD} newest-mirror-words`,
    });
    // Consumed: a restored-then-discarded draft must never resurrect.
    expect(readLastChanceDraft(CHAPTER)).toBeNull();
  });

  it("checkRecovery still restores from a newer IDB draft when the mirror is older", async () => {
    writeLastChanceDraft({
      chapterId: CHAPTER,
      bookId: BOOK,
      markdown: `${SERVER_MD} older-mirror-words`,
      baseVersion: SERVER_VERSION,
    });
    (getDraft as unknown as Mock).mockResolvedValue({
      chapterId: CHAPTER,
      bookId: BOOK,
      markdown: `${SERVER_MD} newer-idb-words`,
      baseVersion: SERVER_VERSION,
      updatedAt: Date.now() + 60_000,
      clientId: "crashed-tab",
    });

    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    const { result } = renderBuffer(store, fake.editor);

    const decision = await result.current.checkRecovery(
      CHAPTER,
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({
      kind: "restore",
      markdown: `${SERVER_MD} newer-idb-words`,
    });
  });

  it("leaves a foreign tab's live mirror intact while still using it for the decision", async () => {
    // Review blocker scenario: Tab A is ALIVE and typing this chapter
    // (mirror live per-keystroke) when Tab B loads the same chapter and runs
    // checkRecovery. Deleting A's row here would reopen the exact D-24
    // total-loss window for A (hard crash before A's next keystroke).
    //
    // The row must still be READ, not ignored: a crashed tab's row is also
    // "foreign" (clientId dies with the page — recovery after a real crash
    // always sees a foreign clientId), so refusing foreign rows would
    // disable mirror crash-recovery outright. This matches the IDB draft
    // path, which reads regardless of clientId for the same reason. The
    // multi-tab ambiguity resolves exactly like the IDB path: restore goes
    // through markDirty + CAS-stamped saves, and the surviving row is
    // reaped later (decision-"none" hygiene, discard, or 14-day prune).
    writeLastChanceDraft({
      chapterId: CHAPTER,
      bookId: BOOK,
      markdown: `${SERVER_MD} live-tab-a-words`,
      baseVersion: SERVER_VERSION,
    });
    const raw = JSON.parse(
      localStorage.getItem(lastChanceKeyFor(CHAPTER))!
    ) as Record<string, unknown>;
    localStorage.setItem(
      lastChanceKeyFor(CHAPTER),
      JSON.stringify({ ...raw, clientId: "live-tab-a" })
    );

    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    const { result } = renderBuffer(store, fake.editor);

    const decision = await result.current.checkRecovery(
      CHAPTER,
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({
      kind: "restore",
      markdown: `${SERVER_MD} live-tab-a-words`,
    });
    // NOT consumed — the owning tab may be alive and still typing.
    expect(readLastChanceDraft(CHAPTER)?.markdown).toBe(
      `${SERVER_MD} live-tab-a-words`
    );
  });

  it("reaps a foreign mirror whose words already match the server (CAS-guarded hygiene)", async () => {
    writeLastChanceDraft({
      chapterId: CHAPTER,
      bookId: BOOK,
      markdown: SERVER_MD,
      baseVersion: SERVER_VERSION,
    });
    const raw = JSON.parse(
      localStorage.getItem(lastChanceKeyFor(CHAPTER))!
    ) as Record<string, unknown>;
    localStorage.setItem(
      lastChanceKeyFor(CHAPTER),
      JSON.stringify({ ...raw, clientId: "crashed-tab" })
    );

    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    const { result } = renderBuffer(store, fake.editor);

    const decision = await result.current.checkRecovery(
      CHAPTER,
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({ kind: "none" });
    // Server already holds these words — garbage for every tab; removed.
    expect(readLastChanceDraft(CHAPTER)).toBeNull();
  });

  it("clearDraft drops this tab's mirror row (save success)", () => {
    const store = makePaneStore();
    const fake = makeFakeEditor(store, SERVER_MD);
    const { result } = renderBuffer(store, fake.editor);

    act(() => {
      fake.type(`${SERVER_MD} words-to-save`);
    });
    expect(readLastChanceDraft(CHAPTER)).not.toBeNull();

    act(() => {
      result.current.clearDraft(CHAPTER);
    });
    expect(readLastChanceDraft(CHAPTER)).toBeNull();
  });
});
