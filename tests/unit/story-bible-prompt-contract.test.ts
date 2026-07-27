import { describe, it, expect, vi } from "vitest";

// prompt-assembler transitively imports @/lib/db (real Prisma init at load).
// Mock it so importing the module for its static instruction table is
// side-effect free (same pattern as line-editor-signature-gate).
vi.mock("@/lib/db", () => ({ db: {} }));

import { CONDUCTOR_WORKFLOW_INSTRUCTIONS } from "@/lib/agents/prompt-assembler";

/**
 * D-188 root cause: the conductor instruction for `create-story-bible` merely
 * said "write the STORY_BIBLE document when you have enough information", and a
 * model that streamed the whole bible into the chat instead was never
 * contradicted — it then told the writer "Story Bible Status: Complete" over an
 * empty book. Prompt hardening is the cheap half of the fix (artifact-contract
 * is the enforcing half), so the imperative is pinned here.
 */
describe("create-story-bible conductor instruction (D-188 prompt half)", () => {
  const text = CONDUCTOR_WORKFLOW_INSTRUCTIONS["create-story-bible"];

  it("demands the WriteDocument call", () => {
    expect(text).toMatch(/MUST call WriteDocument/);
    expect(text).toMatch(/STORY_BIBLE/);
  });

  it("says pasting into the chat does not save, and names what it blocks", () => {
    expect(text).toMatch(/does NOT save it/i);
    expect(text).toMatch(/build-architecture/);
  });

  it("forbids claiming completion without having called the tool", () => {
    expect(text).toMatch(/never tell the user the story bible is complete/i);
  });
});
