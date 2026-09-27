// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { getAgentStrings, workflowLabel } from "@/lib/i18n/agent-strings";

/**
 * P6-S08 — on an imported book (chapter text only, no Concept / Story Bible)
 * the agent panel showed "World Research" and "Write Synopsis" locked, with
 * no way forward. Both declare `anyOf: [{ type: "manuscript" }]` on their
 * document prerequisite (R-201) precisely so an imported manuscript
 * satisfies them, and the server honours it — the client's own check read
 * only `p.type`/`p.value` and never looked at `anyOf`.
 */

vi.mock("@/hooks/use-workflow-costs", () => ({
  useWorkflowCostEstimates: () => ({}),
}));

import { WorkflowSelector } from "@/components/agent/workflow-selector";

const as = getAgentStrings("en");

function renderSelector(docTypes: string[], hasChapterContent: boolean) {
  return render(
    <TooltipProvider>
      <WorkflowSelector
        bookId="b1"
        chapters={[{ chapterNumber: 1, title: "Prolog" }]}
        onSelect={() => {}}
        existingDocTypes={new Set(docTypes)}
        hasChapterContent={hasChapterContent}
        defaultTab="workflows"
      />
    </TooltipProvider>
  );
}

function workflowButton(workflowId: string): HTMLButtonElement {
  const label = workflowLabel(as, workflowId) ?? workflowId;
  const text = screen.getByText(label);
  return text.closest("button") as HTMLButtonElement;
}

afterEach(() => cleanup());

describe("P6-S08 — an imported manuscript satisfies anyOf prerequisites", () => {
  it("unlocks World Research and Write Synopsis on a book that is chapter text only", () => {
    renderSelector(["CHAPTER_CONTENT"], true);

    expect(workflowButton("research-world").disabled).toBe(false);
    expect(workflowButton("write-synopsis").disabled).toBe(false);
  });

  it("still locks them on an empty book, where neither the document nor a manuscript exists", () => {
    renderSelector([], false);

    expect(workflowButton("research-world").disabled).toBe(true);
    expect(workflowButton("write-synopsis").disabled).toBe(true);
  });

  it("locks a manuscript-only workflow until the book has chapter text, as the server does", () => {
    renderSelector(["CONCEPT"], false);
    expect(workflowButton("check-continuity").disabled).toBe(true);
    cleanup();

    renderSelector(["CHAPTER_CONTENT"], true);
    expect(workflowButton("check-continuity").disabled).toBe(false);
  });
});
