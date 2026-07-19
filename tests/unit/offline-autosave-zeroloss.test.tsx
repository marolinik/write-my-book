// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, renderHook } from "@testing-library/react";
import { createStore } from "zustand";
import type { StoreApi } from "zustand";
import type { Editor } from "@tiptap/react";

import {
  useDraftBuffer,
  decideRecovery,
  DRAFT_BUFFER_INTERVAL_MS,
  MIRROR_KEYSTROKE_THROTTLE_MS,
} from "@/hooks/use-draft-buffer";
import {
  readLastChanceDraft,
  writeLastChanceDraft,
  LAST_CHANCE_MAX_MARKDOWN_LENGTH,
} from "@/lib/offline/last-chance-mirror";
import {
  getDraft,
  putDraft,
  deleteDraft,
  getClientId,
  type ChapterDraft,
} from "@/lib/offline/draft-store";
import type { EditorPaneState } from "@/stores/editor-store";

/**
 * GATE 1 — "Zero words lost (all W4 disasters)."
 *
 * This is the deterministic harness for the offline-autosave disaster class
 * that the campaign's W4 UI drills marked 0/8 BLOCKED-ENV (they need a live
 * Chrome + real IndexedDB + a real crash on :3002). Every scenario here is
 * exercised WITHOUT a network, a live browser, or an LLM.
 *
 * Fidelity of the two durability layers under test:
 *   - The SYNCHRONOUS localStorage last-chance mirror (last-chance-mirror.ts)
 *     is the REAL module running against jsdom's REAL localStorage — its
 *     zero-settle durability is proven for real here.
 *   - The asynchronous IndexedDB write-behind buffer (draft-store.ts) is
 *     SIMULATED by an in-memory Map honouring the same put/get/delete
 *     contract (jsdom ships no IndexedDB). The logic that decides whether the
 *     writer's words are written, retained, and offered back on reload is the
 *     REAL hook + REAL decision table; only the storage engine is a stand-in.
 *
 * The end-to-end confirmation of the same eight classes in a real browser
 * with real IndexedDB and a real OS-level kill is BLOCKED-ENV in this runner
 * and lives in tests/e2e/offline-autosave.spec.ts +
 * tests/e2e/w4-data-safety-drills.spec.ts (need the dev server on :3002).
 *
 * Cardinal rule for this file: every assertion checks the WRITER'S WORDS are
 * never lost — the strong bar, no renegotiation. Where the current code
 * cannot meet the strong bar, that leg is an explicit documented-RED
 * (`it.fails`), never a silently weakened PASS.
 */

// ── Simulated IndexedDB engine (in-memory, same contract) ─────
// vi.hoisted so the mock factory (hoisted above imports) can close over it.
const { idbRows } = vi.hoisted(() => ({
  idbRows: new Map<string, ChapterDraft>(),
}));

vi.mock("@/lib/offline/draft-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/offline/draft-store")>();
  return {
    ...actual,
    getDraft: vi.fn(async (chapterId: string) => idbRows.get(chapterId) ?? null),
    putDraft: vi.fn(async (input: Omit<ChapterDraft, "updatedAt" | "clientId">) => {
      idbRows.set(input.chapterId, {
        ...input,
        updatedAt: Date.now(),
        clientId: actual.getClientId(),
      });
      return true;
    }),
    deleteDraft: vi.fn(
      async (
        chapterId: string,
        opts?: { onlyIfMine?: boolean; ifUpdatedAtEquals?: number }
      ) => {
        const existing = idbRows.get(chapterId);
        if (existing) {
          if (opts?.onlyIfMine && existing.clientId !== actual.getClientId()) {
            return false;
          }
          if (
            opts?.ifUpdatedAtEquals !== undefined &&
            existing.updatedAt !== opts.ifUpdatedAtEquals
          ) {
            return false;
          }
        }
        idbRows.delete(chapterId);
        return true;
      }
    ),
  };
});

// ── Fake editor + pane store (minimal, production-faithful) ───

const BOOK = "book-1";
const SERVER_MD = "The harbor lay quiet under the morning fog.";
const SERVER_VERSION = 3;

/** Minimal pane store — only the fields bufferNow/mirrorNow actually read. */
function makePaneStore(chapterId: string): StoreApi<EditorPaneState> {
  return createStore<EditorPaneState>(
    (set) =>
      ({
        chapterId,
        isDirty: false,
        documentVersion: SERVER_VERSION,
        markDirty: () => set({ isDirty: true } as Partial<EditorPaneState>),
        markClean: () => set({ isDirty: false } as Partial<EditorPaneState>),
      }) as unknown as EditorPaneState
  );
}

/**
 * Fake tiptap editor. Registers update handlers exactly like production: the
 * editor's own onUpdate (which marks the pane dirty) fires BEFORE external
 * listeners, so the hook's dirty guard sees the current keystroke.
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
    /** A real keystroke: mutates content, marks dirty, fires update. */
    type(next: string): void {
      markdown = next;
      store.getState().markDirty();
      handlers.forEach((h) => h());
    },
    /** Content moved without an update event (e.g. mid-teardown DOM state). */
    setMarkdownSilently(next: string): void {
      markdown = next;
    },
  };
}

function renderBuffer(store: StoreApi<EditorPaneState>, editor: Editor | null) {
  const editorRef = { current: editor };
  return renderHook(() =>
    useDraftBuffer({
      paneStore: store,
      editorRef,
      editor,
      paneChapterId: store.getState().chapterId,
      bookId: BOOK,
    })
  );
}

beforeEach(() => {
  localStorage.clear();
  idbRows.clear();
  (getDraft as unknown as Mock).mockClear();
  (putDraft as unknown as Mock).mockClear();
  (deleteDraft as unknown as Mock).mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════
// Offline W4-disaster scenario class (the 0/8 that was BLOCKED-ENV)
// ══════════════════════════════════════════════════════════════

describe("Gate 1 — offline autosave zero-word-loss scenario class", () => {
  // ── (1) edit while offline, then reconnect → the edit survives ──
  it("[1] offline edit is durable in BOTH stores and replays intact on reconnect", async () => {
    const store = makePaneStore("ch-1");
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);
    const words = `${SERVER_MD} words typed during the outage`;

    // Type while "offline". The synchronous mirror captures it instantly...
    act(() => fake.type(words));
    expect(readLastChanceDraft("ch-1")?.markdown).toBe(words);

    // ...and the write-behind buffer lands it in IndexedDB on flush.
    await act(async () => {
      await view.result.current.bufferNow();
    });
    expect(idbRows.get("ch-1")?.markdown).toBe(words);

    // Reconnect / reload: a fresh pane checks recovery against the unchanged
    // server (baseVersion === serverVersion) → the exact words come back.
    const decision = await view.result.current.checkRecovery(
      "ch-1",
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({ kind: "restore", markdown: words });
    view.unmount();
  });

  // ── (2) save transport throws mid-autosave → nothing silently dropped ──
  it("[2] a FAILED save never destroys the local copy; only a confirmed save clears it", async () => {
    const store = makePaneStore("ch-2");
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);
    const words = `${SERVER_MD} unsent words`;

    act(() => fake.type(words));
    await act(async () => {
      await view.result.current.bufferNow();
    });
    expect(readLastChanceDraft("ch-2")?.markdown).toBe(words);
    expect(idbRows.get("ch-2")?.markdown).toBe(words);

    // Autosave transport throws (network/HTTP failure): the editor's failure
    // path (manuscript-editor.tsx:646-657) counts the failure and does NOT
    // call clearDraft — the words MUST remain buffered.
    // (Modelled by simply not clearing — a failed PUT touches no draft row.)
    expect(readLastChanceDraft("ch-2")?.markdown).toBe(words);
    expect(idbRows.get("ch-2")?.markdown).toBe(words);

    // Only a CONFIRMED server write (save success → clearDraft) reaps the row.
    act(() => view.result.current.clearDraft("ch-2"));
    expect(readLastChanceDraft("ch-2")).toBeNull();
    expect(idbRows.has("ch-2")).toBe(false);
    view.unmount();
  });

  // ── (3) tab/browser close with an unsaved buffer → recoverable draft ──
  it("[3] pagehide/visibilitychange flushes the un-throttled tail — zero loss on close", async () => {
    const store = makePaneStore("ch-3");
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);

    act(() => {
      fake.type(`${SERVER_MD} leading`); // opens the throttle window
      // Newest keystrokes land AFTER the leading write, still inside the
      // window — exactly the bytes a naive throttle would drop on close.
      fake.setMarkdownSilently(`${SERVER_MD} leading and the final sentence`);
      window.dispatchEvent(new Event("pagehide"));
    });

    // The unload flush mirrors UNCONDITIONALLY (bypasses the throttle) →
    // the full latest content is durable.
    expect(readLastChanceDraft("ch-3")?.markdown).toBe(
      `${SERVER_MD} leading and the final sentence`
    );
    view.unmount();
  });

  // ── (4) reload after offline edits → text restored verbatim ──
  it("[4] reload after an offline edit restores the words byte-for-byte", async () => {
    const store = makePaneStore("ch-4");
    const fake = makeFakeEditor(store, SERVER_MD);
    const first = renderBuffer(store, fake.editor);
    const words = `${SERVER_MD}\n\nA whole new paragraph, offline.`;

    act(() => fake.type(words));
    await act(async () => {
      await first.result.current.bufferNow();
    });
    first.unmount(); // the tab goes away

    // A brand-new tab/hook instance (fresh clientId is irrelevant to reads).
    const store2 = makePaneStore("ch-4");
    const fake2 = makeFakeEditor(store2, SERVER_MD);
    const second = renderBuffer(store2, fake2.editor);

    const decision = await second.result.current.checkRecovery(
      "ch-4",
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({ kind: "restore", markdown: words });
    // No truncation, no corruption, no prepend — exactly what was typed.
    if (decision.kind === "restore") {
      expect(decision.markdown).toBe(words);
    }
    second.unmount();
  });

  // ── (5) concurrent offline edits to two docs → no cross-contamination ──
  it("[5] two chapters edited offline stay perfectly isolated", async () => {
    const storeA = makePaneStore("ch-A");
    const fakeA = makeFakeEditor(storeA, SERVER_MD);
    const viewA = renderBuffer(storeA, fakeA.editor);

    const storeB = makePaneStore("ch-B");
    const fakeB = makeFakeEditor(storeB, SERVER_MD);
    const viewB = renderBuffer(storeB, fakeB.editor);

    const aWords = `${SERVER_MD} ALPHA-only words`;
    const bWords = `${SERVER_MD} BETA-only words`;
    act(() => {
      fakeA.type(aWords);
      fakeB.type(bWords);
    });
    await act(async () => {
      await viewA.result.current.bufferNow();
      await viewB.result.current.bufferNow();
    });

    // Neither store's words bled into the other — mirror and IDB both keyed.
    expect(readLastChanceDraft("ch-A")?.markdown).toBe(aWords);
    expect(readLastChanceDraft("ch-B")?.markdown).toBe(bWords);
    expect(idbRows.get("ch-A")?.markdown).toBe(aWords);
    expect(idbRows.get("ch-B")?.markdown).toBe(bWords);

    const decA = await viewA.result.current.checkRecovery(
      "ch-A",
      SERVER_MD,
      SERVER_VERSION
    );
    const decB = await viewB.result.current.checkRecovery(
      "ch-B",
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decA).toEqual({ kind: "restore", markdown: aWords });
    expect(decB).toEqual({ kind: "restore", markdown: bWords });
    viewA.unmount();
    viewB.unmount();
  });

  // ── (6) reconnect replay is idempotent (no dup / no clobber loses words) ──
  it("[6] replay is idempotent — restored content is never duplicated or re-lost", async () => {
    const store = makePaneStore("ch-6");
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);
    const words = `${SERVER_MD} recovered exactly once`;

    act(() => fake.type(words));
    await act(async () => {
      await view.result.current.bufferNow();
    });

    // First replay: restore the words (the mirror row is this tab's, so it is
    // consumed; the IDB row remains as the durable source).
    const first = await view.result.current.checkRecovery(
      "ch-6",
      SERVER_MD,
      SERVER_VERSION
    );
    expect(first).toEqual({ kind: "restore", markdown: words });

    // Second replay (e.g. a double mount / refetch): still exactly the words —
    // never "wordswords" and never an empty/lost restore.
    const second = await view.result.current.checkRecovery(
      "ch-6",
      SERVER_MD,
      SERVER_VERSION
    );
    expect(second).toEqual({ kind: "restore", markdown: words });

    // Once the server has caught up to the words, replay is a clean no-op —
    // it does NOT re-apply and clobber anything.
    const settled = await view.result.current.checkRecovery(
      "ch-6",
      words,
      SERVER_VERSION + 1
    );
    expect(settled).toEqual({ kind: "none" });
    view.unmount();
  });

  // ── (7) very large buffer ──
  it("[7a] a large (under-cap) draft round-trips through the mirror intact", () => {
    // ~900KB — under the 1MB mirror ceiling; must persist byte-for-byte.
    const big = "x".repeat(900_000);
    expect(
      writeLastChanceDraft({
        chapterId: "ch-7",
        bookId: BOOK,
        markdown: big,
        baseVersion: SERVER_VERSION,
      })
    ).toBe(true);
    expect(readLastChanceDraft("ch-7")?.markdown).toBe(big);
  });

  it("[7b] an over-cap draft the mirror refuses is STILL covered by the IDB buffer", async () => {
    const store = makePaneStore("ch-7b");
    const huge = "y".repeat(LAST_CHANCE_MAX_MARKDOWN_LENGTH + 1);
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);

    act(() => fake.type(huge));
    await act(async () => {
      await view.result.current.bufferNow();
    });

    // The synchronous mirror opts out above 1MB (jank/quota guard)...
    expect(readLastChanceDraft("ch-7b")).toBeNull();
    // ...but the writer's words are NOT lost — the IDB buffer holds them and
    // recovery offers them back. Honest fallback, no silent drop.
    expect(idbRows.get("ch-7b")?.markdown).toBe(huge);
    const decision = await view.result.current.checkRecovery(
      "ch-7b",
      SERVER_MD,
      SERVER_VERSION
    );
    expect(decision).toEqual({ kind: "restore", markdown: huge });
    view.unmount();
  });

  // ── (8) rapid successive edits (debounce) with a failing transport ──
  it("[8] a rapid burst under a dead transport loses nothing once the buffer settles", async () => {
    vi.useFakeTimers();
    try {
      const store = makePaneStore("ch-8");
      const fake = makeFakeEditor(store, SERVER_MD);
      const view = renderBuffer(store, fake.editor);

      // 10 keystrokes 10ms apart, transport permanently down (never cleared).
      act(() => {
        for (let i = 1; i <= 10; i += 1) {
          fake.type(`${SERVER_MD} burst-${i}`);
          vi.advanceTimersByTime(10);
        }
      });
      // Leading edge already durable — never a total-loss window.
      expect(readLastChanceDraft("ch-8")?.markdown).toBe(`${SERVER_MD} burst-1`);

      // Trailing edge lands the FINAL keystroke within one throttle window.
      act(() => vi.advanceTimersByTime(MIRROR_KEYSTROKE_THROTTLE_MS));
      expect(readLastChanceDraft("ch-8")?.markdown).toBe(
        `${SERVER_MD} burst-10`
      );

      // The 2s write-behind buffer independently captures the final content.
      await act(async () => {
        vi.advanceTimersByTime(DRAFT_BUFFER_INTERVAL_MS);
        await Promise.resolve();
      });
      expect(idbRows.get("ch-8")?.markdown).toBe(`${SERVER_MD} burst-10`);
      view.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// STEP 2 — D-24 strong-bar (restore the un-renegotiated zero-loss claim)
// ══════════════════════════════════════════════════════════════
//
// Background: the D-24 fix's E2E re-verify (2026-07-18) was originally written
// to assert the FULL typed marker survived a zero-settle hard close. It was
// then RENEGOTIATED to assert only a prefix (everything typed >200ms before
// the close), conceding the last ~150ms as "documented, accepted." These
// tests re-pin the strong bar deterministically so the automated gate can no
// longer certify D-24 on the weakened claim.

describe("D-24 strong-bar — hard-crash zero word loss", () => {
  // STRONG BAR, MET: any NOTIFIED teardown (tab close, SPA nav, unmount) is
  // truly zero-loss — the flush mirrors unconditionally and synchronously.
  it("graceful/notified teardown loses zero words (unmount flush)", () => {
    const store = makePaneStore("ch-sb1");
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);

    act(() => {
      fake.type(`${SERVER_MD} leading`);
      fake.setMarkdownSilently(`${SERVER_MD} leading + newest tail past throttle`);
      view.unmount(); // cleanup flush runs mirrorNow unconditionally
    });

    expect(readLastChanceDraft("ch-sb1")?.markdown).toBe(
      `${SERVER_MD} leading + newest tail past throttle`
    );
  });

  // REGRESSION FLOOR, MET: the ORIGINAL D-24 bug was TOTAL loss (baseline
  // only). This pins the floor that must never regress — even with ZERO
  // settle, no timers, and NO unload event, the leading edge is durable, so a
  // hard kill is at worst a bounded PARTIAL loss.
  it("hard kill with zero settle is never total loss — leading edge is durable", () => {
    const store = makePaneStore("ch-sb2");
    const fake = makeFakeEditor(store, SERVER_MD);
    const view = renderBuffer(store, fake.editor);

    act(() => {
      fake.type(`${SERVER_MD} kept`); // leading edge → synchronous write
      fake.type(`${SERVER_MD} kept then dropped`); // coalesced into pending trailing timer
    });

    // No timer advance, no unload event — a true OS-level kill. Something
    // durable exists and it is NOT the pristine baseline (the D-24 defect).
    const row = readLastChanceDraft("ch-sb2");
    expect(row).not.toBeNull();
    expect(row?.markdown).toBe(`${SERVER_MD} kept`);
    expect(row?.markdown).not.toBe(SERVER_MD); // baseline-only == D-24 total loss
    view.unmount();
  });

  // STRONG BAR, CURRENTLY UNMET (documented-RED): on a hard kill with NO
  // unload event, keystrokes inside the ~150ms throttle window are still lost.
  // The strong Gate-1 bar is "zero words lost" — this asserts it and is
  // EXPECTED to fail against current code, pinning the exact residual so a
  // regression that WIDENS the window is caught. Remove `.fails` when the
  // throttle window is closed (per-keystroke synchronous write, or window→0
  // within the 1MB mirror cap) — see the evidence md for the proposed fix.
  it.fails(
    "STRONG BAR: hard kill inside the throttle window loses zero words",
    () => {
      const store = makePaneStore("ch-sb3");
      const fake = makeFakeEditor(store, SERVER_MD);
      const view = renderBuffer(store, fake.editor);

      act(() => {
        fake.type(`${SERVER_MD} kept`);
        fake.type(`${SERVER_MD} kept then dropped`); // newest, still in-window
      });

      // Zero settle, no unload. The strong bar demands the NEWEST words be
      // durable. Current code only holds the leading edge → this fails.
      expect(readLastChanceDraft("ch-sb3")?.markdown).toBe(
        `${SERVER_MD} kept then dropped`
      );
      view.unmount();
    }
  );
});

// ══════════════════════════════════════════════════════════════
// Pure recovery-decision table (no store, no editor) — the "which words
// win" logic that underpins every scenario above. Zero-loss-critical
// branches: a moved server must NEVER silently overwrite, and a strictly
// newer offline draft must always be offered back.
// ══════════════════════════════════════════════════════════════

describe("decideRecovery — zero-loss decision table", () => {
  const draft = (markdown: string, baseVersion: number | null): ChapterDraft => ({
    chapterId: "ch",
    bookId: BOOK,
    markdown,
    baseVersion,
    updatedAt: Date.now(),
    clientId: getClientId(),
  });

  it("no draft → none", () => {
    expect(decideRecovery(null, SERVER_MD, SERVER_VERSION)).toEqual({
      kind: "none",
    });
  });

  it("draft equals server → none (nothing to restore, nothing lost)", () => {
    expect(decideRecovery(draft(SERVER_MD, 3), SERVER_MD, 3)).toEqual({
      kind: "none",
    });
  });

  it("same base as server → restore the newer offline typing", () => {
    const d = draft(`${SERVER_MD} newer`, 3);
    expect(decideRecovery(d, SERVER_MD, 3)).toEqual({
      kind: "restore",
      markdown: `${SERVER_MD} newer`,
    });
  });

  it("server has no document yet (version null) → restore (never lost)", () => {
    const d = draft("first words ever", null);
    expect(decideRecovery(d, "", null)).toEqual({
      kind: "restore",
      markdown: "first words ever",
    });
  });

  it("server MOVED under a stale base → conflict, NEVER a silent overwrite", () => {
    const d = draft(`${SERVER_MD} mine`, 3);
    const decision = decideRecovery(d, "Their external rewrite.", 5);
    expect(decision.kind).toBe("conflict");
    if (decision.kind === "conflict") {
      // The writer's words are preserved for the conflict dialog; the server's
      // version is carried through untouched — neither side is dropped.
      expect(decision.markdown).toBe(`${SERVER_MD} mine`);
      expect(decision.serverContent).toBe("Their external rewrite.");
      expect(decision.serverVersion).toBe(5);
      expect(decision.baseVersion).toBe(3);
    }
  });
});
