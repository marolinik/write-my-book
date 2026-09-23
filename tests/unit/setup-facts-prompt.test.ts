import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The setup conversation is told what the manuscript already settles, and
 * the instructions say what to do with it: read the chapters, propose, and
 * ask only what the text leaves open. Other workflows neither read the
 * manuscript for this nor carry the block.
 */

const h = vi.hoisted(() => ({ readManuscriptFacts: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    book: { findUnique: vi.fn(async () => ({ genre: null, language: "sr" })) },
    bookSettings: { findUnique: vi.fn(async () => null) },
    writerMemory: { findMany: vi.fn(async () => []) },
    editFinding: { findMany: vi.fn(async () => []) },
    chapter: { findMany: vi.fn(async () => []), count: vi.fn(async () => 0) },
    styleProfile: { findFirst: vi.fn(async () => null), findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/setup/manuscript-facts-service", () => ({ readManuscriptFacts: h.readManuscriptFacts }));

import { assembleAgentPrompt } from "@/lib/agents/prompt-assembler";
import { getAgentDefinition } from "@/lib/agents/definitions";
import type { AgentContext } from "@/lib/agents/types";

const docService = {
  findByType: vi.fn(async () => null),
  read: vi.fn(async () => null),
  list: vi.fn(async () => []),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;
const coach = getAgentDefinition("writing-coach")!;
const ctx = (targetWorkflowId: string) =>
  ({ bookId: "b1", userId: "u1", sessionId: "s1", agentType: "writing-coach", targetWorkflowId, language: "sr" }) as AgentContext;

beforeEach(() => {
  h.readManuscriptFacts.mockReset();
  h.readManuscriptFacts.mockResolvedValue({ pov: "third-limited", tense: "past", genre: "historical" });
});

describe("setup conversations start from what the manuscript settles", () => {
  for (const workflow of ["onboard-new-book", "create-story-bible", "new-novel"]) {
    it(`${workflow} carries the settled facts`, async () => {
      const prompt = await assembleAgentPrompt(coach, ctx(workflow), docService);
      expect(h.readManuscriptFacts).toHaveBeenCalledWith("b1");
      expect(prompt).toContain("<established_by_the_manuscript>");
      expect(prompt).toContain("third person, limited");
    });
  }

  it("onboard-new-book is told to read the chapters and skip the sample when they exist", async () => {
    const prompt = await assembleAgentPrompt(coach, ctx("onboard-new-book"), docService);
    expect(prompt).toMatch(/already has chapters[\s\S]*ReadAllChapters/i);
    expect(prompt).toMatch(/do not ask for a writing sample/i);
  });

  it("create-story-bible drafts from the chapters when they exist", async () => {
    const prompt = await assembleAgentPrompt(coach, ctx("create-story-bible"), docService);
    expect(prompt).toMatch(/already has chapters[\s\S]*ReadAllChapters/i);
  });

  it("carries nothing when the manuscript settles nothing", async () => {
    h.readManuscriptFacts.mockResolvedValue(null);
    const prompt = await assembleAgentPrompt(coach, ctx("onboard-new-book"), docService);
    expect(prompt).not.toContain("<established_by_the_manuscript>");
  });

  it("other workflows do not read the manuscript for this", async () => {
    const prompt = await assembleAgentPrompt(coach, ctx("line-edit"), docService);
    expect(h.readManuscriptFacts).not.toHaveBeenCalled();
    expect(prompt).not.toContain("<established_by_the_manuscript>");
  });
});
