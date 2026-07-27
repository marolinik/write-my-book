// ─── Structured Voice Fingerprint ────────────────────────────

export interface StructuredFingerprint {
  sentenceLength: {
    mean: number;
    median: number;
    stdDev: number;
    distribution: "clustered" | "bimodal" | "varied";
  };
  vocabularyRichness: {
    typeTokenRatio: number;
    hapaxRate: number;
    register: "literary" | "conversational" | "academic" | "genre-specific";
  };
  dialogueRatio: number;
  paragraphLength: {
    mean: number;
    median: number;
    singleSentenceRate: number;
  };
  punctuation: {
    emDashFrequency: "heavy" | "moderate" | "light" | "none";
    semicolonUsage: "frequent" | "rare" | "absent";
    ellipsisFrequency: "heavy" | "moderate" | "light" | "none";
  };
  narrativeDistance: "intimate" | "close" | "moderate" | "distant" | "omniscient";
  metaphorDomains: string[];
  pov: string;
}

export interface CalibrationSample {
  passage: string;
  why: string;
  features: string[];
}

// ─── Agent Types ────────────────────────────────────────────

export type AgentType =
  | "writing-coach"
  | "ghostwriter"
  | "style-analyst"
  | "story-architect"
  | "scene-planner"
  | "dev-editor"
  | "line-editor"
  | "beta-reader"
  | "manuscript-analyst"
  | "continuity-checker"
  | "manuscript-reader"
  | "world-researcher"
  | "market-reader"
  | "publishing-editor";

export type ModelTier = "opus" | "sonnet" | "haiku";

export interface AgentContextProfile {
  fingerprint: "full" | "summary" | "none";
  storyBible: "full" | "chapter-relevant" | "characters-only" | "none";
  architecture: "full" | "chapter-only" | "act-level" | "none";
  chapterContent: boolean;                              // Auto-load target chapter content
  adjacentChapters: "none" | "summaries-all" | "one-each"; // Adjacent chapter loading
  chapterPlan: boolean;
  chapterBrief: boolean;
  findingHistory: boolean;                              // Load applied/dismissed/pending findings
  bookMeta: boolean;                                    // Load description, goals, author notes
  seriesContext: "full" | "summary" | "none";
}

export interface AgentDefinition {
  name: string;
  type: AgentType;
  description: string;
  writerDescription: string;
  defaultModel: ModelTier;
  allowedModels: ModelTier[];
  tools: string[];
  contextProfile: AgentContextProfile;
}

/** What the user is currently looking at in the UI. */
export interface PageContext {
  currentRoute: string;
  currentChapterNumber?: number;
  currentChapterId?: string;
  currentDocumentId?: string;
  currentDocumentType?: string;
  editorSelection?: string;
  findingsContext?: {
    totalPending: number;
    visibleSeverities: string[];
    selectedFindingId?: string;
  };
  activeTab?: string;
}

export interface AgentContext {
  bookId: string;
  bookName?: string;
  userId: string;
  chapterNumber?: number;
  chapterId?: string;
  fingerprint?: string;
  storyBible?: string;
  architecture?: string;
  chapterPlan?: string;
  chapterBrief?: string;
  language?: string;
  seriesId?: string;
  seriesBible?: string;
  seriesArchitecture?: string;
  bookDescription?: string;
  authorNotes?: string;
  bookGenre?: string;
  /** When the Writing Coach is conducting, identifies the target workflow. */
  targetWorkflowId?: string;
  /** The specialist agent type the Coach should delegate to. */
  targetAgentType?: AgentType;
  /** Optional initial message from the user (e.g., from floating input or context menu). */
  userMessage?: string;
  /** What the user is currently looking at in the UI. */
  pageContext?: PageContext;
}

export interface AgentStreamMessage {
  type:
    | "thinking"
    | "text"
    | "tool_use"
    | "tool_result"
    | "approval_request"
    | "error"
    | "complete"
    | "cost_update"
    | "status"
    | "budget_warning"
    | "delegation_start"
    | "delegation_progress"
    | "delegation_complete";
  content: string;
  metadata?: Record<string, unknown>;
}

/** Shared token counter across Coach + specialist sessions. */
export interface SharedCostTracker {
  totalInputTokens: number;
  totalOutputTokens: number;
  /**
   * Accumulated USD across Coach + specialists. Each orchestrator adds
   * estimateCost(its OWN registryId, turn tokens) so mixed-model sessions
   * (e.g. Sonnet conductor + Opus specialists) are priced correctly.
   */
  totalCostUsd: number;
}

/** Context passed to the DelegateToSpecialist tool executor. */
export interface DelegationContext {
  parentSessionId: string;
  parentOnMessage: (message: AgentStreamMessage) => void;
  sharedCostTracker: SharedCostTracker;
  language: string;
  /** Chapter number from the parent session — auto-inherited by specialists. */
  chapterNumber?: number;
  /** Factory to create an LLM client for any specialist agent type. */
  createSpecialistClient: (agentType: AgentType) => Promise<{
    client: import("@anthropic-ai/sdk").default;
    modelId: string;
    registryId: string;
  }>;
}

/** Result returned from a specialist delegation. */
export interface DelegationResult {
  success: boolean;
  agentType: AgentType;
  summary: string;
  inputTokens: number;
  outputTokens: number;
  documentIds: string[];
  findingsCreated: number;
}

export interface AgentResult {
  success: boolean;
  tokensInput: number;
  tokensOutput: number;
  documentIds: string[];
  sessionId: string;
  /**
   * Why the session ended. "budget"/"timeout" mean a graceful early end — NOT
   * a failure. "error" means a provider failure ended the loop (retry
   * exhaustion, non-retryable status, or an empty zero-work response) — the
   * session resolves success:false so it is persisted as FAILED, never as a
   * clean completion (D-36).
   */
  endReason?: "natural" | "budget" | "timeout" | "error";
  /** Final-turn summary of done/remaining work when the session ended early. */
  wrapUpSummary?: string;
  /**
   * The assistant's final reply text for this turn (text blocks only, joined).
   * Persisted as a ConversationTurn so continued sessions survive a server
   * restart with full context. Undefined when the turn produced no text.
   */
  assistantText?: string;
  /**
   * True when the session was aborted by user cancellation. onComplete
   * handlers must NOT mark the session "completed" (the cancel route owns
   * the "failed" status) but should still persist counted tokens/cost.
   */
  cancelled?: boolean;
}

export interface ApprovalResponse {
  decision: "approve" | "reject" | "modify";
  message?: string;
}

export interface AgentSpawnOptions {
  agentType: AgentType;
  model: ModelTier;
  context: AgentContext;
  workflowId: string;
  sessionId: string;
  onMessage: (message: AgentStreamMessage) => void;
  onComplete: (result: AgentResult) => void | Promise<void>;
  /**
   * `partial` carries any side effects that already landed before the error —
   * notably `documentIds` for documents written earlier in the turn — so
   * consumers aren't told zero documents changed when some did (F7).
   */
  onError: (
    error: Error,
    partial?: { documentIds: string[] }
  ) => void | Promise<void>;
}

export interface WorkflowPrerequisite {
  /** Document type or condition that must exist. */
  type: "document" | "chapter_content" | "chapter_status";
  /** For 'document': the DocumentType that must exist. For 'chapter_status': min status name. */
  value: string;
  /** Human-readable description of what's missing. */
  description: string;
  /** Workflow ID that can satisfy this prerequisite. */
  satisfiedBy?: string;
}

export interface WorkflowDefinition {
  id: string;
  label: string;
  description: string;
  writerDescription: string;
  primaryAgent: AgentType;
  category: "setup" | "writing" | "editing" | "analysis" | "series" | "style" | "research";
  requiresChapter: boolean;
  requiresSeriesContext: boolean;
  conversational: boolean;
  suggestedNext: string[];
  prerequisites?: WorkflowPrerequisite[];
  /**
   * D-188: the document this workflow PROMISES to produce. Declaring it makes
   * "success with no artifact" checkable (see artifact-contract.ts): the run
   * either persists the document — recovering it from its own transcript when
   * the model streamed it but never called WriteDocument — or is reported as a
   * failure. Also the single source of truth for series auto-synthesis.
   */
  producesDocument?: import("@/generated/prisma/enums").DocumentType;
  /** Estimated minimum duration in minutes. */
  estimatedMinMinutes?: number;
  /** Estimated maximum duration in minutes. */
  estimatedMaxMinutes?: number;
  /** Minimum model tier required for this workflow. Blocks underpowered models. */
  minimumTier?: ModelTier;
}
