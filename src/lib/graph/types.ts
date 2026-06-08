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
  chapter: number;
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
  type: "character_undocumented" | "location_conflict" | "timeline_violation" | "dead_character_reappears" | "orphan_plot_thread" | "relationship_contradiction";
  severity: "critical" | "major" | "minor";
  description: string;
  entities: string[];
  chapters: number[];
}
