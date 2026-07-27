// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * D5 — the discuss thread must render the turn as it arrives.
 *
 * Before: the writer pressed send and watched a disabled input for 61-157 s with
 * no bubble at all. After: the assistant bubble fills in as prose frames land
 * (`streamingText`), then swaps to the settled parsed view when `done` commits
 * the raw reply into the query cache — the SAME render path a reload takes, so
 * the sanitizer that strips control blocks (D-104 / D-157) is the only thing
 * that ever paints a finished turn.
 *
 * Locked here: honest pre-first-token copy (never a blank bubble), incremental
 * text, no duplicate bubble after the swap, identical bubble geometry across the
 * swap (no D-147-class layout jump), and the D-169 stopPropagation guard on the
 * new element (the thread lives inside a card whose onClick navigates away).
 */

const h = vi.hoisted(() => ({
  apply: vi.fn(),
  dismiss: vi.fn(),
  undo: vi.fn(),
  send: vi.fn(),
  replies: [] as Array<{ role: "user" | "assistant"; content: string }>,
  streamingText: "",
  isSending: false,
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
  "Agreed, that beat can land harder.",
  '<<<REMEMBER category="preference">>',
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

beforeEach(() => {
  vi.clearAllMocks();
  h.replies = [];
  h.streamingText = "";
  h.isSending = false;
});
afterEach(() => cleanup());

describe("D5 — streaming discuss bubble", () => {
  it("shows honest waiting copy before the first prose frame (never a blank bubble)", () => {
    h.replies = [{ role: "user", content: "the names matter" }];
    h.isSending = true;
    h.streamingText = "";

    renderThread();

    const bubble = screen.getByTestId("discuss-live-bubble");
    expect(bubble.textContent?.trim()).not.toBe("");
    expect(bubble.textContent).toMatch(/replying/i);
  });

  it("renders the partial reply as it streams in", () => {
    h.replies = [{ role: "user", content: "the names matter" }];
    h.isSending = true;
    h.streamingText = "That's fair — the taxonomy is";

    renderThread();

    expect(screen.getByTestId("discuss-live-bubble").textContent).toContain(
      "That's fair — the taxonomy is"
    );
  });

  it("swaps to the settled, sanitized view on done — one bubble, no control syntax", () => {
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: REVISION_TURN },
    ];
    h.isSending = false;
    h.streamingText = "";

    renderThread();

    // The live bubble is gone (no duplicate assistant turn on screen).
    expect(screen.queryAllByTestId("discuss-live-bubble")).toHaveLength(0);
    // Settled prose only — the sanitizer stripped both control blocks.
    expect(screen.getByText("Agreed, that beat can land harder.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/REMEMBER|<<</);
    // And the settled structured surfaces are present.
    expect(screen.getByRole("button", { name: "Use it" })).toBeTruthy();
    expect(document.body.textContent).toMatch(/Milan's plant names stay Latin/);
  });

  it("keeps the live bubble geometry identical to a settled assistant bubble (no layout jump)", () => {
    h.replies = [
      { role: "user", content: "the names matter" },
      { role: "assistant", content: "Noted." },
    ];
    h.isSending = true;
    h.streamingText = "Second thought";

    renderThread();

    const live = screen.getByTestId("discuss-live-bubble");
    const settled = screen.getByText("Noted.");
    expect(live.className).toBe(settled.className);
    expect(live.tagName).toBe(settled.tagName);
  });

  it("D-169: clicking the live bubble never navigates out of Editorial Review", () => {
    h.replies = [{ role: "user", content: "the names matter" }];
    h.isSending = true;
    h.streamingText = "That's fair";

    const onShowInText = renderThread();

    fireEvent.click(screen.getByTestId("discuss-live-bubble"));

    expect(onShowInText).not.toHaveBeenCalled();
  });
});
