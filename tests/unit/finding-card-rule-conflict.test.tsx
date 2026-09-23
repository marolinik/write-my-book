// @vitest-environment jsdom
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * Triage ranks a note that asks the writer to undo their own decision lower,
 * and never said why: the sentence "Goes against something you already
 * decided" was translated into seven languages and shown nowhere. On the
 * owner's book the dev-editor re-raised the "two separate objects" confusion
 * the day after he had explained it; triage put that note at 0.77. The card
 * now says so, so "I already explained this" has an answer on screen.
 */

vi.mock("@/hooks/use-editorial", () => ({
  useApplyFinding: () => ({ mutate: vi.fn(), isPending: false }),
  useDismissFinding: () => ({ mutate: vi.fn(), isPending: false }),
  useUndoFinding: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-finding-discussion", () => ({
  useFindingDiscussion: () => ({ replies: [], canDiscuss: true, isLoading: false, send: vi.fn(), isSending: false }),
}));

import { FindingCard } from "@/components/editorial/finding-card";
import type { FindingItem } from "@/hooks/use-editorial";

const t = getUIStrings("en");

function pending(ruleConflict: number | null, status = "pending"): FindingItem {
  return {
    id: "f1", bookId: "b1", chapterNumber: 1, sessionId: null, agentType: "dev-editor",
    severity: "important", category: "continuity",
    description: "The brass signet is left in the cell, yet a brass object appears later.",
    suggestion: null, originalText: null, newText: null, locationStart: null, locationEnd: null,
    status, dismissReason: null, appliedAt: null, createdAt: "2026-09-18T00:00:00.000Z",
    impactScore: 6, ruleConflict, triagedAt: ruleConflict === null ? null : "2026-09-18T00:00:01.000Z",
    anchorQuote: null, alternatives: null,
  } as FindingItem;
}

afterEach(() => cleanup());

describe("the card says when a note goes against the writer's own decision", () => {
  it("shows it for the note triage measured at 0.77", () => {
    render(<FindingCard finding={pending(0.77)} bookId="b1" />);
    expect(screen.getByText(t.editorialUI.triageConflict)).toBeTruthy();
  });

  it("stays quiet for a note that was not judged, or judged clear", () => {
    for (const rc of [null, 0.18]) {
      render(<FindingCard finding={pending(rc)} bookId="b1" />);
      expect(screen.queryByText(t.editorialUI.triageConflict)).toBeNull();
      cleanup();
    }
  });

  it("is not repeated on a note already decided", () => {
    render(<FindingCard finding={pending(0.9, "dismissed")} bookId="b1" />);
    expect(screen.queryByText(t.editorialUI.triageConflict)).toBeNull();
  });
});
