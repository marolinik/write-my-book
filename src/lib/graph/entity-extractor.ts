/**
 * LLM-based entity extraction from manuscript text.
 * Uses a focused Claude Haiku call to extract characters, locations, events,
 * objects, relationships, plot threads, and factions as structured JSON.
 */

import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
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

Entity label types and their required properties:
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
7. Do NOT invent entities not present in the text
8. Return valid JSON only - no explanation, no markdown`;

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
      // 16k (was 8k) so a dense chapter's entity JSON isn't truncated mid-array
      // into unparseable output (qwen ceilings are far higher than this).
      max_tokens: 16384,
      messages: [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\n--- MANUSCRIPT TEXT (Chapter ${chapterNumber}) ---\n\n${truncatedText}`,
        },
      ],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text response from extraction model");
    }

    const rawJson = textBlock.text.trim();
    const parsed = parseExtractionResponse(rawJson);

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
 * Parse and validate the LLM's JSON response.
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
  // Tolerate leading/trailing prose (some models — e.g. qwen — wrap the JSON in
  // commentary) by slicing to the outermost object braces.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Diagnostic includes length + head + tail so truncation (unterminated JSON)
    // is distinguishable from a mid-string syntax error in the worker log.
    throw new Error(
      `Failed to parse extraction JSON (len=${cleaned.length}): HEAD[${cleaned.slice(0, 150)}] TAIL[${cleaned.slice(-150)}]`
    );
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("entities" in parsed) ||
    !("relationships" in parsed)
  ) {
    throw new Error("Extraction response missing entities or relationships");
  }

  const data = parsed as {
    entities: unknown[];
    relationships: unknown[];
  };

  // Validate and filter entities
  const entities: ExtractedEntity[] = [];
  for (const raw of data.entities) {
    const entity = validateEntity(raw);
    if (entity) {
      entities.push(entity);
    }
  }

  // Build a set of valid entity names for relationship validation
  const entityNames = new Set(entities.map((e) => e.name.toLowerCase()));

  // Validate and filter relationships
  const relationships: ExtractedRelationship[] = [];
  for (const raw of data.relationships) {
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
