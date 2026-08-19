// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, cleanup, act, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";

/**
 * D-137 (D11 floor-pinner) — a 429 cap wall (and every ghost suggestion) armed
 * during immersive focus writing is INVISIBLE: the z-40 wall banner and z-50
 * ghost overlay render beneath the opaque z-[100] immersive surface, and the
 * frozen hidden-editor caret means the overlay never sits where the writer is
 * typing anyway. Yet the debounced immersive→tiptap `setContent` sync fires the
 * editor "update" the ghost listens for, so a fetch is armed on every pause —
 * a billable-but-invisible suggestion on success, a silent wall on 429.
 *
 * Fix shape (b): suppress ghost fetching + rendering entirely while immersive.
 * Because the results are genuinely invisible in immersive (and the design
 * deliberately suppresses chrome there — the conflict dialog defers to exit),
 * the honest minimal fix is to kill the fetch at its root rather than surface
 * one half of the pairing into the distraction-free view. Passing `immersive`
 * folds into the same effective-enabled gate as a ghost-text toggle-off.
 *
 * These tests drive the ghost component with a stub tiptap editor + mocked
 * fetch, exactly like the sibling ghost-text suites.
 */

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const routerPush = vi.hoisted(() => vi.fn());
const routerMock = vi.hoisted(() => ({ push: routerPush }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { AIGhostText } from "@/components/editor/ai-ghost-text";

const LONG_TEXT =
  "That night Sam sat at the desk and wrote about the"; // >= MIN_CONTEXT_LENGTH
const CURSOR_FROM = LONG_TEXT.length;

type UpdateHandler = () => void;

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
    // Real removal (not a noop) so a listener torn down on immersive entry can
    // never be re-invoked by a later fireUpdate.
    off: (event: string, fn: UpdateHandler) => {
      const list = handlers.get(event) ?? [];
      handlers.set(
        event,
        list.filter((h) => h !== fn)
      );
    },
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

function mockFetchResponse(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  });
}

// The component fires a fire-and-forget warmup ping (`?warmup=1`) on mount when
// active. Count only the REAL ghost fetches for the per-pause assertions.
function realFetchCount(fetchMock: ReturnType<typeof vi.fn>): number {
  return fetchMock.mock.calls.filter(
    (c) => !String(c[0]).includes("warmup")
  ).length;
}

interface DeferredResponse {
  ok: boolean;
  status: number;
  headers?: { get: (k: string) => string | null };
  json: () => Promise<unknown>;
}

// Hand-resolved fetch so a test can assert on the in-flight request (its abort
// signal) before the response settles.
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
      headers: { get: () => "application/json" },
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

describe("AIGhostText — D-137 immersive suppression", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubPointer(false); // desktop
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    toastMock.error.mockReset();
    routerPush.mockReset();
  });

  it("arms NO fetch (not even the warmup) and renders nothing while immersive", async () => {
    const fetchMock = mockFetchResponse(200, {
      suggestion: "dream: the desk was a ship",
    });
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();

    const { container } = render(
      <AIGhostText
        editor={editor}
        bookId="b1"
        chapterNumber={1}
        enabled
        immersive
      />
    );

    // A typing pause that WOULD fetch outside immersive: the debounced
    // immersive→tiptap sync fires "update", but with no listener attached the
    // pause timer never arms.
    await typePauseAndSettle(fireUpdate);

    // Root killed: no ghost fetch, and no warmup ping either — nothing billed.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(realFetchCount(fetchMock)).toBe(0);
    // Nothing painted under the z-[100] surface (component returns null).
    expect(container.firstChild).toBeNull();
  });

  it("clears an in-flight suggestion and ABORTS the request the moment immersive opens", async () => {
    const { fetchMock, settle } = deferredFetch();
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();

    const { rerender } = render(
      <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
    );

    // Fetch is in flight; the D5 pending dots are on screen.
    await typePauseAndSettle(fireUpdate);
    expect(screen.getByRole("status")).toBeTruthy();

    const ghostCall = fetchMock.mock.calls.find(
      (c) => !String(c[0]).includes("warmup")
    ) as unknown[] | undefined;
    const signal = (ghostCall?.[1] as { signal?: AbortSignal } | undefined)
      ?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    // Enter immersive: the hard-clear effect must abort the doomed in-flight
    // fetch (so its `done`/200 can't slip through and bill for an invisible
    // suggestion) and blank the overlay.
    act(() => {
      rerender(
        <AIGhostText
          editor={editor}
          bookId="b1"
          chapterNumber={1}
          enabled
          immersive
        />
      );
    });

    expect(signal?.aborted).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();

    // Settle the aborted request to flush the pending promise cleanly — the
    // consumer's aborted-guard returns before touching state.
    await act(async () => {
      settle(200, { suggestion: "dream: the desk was a ship" });
    });
  });

  it("resumes ghost fetching once immersive exits", async () => {
    const fetchMock = mockFetchResponse(200, {
      suggestion: "dream: the desk was a ship",
    });
    vi.stubGlobal("fetch", fetchMock);
    const { editor, fireUpdate } = makeEditorStub();

    const { rerender } = render(
      <AIGhostText
        editor={editor}
        bookId="b1"
        chapterNumber={1}
        enabled
        immersive
      />
    );

    await typePauseAndSettle(fireUpdate);
    expect(realFetchCount(fetchMock)).toBe(0);

    // Exit immersive — the listener re-attaches and the next pause fetches.
    act(() => {
      rerender(
        <AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />
      );
    });
    await typePauseAndSettle(fireUpdate);

    expect(realFetchCount(fetchMock)).toBe(1);
    expect(screen.getByText(/dream: the desk was a ship/)).toBeTruthy();
  });
});
