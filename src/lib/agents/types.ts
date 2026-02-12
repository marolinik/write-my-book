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
  chapterPlan: boolean;
  chapterBrief: boolean;
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

export interface AgentContext {
  bookId: string;
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
}

export interface AgentStreamMessage {
  type:
    | "thinking"
    | "text"
    | "tool_use"
    | "tool_result"
    | "approval_request"
    | "error"
    | "complete";
  content: string;
  metadata?: Record<string, unknown>;
}

export interface AgentResult {
  success: boolean;
  tokensInput: number;
  tokensOutput: number;
  documentIds: string[];
  sessionId: string;
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
  onComplete: (result: AgentResult) => void;
  onError: (error: Error) => void;
}

export interface WorkflowDefinition {
  id: string;
  label: string;
  description: string;
  writerDescription: string;
  primaryAgent: AgentType;
  category: "setup" | "writing" | "editing" | "analysis" | "series" | "style";
  requiresChapter: boolean;
  requiresSeriesContext: boolean;
  conversational: boolean;
  suggestedNext: string[];
}
