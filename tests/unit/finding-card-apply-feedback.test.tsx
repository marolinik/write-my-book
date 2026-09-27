// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

import { getUIStrings } from "@/lib/i18n/ui-strings";
import { ApiError } from "@/lib/api-client";

/**
 * P2-S08 / P7-S19 — the finding card swallowed the apply refusals. The route
 * answers an honest 422 "so the writer can dismiss it or Discuss it" (D-41a)
 * for a finding with no replacement text, and for a replacement that is an
 * editor's note rather than prose (chapter 31). The card's advisory Apply had
 * no error handler at all, the auto-apply one handled only "not found in
 * chapter", and nothing global shows mutation errors — so Apply looked dead:
 * same card, same enabled button, no word to the writer.
 *
 * An advice-only apply (no passage to change) also answered a note — "no
 * chapter text was changed" — that the card never showed.
 */

type MutateOptions = {
  onError?: (error: Error) => void;
  onSuccess?: (data: unknown) => void;
};

const h = vi.hoisted(() => ({
  outcome: null as null | { error?: Error; data?: unknown },
}));

vi.mock("@/hooks/use-editorial", () => ({
  useApplyFinding: () => ({
    mutate: (_input: unknown, opts?: MutateOptions) => {
      if (h.outcome?.error) opts?.onError?.(h.outcome.error);
      else opts?.onSuccess?.(h.outcome?.data);
    },
    isPending: false,
  }),
  useDismissFinding: () => ({ mutate: vi.fn(), isPending: false }),
  useUndoFinding: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-finding-discussion", () => ({
  useFindingDiscussion: () => ({
    replies: [],
    canDiscuss: true,
    isLoading: false,
    send: vi.fn(),
    isSending: false,
  }),
}));

import { FindingCard } from "@/components/editorial/finding-card";
import type { FindingItem } from "@/hooks/use-editorial";

const t = getUIStrings("en");

function finding(over: Partial<FindingItem>): FindingItem {
  return {
    id: "f1", bookId: "b1", chapterNumber: 2, sessionId: null, agentType: "line-editor",
    severity: "minor", category: "wordiness",
    description: "This sentence circles before it lands.",
    suggestion: null, originalText: null, newText: null, locationStart: null, locationEnd: null,
    status: "pending", dismissReason: null, appliedAt: null, createdAt: "2026-09-25T00:00:00.000Z",
    impactScore: null, ruleConflict: null, triagedAt: null, anchorQuote: null, alternatives: null,
    ...over,
  } as FindingItem;
}

function clickApply() {
  fireEvent.click(screen.getByRole("button", { name: t.editorial.findings.apply }));
}

beforeEach(() => {
  h.outcome = null;
});
afterEach(() => cleanup());

describe("the finding card tells the writer why Apply did nothing", () => {
  it("explains the blank-replacement refusal (422) on an anchored advisory finding", () => {
    h.outcome = {
      error: new ApiError(
        "This finding has no replacement text, so applying it would delete the passage it points to.",
        422,
        { error: "This finding has no replacement text…" }
      ),
    };
    render(
      <FindingCard
        finding={finding({ originalText: "She thought about it for a long time" })}
        bookId="b1"
      />
    );
    clickApply();
    expect(screen.getByText(t.editorial.findings.applyErrorNoReplacement)).toBeTruthy();
  });

  it("explains the editor's-note refusal (422 with note) on an auto-apply finding", () => {
    h.outcome = {
      error: new ApiError("This replacement carries an editor's note…", 422, {
        error: "This replacement carries an editor's note…",
        note: "[TODO]",
      }),
    };
    render(
      <FindingCard
        finding={finding({ originalText: "The door was open.", newText: "[TODO] tighten" })}
        bookId="b1"
      />
    );
    clickApply();
    expect(screen.getByText(t.editorial.findings.applyErrorEditorNote)).toBeTruthy();
  });

  it("still names a moved passage (409) as before", () => {
    h.outcome = {
      error: new ApiError(
        "Original text not found in chapter — may have been edited since the finding was created",
        409,
        {}
      ),
    };
    render(
      <FindingCard
        finding={finding({ originalText: "The door was open.", newText: "The door stood open." })}
        bookId="b1"
      />
    );
    clickApply();
    expect(screen.getByText(t.editorial.findings.applyErrorTextNotFound)).toBeTruthy();
  });

  it("never fails silently on any other error", () => {
    h.outcome = { error: new ApiError("Failed to update finding", 500, {}) };
    render(<FindingCard finding={finding({})} bookId="b1" />);
    clickApply();
    expect(screen.getByText(t.editorial.findings.applyErrorGeneric)).toBeTruthy();
  });

  it("says an advice-only apply changed no chapter text", () => {
    h.outcome = {
      data: {
        id: "f1",
        status: "applied",
        note: "Advice-only finding — accepted; no chapter text was changed.",
      },
    };
    render(<FindingCard finding={finding({})} bookId="b1" />);
    clickApply();
    expect(screen.getByText(t.editorial.findings.adviceAccepted)).toBeTruthy();
  });
});
