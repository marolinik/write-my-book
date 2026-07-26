// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Editor } from "@tiptap/react";

/**
 * D-129 (inline surface) — `inline-edit-popup.tsx` caught every mutation
 * error and silently reset to the instruction phase, so the server's honest
 * 422/429/5xx copy (thrown by use-inline-edit as Error(body.error)) died
 * unseen. The popup must render the error copy and stay retryable.
 *
 * D-127 — the instruction phase must carry the point-of-use disclosure that
 * quick suggestions may run on a faster model than the writer's default.
 */

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-inline-edit", () => ({
  useInlineEdit: () => ({ mutateAsync }),
}));

import { InlineEditPopup } from "@/components/editor/inline-edit-popup";
import { QUICK_ASSIST_FALLBACK_MESSAGE } from "@/components/editor/quick-assist-client-errors";

function makeEditorStub() {
  const rect = {
    top: 0,
    left: 0,
    right: 800,
    bottom: 600,
    width: 800,
    height: 600,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  };
  const editor = {
    isDestroyed: false,
    commands: { focus: vi.fn() },
    state: {
      selection: { from: 1, to: 20 },
      doc: {
        content: { size: 200 },
        textBetween: () => "the salt wind over the harbor",
      },
    },
    view: {
      state: { selection: { from: 1, to: 20 } },
      coordsAtPos: () => ({ top: 50, left: 30, bottom: 66, right: 34 }),
      dom: { getBoundingClientRect: () => rect },
    },
  };
  return editor as unknown as Editor;
}

describe("InlineEditPopup — D-129 error copy renders, D-127 disclosure", () => {
  afterEach(() => {
    cleanup();
    mutateAsync.mockReset();
  });

  it("renders the server's error copy as an alert and returns to the instruction phase", async () => {
    const serverCopy =
      "This model returns only internal reasoning at this budget, so it can't produce inline rewrite suggestions.";
    mutateAsync.mockRejectedValue(new Error(serverCopy));

    render(
      <InlineEditPopup
        editor={makeEditorStub()}
        bookId="b1"
        onClose={vi.fn()}
        initialInstruction="Rewrite"
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(serverCopy);
    // Retryable: the instruction input is back on screen alongside the error.
    expect(
      screen.getByPlaceholderText(/describe what you want/i)
    ).toBeTruthy();
  });

  it("falls back to the generic copy when the mutation rejects with a non-Error value", async () => {
    // use-inline-edit throws Error(body.error), but a thrown string (or any
    // non-Error) must still surface writer-facing copy, not "[object Object]"
    // or a blank alert — the generic fallback covers it.
    mutateAsync.mockRejectedValue("plain string");

    render(
      <InlineEditPopup
        editor={makeEditorStub()}
        bookId="b1"
        onClose={vi.fn()}
        initialInstruction="Rewrite"
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(QUICK_ASSIST_FALLBACK_MESSAGE);
    // Still retryable: the instruction input remains on screen.
    expect(
      screen.getByPlaceholderText(/describe what you want/i)
    ).toBeTruthy();
  });

  it("tells the writer when zero suggestions come back instead of silently resetting", async () => {
    mutateAsync.mockResolvedValue({ suggestions: [] });

    render(
      <InlineEditPopup
        editor={makeEditorStub()}
        bookId="b1"
        onClose={vi.fn()}
        initialInstruction="Rewrite"
      />
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/no suggestions/i);
  });

  it("clears the previous error when a new attempt starts", async () => {
    mutateAsync.mockRejectedValueOnce(new Error("first failure"));

    render(
      <InlineEditPopup
        editor={makeEditorStub()}
        bookId="b1"
        onClose={vi.fn()}
        initialInstruction="Rewrite"
      />
    );
    await screen.findByRole("alert");

    mutateAsync.mockResolvedValueOnce({
      suggestions: [{ label: "Rewrite", text: "A calmer harbor line." }],
    });
    const form = screen
      .getByPlaceholderText(/describe what you want/i)
      .closest("form")!;
    const { fireEvent } = await import("@testing-library/react");
    fireEvent.submit(form);

    await screen.findByText("A calmer harbor line.");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the D-127 faster-model disclosure at the point of use", () => {
    mutateAsync.mockResolvedValue({ suggestions: [] });
    render(
      <InlineEditPopup
        editor={makeEditorStub()}
        bookId="b1"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/faster model/i)).toBeTruthy();
  });
});
