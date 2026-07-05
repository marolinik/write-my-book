import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM client factory so we control what messages.create returns.
const h = vi.hoisted(() => ({
  create: vi.fn(),
}));
vi.mock("@/lib/llm", () => ({
  createLLMClient: vi.fn(() => ({
    client: { messages: { create: h.create } },
    model: { modelId: "test-model" },
    effectiveModelId: "test-model",
  })),
  resolveCheapModelFor: vi.fn(() => ({ id: "anthropic/haiku" })),
}));

import { extractEntities } from "@/lib/graph/entity-extractor";

const KEYS = { anthropicApiKey: "sk-test" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("extractEntities — forced tool-use (B4)", () => {
  it("reads entities/relationships from a tool_use block and validates them", async () => {
    h.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "record_narrative_graph",
          input: {
            entities: [
              {
                name: "Milena",
                label: "Character",
                properties: { role: "protagonist" },
                aliases: ["Mila"],
              },
              { name: "Split", label: "Location", properties: { locationType: "city" } },
              // Invalid label — must be filtered out even on the tool path.
              { name: "Nonsense", label: "Bogus", properties: {} },
            ],
            relationships: [
              {
                from: "Milena",
                fromLabel: "Character",
                to: "Split",
                toLabel: "Location",
                type: "LOCATED_AT",
                properties: { context: "she lives there" },
              },
              // Endpoint not in the entity set — must be filtered out.
              {
                from: "Milena",
                fromLabel: "Character",
                to: "Ghost",
                toLabel: "Character",
                type: "KNOWS",
              },
            ],
          },
        },
      ],
    });

    const result = await extractEntities("some chapter text", "book1", 3, KEYS);

    expect(h.create).toHaveBeenCalledTimes(1);
    // The call must force our extraction tool.
    const callArg = h.create.mock.calls[0][0];
    expect(callArg.tool_choice).toEqual({ type: "tool", name: "record_narrative_graph" });
    expect(callArg.tools?.[0]?.name).toBe("record_narrative_graph");

    expect(result.chapterNumber).toBe(3);
    expect(result.contentHash).toHaveLength(16);
    expect(result.entities.map((e) => e.name)).toEqual(["Milena", "Split"]);
    expect(result.entities[0].aliases).toEqual(["Mila"]);
    // Only the valid, both-endpoints-known relationship survives.
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].type).toBe("LOCATED_AT");
    expect(result.relationships[0].from).toBe("Milena");
    expect(result.relationships[0].to).toBe("Split");
  });

  it("falls back to text-JSON parsing when no tool_use block is present", async () => {
    // A provider that ignored forced tool_choice and returned prose-wrapped JSON.
    const json = JSON.stringify({
      entities: [{ name: "Ivo", label: "Character", properties: { role: "supporting" } }],
      relationships: [],
    });
    h.create.mockResolvedValue({
      content: [{ type: "text", text: "Here is the graph:\n" + json }],
    });

    const result = await extractEntities("text", "book1", 1, KEYS);

    expect(result.entities.map((e) => e.name)).toEqual(["Ivo"]);
    expect(result.relationships).toEqual([]);
    expect(result.chapterNumber).toBe(1);
  });

  it("repairs TRUNCATED text-JSON via jsonrepair (the qwen failure mode)", async () => {
    // qwen sometimes truncates the JSON mid-array (unterminated brackets), which
    // vanilla JSON.parse rejects. jsonrepair closes the open structures so the
    // graph still lands instead of being dropped entirely.
    const truncated =
      '{"entities":[{"name":"Vera","label":"Character","properties":{}},' +
      '{"name":"Kova","label":"Character","properties":{}}],' +
      '"relationships":[{"from":"Vera","fromLabel":"Character","to":"Kova","toLabel":"Character","type":"KNOWS"';
    h.create.mockResolvedValue({ content: [{ type: "text", text: truncated }] });

    const result = await extractEntities("text", "book1", 5, KEYS);

    // Both entities recovered from the unterminated JSON.
    expect(result.entities.map((e) => e.name)).toEqual(["Vera", "Kova"]);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].type).toBe("KNOWS");
  });

  it("returns an empty result (no throw) when the tool input is malformed", async () => {
    h.create.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "t1",
          name: "record_narrative_graph",
          // Missing entities/relationships — validation must throw internally and
          // the pipeline must swallow it into an empty result.
          input: { garbage: true },
        },
      ],
    });

    const result = await extractEntities("text", "book1", 7, KEYS);

    expect(result.entities).toEqual([]);
    expect(result.relationships).toEqual([]);
    expect(result.chapterNumber).toBe(7);
    expect(result.contentHash).toHaveLength(16);
  });

  it("returns an empty result when the model returns neither tool_use nor text", async () => {
    h.create.mockResolvedValue({ content: [] });

    const result = await extractEntities("text", "book1", 2, KEYS);

    expect(result.entities).toEqual([]);
    expect(result.relationships).toEqual([]);
  });
});
