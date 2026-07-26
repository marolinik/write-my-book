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
 * D5 — the ghost component's STREAMING state machine over a fake SSE body:
 *   idle → pending(dots) → streaming(growing ghost, caret, accept DISARMED)
 *        → settled(full ghost + pill, accept ARMED).
 * Accept is armed ONLY on the `done` frame (D-140 cannot worsen); the canonical
 * done text replaces accumulated deltas; an `error` frame flows through the
 * existing quickAssistErrorNotice/surfaceError seam; typing mid-stream aborts.
 */

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
const routerPush = vi.hoisted(() => vi.fn());
const routerMock = vi.hoisted(() => ({ push: routerPush }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { AIGhostText } from "@/components/editor/ai-ghost-text";

const LONG_TEXT = "That night Sam sat at the desk and wrote about the";
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
  return { editor: editor as unknown as Editor, fireUpdate, insertContent, focus };
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

/** A controllable SSE Response whose body frames are pushed by the test. */
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

/** fetch mock: warmup pings get a JSON ack; the real ghost call gets `res`. */
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
function pressEscape() {
  act(() => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    );
  });
}

describe("AIGhostText — streaming state machine (D5)", () => {
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

  it("dots → growing ghost (accept DISARMED) → done (accept ARMED)", async () => {
    stubPointer(false); // desktop, Tab accept
    const { res, push, close } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate, insertContent } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate);
    // Pre-first-token: pending dots.
    expect(screen.getByRole("status")).toBeTruthy();

    // First token: ghost grows, NO accept hint yet (streamDone false).
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    expect(screen.getByText(/The/)).toBeTruthy();
    expect(screen.queryByText(/Tab/)).toBeNull();

    // Tab mid-stream is inert (D-140 cannot worsen).
    pressTab();
    expect(insertContent).not.toHaveBeenCalled();

    // done: canonical text replaces deltas + accept ARMED.
    await act(async () => {
      push({ type: "done", text: "The tide turned." });
      close();
    });
    expect(screen.getByText(/The tide turned\./)).toBeTruthy();
    expect(screen.getByText(/Tab/)).toBeTruthy();

    // Tab now accepts the canonical string.
    pressTab();
    expect(insertContent).toHaveBeenCalledTimes(1);
  });

  it("an error frame surfaces the MODEL_NO_QUICK_SUGGEST settings deep-link", async () => {
    stubPointer(false);
    const { res, push, close } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: "half " });
      push({
        type: "error",
        status: 422,
        error: "This model can't produce autocomplete suggestions.",
        code: "MODEL_NO_QUICK_SUGGEST",
      });
      close();
    });

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    const opts = toastMock.error.mock.calls[0][1] as {
      action?: { label: string; onClick: () => void };
    };
    expect(opts?.action?.label).toMatch(/settings/i);
    // The ghost is cleared on the error.
    expect(screen.queryByText(/half/)).toBeNull();
  });

  it("typing during the stream aborts and dismisses the ghost", async () => {
    stubPointer(false);
    const { res, push } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    expect(screen.getByText(/The/)).toBeTruthy();

    // Resume typing → handleUpdate aborts the in-flight stream + clears the ghost.
    await act(async () => {
      fireUpdate();
    });
    expect(screen.queryByText(/The/)).toBeNull();
  });

  it("Escape mid-stream aborts so a trailing done frame cannot resurrect the ghost or arm accept (CSM-1 / D-142)", async () => {
    stubPointer(false); // desktop, Tab accept
    const { res, push, close } = sseResponse();
    const fetchMock = stubFetch(res);
    const { editor, fireUpdate, insertContent } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    expect(screen.getByText(/The/)).toBeTruthy();

    // The in-flight ghost fetch must carry a signal that Escape can abort.
    const ghostCall = fetchMock.mock.calls.find(
      (c) => !String(c[0]).includes("warmup")
    ) as unknown[] | undefined;
    const signal = (ghostCall?.[1] as { signal?: AbortSignal } | undefined)?.signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);

    // Escape dismisses AND aborts the stream (the resurrect-bill fix).
    pressEscape();
    expect(screen.queryByText(/The/)).toBeNull();
    expect(signal?.aborted).toBe(true);

    // A late done frame after Escape must NOT resurrect the ghost / arm accept.
    await act(async () => {
      push({ type: "done", text: "The tide turned." });
      close();
    });
    expect(screen.queryByText(/tide turned/)).toBeNull();
    expect(screen.queryByText(/Tab/)).toBeNull();

    // And Tab is inert — accept was never armed by the discarded stream.
    pressTab();
    expect(insertContent).not.toHaveBeenCalled();
  });

  it("shows the >8s 'still writing…' affordance in the cursor overlay", async () => {
    stubPointer(false);
    const { res, push } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    // No done frame; 8s elapse with the stream still open.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8100);
    });
    expect(screen.getByText(/still writing/i)).toBeTruthy();
  });
});
