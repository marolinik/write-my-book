// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";

/**
 * The P1/P6 v3 consensus wave, thread side.
 *
 * D-176 (S3, floor driver for BOTH personas): the 19-36 s pre-first-token wait
 *   showed one static line. It must now show a ticking elapsed counter, a phase
 *   that changes as the wait grows (the heartbeat), and a Cancel wired to the
 *   proven all-or-nothing abort. The first-text gate is NOT touched: every
 *   signal here is client-measured.
 * D-177 (S4): at settle the finished reply was briefly re-covered by the waiting
 *   line, because the live bubble unmounted from react-query's `isPending`
 *   (deferred to `onSettled`'s invalidate) instead of from the same state that
 *   commits the settled turn.
 * D-183 (S3): "Keep as-is" / "Use it" stayed live during a pending turn, so a
 *   mid-stream click settled the finding against replies that did not yet
 *   include the in-flight REMEMBER.
 * D-185 (S4): the armed AI Rewrite Comparison card re-anchored at thread bottom,
 *   detached from the turn that emitted it, leaving a dangling lead-in colon.
 */

const h = vi.hoisted(() => ({
  apply: vi.fn(),
  dismiss: vi.fn(),
  undo: vi.fn(),
  send: vi.fn(),
  cancel: vi.fn(),
  replies: [] as Array<{ role: "user" | "assistant"; content: string }>,
  streamingText: "",
  isSending: false,
  turnActive: false,
  turnStartedAt: null as number | null,
}));

vi.mock("@/hooks/use-editorial", () => ({
  useApplyFinding: () => ({ mutate: h.apply, isPending: false }),
  useDismissFinding: () => ({ mutate: h.dismiss, isPending: false }),
  useUndoFinding: () => ({ mutate: h.undo, isPending: false }),
}));

vi.mock("@/hooks/use-finding-discussion", () => ({
  useFindingDiscussion: () => ({
    replies: h.replies,
    userTurns: h.replies.filter((r) => r.role === "user").length,
    canDiscuss: true,
    isLoading: false,
    send: h.send,
    isSending: h.isSending,
    streamingText: h.streamingText,
    turnActive: h.turnActive,
    turnStartedAt: h.turnStartedAt,
    cancel: h.cancel,
  }),
}));

import { FindingCard } from "@/components/editorial/finding-card";
import type { FindingItem } from "@/hooks/use-editorial";

if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const REVISION_TURN = [
  "Agreed, that beat can land harder. Here's a tighter version:",
  '<<<REMEMBER category="preference">>>',
  "Milan's plant names stay Latin.",
  "<<<END>>>",
  "<<<REVISION>>>",
  "suggestion: She bolted for the door.",
  "why: punchier",
  "<<<END>>>",
].join("\n");

function finding(): FindingItem {
  return {
    id: "f1",
    bookId: "b1",
    chapterNumber: 1,
    sessionId: null,
    agentType: "line-editor",
    severity: "suggestion",
    category: "show-tell",
    description: "Interior abstraction at the emotional peak.",
    suggestion: null,
    originalText: "She ran for the door.",
    newText: null,
    locationStart: null,
    locationEnd: null,
    status: "pending",
    dismissReason: null,
    appliedAt: null,
    createdAt: "2026-07-27T00:00:00.000Z",
    rationale: "Shows less than it tells.",
    anchorQuote: "She ran for the door.",
    alternatives: null,
  } as FindingItem;
}

function renderThread() {
  const onShowInText = vi.fn();
  render(<FindingCard finding={finding()} bookId="b1" onShowInText={onShowInText} />);
  fireEvent.click(screen.getByRole("button", { name: "Discuss" }));
  onShowInText.mockClear();
  return onShowInText;
}

/** A turn in flight, pre-first-token: exactly the 19-36s window D-176 measures. */
function armWaitingTurn(): void {
  h.replies = [{ role: "user", content: "the names matter" }];
  h.isSending = true;
  h.turnActive = true;
  h.turnStartedAt = Date.now();
  h.streamingText = "";
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
  h.replies = [];
  h.streamingText = "";
  h.isSending = false;
  h.turnActive = false;
  h.turnStartedAt = null;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("D-176 — the pre-first-token wait is measured, alive and cancellable", () => {
  it("shows an elapsed counter that advances every second", () => {
    armWaitingTurn();
    renderThread();

    const elapsed = screen.getByTestId("discuss-wait-elapsed");
    expect(elapsed.textContent).toContain("0s");

    act(() => void vi.advanceTimersByTime(12_000));
    expect(screen.getByTestId("discuss-wait-elapsed").textContent).toContain("12s");

    act(() => void vi.advanceTimersByTime(24_000));
    expect(screen.getByTestId("discuss-wait-elapsed").textContent).toContain("36s");
  });

  it("beats: the phase line changes as the wait grows past the settling band", () => {
    armWaitingTurn();
    renderThread();

    const first = screen.getByTestId("discuss-wait-hint").textContent ?? "";
    expect(first.trim().length).toBeGreaterThan(0);

    act(() => void vi.advanceTimersByTime(20_000));
    const later = screen.getByTestId("discuss-wait-hint").textContent ?? "";
    expect(later).not.toBe(first);

    act(() => void vi.advanceTimersByTime(40_000));
    expect(screen.getByTestId("discuss-wait-hint").textContent).toMatch(/longer than usual/i);
  });

  it("keeps the per-second counter out of the screen-reader live region", () => {
    armWaitingTurn();
    renderThread();

    // The bubble stays a polite live region for the PHASE, but a counter that
    // re-announces every second would be unusable — it is aria-hidden.
    expect(screen.getByTestId("discuss-live-bubble").getAttribute("aria-live")).toBe("polite");
    expect(screen.getByTestId("discuss-wait-elapsed").getAttribute("aria-hidden")).toBe("true");
  });

  it("offers Cancel during the wait and calls the hook's abort path", () => {
    armWaitingTurn();
    renderThread();

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(h.cancel).toHaveBeenCalledTimes(1);
  });

  it("keeps Cancel available after prose starts arriving (mid-stream is still abortable)", () => {
    armWaitingTurn();
    h.streamingText = "That's fair — the taxonomy is";
    renderThread();

    expect(screen.getByRole("button", { name: /cancel/i })).toBeTruthy();
    // Once prose is on screen the wait chrome is redundant.
    expect(screen.queryByTestId("discuss-wait-elapsed")).toBeNull();
  });

  it("D-169: clicking the wait chrome never navigates out of Editorial Review", () => {
    armWaitingTurn();
    const onShowInText = renderThread();

    fireEvent.click(screen.getByTestId("discuss-turn-controls"));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onShowInText).not.toHaveBeenCalled();
  });

  it("shows no wait chrome when nothing is in flight", () => {
    h.replies = [{ role: "user", content: "hi" }, { role: "assistant", content: "Noted." }];
    renderThread();

    expect(screen.queryByTestId("discuss-turn-controls")).toBeNull();
    expect(screen.queryByRole("button", { name: /cancel/i })).toBeNull();
  });
});

describe("D-177 — the settled reply is never re-covered by the waiting line", () => {
  it("drops the live bubble from the same state that commits the turn, not from isPending", () => {
    // The settle commit: reply appended + turn flag cleared in ONE React commit,
    // while react-query is still `isPending` until onSettled's invalidate lands.
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: "Noted." },
    ];
    h.isSending = true;
    h.turnActive = false;
    h.streamingText = "";

    renderThread();

    expect(screen.queryAllByTestId("discuss-live-bubble")).toHaveLength(0);
    expect(screen.queryByTestId("discuss-turn-controls")).toBeNull();
    expect(screen.getByText("Noted.")).toBeTruthy();
  });
});

describe("D-183 — no dismiss/apply race while a turn is in flight", () => {
  it("disables 'Keep as-is' in the thread during a pending turn", () => {
    armWaitingTurn();
    renderThread();

    const keep = screen.getByRole("button", { name: "Keep as-is" }) as HTMLButtonElement;
    expect(keep.disabled).toBe(true);
    fireEvent.click(keep);
    expect(h.dismiss).not.toHaveBeenCalled();
  });

  it("disables the card's own Apply / Dismiss during a pending turn", () => {
    armWaitingTurn();
    renderThread();

    expect((screen.getByRole("button", { name: "Dismiss" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables 'Use it' while a follow-up turn is in flight over an armed revision", () => {
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: REVISION_TURN },
      { role: "user", content: "and the ending?" },
    ];
    h.isSending = true;
    h.turnActive = true;
    h.turnStartedAt = Date.now();

    renderThread();

    expect((screen.getByRole("button", { name: "Use it" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Keep as-is" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("re-enables both the moment the turn settles", () => {
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: REVISION_TURN },
    ];
    h.isSending = false;
    h.turnActive = false;

    renderThread();

    expect((screen.getByRole("button", { name: "Use it" }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Keep as-is" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("D-185 — the revision card stays anchored to the turn that emitted it", () => {
  it("renders directly under its emitting bubble, not at thread bottom", () => {
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: REVISION_TURN },
      { role: "user", content: "and the ending?" },
      { role: "assistant", content: "Sure — leave the ending alone." },
    ];

    renderThread();

    const card = screen.getByTestId("discuss-revision-card");
    const emitting = screen.getByText(/Agreed, that beat can land harder/);
    const laterTurn = screen.getByText("Sure — leave the ending alone.");

    // emitting bubble → card → later turn, in document order.
    expect(
      emitting.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      card.compareDocumentPosition(laterTurn) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByText("AI Rewrite Comparison")).toBeTruthy();
  });

  it("closes the lead-in so no colon dangles where the revision was lifted out", () => {
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: REVISION_TURN },
    ];

    renderThread();

    const bubble = screen.getByText(/Agreed, that beat can land harder/);
    expect(bubble.textContent?.trim().endsWith(":")).toBe(false);
    expect(bubble.textContent).toContain("Here's a tighter version.");
  });
});
