// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";

/**
 * D-129 (ghost surface) — `ai-ghost-text.tsx:81` discarded every non-200
 * (`if (!res.ok) return`), so the server's honest 429 cap-wall copy and the
 * D-118 422 backstop copy never rendered: the writer experienced pure
 * silence at the wall (phone capture 09-phone-cap-wall-moment.png).
 *
 * D-130 (accept join) — Tab-accept inserted the raw suggestion, gluing it
 * onto the word being typed ("thedream").
 *
 * These tests drive the ghost component with a stub tiptap editor and a
 * mocked fetch, asserting errors reach sonner and accepts join with a space.
 */

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const routerPush = vi.hoisted(() => vi.fn());
// next/navigation's useRouter returns a stable reference; mirror that so the
// ghost component's fetchSuggestion callback stays referentially stable across
// re-renders (an unstable router would re-run the monitor effect and abort an
// in-flight request between the pause and a deferred response resolving).
const routerMock = vi.hoisted(() => ({ push: routerPush }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { AIGhostText } from "@/components/editor/ai-ghost-text";

const LONG_TEXT =
  "That night Sam sat at the desk and wrote about the"; // 50 chars — meets MIN_CONTEXT_LENGTH

type UpdateHandler = () => void;

// Cursor sits at the end of the sample text. The stub models ProseMirror
// positions as plain-string indices (equivalent for join purposes), so
// doc.textBetween(from, to) is a real slice — the earlier stub ignored its
// arguments and could never prove the Tab handler read the correct window.
const CURSOR_FROM = LONG_TEXT.length;

function makeEditorStub() {
  const handlers = new Map<string, UpdateHandler[]>();
  const insertContent = vi.fn();
  const textBetween = vi.fn((from: number, to: number) =>
    LONG_TEXT.slice(from, to)
  );
  const editor = {
    on: (event: string, fn: UpdateHandler) => {
      const list = handlers.get(event) ?? [];
      handlers.set(event, [...list, fn]);
    },
    off: vi.fn(),
    getText: () => LONG_TEXT,
    isFocused: true,
    commands: { insertContent },
    state: {
      selection: { from: CURSOR_FROM },
      doc: { textBetween },
    },
    view: {
      state: { selection: { from: CURSOR_FROM } },
      coordsAtPos: () => ({ top: 100, left: 40, bottom: 120, right: 44 }),
    },
  };
  const fireUpdate = () => {
    for (const fn of handlers.get("update") ?? []) fn();
  };
  return {
    editor: editor as unknown as Editor,
    fireUpdate,
    insertContent,
    textBetween,
  };
}

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

interface DeferredResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

// A fetch mock whose response is resolved by hand, so a test can assert on the
// UI while the ghost request is still in flight (the D5 pending indicator).
function deferredFetch() {
  let resolveResponse!: (res: DeferredResponse) => void;
  const promise = new Promise<DeferredResponse>((resolve) => {
    resolveResponse = resolve;
  });
  const fetchMock = vi.fn().mockReturnValue(promise);
  const settle = (status: number, body: unknown) =>
    resolveResponse({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  return { fetchMock, settle };
}

async function typePauseAndSettle(fireUpdate: () => void) {
  act(() => fireUpdate());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
}

describe("AIGhostText — D-129 errors surface, D-130 accept joins", () => {
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

  it("surfaces the 429 cap-wall copy via toast", async () => {
    const capCopy =
      "Free plan includes 100 ghost-text completions per day. Resets at midnight UTC.";
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(429, {
        error: capCopy,
        upgradeToTier: "indie",
        remainingToday: 0,
      })
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error.mock.calls[0][0]).toBe(capCopy);
  });

  it("throttles the identical wall copy on the next pause", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(429, { error: "Free plan cap reached." })
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
  });

  it("offers the settings deep-link on the MODEL_NO_QUICK_SUGGEST 422", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(422, {
        error: "This model can't produce autocomplete suggestions.",
        code: "MODEL_NO_QUICK_SUGGEST",
      })
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const opts = toastMock.error.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(opts?.action?.label).toMatch(/settings/i);
    opts.action!.onClick();
    expect(routerPush).toHaveBeenCalledWith("/settings");
  });

  it("surfaces a fallback message when the network fails outright", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(String(toastMock.error.mock.calls[0][0])).toMatch(
      /unavailable|try again/i
    );
  });

  it("Tab-accept reads the two-char window before the cursor and inserts a space-joined suggestion (D-130)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    const { editor, fireUpdate, insertContent, textBetween } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true })
      );
    });

    // The handler must read the last TWO doc chars before the cursor so
    // joinGhostSuggestion can disambiguate a trailing quote.
    expect(textBetween).toHaveBeenCalledWith(CURSOR_FROM - 2, CURSOR_FROM);
    // LONG_TEXT ends "…about the" → last two chars "he" → word-join adds a space.
    expect(insertContent).toHaveBeenCalledTimes(1);
    expect(insertContent).toHaveBeenCalledWith(" dream: the desk was a ship");
  });

  it("offers the billing deep-link on the 429 cap wall (upgradeToTier present)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(429, {
        error: "Free plan cap reached.",
        upgradeToTier: "indie",
        remainingToday: 0,
      })
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const opts = toastMock.error.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(opts?.action?.label).toMatch(/upgrade/i);
    opts.action!.onClick();
    expect(routerPush).toHaveBeenCalledWith("/settings/billing");
  });

  it("shows the pending indicator (role=status) while the ghost fetch is in flight (D5)", async () => {
    const { fetchMock, settle } = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    // Fetch is unresolved: the affordance between pause and render is visible.
    expect(screen.getByRole("status")).toBeTruthy();

    // Resolve to avoid a dangling promise / act warning.
    await act(async () => {
      settle(200, { suggestion: "dream" });
    });
  });

  it("replaces the pending indicator with the suggestion once the 200 resolves (D5)", async () => {
    const { fetchMock, settle } = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      settle(200, { suggestion: "dream: the desk was a ship" });
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/dream: the desk was a ship/)).toBeTruthy();
  });

  it("clears the pending indicator and toasts the wall copy on a 429 (D5 + D-129)", async () => {
    const { fetchMock, settle } = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      settle(429, { error: "Free plan cap reached." });
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith("Free plan cap reached.");
  });
});
