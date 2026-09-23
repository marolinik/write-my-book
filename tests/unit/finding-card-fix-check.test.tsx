// @vitest-environment jsdom
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/**
 * An applied card says whether the change removed what the note named.
 *
 * On the owner's book two of eight applied fixes left the problem in place,
 * one of them by pasting an editor's memo into the prose, and the card said
 * nothing. A fix that did not hold now says so next to Undo; one that held
 * says it was checked; one never checked stays exactly as it was.
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

function applied(fixRemains: number | null): FindingItem {
  return {
    id: "f1",
    bookId: "b1",
    chapterNumber: 31,
    sessionId: null,
    agentType: "line-editor",
    severity: "important",
    category: "continuity",
    description: "The call was never set up.",
    suggestion: null,
    originalText: "He carried that call for weeks.",
    newText: "He carried that call for weeks. [Note: add the call to the bible.]",
    locationStart: "10",
    locationEnd: "40",
    status: "applied",
    dismissReason: null,
    appliedAt: "2026-09-23T00:00:00.000Z",
    createdAt: "2026-09-22T00:00:00.000Z",
    impactScore: null,
    ruleConflict: null,
    triagedAt: null,
    fixRemains,
    fixCheckedAt: fixRemains === null ? null : "2026-09-23T00:00:01.000Z",
    anchorQuote: "He carried that call for weeks.",
    alternatives: null,
  } as FindingItem;
}

afterEach(() => cleanup());

describe("the applied card and the fix check", () => {
  it("warns, next to Undo, when the change left the problem in place", () => {
    render(<FindingCard finding={applied(0.74)} bookId="b1" />);
    expect(screen.getByText(t.editorialUI.fixNotHeld)).toBeTruthy();
    expect(screen.getByRole("button", { name: t.editorial.findings.undo })).toBeTruthy();
    expect(screen.queryByText(t.editorialUI.fixHeld)).toBeNull();
  });

  it("says it was checked when the change held", () => {
    render(<FindingCard finding={applied(0.13)} bookId="b1" />);
    expect(screen.getByText(t.editorialUI.fixHeld)).toBeTruthy();
    expect(screen.queryByText(t.editorialUI.fixNotHeld)).toBeNull();
  });

  it("claims nothing about a fix it never checked, or one it could not call", () => {
    for (const remains of [null, 0.55]) {
      render(<FindingCard finding={applied(remains)} bookId="b1" />);
      expect(screen.queryByText(t.editorialUI.fixNotHeld)).toBeNull();
      expect(screen.queryByText(t.editorialUI.fixHeld)).toBeNull();
      cleanup();
    }
  });
});
