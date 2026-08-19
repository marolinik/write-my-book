// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/react";

/**
 * D-145 — the timing chip must show the CLIENT-FELT latency (the moment the
 * pause-timer fires the fetch → the moment accept arms on the `done` frame), not
 * the server's elapsedMs. The server number under-reported the wait (~6.7s
 * server vs ~9–11s felt) because the stream tail + render live outside it. The
 * honest server figure stays available in the chip's tooltip (title), but the
 * DISPLAYED number is the felt one. The >2.5s slow-only gate (D-146) is a
 * registered design memo and stays unchanged — the gate now reads the felt
 * number.
 */

const toastMock = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));
const routerPush = vi.hoisted(() => vi.fn());
// Stable reference (see ghost-text-preview-join.test.tsx): an inline
// `() => ({ push })` changes `router` every render, aborting the in-flight
// stream via the update-effect cleanup and clearing the ghost mid-test.
const routerMock = vi.hoisted(() => ({ push: routerPush }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMock }));

import { AIGhostText } from "@/components/editor/ai-ghost-text";

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

describe("AIGhostText — D-145 felt-latency timing chip", () => {
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

  it("shows the client-FELT latency, not the smaller server elapsedMs", async () => {
    stubPointer(false); // desktop
    const { res, push, close } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate); // fires the fetch → felt clock starts
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    // A slow tail: ~4s pass between the fetch firing and the done frame.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    await act(async () => {
      push({ type: "done", text: "The tide turned.", elapsedMs: 800 });
      close();
    });

    // Server reported 0.8s; the writer felt ~4s. The chip must show the felt
    // number, never the server one.
    const chip = screen.getByText(/~\d+\.\ds/);
    expect(chip.textContent).toMatch(/~4\.\ds/);
    expect(chip.textContent).not.toContain("0.8");
    // The honest server figure stays available in the tooltip.
    expect(chip.getAttribute("title")).toBe("server 0.8s");
  });

  it("stays hidden when the FELT latency is under the 2.5s gate, even if the server was slow", async () => {
    stubPointer(false);
    const { res, push, close } = sseResponse();
    stubFetch(res);
    const { editor, fireUpdate } = makeEditorStub();
    render(<AIGhostText editor={editor} bookId="b1" chapterNumber={1} enabled />);

    await typePauseAndSettle(fireUpdate);
    await act(async () => {
      push({ type: "token", text: "The " });
    });
    // Only 200ms of felt latency — below the D-146 slow-only gate.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    await act(async () => {
      // The server number (6s) is deliberately large: the gate must key off the
      // FELT number, so no chip appears.
      push({ type: "done", text: "The tide turned.", elapsedMs: 6000 });
      close();
    });

    expect(screen.queryByText(/~\d+\.\ds/)).toBeNull();
  });
});
