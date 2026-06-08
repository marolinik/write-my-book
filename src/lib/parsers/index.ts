/**
 * Unified parser registry for agent output files.
 * Dispatches to action-specific parsers with try/catch fallbacks.
 * Returns typed results or null on parse failure (never throws).
 */

import { parseEditReport } from "./edit-parser";
import { parseBetaReaderReport } from "./beta-reader-parser";
import { parseAnalysisReport } from "./analysis-parser";
import { parseContinuityReport } from "./continuity-parser";
import { parseMarketReports } from "./market-reader-parser";
import { parsePublishingEditorReport } from "./publishing-editor";
import { parseSeriesContinuityReport } from "./series-continuity";
import type { ParsedOutput } from "./types";

/**
 * Parse agent output for a given action.
 * Returns typed data on success, or raw content with parseSuccess=false on failure.
 */
export function parseAgentOutput(
  action: string,
  content: string,
  extraFiles?: Map<string, string>
): ParsedOutput {
  try {
    switch (action) {
      case "dev-edit":
      case "line-edit": {
        const findings = parseEditReport(content);
        return { type: "edit", data: findings, parseSuccess: true };
      }

      case "beta-read": {
        const data = parseBetaReaderReport(content);
        return { type: "beta-read", data, parseSuccess: true };
      }

      case "analyze-manuscript": {
        const data = parseAnalysisReport(content);
        return { type: "analysis", data, parseSuccess: true };
      }

      case "continuity-check": {
        const timelineContent = extraFiles?.get("timeline") ?? null;
        const subplotsContent = extraFiles?.get("subplots") ?? null;
        const foreshadowingContent = extraFiles?.get("foreshadowing") ?? null;
        const data = parseContinuityReport(
          content,
          timelineContent,
          subplotsContent,
          foreshadowingContent
        );
        return { type: "continuity", data, parseSuccess: true };
      }

      case "market-read": {
        const files = extraFiles ?? new Map<string, string>();
        // If single content is passed, try to create a map from it
        if (files.size === 0 && content) {
          files.set("MARKET-READ-combined.md", content);
        }
        const data = parseMarketReports(files);
        return { type: "market", data, parseSuccess: true };
      }

      case "export": {
        const pubData = parsePublishingEditorReport(content);
        return { type: "publishing-editor", data: pubData, parseSuccess: true };
      }

      case "check-series-continuity": {
        const scData = parseSeriesContinuityReport(content);
        return { type: "series-continuity", data: scData, parseSuccess: true };
      }

      default:
        return { type: action, data: null, parseSuccess: false, rawContent: content };
    }
  } catch (error) {
    console.warn(
      `[Parser] Failed to parse output for action "${action}":`,
      error instanceof Error ? error.message : error
    );
    return { type: action, data: null, parseSuccess: false, rawContent: content };
  }
}

// Re-export individual parsers for direct use
export { parseEditReport } from "./edit-parser";
export { parseBetaReaderReport, extractNumericScore } from "./beta-reader-parser";
export { parseAnalysisReport } from "./analysis-parser";
export { parseContinuityReport } from "./continuity-parser";
export { parseMarketReports } from "./market-reader-parser";
export { parsePublishingEditorReport } from "./publishing-editor";
export { parseSeriesContinuityReport } from "./series-continuity";

// Re-export all types from centralized types file
export type {
  EditFindingParsed,
  BetaPersona,
  EmotionCell,
  EngagementDataPoint,
  RoundTableEntry,
  GateResult,
  BetaReaderData,
  ReadabilityData,
  PacingDataPoint,
  DialogueEntry,
  OveruseEntry,
  AnalysisData,
  TimelineEvent,
  SubplotTrack,
  ChekhovGun,
  ContinuityData,
  CulturalDimension,
  AdaptationSuggestion,
  MarketReport,
  MarketData,
  PubEditorFinding,
  PubEditorStats,
  PubEditorAutoFix,
  PubEditorData,
  SeriesContinuityFinding,
  SeriesContinuityData,
  ParsedOutput,
} from "./types";
