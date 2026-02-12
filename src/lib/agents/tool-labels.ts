/**
 * Human-readable tool descriptions for the agent message stream.
 * Maps raw tool names + inputs to friendly labels for the UI.
 */

interface ToolInput {
  documentType?: string;
  chapterNumber?: number;
  [key: string]: unknown;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  STORY_BIBLE: "Story Bible",
  ARCHITECTURE: "Architecture",
  FINGERPRINT: "Style Fingerprint",
  CHAPTER_CONTENT: "Chapter Content",
  CHAPTER_PLAN: "Chapter Plan",
  CHAPTER_BRIEF: "Chapter Brief",
  DEV_EDIT_REPORT: "Dev Edit Report",
  LINE_EDIT_REPORT: "Line Edit Report",
  BETA_READ_REPORT: "Beta Read Report",
  CONTINUITY_REPORT: "Continuity Report",
  ANALYSIS_REPORT: "Analysis Report",
  MARKET_REPORT: "Market Report",
  EXPORT_CONFIG: "Export Config",
  FREEWRITE: "Freewrite",
  SERIES_BIBLE: "Series Bible",
  SERIES_ARCHITECTURE: "Series Architecture",
  SERIES_CONTINUITY: "Series Continuity",
  SERIES_FINGERPRINT: "Series Fingerprint",
  KNOWLEDGE_LEDGER: "Knowledge Ledger",
};

function docLabel(type?: string): string {
  if (!type) return "document";
  return DOC_TYPE_LABELS[type] ?? type.replace(/_/g, " ").toLowerCase();
}

function chLabel(num?: number): string {
  return num ? `Chapter ${num}` : "chapter";
}

type ToolLabelFn = (input: ToolInput) => string;

const TOOL_LABELS: Record<string, ToolLabelFn> = {
  ReadDocument: (input) => `Reading ${docLabel(input.documentType)}...`,
  WriteDocument: (input) => `Writing ${docLabel(input.documentType)}...`,
  ReadChapter: (input) => `Reading ${chLabel(input.chapterNumber)}...`,
  WriteChapter: (input) => `Writing ${chLabel(input.chapterNumber)}...`,
  ListDocuments: () => "Checking existing documents...",
  CreateFinding: (input) =>
    `Creating finding${input.chapterNumber ? ` for ${chLabel(input.chapterNumber)}` : ""}...`,
  RequestApproval: () => "Requesting your approval...",
  ReadSeriesDocument: (input) => `Reading ${docLabel(input.documentType)}...`,
  WriteSeriesDocument: (input) => `Writing ${docLabel(input.documentType)}...`,
};

/**
 * Get a human-readable label for a tool call.
 * Falls back to the raw tool name if no label is defined.
 */
export function getToolLabel(toolName: string, input?: ToolInput): string {
  const fn = TOOL_LABELS[toolName];
  if (fn && input) return fn(input);
  if (fn) return fn({});
  return toolName;
}

/**
 * Parse tool input from a message's content or metadata for interpolation.
 */
export function parseToolInput(message: {
  content: string;
  metadata?: Record<string, unknown>;
}): ToolInput | undefined {
  // First try metadata.toolInput
  if (message.metadata?.toolInput) {
    return message.metadata.toolInput as ToolInput;
  }
  // Try parsing content as JSON
  try {
    return JSON.parse(message.content) as ToolInput;
  } catch {
    return undefined;
  }
}
