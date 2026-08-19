// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import type { Editor } from "@tiptap/react";

/**
 * D-144 — the ghost overlay PREVIEW must render byte-identical to what accept
 * inserts. D-130's join-space is applied on ACCEPT; before this fix the preview
 * showed the RAW suggestion ("andthe black beyond") while accept produced the
 * joined "and the black beyond", so the overlay misrepresented the result. Both
 * paths now derive from the SAME joinGhostSuggestion(charsBefore, suggestion).
 */

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
const routerPush = vi.hoisted(() => vi.fn());
// Stable reference: an inline `() => ({ push })` makes `router` change every
// render, which re-creates fetchSuggestion and re-runs the update effect whose
// cleanup ABORTS the in-flight stream — clearing the ghost mid-test.
const routerMock = vi.hoisted(() => ({ push: routerPush }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { AIGhostText } from "@/components/editor/ai-ghost-text";

// Ends in a word char ("…the") so the D-130 join rule wants a leading space.
// Must be >= MIN_CONTEXT_LENGTH (50) chars or the pause never fires a fetch.
const LONG_TEXT = "That night Sam sat at the old desk and wrote about the";
const CURSOR_FROM = LONG_TEXT.length;

type UpdateHandler = () => void;
function makeEditorStub() {
  const handlers = new Map<string, UpdateHandler[]>();
  const insertContent = vi.fn();
  const focus = vi.fn();
  const textBetween = vi.fn((from: number, to: number) => LONG_TEXT.slice(from, to));
  const editor = {
    on: (event: string, fn: UpdateHandler) => {
      const list = handlers.get(event) ?? [];
      handlers.set(event, [...list, fn]);
    },
    off: vi.fn(),
    getText: () => LONG_TEXT,
    isFocused: true,
    commands: { insertContent, focus },
    state: { selection: { from: CURSOR_FROM }, doc: { textBetween } },
    view: {
      state: { selection: { from: CURSOR_FROM } },
      coordsAtPos: () => ({ top: 100, left: 40, bottom: 120, right: 44 }),
    },
  };
  const fireUpdate = () => {
    for (const fn of handlers.get("update") ?? []) fn();
  };
  return { editor: editor as unknown as Editor, fireUpdate, insertContent };
}

function stubPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: coarse && query.includes("coarse"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const enc = new TextEncoder();
function sseResponse() {
  let controller!: ReadableStreamDefaultController;
  const body = new ReadableStream({
    start(c) {
      controller = c;
    },
  });
  const res = {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => (k === "content-type" ? "text/event-stream" : null),
    },
    body,
    json: async () => ({}),
  } as unknown as Response;
  const push = (obj: unknown) =>
    controller.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));
  const close = () => controller.close();
  return { res, push, close };
}

function stubFetch(res: Response) {
  const warmupRes = {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => ({ warmed: true }),
  };
  const fetchMock = vi.fn((url: unknown) =>
    String(url).includes("warmup")
      ? Promise.resolve(warmupRes)
      : Promise.resolve(res)
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function typePauseAndSettle(fireUpdate: () => void) {
  act(() => fireUpdate());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
}
function pressTab() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", cancelable: true })
    );
  });
}

/** The overlay's first child node is the preview text node (the pill/caret is a
 *  following element child). */
function previewTextOf(container: HTMLElement): string {
  const overlay = container.querySelector("span.fixed.z-50");
  return overlay?.childNodes[0]?.textContent ?? "";
}

describe("AIGhostText — D-144 preview == accepted insert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    toastMock.error.mockReset();
    routerPush.mockReset();
  });

  it("previews the join-spaced bytes that Tab inserts (prior word ended in a letter)", async () => {
    stubPointer(false); // desktop, Tab accept
    const { res, push, close } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate, insertContent } = makeEditorStub();
    const { container } = render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    await act(async () => {
      push({ type: "done", text: "The tide turned." });
      close();
    });

    // The join-space is now SHOWN in the preview (before was "theThe tide…").
    const previewText = previewTextOf(container);
    expect(previewText).toBe(" The tide turned.");

    // Tab accepts — the inserted bytes must be byte-identical to the preview.
    pressTab();
    expect(insertContent).toHaveBeenCalledTimes(1);
    expect(insertContent.mock.calls[0][0]).toBe(previewText);
  });

  it("adds no preview space when the join adds none (binds-left suggestion)", async () => {
    stubPointer(false);
    const { res, push, close } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate, insertContent } = makeEditorStub();
    const { container } = render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: ", and " });
    });
    await act(async () => {
      push({ type: "done", text: ", and the words were its wake" });
      close();
    });

    // A suggestion opening with punctuation binds left — no leading space, and
    // the preview must not invent one.
    const previewText = previewTextOf(container);
    expect(previewText).toBe(", and the words were its wake");

    pressTab();
    expect(insertContent.mock.calls[0][0]).toBe(previewText);
  });
});
