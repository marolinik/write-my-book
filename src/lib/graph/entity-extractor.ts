/**
 * LLM-based entity extraction from manuscript text.
 * Uses a focused Claude Haiku call to extract characters, locations, events,
 * objects, relationships, plot threads, and factions as structured JSON.
 */

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { jsonrepair } from "jsonrepair";
import { createLLMClient, resolveCheapModelFor } from "@/lib/llm";
import type { LLMClientOptions } from "@/lib/llm/client-factory";
import type {
  ExtractionResult,
  ExtractedEntity,
  ExtractedRelationship,
  GraphNodeLabel,
  RelationshipType,
} from "./types";

/**
 * Create an extraction client using the caller's keys.
 * Falls back to env vars only for backward compatibility (e.g. background jobs).
 *
 * The cheap ("haiku"-tier) variant is chosen for the user's OWN provider via
 * resolveCheapModelFor(defaultModel) — mirrors inline-edit/route.ts:45-46 and
 * discuss-llm.ts. When no defaultModel is threaded, fall back to a key-presence
 * heuristic so background/legacy callers keep working.
 */
function createExtractionClient(
  keys?: Partial<LLMClientOptions>,
  defaultModel?: string
): {
  client: Anthropic;
  modelId: string;
} {
  const anthropicApiKey = keys?.anthropicApiKey;
  const openrouterApiKey = keys?.openrouterApiKey;

  // Determine which provider to use based on available keys
  const hasAnthropic = !!anthropicApiKey;
  const hasOpenRouter = !!openrouterApiKey;

  if (!hasAnthropic && !hasOpenRouter) {
    throw new Error("No API key available for entity extraction. Add a key in Settings > API Keys.");
  }

  const registryId = defaultModel
    ? resolveCheapModelFor(defaultModel).id
    : hasOpenRouter
      ? "openrouter/haiku"
      : "anthropic/haiku";
  const { client, model } = createLLMClient({
    modelId: registryId,
    anthropicApiKey,
    openrouterApiKey,
    openaiApiKey: keys?.openaiApiKey,
    geminiApiKey: keys?.geminiApiKey,
    grokApiKey: keys?.grokApiKey,
  });
  return { client, modelId: model.modelId };
}

const VALID_LABELS: GraphNodeLabel[] = [
  "Character",
  "Location",
  "Event",
  "Object",
  "PlotThread",
  "Faction",
  "Chapter",
  "Scene",
];

const VALID_RELATIONSHIP_TYPES: RelationshipType[] = [
  "APPEARS_IN",
  "LOCATED_AT",
  "PARTICIPATES_IN",
  "KNOWS",
  "ALLIED_WITH",
  "OPPOSES",
  "OWNS",
  "PART_OF",
  "LEADS_TO",
  "FORESHADOWS",
  "RESOLVES",
  "OCCURS_IN",
  "BELONGS_TO",
  "MENTIONED_IN",
  "TRANSFORMS_INTO",
];

/**
 * Shared guidance on WHAT to extract (labels, relationship types, rules). Used
 * by both the forced-tool-use prompt (structure enforced by the tool schema)
 * and the text-fallback prompt (which adds JSON-envelope instructions).
 */
const EXTRACTION_GUIDANCE = `Entity label types and their required properties:
- Character: { "role": "protagonist|antagonist|supporting|minor|mentioned", "description": "brief description", "status": "alive|dead|unknown|transformed", "physicalTraits": "optional", "personality": "optional", "age": "optional" }
- Location: { "locationType": "city|building|room|region|country|world|other", "description": "brief description", "parentLocation": "optional parent name" }
- Event: { "significance": "major|minor|turning-point|climax", "description": "what happened", "timelinePosition": "relative or absolute time reference" }
- Object: { "objectType": "weapon|artifact|document|vehicle|clothing|tool|other", "description": "brief description", "status": "intact|destroyed|lost|transformed", "currentHolder": "character name or null" }
- PlotThread: { "threadType": "main|subplot|mystery|romance|foreshadowing", "status": "introduced|developing|climaxed|resolved|abandoned", "description": "what the thread is about" }
- Faction: { "factionType": "organization|family|government|religion|military|other", "description": "brief description", "alignment": "e.g. good, evil, neutral, chaotic" }

Relationship types and when to use them:
- APPEARS_IN: Character present in a chapter/scene
- LOCATED_AT: Event or scene takes place at a location
- PARTICIPATES_IN: Character involved in an event
- KNOWS: Two characters know each other
- ALLIED_WITH: Characters or factions allied
- OPPOSES: Characters or factions in opposition
- OWNS: Character possesses an object
- PART_OF: Character belongs to faction, or location is part of another
- LEADS_TO: One event causes or leads to another
- FORESHADOWS: Entity hints at a future event
- RESOLVES: Event resolves a plot thread
- OCCURS_IN: Event happens in a chapter
- BELONGS_TO: Scene belongs to a chapter
- MENTIONED_IN: Entity mentioned in a chapter
- TRANSFORMS_INTO: Entity transforms into another

Rules:
1. Extract ALL named characters, even briefly mentioned ones (use role: "mentioned")
2. Extract locations even if only referenced in passing
3. Identify plot threads being introduced, developed, or resolved
4. Capture ALL relationships between extracted entities
5. Use consistent entity names (prefer full names)
6. Include aliases for characters with nicknames, titles, or shortened names
7. Do NOT invent entities not present in the text`;

/**
 * Prompt for the primary (forced tool-use) path. The tool schema enforces the
 * output shape, so no JSON-envelope wording is needed here.
 */
const EXTRACTION_TOOL_PROMPT = `You are a literary entity extraction engine. Analyze the following manuscript text and extract all narrative entities and their relationships, then record them by calling the record_narrative_graph tool.

${EXTRACTION_GUIDANCE}`;

/**
 * Prompt for the text-parse fallback path (providers/models that ignore forced
 * tool_choice). Keeps the "return ONLY JSON" envelope instructions.
 */
const EXTRACTION_PROMPT = `You are a literary entity extraction engine. Analyze the following manuscript text and extract all narrative entities and their relationships.

Return ONLY a valid JSON object with this exact structure (no markdown, no code fences):

{
  "entities": [
    {
      "name": "Entity Name",
      "label": "Character|Location|Event|Object|PlotThread|Faction",
      "properties": { ... },
      "aliases": ["optional", "alternate", "names"]
    }
  ],
  "relationships": [
    {
      "from": "Entity Name",
      "fromLabel": "Character",
      "to": "Other Entity",
      "toLabel": "Location",
      "type": "APPEARS_IN|LOCATED_AT|PARTICIPATES_IN|KNOWS|ALLIED_WITH|OPPOSES|OWNS|PART_OF|LEADS_TO|FORESHADOWS|RESOLVES|OCCURS_IN|BELONGS_TO|MENTIONED_IN|TRANSFORMS_INTO",
      "properties": { "context": "optional context" }
    }
  ]
}

${EXTRACTION_GUIDANCE}
8. Return valid JSON only - no explanation, no markdown`;

/**
 * Forced tool-use schema for structured extraction. Returning the graph as tool
 * input lets the Anthropic SDK parse it for us, avoiding the fragile text-JSON
 * parsing that dense models (e.g. qwen via OpenRouter) sometimes break.
 */
const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "record_narrative_graph",
  description:
    "Record every narrative entity and relationship extracted from the manuscript text. Call this exactly once with the complete graph.",
  input_schema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        description: "All narrative entities present in the text.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Entity name (prefer full names)." },
            label: { type: "string", enum: VALID_LABELS },
            properties: {
              type: "object",
              description: "Label-specific properties (see label guidance).",
            },
            aliases: {
              type: "array",
              items: { type: "string" },
              description: "Alternate names, nicknames, titles.",
            },
          },
          required: ["name", "label"],
        },
      },
      relationships: {
        type: "array",
        description: "All relationships between the extracted entities.",
        items: {
          type: "object",
          properties: {
            from: { type: "string", description: "Source entity name." },
            fromLabel: { type: "string", enum: VALID_LABELS },
            to: { type: "string", description: "Target entity name." },
            toLabel: { type: "string", enum: VALID_LABELS },
            type: { type: "string", enum: VALID_RELATIONSHIP_TYPES },
            properties: { type: "object", description: "Optional relationship context." },
          },
          required: ["from", "fromLabel", "to", "toLabel", "type"],
        },
      },
    },
    required: ["entities", "relationships"],
  },
};

/**
 * Extract entities and relationships from manuscript text using an LLM.
 */
export async function extractEntities(
  text: string,
  bookId: string,
  chapterNumber: number,
  keys?: Partial<LLMClientOptions>,
  defaultModel?: string
): Promise<ExtractionResult> {
  const contentHash = hashContent(text);
  const { client, modelId } = createExtractionClient(keys, defaultModel);

  // Truncate very long chapters to stay within token limits
  const maxChars = 80_000;
  const truncatedText =
    text.length > maxChars ? text.slice(0, maxChars) + "\n\n[TEXT TRUNCATED]" : text;

  try {
    const response = await client.messages.create({
      model: modelId,
      // 16k (was 8k) so a dense chapter's entity graph isn't truncated mid-array
      // into unparseable output (qwen ceilings are far higher than this).
      max_tokens: 16384,
      // Force the model to return the graph as STRUCTURED tool input, which the
      // SDK parses for us — no fragile text-JSON parsing on the happy path.
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: EXTRACTION_TOOL.name },
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_TOOL_PROMPT}\n\n--- MANUSCRIPT TEXT (Chapter ${chapterNumber}) ---\n\n${truncatedText}`,
        },
      ],
    });

    // Primary path: read the structured tool_use block. Its `.input` is ALREADY
    // a parsed object, so we validate it directly.
    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === "tool_use" && block.name === EXTRACTION_TOOL.name
    );

    let parsed: {
      entities: ExtractedEntity[];
      relationships: ExtractedRelationship[];
    };
    if (toolBlock) {
      parsed = validateExtractionObject(toolBlock.input);
    } else {
      // Fallback: model/provider did not honor forced tool_choice (some non-Claude
      // models via OpenRouter don't) — parse the JSON out of the text block.
      const textBlock = response.content.find((block) => block.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No tool_use or text response from extraction model");
      }
      parsed = parseExtractionResponse(textBlock.text.trim());
    }

    // Observability: which path won (tool_use vs text-fallback) + yield. Lets us
    // confirm whether a given provider honors forced tool_choice and whether the
    // graph is actually being populated.
    console.log(
      `[entity-extractor] book=${bookId} ch=${chapterNumber} path=${toolBlock ? "tool_use" : "text-fallback"} entities=${parsed.entities.length} rels=${parsed.relationships.length}`
    );

    return {
      entities: parsed.entities,
      relationships: parsed.relationships,
      chapterNumber,
      contentHash,
    };
  } catch (error) {
    // On LLM failure, return empty result rather than crashing the pipeline
    console.error(
      `[entity-extractor] Failed to extract entities for book=${bookId} chapter=${chapterNumber}:`,
      error
    );
    return {
      entities: [],
      relationships: [],
      chapterNumber,
      contentHash,
    };
  }
}

/**
 * Parse the LLM's TEXT JSON response and validate it. Used by the fallback path
 * (providers that ignore forced tool_choice).
 */
function parseExtractionResponse(raw: string): {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
} {
  // Strip markdown code fences if present.
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  // Strip LEADING prose so the payload starts at the first object brace.
  const firstBrace = cleaned.indexOf("{");
  if (firstBrace > 0) cleaned = cleaned.slice(firstBrace);
  const lastBrace = cleaned.lastIndexOf("}");

  // Try, in order, the strategies that recover the most-likely qwen failure modes.
  // IMPORTANT: repair runs on the FULL leading-stripped payload, NOT the
  // last-brace slice — for TRUNCATED JSON the last `}` sits mid-structure, so
  // slicing to it would drop trailing keys (e.g. relationships) that jsonrepair
  // would otherwise recover by closing the open brackets.
  const strategies: Array<() => string> = [
    () => cleaned, // clean JSON (no surrounding prose)
    () => (lastBrace > 0 ? cleaned.slice(0, lastBrace + 1) : cleaned), // trailing prose
    () => jsonrepair(cleaned), // truncation / trailing commas / minor malformation
  ];
  for (const build of strategies) {
    try {
      return validateExtractionObject(JSON.parse(build()));
    } catch {
      // fall through to the next recovery strategy
    }
  }
  // Diagnostic: len + head + tail distinguishes truncation from a syntax error.
  throw new Error(
    `Failed to parse extraction JSON even after repair (len=${cleaned.length}): HEAD[${cleaned.slice(0, 150)}] TAIL[${cleaned.slice(-150)}]`
  );
}

/**
 * Validate an already-parsed extraction object (from either forced tool-use
 * input or text-parsed JSON), filtering to the known labels/relationship types
 * and coercing each entity/relationship into the canonical shape.
 */
function validateExtractionObject(parsed: unknown): {
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
} {
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("entities" in parsed) ||
    !("relationships" in parsed)
  ) {
    throw new Error("Extraction response missing entities or relationships");
  }

  const data = parsed as {
    entities: unknown;
    relationships: unknown;
  };
  const rawEntities = Array.isArray(data.entities) ? data.entities : [];
  const rawRelationships = Array.isArray(data.relationships) ? data.relationships : [];

  // Validate and filter entities
  const entities: ExtractedEntity[] = [];
  for (const raw of rawEntities) {
    const entity = validateEntity(raw);
    if (entity) {
      entities.push(entity);
    }
  }

  // Build a set of valid entity names for relationship validation
  const entityNames = new Set(entities.map((e) => e.name.toLowerCase()));

  // Validate and filter relationships
  const relationships: ExtractedRelationship[] = [];
  for (const raw of rawRelationships) {
    const rel = validateRelationship(raw, entityNames);
    if (rel) {
      relationships.push(rel);
    }
  }

  return { entities, relationships };
}

/**
 * Validate a single extracted entity.
 */
function validateEntity(raw: unknown): ExtractedEntity | null {
  if (typeof raw !== "object" || raw === null) return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return null;
  if (typeof obj.label !== "string") return null;

  // Validate label
  if (!VALID_LABELS.includes(obj.label as GraphNodeLabel)) return null;
  // Skip Chapter and Scene labels — those are managed structurally, not extracted
  if (obj.label === "Chapter" || obj.label === "Scene") return null;

  const properties =
    typeof obj.properties === "object" && obj.properties !== null
      ? (obj.properties as Record<string, unknown>)
      : {};

  const aliases: string[] = [];
  if (Array.isArray(obj.aliases)) {
    for (const alias of obj.aliases) {
      if (typeof alias === "string" && alias.trim()) {
        aliases.push(alias.trim());
      }
    }
  }

  return {
    name: obj.name.trim(),
    label: obj.label as GraphNodeLabel,
    properties,
    aliases: aliases.length > 0 ? aliases : undefined,
  };
}

/**
 * Validate a single extracted relationship.
 */
function validateRelationship(
  raw: unknown,
  entityNames: Set<string>
): ExtractedRelationship | null {
  if (typeof raw !== "object" || raw === null) return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.from !== "string" || !obj.from.trim()) return null;
  if (typeof obj.to !== "string" || !obj.to.trim()) return null;
  if (typeof obj.type !== "string") return null;
  if (typeof obj.fromLabel !== "string") return null;
  if (typeof obj.toLabel !== "string") return null;

  // Validate relationship type
  if (!VALID_RELATIONSHIP_TYPES.includes(obj.type as RelationshipType)) return null;

  // Validate that both endpoints reference known entities
  if (
    !entityNames.has(obj.from.trim().toLowerCase()) ||
    !entityNames.has(obj.to.trim().toLowerCase())
  ) {
    return null;
  }

  // Validate labels
  if (
    !VALID_LABELS.includes(obj.fromLabel as GraphNodeLabel) ||
    !VALID_LABELS.includes(obj.toLabel as GraphNodeLabel)
  ) {
    return null;
  }

  const properties =
    typeof obj.properties === "object" && obj.properties !== null
      ? (obj.properties as Record<string, unknown>)
      : undefined;

  return {
    from: obj.from.trim(),
    fromLabel: obj.fromLabel as GraphNodeLabel,
    to: obj.to.trim(),
    toLabel: obj.toLabel as GraphNodeLabel,
    type: obj.type as RelationshipType,
    properties,
  };
}

/**
 * Compute a content hash for incremental processing.
 * Returns a 16-char hex string.
 */
export function hashContent(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}
