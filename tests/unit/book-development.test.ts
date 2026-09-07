// Book-development package unit tests: SYNOPSIS document type, write-synopsis
// workflow + journey checkpoint, CONCEPT persistence wiring, and the
// Perplexity/Firecrawl provider selection in WebSearch/FetchWebPage.
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { getWorkflow } from "@/lib/agents/workflows";
import {
  isStepComplete,
  StepCompletionInput,
  getDetailedJourneyProgress,
} from "@/lib/agents/journeys";
import { getStoragePath } from "@/lib/documents/storage-keys";
import { DocumentType } from "@/generated/prisma/enums";
import { createDocumentSchema } from "@/lib/validation";
import { getAgentDefinition } from "@/lib/agents/definitions";
import type { ToolContext } from "@/lib/agents/tools";

const baseStepInput: StepCompletionInput = {
  hasFingerprint: false,
  hasStoryBible: false,
  hasArchitecture: false,
  hasSynopsis: false,
  hasAnalysisReport: false,
  hasMarketReport: false,
  hasContinuityReport: false,
  hasImportedManuscript: false,
  chapterCount: 0,
  chapterStatuses: {},
};

describe("SYNOPSIS document type", () => {
  it("maps to the canonical .planning/SYNOPSIS.md storage path", () => {
    const p = getStoragePath(DocumentType.SYNOPSIS);
    // Note: getStoragePath takes the generated enum; use the one exported or the
    // string form through the DocumentType re-export.
    expect(p).toBe(".planning/SYNOPSIS.md");
  });

  it("is accepted by the REST createDocumentSchema", () => {
    const parsed = createDocumentSchema.safeParse({
      type: "SYNOPSIS",
      content: "# Synopsis\n\nSome plot.",
    });
    expect(parsed.success).toBe(true);
  });

  it("still rejects unknown types", () => {
    const parsed = createDocumentSchema.safeParse({
      type: "NOT_A_TYPE",
      content: "x",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("write-synopsis workflow", () => {
  it("declares a SYNOPSIS- producing setup workflow with a CONCEPT prerequisite", () => {
    const wf = getWorkflow("write-synopsis");
    expect(wf).toBeDefined();
    expect(wf!.producesDocument).toBe("SYNOPSIS");
    expect(wf!.category).toBe("setup");
    expect(wf!.requiresChapter).toBe(false);
    const prerequisite = wf!.prerequisites?.find((p) => p.value === "CONCEPT");
    expect(prerequisite).toBeDefined();
  });

  it("is run by the scene-planner (has the tools to write a doc)", () => {
    const wf = getWorkflow("write-synopsis");
    const agent = getAgentDefinition(wf!.primaryAgent);
    expect(agent).toBeDefined();
    expect(agent!.tools).toContain("WriteDocument");
    expect(agent!.tools).toContain("ReadDocument");
  });
});

describe("synopsis journey checkpoint", () => {
  it("is incomplete until hasSynopsis is true, then complete", () => {
    const input = { ...baseStepInput };
    expect(
      isStepComplete({ workflowId: "write-synopsis" }, input)
    ).toBe(false);
    const withSynopsis = { ...input, hasSynopsis: true };
    expect(
      isStepComplete({ workflowId: "write-synopsis" }, withSynopsis)
    ).toBe(true);
  });

  it("appears in the new-novel journey after new-novel and before capture-style", () => {
    const detail = getDetailedJourneyProgress("new-novel", baseStepInput);
    expect(detail).not.toBeNull();
    const stepIds = detail!.steps.map((s) => s.workflowId);
    const synIdx = stepIds.indexOf("write-synopsis");
    const newNovelIdx = stepIds.indexOf("new-novel");
    const captureIdx = stepIds.indexOf("capture-style");
    expect(synIdx).toBeGreaterThan(newNovelIdx);
    expect(synIdx).toBeLessThan(captureIdx);
  });
});

describe("CONCEPT persistence wiring", () => {
  it("caps the write-synopsis CONCEPT prerequisite on new-novel", () => {
    const wf = getWorkflow("write-synopsis");
    const prereq = wf!.prerequisites?.find((p) => p.value === "CONCEPT");
    expect(prereq!.satisfiedBy).toBe("new-novel");
  });
});

describe("WebSearch provider selection (Perplexity primary, Serper fallback)", () => {
  const OLD = {
    pp: process.env.PERPLEXITY_API_KEY,
    serper: process.env.SERPER_API_KEY,
  };
  const ctx = {
    bookId: "book-1",
    userId: "user-1",
    sessionId: "sess-1",
    agentType: "world-researcher",
    documentService: {} as never,
  };
  let executeTool: (
    toolName: string,
    ctx: ToolContext,
    input: Record<string, unknown>
  ) => Promise<string>;

  beforeAll(async () => {
    const mod = await import("@/lib/agents/tools");
    executeTool = mod.executeTool;
  });

  afterEach(() => {
    delete (global as { fetch?: unknown }).fetch;
    process.env.PERPLEXITY_API_KEY = OLD.pp;
    process.env.SERPER_API_KEY = OLD.serper;
  });

  it(
    "calls Perplexity first when its key is configured",
    async () => {
      process.env.PERPLEXITY_API_KEY = "pp-key";
      process.env.SERPER_API_KEY = "";
      const calls: string[] = [];
      (global as { fetch: unknown }).fetch = (async (
        input: RequestInfo | URL
      ) => {
        calls.push(String(input));
        const body = String(input).includes("perplexity")
          ? {
              choices: [
                { message: { content: "A grounded answer.[1]" } },
              ],
              citations: ["https://example.com/source"],
            }
          : { organic: [] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as typeof fetch;

      const result = await executeTool(
        "WebSearch",
        ctx,
        { query: "Renaissance Florence guilds" }
      );
      expect(calls.some((c) => c.includes("perplexity"))).toBe(true);
      expect(result).toContain("example.com/source");
    },
    20000
  );

  it(
    "does not call Perplexity when its key is unset",
    async () => {
      process.env.PERPLEXITY_API_KEY = "";
      process.env.SERPER_API_KEY = "";
      const calls: string[] = [];
      (global as { fetch: unknown }).fetch = (async (
        input: RequestInfo | URL
      ) => {
        calls.push(String(input));
        return new Response("", { status: 200 });
      }) as typeof fetch;

      await executeTool("WebSearch", ctx, { query: "test" });
      expect(calls.some((c) => c.includes("perplexity"))).toBe(false);
    },
    20000
  );
});

describe("FetchWebPage provider selection (Firecrawl primary)", () => {
  it(
    "calls Firecrawl when its key is configured and returns a markdown document",
    async () => {
      const OLD = process.env.FIRECRAWL_API_KEY;
      process.env.FIRECRAWL_API_KEY = "fc-key";
      const ctx = {
        bookId: "book-1",
        userId: "user-1",
        sessionId: "sess-1",
        agentType: "world-researcher",
        documentService: {} as never,
      };
      const calls: string[] = [];
      (global as { fetch: unknown }).fetch = (async (
        input: RequestInfo | URL
      ) => {
        calls.push(String(input));
        if (String(input).includes("firecrawl")) {
          return new Response(
            JSON.stringify({ data: { markdown: "# Clean Markdown\n\nBody." } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response("", { status: 200 });
      }) as typeof fetch;

      const mod = await import("@/lib/agents/tools");
      const result = await mod.executeTool(
        "FetchWebPage",
        ctx,
        { url: "https://example.com/article" }
      );
      expect(calls.some((c) => c.includes("firecrawl"))).toBe(true);
      expect(result).toContain("Clean Markdown");
      expect(result).toContain("Body.");

      process.env.FIRECRAWL_API_KEY = OLD;
      delete (global as { fetch?: unknown }).fetch;
    },
    20000
  );
});