// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: routerPush }) }));

import { AIGhostText } from "@/components/editor/ai-ghost-text";

const LONG_TEXT =
  "That night Sam sat at the desk and wrote about the"; // 50 chars — meets MIN_CONTEXT_LENGTH

type UpdateHandler = () => void;

function makeEditorStub(opts?: { charBefore?: string }) {
  const handlers = new Map<string, UpdateHandler[]>();
  const insertContent = vi.fn();
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
      selection: { from: 5 },
      doc: { textBetween: () => opts?.charBefore ?? "e" },
    },
    view: {
      state: { selection: { from: 5 } },
      coordsAtPos: () => ({ top: 100, left: 40, bottom: 120, right: 44 }),
    },
  };
  const fireUpdate = () => {
    for (const fn of handlers.get("update") ?? []) fn();
  };
  return { editor: editor as unknown as Editor, fireUpdate, insertContent };
}

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
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

  it("Tab-accept inserts the suggestion with a joining space (D-130)", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    const { editor, fireUpdate, insertContent } = makeEditorStub({
      charBefore: "e",
    });
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true })
      );
    });

    expect(insertContent).toHaveBeenCalledTimes(1);
    expect(insertContent).toHaveBeenCalledWith(
      " dream: the desk was a ship"
    );
  });
});
