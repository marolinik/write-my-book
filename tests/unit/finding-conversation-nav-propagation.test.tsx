// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * D-169 (S2, live-proven 2026-07-27, shot `43d`): every control INSIDE the
 * discuss thread also navigated the writer out of Editorial Review.
 *
 * Mechanism: `FindingCard`'s root <Card> carries
 * `onClick={() => { setSelectedFinding(id); onShowInText?.(finding) }}`, and on
 * the editorial surface `onShowInText` → `handleShowInText` →
 * `router.push(/books/:id/chapters/:chapterId)`. Every button FindingCard owns
 * calls `e.stopPropagation()` (Apply / Dismiss / Discuss / Undo), but the
 * thread rendered inside the same card — "Use it", "Keep as-is", the close X,
 * the AI Rewrite Comparison's Accept/Reject, and the message input — passed
 * bare handlers, so the click bubbled to the card and the writer was dropped
 * into the chapter editor mid-decision.
 *
 * These tests mount the REAL FindingCard (the surface that carries the
 * navigation handler) with a spy on `onShowInText`, open the thread, and assert
 * every in-thread control still does its own job while NEVER triggering
 * navigation.
 */

const h = vi.hoisted(() => ({
  apply: vi.fn(),
  dismiss: vi.fn(),
  undo: vi.fn(),
  send: vi.fn(),
  replies: [] as Array<{ role: "user" | "assistant"; content: string }>,
}));

vi.mock("@/hooks/use-editorial", () => ({
  useApplyFinding: () => ({ mutate: h.apply, isPending: false }),
  useDismissFinding: () => ({ mutate: h.dismiss, isPending: false }),
  useUndoFinding: () => ({ mutate: h.undo, isPending: false }),
}));

vi.mock("@/hooks/use-finding-discussion", () => ({
  useFindingDiscussion: () => ({
    replies: h.replies,
    canDiscuss: true,
    isLoading: false,
    send: h.send,
    isSending: false,
  }),
}));

import { FindingCard } from "@/components/editorial/finding-card";
import type { FindingItem } from "@/hooks/use-editorial";

// Radix ScrollArea (inside AIRewriteComparison) observes its viewport.
if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const REVISION_TURN = [
  "Here is a tighter beat.",
  "<<<REVISION>>>",
  "suggestion: She bolted for the door.",
  "why: punchier",
  "<<<END>>>",
].join("\n");

function finding(overrides: Partial<FindingItem> = {}): FindingItem {
  return {
    id: "f1",
    bookId: "b1",
    chapterNumber: 1,
    sessionId: null,
    agentType: "line-editor",
    severity: "suggestion",
    category: "show-tell",
    description: "Interior abstraction at an emotional peak.",
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
    ...overrides,
  } as FindingItem;
}

/** Mount the card and open its discuss thread. Returns the navigation spy. */
function renderThread(replies: Array<{ role: "user" | "assistant"; content: string }>) {
  h.replies = replies;
  const onShowInText = vi.fn();
  render(<FindingCard finding={finding()} bookId="b1" onShowInText={onShowInText} />);
  // "Discuss" is FindingCard's own button (already stops propagation).
  fireEvent.click(screen.getByRole("button", { name: "Discuss" }));
  onShowInText.mockClear();
  return onShowInText;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.replies = [];
});
afterEach(() => cleanup());

describe("D-169 — in-thread controls must not navigate out of Editorial Review", () => {
  it('"Keep as-is" dismisses WITHOUT triggering show-in-text navigation', () => {
    const onShowInText = renderThread([
      { role: "user", content: "keep it" },
      { role: "assistant", content: "Understood — I'll leave it." },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Keep as-is" }));

    expect(h.dismiss).toHaveBeenCalledTimes(1);
    expect(onShowInText).not.toHaveBeenCalled();
  });

  it('"Use it" applies the revision WITHOUT navigating', () => {
    const onShowInText = renderThread([
      { role: "user", content: "tighten it" },
      { role: "assistant", content: REVISION_TURN },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Use it" }));

    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(h.apply.mock.calls[0][0]).toEqual({
      findingId: "f1",
      overrideText: "She bolted for the door.",
    });
    expect(onShowInText).not.toHaveBeenCalled();
  });

  it("the thread's close X closes the thread WITHOUT navigating", () => {
    const onShowInText = renderThread([
      { role: "user", content: "hm" },
      { role: "assistant", content: "Noted." },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Close conversation" }));

    expect(onShowInText).not.toHaveBeenCalled();
    // Thread really closed — the in-thread control is gone.
    expect(screen.queryByRole("button", { name: "Keep as-is" })).toBeNull();
  });

  it("the revision card's Accept does not navigate", () => {
    const onShowInText = renderThread([
      { role: "user", content: "tighten it" },
      { role: "assistant", content: REVISION_TURN },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Accept Rewrite/ }));

    expect(h.apply).toHaveBeenCalledTimes(1);
    expect(onShowInText).not.toHaveBeenCalled();
  });

  it("the revision card's Reject does not navigate", () => {
    const onShowInText = renderThread([
      { role: "user", content: "tighten it" },
      { role: "assistant", content: REVISION_TURN },
    ]);

    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));

    expect(h.dismiss).toHaveBeenCalledTimes(1);
    expect(onShowInText).not.toHaveBeenCalled();
  });

  it("clicking the message input or its send button does not navigate", () => {
    const onShowInText = renderThread([]);

    const input = screen.getByPlaceholderText(/why you disagree/i);
    fireEvent.click(input);
    expect(onShowInText).not.toHaveBeenCalled();

    // Type first — the send button is disabled (and unclickable) while empty.
    fireEvent.change(input, { target: { value: "keep her taxonomy" } });
    const sendButton = input.parentElement?.querySelector("button");
    expect(sendButton).not.toBeNull();
    fireEvent.click(sendButton!);
    expect(onShowInText).not.toHaveBeenCalled();
  });

  it("clicking a reply bubble or the constraint chip does not navigate", () => {
    const onShowInText = renderThread([
      { role: "user", content: "keep her taxonomy" },
      {
        role: "assistant",
        content: [
          "Understood.",
          '<<<REMEMBER category="preference">>>',
          "Do not flag her taxonomy at emotional peaks.",
          "<<<END>>>",
        ].join("\n"),
      },
    ]);

    fireEvent.click(screen.getByText("Understood."));
    expect(onShowInText).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText(/remember/i));
    expect(onShowInText).not.toHaveBeenCalled();
  });

  it("FindingCard's OWN body click still navigates (guard is thread-scoped, not card-wide)", () => {
    h.replies = [];
    const onShowInText = vi.fn();
    render(<FindingCard finding={finding()} bookId="b1" onShowInText={onShowInText} />);

    fireEvent.click(screen.getByText("Interior abstraction at an emotional peak."));

    expect(onShowInText).toHaveBeenCalledTimes(1);
  });
});
