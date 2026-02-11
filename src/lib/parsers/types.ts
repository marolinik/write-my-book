/**
 * Centralized types for all agent output parsers.
 */

// --- edit-parser types ---

export interface EditFindingParsed {
  severity: "critical" | "major" | "moderate" | "minor";
  category: string;
  description: string;
  suggestion: string | null;
  locationStart: string | null;
  locationEnd: string | null;
}

// --- beta-reader-parser types ---

export interface BetaPersona {
  name: string;
  archetype: string;
  score: number;
  vote: boolean;
  excerpt: string;
}

export interface EmotionCell {
  persona: string;
  beat: string;
  emotion: string;
  intensity: number;
}

export interface EngagementDataPoint {
  beat: string;
  investment: number;
  drift: number;
  confusion: number;
  putDownRisk: number;
  anticipation: number;
}

export interface RoundTableEntry {
  name: string;
  archetype: string;
  text: string;
}

export interface GateResult {
  result: "PASSED" | "FAILED" | "NEAR_MISS";
  consensus: number;
  convergence: number;
  scoreBand: string;
  totalVotes: number;
  passVotes: number;
}

export interface BetaReaderData {
  gate: GateResult;
  personas: BetaPersona[];
  emotions: EmotionCell[];
  engagement: EngagementDataPoint[];
  roundTable: RoundTableEntry[];
}

// --- analysis-parser types ---

export interface ReadabilityData {
  fleschKincaid: number;
  fleschReadingEase: number;
  gunningFog: number;
  colemanLiau: number;
  genreBenchmark: {
    fk: { min: number; max: number } | null;
    fre: { min: number; max: number } | null;
  };
}

export interface PacingDataPoint {
  chapter: string;
  tension: number;
  genreAvg: number | null;
}

export interface DialogueEntry {
  character: string;
  lineCount: number;
  avgLength: number;
  percentage: number;
}

export interface OveruseEntry {
  word: string;
  count: number;
  expected: number;
  ratio: number;
}

export interface AnalysisData {
  readability: ReadabilityData;
  pacing: PacingDataPoint[];
  dialogue: DialogueEntry[];
  overuse: OveruseEntry[];
}

// --- continuity-parser types ---

export interface TimelineEvent {
  chapter: number;
  event: string;
  character: string;
  status: "ok" | "warning" | "error";
}

export interface SubplotTrack {
  name: string;
  introduced: number;
  lastMentioned: number;
  status: "active" | "dormant" | "resolved";
}

export interface ChekhovGun {
  item: string;
  chapter: number;
  density: number;
  status: "unfired" | "fired";
}

export interface ContinuityData {
  timeline: TimelineEvent[];
  subplots: SubplotTrack[];
  chekhovGuns: ChekhovGun[];
  findingsCount: number;
}

// --- market-reader-parser types ---

export interface CulturalDimension {
  name: string;
  score: number;
}

export interface AdaptationSuggestion {
  text: string;
}

export interface MarketReport {
  marketId: string;
  marketName: string;
  overallScore: number;
  dimensions: CulturalDimension[];
  suggestions: AdaptationSuggestion[];
}

export interface MarketData {
  markets: MarketReport[];
}

// --- publishing-editor types ---

export interface PubEditorFinding {
  checkId: string;
  checkName: string;
  severity: "Warning" | "Info";
  category: string;
  chapter: string;
  location: string;
  issue: string;
  recommendation: string;
  disposition: string;
  dismissReason?: string;
}

export interface PubEditorStats {
  totalWordCount: number;
  chapterCount: number;
  avgChapterLength: number;
  estimatedPages: number;
  estimatedReadingTime: string;
}

export interface PubEditorAutoFix {
  category: string;
  changes: number;
  details: string;
}

export interface PubEditorData {
  checksRun: number;
  totalFindings: number;
  warningCount: number;
  infoCount: number;
  autoFixCount: number;
  findings: PubEditorFinding[];
  stats: PubEditorStats;
  autoFixes: PubEditorAutoFix[];
}

// --- series-continuity types ---

export interface SeriesContinuityFinding {
  severity: "critical" | "major" | "minor";
  bookNumber: number;
  chapterNumber: number | null;
  category: string;
  description: string;
}

export interface SeriesContinuityData {
  findings: SeriesContinuityFinding[];
  totalBooks: number;
  booksChecked: number;
}

// --- Unified output type ---

export type ParsedOutput =
  | { type: "edit"; data: EditFindingParsed[]; parseSuccess: true }
  | { type: "beta-read"; data: BetaReaderData; parseSuccess: true }
  | { type: "analysis"; data: AnalysisData; parseSuccess: true }
  | { type: "continuity"; data: ContinuityData; parseSuccess: true }
  | { type: "market"; data: MarketData; parseSuccess: true }
  | { type: "publishing-editor"; data: PubEditorData; parseSuccess: true }
  | { type: "series-continuity"; data: SeriesContinuityData; parseSuccess: true }
  | { type: string; data: null; parseSuccess: false; rawContent: string };
