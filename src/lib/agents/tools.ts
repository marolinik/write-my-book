import { createHash } from "crypto";
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import {
  getCharacterNetwork,
  getTimeline,
  getLocationMap,
  getPlotThreads,
  getChapterEntities,
  runConsistencyChecks,
} from "@/lib/graph/graph-queries";
import { upsertEntities } from "@/lib/graph/graph-builder";
import type { GraphNodeLabel, ExtractionResult, RelationshipType } from "@/lib/graph/types";
import { searchMemory, formatSearchResults } from "@/lib/vector/retriever";
import { indexDocument } from "@/lib/vector/indexer";
import type { DocType } from "@/lib/vector/types";
import {
  getRelevantInsights,
  createInsight,
  resolveInsight,
} from "./blackboard";
import type { AgentType, AgentStreamMessage, DelegationResult, StructuredFingerprint, CalibrationSample } from "./types";
import { getAgentDefinition } from "./definitions";
import { assembleAgentPrompt } from "./prompt-assembler";
import { processPostSession } from "./post-session";
import { getSession } from "./session-manager";

export const APPROVAL_SENTINEL = "__APPROVAL_GATE__";

// ─── Finding Validation Helpers ─────────────────────────────────

function computeFindingHash(
  chapterNumber: number,
  category: string,
  description: string
): string {
  const canonical = [
    chapterNumber.toString(),
    category.toLowerCase().trim(),
    description.toLowerCase().trim().slice(0, 200),
  ].join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function fuzzyMatch(needle: string, haystack: string): number {
  // NFC-normalize both inputs to prevent false rejections from Unicode
  // normalization differences (critical for Serbian diacritics: č, ć, š, ž, đ)
  needle = needle.normalize("NFC");
  haystack = haystack.normalize("NFC");
  if (haystack.includes(needle)) return 1.0;
  const normNeedle = needle.replace(/\s+/g, " ").trim().toLowerCase();
  const normHaystack = haystack.replace(/\s+/g, " ").trim().toLowerCase();
  if (normHaystack.includes(normNeedle)) return 1.0;
  const needleLen = normNeedle.length;
  if (needleLen === 0) return 0;
  let bestSimilarity = 0;
  for (let i = 0; i <= normHaystack.length - needleLen; i++) {
    const window = normHaystack.slice(i, i + needleLen);
    let matches = 0;
    for (let j = 0; j < needleLen; j++) {
      if (window[j] === normNeedle[j]) matches++;
    }
    const sim = matches / needleLen;
    if (sim > bestSimilarity) bestSimilarity = sim;
    if (bestSimilarity >= 0.95) break;
  }
  return bestSimilarity;
}

interface ValidationInput {
  chapterNumber: number;
  anchorQuote: string;
  paragraphNumber: number;
  alternatives: Array<{ label: string; originalText: string; newText: string }>;
  crossReferences?: Array<{ chapterNumber: number; paragraphNumber: number; quote: string }>;
}

async function validateFinding(
  ctx: ToolContext,
  input: ValidationInput,
  chapterContent: string
): Promise<{ valid: boolean; reason?: string }> {
  const similarity = fuzzyMatch(input.anchorQuote, chapterContent);
  if (similarity < 0.8) {
    return {
      valid: false,
      reason: `REJECTED: Your anchorQuote was not found in the chapter text (similarity: ${(similarity * 100).toFixed(0)}%). Please re-read the chapter and provide an exact quote. The anchorQuote you provided: "${input.anchorQuote.slice(0, 80)}..."`,
    };
  }
  const paragraphs = chapterContent.split(/\n\n+/).filter(p => p.trim().length > 0);
  if (input.paragraphNumber < 1 || input.paragraphNumber > paragraphs.length) {
    return {
      valid: false,
      reason: `REJECTED: Paragraph ${input.paragraphNumber} does not exist. The chapter has ${paragraphs.length} paragraphs (1-indexed). Please re-count.`,
    };
  }
  const targetParagraph = paragraphs[input.paragraphNumber - 1];
  const paragraphMatch = fuzzyMatch(input.anchorQuote, targetParagraph);
  if (paragraphMatch < 0.5) {
    // The quote IS in the chapter (passed overall similarity check above) but
    // the LLM got the paragraph number wrong. This is common because LLMs count
    // paragraphs differently (ignoring headings, scene breaks, short lines).
    // Instead of rejecting, find the correct paragraph and auto-correct.
    let bestParagraph = -1;
    let bestScore = 0;
    for (let i = 0; i < paragraphs.length; i++) {
      const score = fuzzyMatch(input.anchorQuote, paragraphs[i]);
      if (score > bestScore) {
        bestScore = score;
        bestParagraph = i + 1; // 1-indexed
      }
      if (bestScore >= 0.95) break; // Good enough
    }
    if (bestScore >= 0.5) {
      // Auto-correct: mutate the input to use the correct paragraph number.
      // LLMs commonly miscount paragraphs (ignoring headings, scene breaks, etc.)
      // but the quote is genuinely in the chapter — accept it at the correct location.
      input.paragraphNumber = bestParagraph;
    } else {
      return {
        valid: false,
        reason: `REJECTED: Your anchorQuote was found in the chapter but could not be matched to any specific paragraph (best match: ${(bestScore * 100).toFixed(0)}%). Please verify the quote is an exact copy.`,
      };
    }
  }
  if (!input.alternatives || input.alternatives.length < 2) {
    return {
      valid: false,
      reason: `REJECTED: You must provide at least 2 rewrite alternatives. You provided ${input.alternatives?.length ?? 0}.`,
    };
  }
  return { valid: true };
}

function computeGroundingScore(
  anchorQuote: string,
  chapterContent: string,
  alternatives: Array<{ originalText: string }>
): number {
  const anchorSimilarity = fuzzyMatch(anchorQuote, chapterContent);
  const altScores = alternatives.map(alt => fuzzyMatch(alt.originalText, chapterContent));
  const avgAltSimilarity = altScores.reduce((sum, s) => sum + s, 0) / altScores.length;
  return (anchorSimilarity * 0.7) + (avgAltSimilarity * 0.3);
}

// ─── In-memory document locks for parallel agent safety ────────

const documentLocks = new Map<string, Map<string, string>>(); // bookId -> lockKey -> sessionId

function acquireDocLock(
  bookId: string,
  lockKey: string,
  sessionId: string
): boolean {
  const bookLocks = documentLocks.get(bookId) ?? new Map();
  if (bookLocks.has(lockKey) && bookLocks.get(lockKey) !== sessionId) {
    return false;
  }
  bookLocks.set(lockKey, sessionId);
  documentLocks.set(bookId, bookLocks);
  return true;
}

function releaseDocLock(
  bookId: string,
  lockKey: string,
  sessionId: string
): void {
  const bookLocks = documentLocks.get(bookId);
  if (bookLocks?.get(lockKey) === sessionId) {
    bookLocks.delete(lockKey);
  }
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface ToolContext {
  bookId: string;
  userId: string;
  sessionId: string;
  agentType: string;
  documentService: DocumentService;
  seriesId?: string;
  seriesDocumentService?: DocumentService;
  /** Chapter number scoped to this session — used as fallback for tools. */
  chapterNumber?: number;
  /** Delegation context — present only for the Writing Coach orchestrator. */
  delegationContext?: import("./types").DelegationContext;
}

// ─── Tool Definitions ──────────────────────────────────────────

const readDocumentDef: ToolDefinition = {
  name: "ReadDocument",
  description:
    "Read a document's content by type. Returns the full text of the document.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The document type to read",
        enum: Object.values(DocumentType),
      },
      chapterNumber: {
        type: "number",
        description: "Chapter number (required for chapter-scoped documents)",
      },
    },
    required: ["documentType"],
  },
};

const writeDocumentDef: ToolDefinition = {
  name: "WriteDocument",
  description:
    "Create or update a document. If a document of this type already exists, it will be updated with a new version.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The document type to write",
        enum: Object.values(DocumentType),
      },
      content: {
        type: "string",
        description: "The full content to write",
      },
      title: {
        type: "string",
        description: "Optional title for the document",
      },
      chapterNumber: {
        type: "number",
        description: "Chapter number (required for chapter-scoped documents)",
      },
    },
    required: ["documentType", "content"],
  },
};

const readChapterDef: ToolDefinition = {
  name: "ReadChapter",
  description: "Read the markdown content of a chapter by chapter number.",
  input_schema: {
    type: "object",
    properties: {
      chapterNumber: {
        type: "number",
        description: "The chapter number to read",
      },
    },
    required: ["chapterNumber"],
  },
};

const writeChapterDef: ToolDefinition = {
  name: "WriteChapter",
  description: "Write or update a chapter's markdown content.",
  input_schema: {
    type: "object",
    properties: {
      chapterNumber: {
        type: "number",
        description: "The chapter number to write",
      },
      markdown: {
        type: "string",
        description: "The full markdown content for the chapter",
      },
    },
    required: ["chapterNumber", "markdown"],
  },
};

const listDocumentsDef: ToolDefinition = {
  name: "ListDocuments",
  description:
    "List all documents for the current book, optionally filtered by type.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "Optional: filter by document type",
        enum: Object.values(DocumentType),
      },
    },
  },
};

const FINDING_CATEGORIES = [
  "pacing", "character", "dialogue", "continuity", "prose",
  "structure", "tension", "pov", "show-tell", "setting",
  "theme", "foreshadowing", "stakes", "emotion", "worldbuilding",
  "crutch-phrase", "filter-word", "ai-tell", "sentence-variety",
  "verb-strength", "redundancy", "clarity", "genre-convention"
] as const;

const createFindingDef: ToolDefinition = {
  name: "CreateFinding",
  description:
    "Create an editorial finding — one specific issue found during analysis. " +
    "Every finding MUST include an exact anchor quote from the chapter, a paragraph number, " +
    "a rationale explaining WHY this matters, and 2-3 ranked rewrite alternatives. " +
    "Findings with hallucinated quotes or invalid paragraph numbers will be REJECTED.",
  input_schema: {
    type: "object" as const,
    strict: true,
    properties: {
      chapterNumber: {
        type: "number",
        description: "Chapter number where the finding was identified",
      },
      severity: {
        type: "string",
        description: "Severity: critical (breaks the story), important (weakens the chapter), suggestion (could improve)",
        enum: ["critical", "important", "suggestion"],
      },
      category: {
        type: "string",
        description: "Domain category of the finding",
        enum: FINDING_CATEGORIES,
      },
      description: {
        type: "string",
        description: "What the issue is — one specific problem, not a list",
      },
      rationale: {
        type: "string",
        description: "WHY this matters to the reader/story — not just what it is",
      },
      confidence: {
        type: "number",
        description: "Your confidence this is a genuine issue (0.0 to 1.0)",
      },
      paragraphNumber: {
        type: "number",
        description: "1-based paragraph index where the issue occurs",
      },
      anchorQuote: {
        type: "string",
        description: "Exact text from the chapter that demonstrates the issue — copy verbatim",
      },
      alternatives: {
        type: "array",
        description: "2-3 ranked rewrite alternatives, best first",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "e.g. 'Option A — tighten pacing'" },
            originalText: { type: "string", description: "Exact text to replace (verbatim from chapter)" },
            newText: { type: "string", description: "Replacement text preserving the author's voice" },
          },
          required: ["label", "originalText", "newText"],
        },
        minItems: 2,
        maxItems: 3,
      },
      crossReferences: {
        type: "array",
        description: "For continuity findings: other passages that conflict with this one",
        items: {
          type: "object",
          properties: {
            chapterNumber: { type: "number" },
            paragraphNumber: { type: "number" },
            quote: { type: "string" },
          },
          required: ["chapterNumber", "paragraphNumber", "quote"],
        },
      },
    },
    required: [
      "chapterNumber", "severity", "category", "description",
      "rationale", "confidence", "paragraphNumber", "anchorQuote", "alternatives"
    ],
  },
};

const requestApprovalDef: ToolDefinition = {
  name: "RequestApproval",
  description:
    "Pause execution and ask the writer for approval before proceeding with a significant action.",
  input_schema: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "Short title for the approval request",
      },
      description: {
        type: "string",
        description: "Detailed description of what you want to do and why",
      },
    },
    required: ["title", "description"],
  },
};

const SERIES_DOC_TYPES = [
  "SERIES_BIBLE",
  "SERIES_ARCHITECTURE",
  "SERIES_CONTINUITY",
  "SERIES_FINGERPRINT",
  "KNOWLEDGE_LEDGER",
];

const readSeriesDocumentDef: ToolDefinition = {
  name: "ReadSeriesDocument",
  description:
    "Read a series-level document's content by type. Returns the full text of the series document.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The series document type to read",
        enum: SERIES_DOC_TYPES,
      },
    },
    required: ["documentType"],
  },
};

const writeSeriesDocumentDef: ToolDefinition = {
  name: "WriteSeriesDocument",
  description:
    "Create or update a series-level document. If a document of this type already exists, it will be updated with a new version.",
  input_schema: {
    type: "object",
    properties: {
      documentType: {
        type: "string",
        description: "The series document type to write",
        enum: SERIES_DOC_TYPES,
      },
      content: {
        type: "string",
        description: "The full content to write",
      },
      title: {
        type: "string",
        description: "Optional title for the document",
      },
    },
    required: ["documentType", "content"],
  },
};

// ─── Knowledge Graph Tools ──────────────────────────────────

const queryGraphDef: ToolDefinition = {
  name: "QueryGraph",
  description:
    "Query the book's knowledge graph for character relationships, timeline, location maps, plot threads, or consistency checks.",
  input_schema: {
    type: "object",
    properties: {
      queryType: {
        type: "string",
        description: "Type of graph query to run",
        enum: [
          "character-network",
          "timeline",
          "location-map",
          "plot-threads",
          "chapter-entities",
          "consistency-checks",
        ],
      },
      chapterNumber: {
        type: "number",
        description:
          "Chapter number (required for chapter-entities query)",
      },
    },
    required: ["queryType"],
  },
};

const updateGraphEntityDef: ToolDefinition = {
  name: "UpdateGraphEntity",
  description:
    "Create or update entities in the knowledge graph (characters, locations, events, objects, factions).",
  input_schema: {
    type: "object",
    properties: {
      entities: {
        type: "array",
        description: "Array of entities to upsert",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "Character",
                "Location",
                "Event",
                "Object",
                "PlotThread",
                "Faction",
              ],
            },
            name: { type: "string" },
            properties: {
              type: "object",
              description: "Entity-specific properties (role, description, etc.)",
            },
          },
          required: ["type", "name"],
        },
      },
      relationships: {
        type: "array",
        description: "Relationships between entities",
        items: {
          type: "object",
          properties: {
            from: { type: "string", description: "Source entity name" },
            to: { type: "string", description: "Target entity name" },
            type: { type: "string", description: "Relationship type (e.g. KNOWS, ALLIED_WITH)" },
            properties: { type: "object" },
          },
          required: ["from", "to", "type"],
        },
      },
      chapterNumber: {
        type: "number",
        description: "Chapter these entities appear in",
      },
    },
    required: ["entities"],
  },
};

// ─── Vector Memory Tools ────────────────────────────────────

const searchMemoryDef: ToolDefinition = {
  name: "SearchMemory",
  description:
    "Semantic search across the book's manuscript content. Returns relevant passages with similarity scores.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Natural language query to search for",
      },
      collection: {
        type: "string",
        description: "Which memory tier to search",
        enum: ["manuscript", "sessions"],
      },
      chapterNumber: {
        type: "number",
        description: "Optional: limit search to a specific chapter",
      },
      limit: {
        type: "number",
        description: "Number of results to return (default: 5)",
      },
    },
    required: ["query"],
  },
};

const rememberInsightDef: ToolDefinition = {
  name: "RememberInsight",
  description:
    "Store a session insight (decision rationale, style observation, key outcome) into episodic memory for future agents to recall.",
  input_schema: {
    type: "object",
    properties: {
      content: {
        type: "string",
        description: "The insight to remember",
      },
      category: {
        type: "string",
        description: "Category of the insight",
        enum: ["decision", "style", "outcome", "observation"],
      },
    },
    required: ["content", "category"],
  },
};

// ─── Blackboard Tools ───────────────────────────────────────

const postInsightDef: ToolDefinition = {
  name: "PostInsight",
  description:
    "Post an insight to the book's blackboard for other agents to see. Use for warnings about inconsistencies, suggestions, constraints, or flags.",
  input_schema: {
    type: "object",
    properties: {
      insightType: {
        type: "string",
        description: "Type of insight",
        enum: ["WARNING", "SUGGESTION", "FLAG", "CONSTRAINT"],
      },
      domain: {
        type: "string",
        description: "Domain the insight applies to",
        enum: [
          "character",
          "timeline",
          "pacing",
          "style",
          "continuity",
          "world-rules",
          "structure",
          "foreshadowing",
        ],
      },
      summary: {
        type: "string",
        description: "One-line summary of the insight",
      },
      detail: {
        type: "string",
        description: "Full detail text",
      },
      targetAgents: {
        type: "array",
        items: { type: "string" },
        description:
          "Which agent types should see this (empty = all agents)",
      },
      chapterScope: {
        type: "array",
        items: { type: "number" },
        description: "Which chapters this applies to (empty = all)",
      },
    },
    required: ["insightType", "domain", "summary", "detail"],
  },
};

const readInsightsDef: ToolDefinition = {
  name: "ReadInsights",
  description:
    "Read active insights from the book's blackboard relevant to your agent type and current chapter.",
  input_schema: {
    type: "object",
    properties: {
      chapterNumber: {
        type: "number",
        description: "Optional: filter insights for a specific chapter",
      },
    },
  },
};

const resolveInsightDef: ToolDefinition = {
  name: "ResolveInsight",
  description:
    "Mark a blackboard insight as resolved after you have addressed the issue it describes.",
  input_schema: {
    type: "object",
    properties: {
      insightId: {
        type: "string",
        description: "The ID of the insight to resolve",
      },
    },
    required: ["insightId"],
  },
};

// ─── Delegation Tool ────────────────────────────────────────

const SPECIALIST_AGENT_TYPES = [
  "ghostwriter",
  "style-analyst",
  "story-architect",
  "scene-planner",
  "dev-editor",
  "line-editor",
  "beta-reader",
  "manuscript-analyst",
  "continuity-checker",
  "manuscript-reader",
  "world-researcher",
  "market-reader",
  "publishing-editor",
] as const;

const delegateToSpecialistDef: ToolDefinition = {
  name: "DelegateToSpecialist",
  description:
    "Delegate a task to a specialist agent. The specialist runs in the background, performing its full workflow. " +
    "You receive a summary of the specialist's work when complete. Use this for editorial passes, analysis, writing, " +
    "and other specialist tasks. You MUST NOT delegate to yourself (writing-coach).",
  input_schema: {
    type: "object",
    properties: {
      agentType: {
        type: "string",
        description: "The specialist agent type to delegate to",
        enum: SPECIALIST_AGENT_TYPES as unknown as string[],
      },
      task: {
        type: "string",
        description: "Clear description of what the specialist should accomplish",
      },
      chapterNumber: {
        type: "number",
        description: "Chapter number for chapter-scoped work (optional)",
      },
      workflowId: {
        type: "string",
        description: "Workflow ID for post-session processing (e.g. 'dev-edit', 'line-edit'). Optional.",
      },
    },
    required: ["agentType", "task"],
  },
};

// ─── Voice Metrics Tool ─────────────────────────────────────

const setVoiceMetricsDef: ToolDefinition = {
  name: "SetVoiceMetrics",
  description:
    "Store structured voice metrics and calibration samples extracted from the writing analysis. " +
    "Call this ONCE after completing the style fingerprint document.",
  input_schema: {
    type: "object" as const,
    strict: true,
    properties: {
      sentenceLengthMean: { type: "number", description: "Mean sentence length in words" },
      sentenceLengthMedian: { type: "number", description: "Median sentence length in words" },
      sentenceLengthStdDev: { type: "number", description: "Standard deviation of sentence length" },
      sentenceLengthDistribution: {
        type: "string",
        description: "Shape of the sentence length distribution",
        enum: ["clustered", "bimodal", "varied"],
      },
      typeTokenRatio: { type: "number", description: "Vocabulary type-token ratio (0.0-1.0)" },
      hapaxRate: { type: "number", description: "Rate of words used only once (0.0-1.0)" },
      vocabularyRegister: {
        type: "string",
        description: "Vocabulary register",
        enum: ["literary", "conversational", "academic", "genre-specific"],
      },
      dialogueRatio: { type: "number", description: "Ratio of dialogue to total text (0.0-1.0)" },
      paragraphLengthMean: { type: "number", description: "Mean paragraph length in sentences" },
      paragraphLengthMedian: { type: "number", description: "Median paragraph length in sentences" },
      singleSentenceRate: { type: "number", description: "Rate of single-sentence paragraphs (0.0-1.0)" },
      emDashFrequency: {
        type: "string",
        description: "Em dash usage frequency",
        enum: ["heavy", "moderate", "light", "none"],
      },
      semicolonUsage: {
        type: "string",
        description: "Semicolon usage frequency",
        enum: ["frequent", "rare", "absent"],
      },
      ellipsisFrequency: {
        type: "string",
        description: "Ellipsis usage frequency",
        enum: ["heavy", "moderate", "light", "none"],
      },
      narrativeDistance: {
        type: "string",
        description: "Narrative distance / POV closeness",
        enum: ["intimate", "close", "moderate", "distant", "omniscient"],
      },
      pov: { type: "string", description: "Primary point of view (e.g. 'close third', 'first person')" },
      metaphorDomains: {
        type: "array",
        description: "Primary metaphor domains the author draws from (optional)",
        items: { type: "string" },
      },
      calibrationSamples: {
        type: "array",
        description: "3-5 sample passages demonstrating the author's voice with explanations",
        items: {
          type: "object",
          properties: {
            passage: { type: "string", description: "Exact passage from the text" },
            why: { type: "string", description: "Why this passage demonstrates the voice" },
            features: {
              type: "array",
              items: { type: "string" },
              description: "Specific voice features demonstrated",
            },
          },
          required: ["passage", "why", "features"],
        },
        minItems: 3,
        maxItems: 5,
      },
    },
    required: [
      "sentenceLengthMean", "sentenceLengthMedian", "sentenceLengthStdDev", "sentenceLengthDistribution",
      "typeTokenRatio", "hapaxRate", "vocabularyRegister",
      "dialogueRatio",
      "paragraphLengthMean", "paragraphLengthMedian", "singleSentenceRate",
      "emDashFrequency", "semicolonUsage", "ellipsisFrequency",
      "narrativeDistance", "pov", "calibrationSamples",
    ],
  },
};

const webSearchDef: ToolDefinition = {
  name: "WebSearch",
  description:
    "Search the web for factual information to support your writing research. " +
    "Use this for historical facts, real-world locations, cultural details, " +
    "genre market data, or any topic the writer needs researched. " +
    "Returns search results with titles, snippets, and URLs.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "The search query. Be specific and focused.",
      },
    },
    required: ["query"],
  },
};

const fetchWebPageDef: ToolDefinition = {
  name: "FetchWebPage",
  description:
    "Fetch the text content of a specific web page URL. " +
    "Use this after WebSearch to read full articles for detailed research. " +
    "Returns the page text (HTML stripped).",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The full URL to fetch.",
      },
    },
    required: ["url"],
  },
};

const ALL_TOOL_DEFINITIONS: ToolDefinition[] = [
  readDocumentDef,
  writeDocumentDef,
  readChapterDef,
  writeChapterDef,
  listDocumentsDef,
  createFindingDef,
  requestApprovalDef,
  readSeriesDocumentDef,
  writeSeriesDocumentDef,
  queryGraphDef,
  updateGraphEntityDef,
  searchMemoryDef,
  rememberInsightDef,
  postInsightDef,
  readInsightsDef,
  resolveInsightDef,
  delegateToSpecialistDef,
  setVoiceMetricsDef,
  webSearchDef,
  fetchWebPageDef,
];

/** Get tool definitions filtered by allowed tool names. */
export function getToolDefinitions(
  allowedTools: string[]
): ToolDefinition[] {
  return ALL_TOOL_DEFINITIONS.filter((t) => allowedTools.includes(t.name));
}

// ─── Retry Logic ───────────────────────────────────────────────

function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("econnrefused") ||
    msg.includes("epipe") ||
    msg.includes("connection") ||
    msg.includes("timed out") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("prisma") && msg.includes("connection")
  );
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  baseDelayMs: number = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isTransientError(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

// ─── Tool Executors ────────────────────────────────────────────

async function executeReadDocument(
  ctx: ToolContext,
  input: { documentType: string; chapterNumber?: number }
): Promise<string> {
  const type = input.documentType as DocumentType;
  const doc = await ctx.documentService.findByType(type, input.chapterNumber);
  if (!doc) {
    return `No ${input.documentType} document found${input.chapterNumber ? ` for chapter ${input.chapterNumber}` : ""}.`;
  }
  const result = await ctx.documentService.read(doc.id);
  if (!result) return "Document not found.";
  return result.content;
}

/** Chapter-scoped document types that need a chapterNumber */
const CHAPTER_SCOPED_DOC_TYPES = new Set([
  "CHAPTER_CONTENT",
  "CHAPTER_PLAN",
  "CHAPTER_BRIEF",
  "DEV_EDIT_REPORT",
  "LINE_EDIT_REPORT",
  "BETA_READ_REPORT",
]);

async function executeWriteDocument(
  ctx: ToolContext,
  input: {
    documentType: string;
    content: string;
    title?: string;
    chapterNumber?: number;
  }
): Promise<string> {
  const type = input.documentType as DocumentType;

  // For chapter-scoped doc types, fall back to session-level chapterNumber
  const resolvedChapterNumber = input.chapterNumber ?? (CHAPTER_SCOPED_DOC_TYPES.has(type) ? ctx.chapterNumber : undefined);

  // Acquire document lock to prevent parallel agents writing the same type
  const lockKey = `${type}:${resolvedChapterNumber ?? "null"}`;
  if (!acquireDocLock(ctx.bookId, lockKey, ctx.sessionId)) {
    return `Another agent is currently writing ${input.documentType}. Please wait and retry.`;
  }

  try {
    // Use transaction to prevent duplicate creation by parallel agents
    const result = await db.$transaction(async (tx) => {
      const where: Record<string, unknown> = { type };
      if (ctx.bookId) where.bookId = ctx.bookId;
      if (resolvedChapterNumber !== undefined)
        where.chapterNumber = resolvedChapterNumber;

      const existing = await tx.document.findFirst({ where });

      if (existing) {
        const updated = await ctx.documentService.update(
          existing.id,
          input.content,
          input.title,
          "agent_write",
          "agent"
        );
        return `Updated ${input.documentType} (version ${updated.version.version}).`;
      }

      const doc = await ctx.documentService.create(
        type,
        input.content,
        input.title,
        resolvedChapterNumber,
        undefined,
        "agent"
      );
      return `Created ${input.documentType} (id: ${doc.id}).`;
    });

    return result;
  } finally {
    releaseDocLock(ctx.bookId, lockKey, ctx.sessionId);
  }
}

async function executeReadChapter(
  ctx: ToolContext,
  input: { chapterNumber: number }
): Promise<string> {
  const doc = await ctx.documentService.findByType(
    DocumentType.CHAPTER_CONTENT,
    input.chapterNumber
  );
  if (!doc) {
    return `No content found for chapter ${input.chapterNumber}.`;
  }
  const result = await ctx.documentService.read(doc.id);
  if (!result) return "Chapter content not found.";
  return result.content;
}

async function executeWriteChapter(
  ctx: ToolContext,
  input: { chapterNumber: number; markdown: string }
): Promise<string> {
  // Find the chapter record
  const chapter = await db.chapter.findFirst({
    where: { bookId: ctx.bookId, chapterNumber: input.chapterNumber },
  });
  if (!chapter) {
    return `Chapter ${input.chapterNumber} not found in this book.`;
  }

  // Find or create the chapter content document
  const existing = await ctx.documentService.findByType(
    DocumentType.CHAPTER_CONTENT,
    input.chapterNumber
  );

  if (existing) {
    await ctx.documentService.update(
      existing.id,
      input.markdown,
      undefined,
      "agent_write",
      "agent"
    );
  } else {
    await ctx.documentService.create(
      DocumentType.CHAPTER_CONTENT,
      input.markdown,
      `Chapter ${input.chapterNumber}`,
      input.chapterNumber,
      chapter.actNumber,
      "agent"
    );
  }

  // Update word count on the chapter record
  const wordCount = input.markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_~`>|-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  await db.chapter.update({
    where: { id: chapter.id },
    data: { wordCount },
  });

  return `Wrote chapter ${input.chapterNumber} (${wordCount} words).`;
}

async function executeListDocuments(
  ctx: ToolContext,
  input: { documentType?: string }
): Promise<string> {
  const filter = input.documentType
    ? { type: input.documentType as DocumentType }
    : undefined;

  const docs = await ctx.documentService.list(filter);
  if (docs.length === 0) {
    return "No documents found.";
  }

  return docs
    .map(
      (d) =>
        `- ${d.type}${d.chapterNumber ? ` (ch ${d.chapterNumber})` : ""}: ${d.title ?? "(untitled)"} [v${d.currentVersion}]`
    )
    .join("\n");
}

async function executeCreateFinding(
  ctx: ToolContext,
  input: {
    chapterNumber: number;
    severity: string;
    category: string;
    description: string;
    rationale: string;
    confidence: number;
    paragraphNumber: number;
    anchorQuote: string;
    alternatives: Array<{ label: string; originalText: string; newText: string }>;
    crossReferences?: Array<{ chapterNumber: number; paragraphNumber: number; quote: string }>;
  }
): Promise<string> {
  // Resolve chapter number
  const chapterNumber = input.chapterNumber ?? ctx.chapterNumber;
  if (!chapterNumber) {
    return "Error: chapterNumber is required for CreateFinding but was not provided and no session-level chapter scope is set.";
  }

  // Get chapter content for validation
  const chapter = await db.chapter.findFirst({
    where: {
      bookId: ctx.bookId,
      chapterNumber,
    },
  });

  if (!chapter) {
    return `Error: Chapter ${chapterNumber} not found.`;
  }

  // Read chapter content from document service
  const manuscriptDoc = await ctx.documentService.findByType(
    DocumentType.CHAPTER_CONTENT,
    chapterNumber
  );

  if (!manuscriptDoc) {
    return `Error: No manuscript document found for chapter ${chapterNumber}.`;
  }

  const manuscriptContent = await ctx.documentService.read(manuscriptDoc.id);
  if (!manuscriptContent) {
    return `Error: Could not read manuscript for chapter ${chapterNumber}.`;
  }

  // Validate finding against chapter content
  // Use a mutable validation input so validateFinding can auto-correct paragraph number
  const validationInput: ValidationInput = {
    chapterNumber,
    anchorQuote: input.anchorQuote,
    paragraphNumber: input.paragraphNumber,
    alternatives: input.alternatives,
    crossReferences: input.crossReferences,
  };
  const validation = await validateFinding(
    ctx,
    validationInput,
    manuscriptContent.content
  );
  // Use the (possibly corrected) paragraph number for the rest of this function
  const resolvedParagraphNumber = validationInput.paragraphNumber;

  if (!validation.valid) {
    // Record rejection for analytics
    await db.editFinding.create({
      data: {
        bookId: ctx.bookId,
        chapterNumber,
        agentType: ctx.agentType,
        sessionId: ctx.sessionId,
        severity: input.severity,
        category: input.category,
        description: input.description,
        rationale: input.rationale,
        confidence: input.confidence,
        paragraphNumber: input.paragraphNumber,
        anchorQuote: input.anchorQuote,
        alternatives: JSON.stringify(input.alternatives),
        status: "rejected",
        rejectedAt: new Date(),
        rejectionReason: validation.reason,
      },
    });
    return validation.reason!;
  }

  // Compute content hash for deduplication
  const contentHash = computeFindingHash(
    chapterNumber,
    input.category,
    input.description
  );

  // Check for existing finding with same content hash
  const existing = await db.editFinding.findFirst({
    where: {
      bookId: ctx.bookId,
      chapterNumber,
      contentHash,
      status: { not: "rejected" },
    },
  });

  if (existing) {
    return `Finding already exists (id: ${existing.id}). Skipped duplicate based on content hash.`;
  }

  // Compute grounding score
  const groundingScore = computeGroundingScore(
    input.anchorQuote,
    manuscriptContent.content,
    input.alternatives
  );

  // Create the finding (use resolvedParagraphNumber which may have been auto-corrected)
  const finding = await db.editFinding.create({
    data: {
      bookId: ctx.bookId,
      chapterNumber,
      agentType: ctx.agentType,
      sessionId: ctx.sessionId,
      severity: input.severity,
      category: input.category,
      description: input.description,
      rationale: input.rationale,
      confidence: input.confidence,
      paragraphNumber: resolvedParagraphNumber,
      anchorQuote: input.anchorQuote,
      alternatives: JSON.stringify(input.alternatives),
      groundingScore,
      chapterVersion: manuscriptDoc.currentVersion,
      contentHash,
      // Legacy fields for backward compatibility
      suggestion: input.rationale,
      originalText: input.alternatives[0]?.originalText ?? null,
      newText: input.alternatives[0]?.newText ?? null,
    },
  });

  return `Finding created (id: ${finding.id}, severity: ${input.severity}, category: ${input.category}, grounding: ${(groundingScore * 100).toFixed(0)}%).`;
}

async function executeReadSeriesDocument(
  ctx: ToolContext,
  input: { documentType: string }
): Promise<string> {
  if (!ctx.seriesDocumentService) {
    return "Error: No series context available. This tool requires a series workflow.";
  }
  const type = input.documentType as DocumentType;
  const doc = await ctx.seriesDocumentService.findByType(type);
  if (!doc) {
    return `No ${input.documentType} document found for this series.`;
  }
  const result = await ctx.seriesDocumentService.read(doc.id);
  if (!result) return "Document not found.";
  return result.content;
}

async function executeWriteSeriesDocument(
  ctx: ToolContext,
  input: { documentType: string; content: string; title?: string }
): Promise<string> {
  if (!ctx.seriesDocumentService) {
    return "Error: No series context available. This tool requires a series workflow.";
  }
  const type = input.documentType as DocumentType;
  const existing = await ctx.seriesDocumentService.findByType(type);

  if (existing) {
    const result = await ctx.seriesDocumentService.update(
      existing.id,
      input.content,
      input.title,
      "agent_write",
      "agent"
    );
    return `Updated ${input.documentType} (version ${result.version.version}).`;
  }

  const doc = await ctx.seriesDocumentService.create(
    type,
    input.content,
    input.title,
    undefined,
    undefined,
    "agent"
  );
  return `Created ${input.documentType} (id: ${doc.id}).`;
}

// ─── Graph / Vector / Blackboard Executors ──────────────────

async function executeQueryGraph(
  ctx: ToolContext,
  input: { queryType: string; chapterNumber?: number }
): Promise<string> {
  try {
    switch (input.queryType) {
      case "character-network": {
        const data = await getCharacterNetwork(ctx.bookId);
        return JSON.stringify(data, null, 2);
      }
      case "timeline": {
        const data = await getTimeline(ctx.bookId);
        return JSON.stringify(data, null, 2);
      }
      case "location-map": {
        const data = await getLocationMap(ctx.bookId);
        return JSON.stringify(data, null, 2);
      }
      case "plot-threads": {
        const data = await getPlotThreads(ctx.bookId);
        return JSON.stringify(data, null, 2);
      }
      case "chapter-entities": {
        if (!input.chapterNumber) return "chapterNumber is required for chapter-entities query.";
        const data = await getChapterEntities(ctx.bookId, input.chapterNumber);
        return JSON.stringify(data, null, 2);
      }
      case "consistency-checks": {
        const data = await runConsistencyChecks(ctx.bookId);
        return JSON.stringify(data, null, 2);
      }
      default:
        return `Unknown query type: ${input.queryType}`;
    }
  } catch (error) {
    return `Graph query failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executeUpdateGraphEntity(
  ctx: ToolContext,
  input: {
    entities: Array<{ type: string; name: string; properties?: Record<string, unknown> }>;
    relationships?: Array<{ from: string; to: string; type: string; properties?: Record<string, unknown> }>;
    chapterNumber?: number;
  }
): Promise<string> {
  try {
    const extractionResult: ExtractionResult = {
      entities: input.entities.map((e) => ({
        name: e.name,
        label: e.type as GraphNodeLabel,
        properties: e.properties ?? {},
      })),
      relationships: (input.relationships ?? []).map((r) => ({
        from: r.from,
        fromLabel: "Character" as GraphNodeLabel,
        to: r.to,
        toLabel: "Character" as GraphNodeLabel,
        type: r.type as RelationshipType,
        properties: r.properties,
      })),
      chapterNumber: input.chapterNumber ?? 0,
      contentHash: "",
    };

    const stats = await upsertEntities(extractionResult);
    return `Graph updated: ${stats.nodesCreated} created, ${stats.nodesUpdated} updated, ${stats.relationshipsCreated} relationships.`;
  } catch (error) {
    return `Graph update failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executeSearchMemory(
  ctx: ToolContext,
  input: { query: string; collection?: string; chapterNumber?: number; limit?: number }
): Promise<string> {
  try {
    const limit = input.limit ?? 5;

    // Map old collection names to docType filter
    const docTypeMap: Record<string, DocType | undefined> = {
      manuscript: "chapter",
      sessions: "conversation",
      style: "style",
    };
    const docType = docTypeMap[input.collection ?? "manuscript"];

    const results = await searchMemory(ctx.bookId, input.query, {
      docType,
      chapterNumber: input.chapterNumber,
      limit,
    });

    if (results.length === 0) return "No relevant memories found.";

    return formatSearchResults(results);
  } catch (error) {
    return `Memory search failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executeRememberInsight(
  ctx: ToolContext,
  input: { content: string; category: string }
): Promise<string> {
  try {
    await indexDocument(
      ctx.bookId,
      "conversation",
      `${ctx.sessionId}:insight:${Date.now()}`,
      `[${input.category}] ${input.content}`,
      { userId: undefined }
    );
    return `Insight stored in episodic memory (category: ${input.category}).`;
  } catch (error) {
    return `Remember failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executePostInsight(
  ctx: ToolContext,
  input: {
    insightType: string;
    domain: string;
    summary: string;
    detail: string;
    targetAgents?: string[];
    chapterScope?: number[];
  }
): Promise<string> {
  const result = await createInsight({
    bookId: ctx.bookId,
    sourceSessionId: ctx.sessionId,
    sourceAgentType: ctx.agentType,
    insightType: input.insightType as "WARNING" | "SUGGESTION" | "FLAG" | "CONSTRAINT",
    domain: input.domain,
    summary: input.summary,
    detail: input.detail,
    targetAgents: input.targetAgents,
    chapterScope: input.chapterScope,
  });
  return `Insight posted to blackboard (id: ${result.id}, type: ${input.insightType}, domain: ${input.domain}).`;
}

async function executeReadInsights(
  ctx: ToolContext,
  input: { chapterNumber?: number }
): Promise<string> {
  const insights = await getRelevantInsights(
    ctx.bookId,
    ctx.agentType,
    input.chapterNumber
  );
  if (insights.length === 0) return "No active insights on the blackboard.";
  return insights
    .map(
      (i) =>
        `- [${i.insightType}] (${i.domain}) ${i.summary}\n  ${i.detail}\n  (id: ${i.id}, from: ${i.sourceAgentType})`
    )
    .join("\n\n");
}

async function executeResolveInsight(
  ctx: ToolContext,
  input: { insightId: string }
): Promise<string> {
  await resolveInsight(input.insightId, ctx.sessionId);
  return `Insight ${input.insightId} marked as resolved.`;
}

// ─── Web Search & Fetch Executors ────────────────────────────

async function executeWebSearch(
  _ctx: ToolContext,
  input: { query: string }
): Promise<string> {
  const query = input.query?.trim();
  if (!query) return "Error: search query is required.";

  // Try Serper API first (Google results, best quality)
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    try {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: {
          "X-API-KEY": serperKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ q: query, num: 8 }),
      });
      if (res.ok) {
        const data = await res.json();
        const parts: string[] = [];

        if (data.knowledgeGraph) {
          const kg = data.knowledgeGraph;
          parts.push(`## ${kg.title ?? ""}\n${kg.description ?? ""}`);
        }

        if (data.organic) {
          for (const item of data.organic.slice(0, 8)) {
            parts.push(
              `### ${item.title}\n${item.snippet}\nURL: ${item.link}`
            );
          }
        }

        if (parts.length > 0) return parts.join("\n\n");
      }
    } catch (e) {
      console.error("[WebSearch] Serper failed, falling back:", e);
    }
  }

  // Fallback: DuckDuckGo HTML (no API key needed)
  try {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WMBBot/1.0)",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return `Search request failed with status ${res.status}.`;
    }
    const html = await res.text();

    // Extract titles + URLs
    const titleRegex =
      /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRegex =
      /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    const titles: Array<{ title: string; url: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = titleRegex.exec(html)) !== null) {
      titles.push({
        url: m[1].replace(/&amp;/g, "&"),
        title: m[2].replace(/<[^>]+>/g, "").trim(),
      });
    }

    const snippets: string[] = [];
    while ((m = snippetRegex.exec(html)) !== null) {
      snippets.push(
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .trim()
      );
    }

    const results: string[] = [];
    for (let i = 0; i < Math.min(titles.length, 8); i++) {
      const t = titles[i];
      const s = snippets[i] ?? "";
      results.push(`### ${t.title}\n${s}${t.url ? `\nURL: ${t.url}` : ""}`);
    }

    if (results.length > 0) return results.join("\n\n");
    return "No results found for this query. Try rephrasing.";
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return "Search timed out. Try a simpler query.";
    }
    return `Search failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function executeFetchWebPage(
  _ctx: ToolContext,
  input: { url: string }
): Promise<string> {
  const url = input.url?.trim();
  if (!url) return "Error: URL is required.";

  try {
    new URL(url);
  } catch {
    return "Error: Invalid URL format.";
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; WMBBot/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return `Fetch failed with status ${res.status} ${res.statusText}.`;
    }

    const contentType = res.headers.get("content-type") ?? "";
    const text = await res.text();

    // Plain text — return directly
    if (contentType.includes("text/plain")) {
      return text.length > 50_000
        ? text.slice(0, 50_000) + "\n[TRUNCATED]"
        : text;
    }

    // Strip HTML to readable text
    let cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n\n")
      .replace(/<h[1-6][^>]*>/gi, "## ")
      .replace(/<li[^>]*>/gi, "- ")
      .replace(/<\/li>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+/g, " ")
      .trim();

    if (cleaned.length > 50_000) {
      cleaned = cleaned.slice(0, 50_000) + "\n[TRUNCATED]";
    }

    return cleaned || "Page had no readable text content.";
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return "Fetch timed out after 15 seconds.";
    }
    return `Fetch failed: ${e instanceof Error ? e.message : String(e)}`;
  }
}

// ─── Voice Metrics Executor ─────────────────────────────────

async function executeSetVoiceMetrics(
  ctx: ToolContext,
  input: Record<string, unknown>
): Promise<string> {
  // Compose the StructuredFingerprint object
  const metrics: StructuredFingerprint = {
    sentenceLength: {
      mean: input.sentenceLengthMean as number,
      median: input.sentenceLengthMedian as number,
      stdDev: input.sentenceLengthStdDev as number,
      distribution: input.sentenceLengthDistribution as StructuredFingerprint["sentenceLength"]["distribution"],
    },
    vocabularyRichness: {
      typeTokenRatio: input.typeTokenRatio as number,
      hapaxRate: input.hapaxRate as number,
      register: input.vocabularyRegister as StructuredFingerprint["vocabularyRichness"]["register"],
    },
    dialogueRatio: input.dialogueRatio as number,
    paragraphLength: {
      mean: input.paragraphLengthMean as number,
      median: input.paragraphLengthMedian as number,
      singleSentenceRate: input.singleSentenceRate as number,
    },
    punctuation: {
      emDashFrequency: input.emDashFrequency as StructuredFingerprint["punctuation"]["emDashFrequency"],
      semicolonUsage: input.semicolonUsage as StructuredFingerprint["punctuation"]["semicolonUsage"],
      ellipsisFrequency: input.ellipsisFrequency as StructuredFingerprint["punctuation"]["ellipsisFrequency"],
    },
    narrativeDistance: input.narrativeDistance as StructuredFingerprint["narrativeDistance"],
    metaphorDomains: (input.metaphorDomains as string[] | undefined) ?? [],
    pov: input.pov as string,
  };

  const calibrationSamples = input.calibrationSamples as CalibrationSample[];

  // Find or create StyleProfile — match the bridgeFingerprintToStyleProfile pattern
  const existing = await db.styleProfile.findFirst({
    where: { userId: ctx.userId, sourceBookId: ctx.bookId },
  });

  // Prisma Json fields accept plain values via JSON.parse(JSON.stringify(...))
  const metricsJson = JSON.parse(JSON.stringify(metrics));
  const samplesJson = JSON.parse(JSON.stringify(calibrationSamples));

  if (existing) {
    await db.styleProfile.update({
      where: { id: existing.id },
      data: {
        metrics: metricsJson,
        calibrationSamples: samplesJson,
      },
    });
  } else {
    // Create a new StyleProfile with metrics — the fingerprint text
    // will be filled by bridgeFingerprintToStyleProfile after the FINGERPRINT doc is written
    const book = await db.book.findUnique({
      where: { id: ctx.bookId },
      select: { name: true, bookNumber: true },
    });

    await db.styleProfile.create({
      data: {
        userId: ctx.userId,
        sourceBookId: ctx.bookId,
        sourceBookNumber: book?.bookNumber ?? 1,
        name: `Style — ${book?.name ?? "Book"}`,
        description: "Auto-generated from capture-style workflow",
        fingerprint: "", // Will be populated by bridgeFingerprintToStyleProfile
        metrics: metricsJson,
        calibrationSamples: samplesJson,
      },
    });
  }

  return `Voice metrics stored: ${Object.keys(metrics).length} metric groups, ${calibrationSamples.length} calibration samples.`;
}

// ─── Delegation Executor ────────────────────────────────────

async function executeDelegateToSpecialist(
  ctx: ToolContext,
  input: {
    agentType: string;
    task: string;
    chapterNumber?: number;
    workflowId?: string;
  }
): Promise<string> {
  const delegationCtx = ctx.delegationContext;
  if (!delegationCtx) {
    return "Error: DelegateToSpecialist is only available to the Writing Coach conductor.";
  }

  const specialistType = input.agentType as AgentType;
  const specialistDef = getAgentDefinition(specialistType);
  if (!specialistDef) {
    return `Error: Unknown specialist agent type: ${input.agentType}`;
  }

  // Auto-inherit chapterNumber: prefer explicit input, fall back to parent session's scope
  const resolvedChapterNumber = input.chapterNumber ?? delegationCtx.chapterNumber;

  // Emit delegation_start to the parent SSE stream
  delegationCtx.parentOnMessage({
    type: "delegation_start",
    content: `Delegating to ${specialistDef.name}...`,
    metadata: {
      agentType: specialistType,
      agentName: specialistDef.name,
      task: input.task,
      chapterNumber: resolvedChapterNumber,
    },
  });

  try {
    // Resolve specialist LLM client
    const { client, modelId, registryId } = await delegationCtx.createSpecialistClient(specialistType);

    // Import AgentOrchestrator dynamically to avoid circular dependency
    const { AgentOrchestrator } = await import("./orchestrator");

    // Build specialist orchestrator with shared cost tracker
    const specialistOrchestrator = new AgentOrchestrator({
      client,
      modelId,
      registryId,
      maxRuntimeMs: 20 * 60 * 1000, // 20 min for specialists
      maxSessionCostUsd: 5, // per-specialist budget
      sharedCostTracker: delegationCtx.sharedCostTracker,
    });

    // Register sub-orchestrator in parent session for approval forwarding
    const parentSession = getSession(delegationCtx.parentSessionId);
    const delegationId = crypto.randomUUID();
    if (parentSession) {
      parentSession.subOrchestrators.set(delegationId, specialistOrchestrator);
    }

    // Track specialist results
    let specialistSuccess = false;
    let specialistInputTokens = 0;
    let specialistOutputTokens = 0;
    const specialistDocumentIds: string[] = [];
    let findingsCount = 0;
    const textChunks: string[] = [];

    // Specialist tool list — EXCLUDE DelegateToSpecialist to prevent recursion
    const specialistTools = specialistDef.tools.filter((t) => t !== "DelegateToSpecialist");

    const docService = new DocumentService(ctx.userId, ctx.bookId);

    const spawnOptions = {
      agentType: specialistType,
      model: specialistDef.defaultModel,
      context: {
        bookId: ctx.bookId,
        bookName: undefined as string | undefined,
        userId: ctx.userId,
        chapterNumber: resolvedChapterNumber,
        language: delegationCtx.language,
        seriesId: ctx.seriesId,
      },
      workflowId: input.workflowId ?? specialistType,
      sessionId: `${delegationCtx.parentSessionId}-delegate-${delegationId}`,
      onMessage: (message: AgentStreamMessage) => {
        // Forward to parent as delegation_progress
        delegationCtx.parentOnMessage({
          type: "delegation_progress",
          content: message.content,
          metadata: {
            ...message.metadata,
            delegationId,
            agentType: specialistType,
            agentName: specialistDef.name,
            originalType: message.type,
          },
        });

        // Collect text for summary
        if (message.type === "text") {
          textChunks.push(message.content);
        }
        // Count findings
        if (message.type === "tool_result" && message.metadata?.tool === "CreateFinding") {
          findingsCount++;
        }
      },
      onComplete: (result: import("./types").AgentResult) => {
        specialistSuccess = result.success;
        specialistInputTokens = result.tokensInput;
        specialistOutputTokens = result.tokensOutput;
        specialistDocumentIds.push(...result.documentIds);
      },
      onError: (_error: Error) => {
        specialistSuccess = false;
      },
    } as const;

    await specialistOrchestrator.runAgent(spawnOptions);

    // Clean up sub-orchestrator registration
    if (parentSession) {
      parentSession.subOrchestrators.delete(delegationId);
    }

    // Run post-session processing for the specialist's workflow
    if (input.workflowId) {
      try {
        await processPostSession({
          sessionId: spawnOptions.sessionId,
          bookId: ctx.bookId,
          userId: ctx.userId,
          workflowId: input.workflowId,
          agentType: specialistType,
          chapterNumber: resolvedChapterNumber,
        });
      } catch (e) {
        console.error(`[Delegation] Post-session error for ${specialistType}:`, e);
      }
    }

    // Emit delegation_complete
    delegationCtx.parentOnMessage({
      type: "delegation_complete",
      content: `${specialistDef.name} ${specialistSuccess ? "completed" : "failed"}.`,
      metadata: {
        delegationId,
        agentType: specialistType,
        agentName: specialistDef.name,
        success: specialistSuccess,
        inputTokens: specialistInputTokens,
        outputTokens: specialistOutputTokens,
        findingsCreated: findingsCount,
      },
    });

    // Build summary for the Coach (truncated to 10KB)
    const fullText = textChunks.join("");
    const truncatedSummary = fullText.length > 10000
      ? fullText.slice(0, 10000) + "\n... (truncated)"
      : fullText;

    const resultSummary = [
      `## ${specialistDef.name} Delegation Result`,
      `Status: ${specialistSuccess ? "SUCCESS" : "FAILED"}`,
      `Tokens: ${specialistInputTokens} input, ${specialistOutputTokens} output`,
      findingsCount > 0 ? `Findings created: ${findingsCount}` : "",
      specialistDocumentIds.length > 0 ? `Documents updated: ${specialistDocumentIds.length}` : "",
      `\n### Specialist Output:\n${truncatedSummary || "(no text output)"}`,
    ].filter(Boolean).join("\n");

    return resultSummary;
  } catch (error) {
    // Clean up on failure
    delegationCtx.parentOnMessage({
      type: "delegation_complete",
      content: `${specialistDef.name} failed: ${error instanceof Error ? error.message : String(error)}`,
      metadata: {
        delegationId: "unknown",
        agentType: specialistType,
        agentName: specialistDef.name,
        success: false,
      },
    });

    return `Delegation to ${specialistDef.name} failed: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Execute a tool by name. Returns APPROVAL_SENTINEL for approval gates. */
export async function executeTool(
  toolName: string,
  ctx: ToolContext,
  input: Record<string, unknown>
): Promise<string> {
  // RequestApproval is not retriable — return immediately
  if (toolName === "RequestApproval") return APPROVAL_SENTINEL;

  // SetVoiceMetrics — single upsert, wrap in retry
  if (toolName === "SetVoiceMetrics") {
    return withRetry(() => executeSetVoiceMetrics(ctx, input));
  }

  // DelegateToSpecialist is not retriable — it runs a full sub-session
  if (toolName === "DelegateToSpecialist") {
    return executeDelegateToSpecialist(ctx, input as {
      agentType: string;
      task: string;
      chapterNumber?: number;
      workflowId?: string;
    });
  }

  try {
    return await withRetry(() => executeToolInner(toolName, ctx, input));
  } catch (error) {
    return `Error executing ${toolName}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

async function executeToolInner(
  toolName: string,
  ctx: ToolContext,
  input: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "ReadDocument":
      return executeReadDocument(
        ctx,
        input as { documentType: string; chapterNumber?: number }
      );
    case "WriteDocument":
      return executeWriteDocument(
        ctx,
        input as {
          documentType: string;
          content: string;
          title?: string;
          chapterNumber?: number;
        }
      );
    case "ReadChapter":
      return executeReadChapter(
        ctx,
        input as { chapterNumber: number }
      );
    case "WriteChapter":
      return executeWriteChapter(
        ctx,
        input as { chapterNumber: number; markdown: string }
      );
    case "ListDocuments":
      return executeListDocuments(
        ctx,
        input as { documentType?: string }
      );
    case "CreateFinding":
      return executeCreateFinding(
        ctx,
        input as {
          chapterNumber: number;
          severity: string;
          category: string;
          description: string;
          rationale: string;
          confidence: number;
          paragraphNumber: number;
          anchorQuote: string;
          alternatives: Array<{ label: string; originalText: string; newText: string }>;
          crossReferences?: Array<{ chapterNumber: number; paragraphNumber: number; quote: string }>;
        }
      );
    case "ReadSeriesDocument":
      return executeReadSeriesDocument(
        ctx,
        input as { documentType: string }
      );
    case "WriteSeriesDocument":
      return executeWriteSeriesDocument(
        ctx,
        input as { documentType: string; content: string; title?: string }
      );
    case "QueryGraph":
      return executeQueryGraph(
        ctx,
        input as { queryType: string; chapterNumber?: number }
      );
    case "UpdateGraphEntity":
      return executeUpdateGraphEntity(
        ctx,
        input as {
          entities: Array<{ type: string; name: string; properties?: Record<string, unknown> }>;
          relationships?: Array<{ from: string; to: string; type: string; properties?: Record<string, unknown> }>;
          chapterNumber?: number;
        }
      );
    case "SearchMemory":
      return executeSearchMemory(
        ctx,
        input as { query: string; collection?: string; chapterNumber?: number; limit?: number }
      );
    case "RememberInsight":
      return executeRememberInsight(
        ctx,
        input as { content: string; category: string }
      );
    case "PostInsight":
      return executePostInsight(
        ctx,
        input as {
          insightType: string;
          domain: string;
          summary: string;
          detail: string;
          targetAgents?: string[];
          chapterScope?: number[];
        }
      );
    case "ReadInsights":
      return executeReadInsights(
        ctx,
        input as { chapterNumber?: number }
      );
    case "ResolveInsight":
      return executeResolveInsight(
        ctx,
        input as { insightId: string }
      );
    case "WebSearch":
      return executeWebSearch(
        ctx,
        input as { query: string }
      );
    case "FetchWebPage":
      return executeFetchWebPage(
        ctx,
        input as { url: string }
      );
    default:
      return `Error: Unknown tool: ${toolName}`;
  }
}
