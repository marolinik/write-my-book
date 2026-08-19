import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * RC-4 core: a failed LLM/parse must be reported as `failed`, NOT as a
 * genuinely-empty (clean) extraction. Before the fix, `extractEntities` caught
 * every error and returned an empty `ExtractionResult` indistinguishable from a
 * legitimately entity-free chapter — the erased bit that let a dead extraction
 * pass as a billed success.
 */

const h = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  createLLMClient: () => ({
    client: { messages: { create: h.create } },
    model: { modelId: "test-model" },
  }),
  resolveCheapModelFor: () => ({ id: "anthropic/haiku" }),
}));

import { extractEntities } from "@/lib/graph/entity-extractor";

const KEYS = { anthropicApiKey: "sk-test" };
const SUBSTANTIVE = Array.from({ length: 120 }, (_, i) => `word${i}`).join(" ");

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("extractEntities failure signaling (RC-4)", () => {
  it("stamps failed:true + a reason when the LLM call throws", async () => {
    h.create.mockRejectedValue(new Error("provider 503"));

    const res = await extractEntities(SUBSTANTIVE, "book-1", 7, KEYS);

    expect(res.failed).toBe(true);
    expect(res.failureReason).toContain("provider 503");
    expect(res.entities).toEqual([]);
    expect(res.relationships).toEqual([]);
    // content hash still present so a retry can be content-versioned.
    expect(typeof res.contentHash).toBe("string");
  });

  it("does NOT set failed on a genuine (populated) extraction", async () => {
    h.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "record_narrative_graph",
          input: {
            entities: [
              { name: "Mira", label: "Character", properties: { role: "protagonist" } },
            ],
            relationships: [],
          },
        },
      ],
    });

    const res = await extractEntities(SUBSTANTIVE, "book-1", 7, KEYS);

    expect(res.failed).toBeUndefined();
    expect(res.entities).toHaveLength(1);
  });

  it("does NOT set failed on a genuinely EMPTY extraction (model ran, found nothing)", async () => {
    h.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "record_narrative_graph",
          input: { entities: [], relationships: [] },
        },
      ],
    });

    const res = await extractEntities(SUBSTANTIVE, "book-1", 7, KEYS);

    // Empty-but-not-failed: the yield heuristic downstream decides what to do
    // with this; the extractor only reports that the call itself succeeded.
    expect(res.failed).toBeUndefined();
    expect(res.entities).toEqual([]);
  });
});
