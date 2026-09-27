// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import {
  act,
  renderHook,
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import type { Editor } from "@tiptap/react";

import { useDraftBuffer } from "@/hooks/use-draft-buffer";
import {
  lastChanceKeyFor,
  readLastChanceDraft,
  writeLastChanceDraft,
} from "@/lib/offline/last-chance-mirror";
import type { ChapterDraft } from "@/lib/offline/draft-store";
import { applyRecoveryDecision } from "@/components/editor/draft-recovery";
import { SaveConflictDialog } from "@/components/editor/save-conflict-dialog";
import {
  destroyPaneStore,
  getOrCreatePaneStore,
} from "@/stores/editor-store";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P5-S02, P5-S06, X-S23 — the last-chance localStorage mirror outlived the
 * words it protected and later raised a FALSE conflict that put old text back
 * in the editor.
 *
 * A crashed or closed tab leaves its mirror stamped with ITS clientId, and a
 * new page load always has a new one. Recovery re-buffered only the IDB row
 * under the new clientId, so the save-success `clearDraft({ onlyIfMine })`
 * and the conflict dialog's own clearing both skipped the foreign mirror.
 * Once another device saved, the next load of the chapter read that mirror as
 * newer unsaved typing: conflict chip, stale text, and "Load theirs" looped.
 *
 * Recovery must adopt BOTH rows, and resolving must clear BOTH.
 */

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

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  }),
}));

const h = vi.hoisted(() => ({
  saveChapter: vi.fn(async () => ({ version: 4 })),
}));

vi.mock("@/hooks/use-documents", () => ({
  useSaveChapterContent: () => ({ mutateAsync: h.saveChapter }),
  useSaveDocumentContent: () => ({ mutateAsync: vi.fn() }),
}));

type EditorPaneStore = ReturnType<typeof getOrCreatePaneStore>;

const BOOK = "book-1";
const CHAPTER = "ch-tide";
const PANE = "mirror-resolution-pane";
const t = getUIStrings("en");

/** A mirror row as a crashed / closed tab leaves it: someone else's clientId. */
function leaveCrashedTabMirror(markdown: string, baseVersion: number): void {
  writeLastChanceDraft({ chapterId: CHAPTER, bookId: BOOK, markdown, baseVersion });
  const raw = JSON.parse(localStorage.getItem(lastChanceKeyFor(CHAPTER))!) as
    Record<string, unknown>;
  localStorage.setItem(
    lastChanceKeyFor(CHAPTER),
    JSON.stringify({ ...raw, clientId: "crashed-tab", updatedAt: Date.now() - 5_000 })
  );
}

/** tiptap double: markdown storage, update events, and setContent. */
function makeFakeEditor(store: EditorPaneStore, initial: string) {
  let markdown = initial;
  const handlers = new Set<() => void>();
  const editor = {
    isDestroyed: false,
    storage: { markdown: { getMarkdown: () => markdown } },
    commands: {
      setContent(next: string) {
        markdown = next;
        return true;
      },
    },
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
    type(next: string) {
      markdown = next;
      store.getState().markDirty();
      handlers.forEach((fn) => fn());
    },
  };
}

function openChapter(serverVersion: number): EditorPaneStore {
  const store = getOrCreatePaneStore(PANE);
  store.getState().setChapter(BOOK, CHAPTER, 1);
  store.getState().setDocumentVersion(serverVersion);
  store.getState().markClean();
  return store;
}

function renderBuffer(store: EditorPaneStore, editor: Editor) {
  const editorRef = { current: editor };
  const view = renderHook(() =>
    useDraftBuffer({
      paneStore: store,
      editorRef,
      editor,
      paneChapterId: CHAPTER,
      bookId: BOOK,
    })
  );
  return { view, editorRef };
}

async function recover(
  store: EditorPaneStore,
  editorRef: { current: Editor | null },
  api: ReturnType<typeof useDraftBuffer>,
  serverMarkdown: string,
  serverVersion: number
) {
  const decision = await api.checkRecovery(CHAPTER, serverMarkdown, serverVersion);
  await act(async () => {
    applyRecoveryDecision({
      decision,
      editorRef,
      paneStore: store,
      chapterId: CHAPTER,
      serverMarkdown,
      serverVersion,
      onConflictToast: () => {},
      adoptDraft: api.adoptDraft,
      clearDraft: api.clearDraft,
      strings: { recovered: t.toasts.draftRecovered, discard: t.toasts.discardRecovery },
    });
    // adoptDraft's IDB write is async.
    await Promise.resolve();
    await Promise.resolve();
  });
  return decision;
}

beforeEach(() => {
  localStorage.clear();
  idbRows.clear();
  h.saveChapter.mockClear();
});

afterEach(() => {
  cleanup();
  destroyPaneStore(PANE);
});

describe("P5-S02 / P5-S06 — restore, then save", () => {
  it("clears the crashed tab's mirror once the recovered words are saved", async () => {
    const serverV8 = "The tide tables were wrong again.";
    const recovered = `${serverV8} crash words walked river stone`;
    leaveCrashedTabMirror(recovered, 8);

    const store = openChapter(8);
    const fake = makeFakeEditor(store, serverV8);
    const { view, editorRef } = renderBuffer(store, fake.editor);

    const decision = await recover(store, editorRef, view.result.current, serverV8, 8);
    expect(decision).toEqual({ kind: "restore", markdown: recovered });

    // The stamped PUT lands (v9) and the editor's success path runs clearDraft.
    act(() => {
      store.getState().setDocumentVersion(9);
      view.result.current.clearDraft(CHAPTER);
    });

    expect(readLastChanceDraft(CHAPTER)).toBeNull();
    expect(idbRows.has(CHAPTER)).toBe(false);

    // The harm the stale row caused: the laptop saves v10, the phone reopens
    // the chapter — that must be a clean load, not a conflict with v9 text.
    const next = await view.result.current.checkRecovery(
      CHAPTER,
      `${recovered} and the laptop's new line`,
      10
    );
    expect(next).toEqual({ kind: "none" });
  });
});

describe("X-S23 — conflict recovered after a close, resolved with Keep mine", () => {
  it("clears every draft of the resolved conflict, the mirror included", async () => {
    const serverV3 = "Verify chapter opens. The other device's paragraph.";
    const phoneWords = "Verify chapter opens. The phone's offline paragraph.";
    leaveCrashedTabMirror(phoneWords, 2);

    const store = openChapter(3);
    const fake = makeFakeEditor(store, serverV3);
    const { view, editorRef } = renderBuffer(store, fake.editor);

    const decision = await recover(store, editorRef, view.result.current, serverV3, 3);
    expect(decision.kind).toBe("conflict");
    expect(store.getState().saveConflict).not.toBeNull();

    render(
      <SaveConflictDialog
        open
        onOpenChange={() => {}}
        bookId={BOOK}
        chapterId={CHAPTER}
        paneId={PANE}
        editor={fake.editor}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: t.editorChrome.keepMine }));

    await waitFor(() => expect(store.getState().saveConflict).toBeNull());
    expect(h.saveChapter).toHaveBeenCalledWith(
      expect.objectContaining({ markdown: phoneWords, expectedVersion: 3 })
    );
    await waitFor(() => expect(idbRows.has(CHAPTER)).toBe(false));
    expect(readLastChanceDraft(CHAPTER)).toBeNull();

    // Another device saves v5; reopening on the phone must not re-raise the
    // conflict with the words that are already v4.
    const next = await view.result.current.checkRecovery(
      CHAPTER,
      `${phoneWords} Tablet line.`,
      5
    );
    expect(next).toEqual({ kind: "none" });
  });
});
