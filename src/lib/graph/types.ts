/**
 * TypeScript types for the Neo4j knowledge graph.
 * Defines all node types, relationship types, and query result shapes.
 */

// ─── Node Types ──────────────────────────────────────────────

export interface GraphNodeBase {
  id: string;
  bookId: string;
  name: string;
  aliases?: string[];
  firstAppearance?: number; // chapter number
  lastMentioned?: number;
  contentHash?: string; // for incremental updates
  createdAt: string;
  updatedAt: string;
}

export interface CharacterNode extends GraphNodeBase {
  _label: "Character";
  role: "protagonist" | "antagonist" | "supporting" | "minor" | "mentioned";
  description?: string;
  physicalTraits?: string;
  personality?: string;
  age?: string;
  status: "alive" | "dead" | "unknown" | "transformed";
  deathChapter?: number;
}

export interface LocationNode extends GraphNodeBase {
  _label: "Location";
  locationType: "city" | "building" | "room" | "region" | "country" | "world" | "other";
  description?: string;
  parentLocation?: string;
}

export interface EventNode extends GraphNodeBase {
  _label: "Event";
  /**
   * NARRATING-time chapter: the chapter this Event was extracted from (where it
   * is told). Deterministically stamped at upsert (never LLM-derived). Kept for
   * display/timeline ordering and for legacy compatibility.
   */
  chapter: number;
  /**
   * STORY-time chapter: when the Event actually happens in the story's internal
   * chronology (RC-2 / D-32). For linear narration this equals `chapter`; for a
   * flashback / retelling / dream / prophecy narrated in a later chapter it is
   * the EARLIER story chapter the event belongs to. Consistency checks
   * (dead_character_reappears, timeline_violation, location_conflict) compare
   * story-time so non-chronological narration stops false-firing. Defaults to
   * `chapter` when no story-time signal is available.
   */
  occursInChapter?: number;
  timelinePosition?: string; // relative or absolute time reference
  significance: "major" | "minor" | "turning-point" | "climax";
  description?: string;
}

export interface ObjectNode extends GraphNodeBase {
  _label: "Object";
  objectType: "weapon" | "artifact" | "document" | "vehicle" | "clothing" | "tool" | "other";
  description?: string;
  status: "intact" | "destroyed" | "lost" | "transformed";
  currentHolder?: string; // character name
}

export interface PlotThreadNode extends GraphNodeBase {
  _label: "PlotThread";
  threadType: "main" | "subplot" | "mystery" | "romance" | "foreshadowing";
  status: "introduced" | "developing" | "climaxed" | "resolved" | "abandoned";
  introducedChapter: number;
  resolvedChapter?: number;
  description?: string;
}

export interface ChapterNode extends GraphNodeBase {
  _label: "Chapter";
  chapterNumber: number;
  title?: string;
  povCharacter?: string;
  timelineStart?: string;
  timelineEnd?: string;
  tensionLevel?: number; // 1-10
}

export interface FactionNode extends GraphNodeBase {
  _label: "Faction";
  factionType: "organization" | "family" | "government" | "religion" | "military" | "other";
  description?: string;
  alignment?: string;
}

export interface SceneNode extends GraphNodeBase {
  _label: "Scene";
  chapterNumber: number;
  sceneIndex: number;
  location?: string;
  povCharacter?: string;
  mood?: string;
}

export type GraphNode =
  | CharacterNode
  | LocationNode
  | EventNode
  | ObjectNode
  | PlotThreadNode
  | ChapterNode
  | FactionNode
  | SceneNode;

export type GraphNodeLabel = GraphNode["_label"];

// ─── Relationship Types ──────────────────────────────────────

export type RelationshipType =
  | "APPEARS_IN"        // Character → Chapter/Scene
  | "LOCATED_AT"        // Event/Scene → Location
  | "PARTICIPATES_IN"   // Character → Event
  | "KNOWS"             // Character → Character
  | "ALLIED_WITH"       // Character/Faction → Character/Faction
  | "OPPOSES"           // Character/Faction → Character/Faction
  | "OWNS"              // Character → Object
  | "PART_OF"           // Character → Faction, Location → Location
  | "LEADS_TO"          // Event → Event
  | "FORESHADOWS"       // Event/Object → Event
  | "RESOLVES"          // Event → PlotThread
  | "OCCURS_IN"         // Event → Chapter
  | "BELONGS_TO"        // Scene → Chapter
  | "MENTIONED_IN"      // any → Chapter
  | "TRANSFORMS_INTO";  // Character/Object → Character/Object

/**
 * Runtime allowlist mirroring the RelationshipType union — the single source of
 * truth for the extraction tool schema + filter (entity-extractor), the agent
 * UpdateGraphEntity tool schema (agents/tools), and the Cypher boundary
 * sanitizer (graph-builder.sanitizeRelationshipType, D-63). `as const satisfies`
 * guarantees no entry can drift to a value that is not a valid RelationshipType.
 */
export const RELATIONSHIP_TYPES = [
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
] as const satisfies readonly RelationshipType[];

export interface GraphRelationship {
  type: RelationshipType;
  fromId: string;
  fromLabel: GraphNodeLabel;
  toId: string;
  toLabel: GraphNodeLabel;
  properties?: Record<string, unknown>;
  chapter?: number;
}

// ─── Extraction Types ────────────────────────────────────────

export interface ExtractedEntity {
  name: string;
  label: GraphNodeLabel;
  properties: Record<string, unknown>;
  aliases?: string[];
}

export interface ExtractedRelationship {
  from: string; // entity name
  fromLabel: GraphNodeLabel;
  to: string; // entity name
  toLabel: GraphNodeLabel;
  type: RelationshipType;
  properties?: Record<string, unknown>;
}

export interface ExtractionResult {
  /**
   * The book this extraction belongs to. REQUIRED and authoritative: every
   * node and relationship write in graph-builder is scoped to this id (D-30 —
   * a relationship upsert that matched endpoints by name alone wrote edges
   * into every same-named pair across ALL books, including other tenants').
   */
  bookId: string;
  /**
   * The owning tenant (RC-6 defense in depth). Optional & backward-compatible:
   * when present it is stamped onto every node/edge written for this extraction
   * so graph reads can enforce tenant isolation beyond bookId alone. Legacy /
   * background callers that omit it simply write no userId (reads stay
   * bookId-scoped, exactly as before).
   */
  userId?: string;
  entities: ExtractedEntity[];
  relationships: ExtractedRelationship[];
  chapterNumber: number;
  contentHash: string;
}

// ─── Query Result Types ──────────────────────────────────────

export interface CharacterNetwork {
  characters: Array<{
    name: string;
    role: string;
    connections: number;
  }>;
  relationships: Array<{
    from: string;
    to: string;
    type: RelationshipType;
    weight: number;
  }>;
}

export interface TimelineEvent {
  name: string;
  chapter: number;
  significance: string;
  participants: string[];
  location?: string;
  timelinePosition?: string;
}

export interface LocationMap {
  locations: Array<{
    name: string;
    type: string;
    childLocations: string[];
    characters: string[];
    events: string[];
  }>;
}

export interface PlotThreadSummary {
  threads: Array<{
    name: string;
    type: string;
    status: string;
    introducedChapter: number;
    resolvedChapter?: number;
    relatedCharacters: string[];
  }>;
}

export interface ConsistencyIssue {
  type: "character_undocumented" | "location_conflict" | "timeline_violation" | "dead_character_reappears" | "orphan_plot_thread" | "relationship_contradiction" | "attribute_conflict";
  severity: "critical" | "major" | "minor";
  description: string;
  entities: string[];
  chapters: number[];
}
