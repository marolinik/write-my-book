export { neo4jDriver, getSession, withSession, closeNeo4j, verifyNeo4jConnection } from "./neo4j-client";
export { initGraphSchema, clearBookGraph } from "./schema";
export { extractEntities, hashContent } from "./entity-extractor";
export { upsertEntities, removeChapterEntities } from "./graph-builder";
export {
  getCharacterNetwork,
  getTimeline,
  getLocationMap,
  getPlotThreads,
  getChapterEntities,
  runConsistencyChecks,
} from "./graph-queries";
export { updateFromChapter, updateFromStoryBible, getContentHash } from "./graph-maintenance";
export type {
  GraphNode,
  GraphNodeLabel,
  GraphNodeBase,
  CharacterNode,
  LocationNode,
  EventNode,
  ObjectNode,
  PlotThreadNode,
  ChapterNode,
  FactionNode,
  SceneNode,
  RelationshipType,
  GraphRelationship,
  ExtractedEntity,
  ExtractedRelationship,
  ExtractionResult,
  CharacterNetwork,
  TimelineEvent,
  LocationMap,
  PlotThreadSummary,
  ConsistencyIssue,
} from "./types";
