// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, cleanup, act, screen, fireEvent } from "@testing-library/react";
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
 * D-132 (touch accept) — the ONLY accept affordance was a hardware Tab key,
 * dead on a phone soft keyboard. The ghost overlay is now a tap target
 * (role=button) and the hint is pointer-aware.
 *
 * D-134 (cap-wall re-silence) — the 429 cap wall was a cooled-down toast, so
 * the 2nd–5th typing pauses inside the 60s window rendered NOTHING (the old
 * D-129 silent wall returned). The upgrade wall is now a PERSISTENT banner
 * (role=alert) that bypasses the toast cooldown and clears on success.
 *
 * These tests drive the ghost component with a stub tiptap editor and a
 * mocked fetch.
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
import { WALL_RETRY_MS } from "@/components/editor/quick-assist-client-errors";

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
  const focus = vi.fn();
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
    commands: { insertContent, focus },
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
    focus,
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

// D-132 — the tap hint and the F2/Tab badges key off `(pointer: coarse)`. jsdom
// has no matchMedia, so tests that care about the pointer stub it explicitly.
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

async function typePauseAndSettle(fireUpdate: () => void) {
  act(() => fireUpdate());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
}

describe("AIGhostText — errors surface, accept joins + is tappable, wall persists", () => {
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

  it("throttles the identical (non-wall) error copy on the next pause", async () => {
    // No upgradeToTier → a plain error toast, still governed by the cooldown.
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(500, { error: "The suggestion service is down." })
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

  // ─── D-132: touch path to accept ──────────────────────────────────────────

  it("D-132 (F3+F6): a settled tap (pointerdown→pointerup within slop) accepts", async () => {
    stubPointer(true); // phone
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    const { editor, fireUpdate, insertContent, focus } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    const accept = screen.getByRole("button", { name: /accept suggestion/i });
    // Accept fires on pointerUP after tap-vs-drag discrimination — the
    // pointerDown only keeps the ghost alive (no caret move / blur).
    act(() => {
      fireEvent.pointerDown(accept, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
    });
    // Down alone must NOT insert — a scroll could still cancel the gesture.
    expect(insertContent).not.toHaveBeenCalled();
    act(() => {
      fireEvent.pointerUp(accept, { pointerId: 1, clientX: 103, clientY: 102 });
    });

    // Same shared accept path as Tab: two-char join, single insert.
    expect(insertContent).toHaveBeenCalledTimes(1);
    expect(insertContent).toHaveBeenCalledWith(" dream: the desk was a ship");
    // Keeps the writing flow — focus returns to the editor after the insert.
    expect(focus).toHaveBeenCalled();
    // The overlay is gone once accepted.
    expect(
      screen.queryByRole("button", { name: /accept suggestion/i })
    ).toBeNull();
  });

  it("D-132 (F3+F6): a scroll/drag that starts on the overlay does NOT accept", async () => {
    stubPointer(true); // phone
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    const { editor, fireUpdate, insertContent } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    const accept = screen.getByRole("button", { name: /accept suggestion/i });
    act(() => {
      fireEvent.pointerDown(accept, {
        pointerId: 1,
        clientX: 100,
        clientY: 100,
      });
      // Finger travels far beyond the tap slop before lifting — a scroll.
      fireEvent.pointerMove(accept, {
        pointerId: 1,
        clientX: 100,
        clientY: 140,
      });
      fireEvent.pointerUp(accept, { pointerId: 1, clientX: 100, clientY: 140 });
    });

    // No text inserted; the suggestion is still on screen.
    expect(insertContent).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /accept suggestion/i })
    ).toBeTruthy();
  });

  it("D-132/F7: shows a tap-to-accept pill on coarse-pointer devices", async () => {
    stubPointer(true);
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    expect(screen.getByText(/tap to accept/i)).toBeTruthy();
    expect(screen.queryByText(/Tab/)).toBeNull();
  });

  it("F1: fine-pointer overlay is passive — Tab hint, no tap button", async () => {
    stubPointer(false); // desktop
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);

    // Desktop keeps the subtle keyboard hint...
    expect(screen.getByText(/Tab/)).toBeTruthy();
    expect(screen.queryByText(/tap to accept/i)).toBeNull();
    // ...and reverts to the original passive overlay: no accept button, so a
    // click passes through to the editor (caret move dismisses via
    // selectionUpdate as before) rather than inserting the suggestion.
    expect(
      screen.queryByRole("button", { name: /accept suggestion/i })
    ).toBeNull();
  });

  // ─── D-134: persistent cap-wall banner (moved from toast) ──────────────────

  it("D-134: renders the 429 wall copy verbatim in a persistent banner with an Upgrade deep-link", async () => {
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

    const banner = screen.getByRole("alert");
    expect(banner.textContent).toContain(capCopy);
    // The wall does NOT go through the cooled-down toast anymore.
    expect(toastMock.error).not.toHaveBeenCalled();

    const upgrade = screen.getByRole("button", { name: /upgrade/i });
    act(() => {
      fireEvent.click(upgrade);
    });
    expect(routerPush).toHaveBeenCalledWith("/settings/billing");
  });

  it("D-134: the wall banner PERSISTS across repeated 429s inside the 60s cooldown window", async () => {
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

    // Five pauses, all inside the 60s toast cooldown window.
    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);

    // Still exactly one banner, still visible — no silent wall (D-129 regression).
    const banners = screen.getAllByRole("alert");
    expect(banners).toHaveLength(1);
    expect(banners[0].textContent).toContain("Free plan cap reached.");
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("D-134: the wall banner can be dismissed", async () => {
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
    expect(screen.getByRole("alert")).toBeTruthy();

    const dismiss = screen.getByRole("button", { name: /dismiss/i });
    act(() => {
      fireEvent.click(dismiss);
    });

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("D-134 (F4): suppresses the doomed per-pause 429 refetch while the wall is up", async () => {
    const fetchMock = mockFetchResponse(429, {
      error: "Free plan cap reached.",
      upgradeToTier: "indie",
      remainingToday: 0,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    // First pause hits the wall; four more pauses inside WALL_RETRY_MS must NOT
    // re-fire the doomed request.
    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);
    await typePauseAndSettle(fireUpdate);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("D-134 (F4): Dismiss hides the banner but keeps suppressing — no re-fetch, no re-show", async () => {
    const fetchMock = mockFetchResponse(429, {
      error: "Free plan cap reached.",
      upgradeToTier: "indie",
      remainingToday: 0,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    });
    expect(screen.queryByRole("alert")).toBeNull();

    // Next pause inside the window: the doomed loop stays disarmed and the
    // banner must NOT reappear (the old "inert dismiss" defect).
    await typePauseAndSettle(fireUpdate);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("D-134 (F4): after WALL_RETRY_MS a still-capped re-probe re-shows the banner", async () => {
    const fetchMock = mockFetchResponse(429, {
      error: "Free plan cap reached.",
      upgradeToTier: "indie",
      remainingToday: 0,
    });
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    });
    expect(screen.queryByRole("alert")).toBeNull();

    // Suppression expires; the next pause honestly re-probes and, still capped,
    // re-enters the wall (D-134's whole point).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALL_RETRY_MS);
    });
    await typePauseAndSettle(fireUpdate);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("D-134 (F10): a later successful suggestion clears the wall banner (after expiry)", async () => {
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
    expect(screen.getByRole("alert")).toBeTruthy();

    // The day rolls / wall lifts: after the suppression window the next pause
    // fetches again and succeeds.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALL_RETRY_MS);
    });
    vi.stubGlobal(
      "fetch",
      mockFetchResponse(200, { suggestion: "dream: the desk was a ship" })
    );
    await typePauseAndSettle(fireUpdate);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/dream: the desk was a ship/)).toBeTruthy();
  });

  it("D-134 (F10): any successful (non-429) response clears the wall — even an empty suggestion", async () => {
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
    expect(screen.getByRole("alert")).toBeTruthy();

    // After expiry the re-probe succeeds with an EMPTY suggestion — the stale
    // 429 copy must not linger next to a different error/toast (F10).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WALL_RETRY_MS);
    });
    vi.stubGlobal("fetch", mockFetchResponse(200, { suggestion: "" }));
    await typePauseAndSettle(fireUpdate);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  // ─── D5: pending indicator (unchanged) ─────────────────────────────────────

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

  it("clears the pending indicator and toasts a non-wall error on a 5xx (D5 + D-129)", async () => {
    const { fetchMock, settle } = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();
    render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    await typePauseAndSettle(fireUpdate);
    expect(screen.getByRole("status")).toBeTruthy();

    await act(async () => {
      settle(500, { error: "The suggestion service is down." });
    });

    expect(screen.queryByRole("status")).toBeNull();
    expect(toastMock.error).toHaveBeenCalledWith(
      "The suggestion service is down."
    );
  });
});
