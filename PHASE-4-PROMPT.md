Phase 4: Claude Agent SDK Integration — Writing Assistant Super-Agent

  Context

  All work happens in D:\Projects\Write-My-Book-OK\platform-new.

  Phase 1 (COMPLETE): Prisma schema (17 models), core lib (db, auth, encryption, cost, utils, validation, storage adapter), Docker, auth (middleware, login/signup,
  webhook), Book/Series/Chapter CRUD API routes, root layout with Clerk + React Query + 4 Google fonts.

  Phase 2 (COMPLETE): Document system (DocumentService, VersionManager, storage-keys), 8 document/version API routes, chapter content API route (GET/PUT with word
  count sync), TipTap manuscript editor with markdown mode + auto-save + focus mode, editor toolbar, status bar, version history panel with diff view, Zustand editor
  store, React Query hooks, shadcn/ui initialized (button, separator, dialog, scroll-area, tabs, dropdown-menu, tooltip, badge), globals.css with full shadcn CSS
  variables + TipTap styles.

  Phase 3 (COMPLETE): 3-panel layout with SidebarProvider + collapsible sidebar (nav links, active book chapter sub-nav, Clerk UserButton) + AppHeader with
  breadcrumbs + agent panel toggle. Dashboard page with stats + recent books grid. Books pages (list, new, detail with chapter table, settings with AI model selectors).
  Series pages (list, new, detail). New chapter form. Settings API route (GET/PATCH with upsert). React Query hooks for books, series, chapters, settings.
  All shadcn components: sheet, avatar, sidebar, input, textarea, card, popover, select, switch, label, skeleton.

  Key existing patterns:
  - Auth: requireUser() from @/lib/auth returns User with id, clerkId, email, displayName
  - DB: db from @/lib/db (Prisma 7, import types from @/generated/prisma/client or @/generated/prisma/enums)
  - API routes: NextRequest/NextResponse, type RouteParams = { params: Promise<{ id: string }> }, Zod parse, verify ownership, return JSON
  - Components: shadcn/ui in src/components/ui/, editor in src/components/editor/, layout in src/components/layout/
  - Fonts: --font-sans (Libre Franklin), --font-display (Cormorant Garamond), --font-mono (JetBrains Mono), --font-serif (Lora)
  - Layout: SidebarProvider + AppSidebar + SidebarInset with AppHeader, agent panel toggled via useState in (app)/layout.tsx
  - State: Zustand for editor (src/stores/editor-store.ts), React Query for server data
  - Documents: DocumentService (create/read/update/delete/findByType/list/getVersions/restoreVersion), VersionManager with line-based diff
  - Storage: S3Adapter for MinIO, storage keys via generateS3Prefix/generateSeriesS3Prefix
  - Cost: estimateCost(model, inputTokens, outputTokens) in src/lib/cost.ts — opus $15/$75, sonnet $3/$15, haiku $0.25/$1.25 per 1M tokens
  - Validation: startActionSchema, sendMessageSchema, updateSettingsSchema, updateFindingSchema already in src/lib/validation.ts
  - Agent placeholder: src/components/layout/agent-panel-placeholder.tsx (320px right panel, toggled from AppHeader)
  - DB models for agents: AgentSession (hierarchical), UsageRecord, BookSettings (model selections), EditFinding, DismissedPattern, EditAction
  - Reference platform at D:\Projects\Write-My-Book-OK\platform\ — read-only, has working agent system with Anthropic SDK (not Agent SDK)

  Reference platform architecture (platform/src/lib/agents/):
  - definitions.ts: 14 agent definitions with context profiles, model tiers, tool lists, prompt file paths
  - types.ts: AgentContext, AgentStreamMessage, AgentResult, ApprovalResponse interfaces
  - workflows.ts: 26 workflow definitions with categories (setup/writing/editing/analysis/export/series)
  - orchestrator/index.ts: AgentOrchestrator class with runAgent + runConversation + tool-use loop
  - session-manager.ts: In-memory session store with SSE listeners, message buffering, approval gates
  - prompt-assembler.ts: Loads agent .md prompts + reference .md files + filters project context by agent profile
  - tools/: Read, Write, Glob, Grep, RequestApproval, DispatchWorkflow tool definitions

  ---
  Goal

  Integrate the Claude Agent SDK (@anthropic-ai/claude-agent-sdk) to power a writing assistant that runs server-side and streams results to the agent panel UI.
  This phase builds: agent definitions, workflow system, orchestrator with SSE streaming, agent panel UI with message display + workflow selector, and session/cost tracking.

  ---
  Step 0: Install Dependencies

  npm install @anthropic-ai/sdk

  Note: We use the Anthropic SDK directly (not the Agent SDK) since the reference platform proves this architecture works and the Agent SDK is designed for CLI agents, not web streaming. The Anthropic SDK's messages.stream() method is ideal for our SSE-based architecture.

  ---
  Step 1: Agent Type Definitions + Workflows

  1a. Agent Types — src/lib/agents/types.ts

  Port from reference platform/src/lib/agents/types.ts adapted for platform-new's book-centric model:

  ```typescript
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
    | "continuity-checker";

  export type ModelTier = "opus" | "sonnet" | "haiku";

  export interface AgentContextProfile {
    fingerprint: "full" | "summary" | "none";
    storyBible: "full" | "chapter-relevant" | "characters-only" | "none";
    architecture: "full" | "chapter-only" | "act-level" | "none";
    chapterPlan: boolean;
    chapterBrief: boolean;
  }

  export interface AgentDefinition {
    name: string;
    type: AgentType;
    description: string;
    writerDescription: string;  // plain English for the UI
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
  }

  export interface AgentStreamMessage {
    type: "thinking" | "text" | "tool_use" | "tool_result" | "approval_request" | "error" | "complete";
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

  export interface WorkflowDefinition {
    id: string;
    label: string;
    description: string;
    writerDescription: string;
    primaryAgent: AgentType;
    category: "setup" | "writing" | "editing" | "analysis";
    requiresChapter: boolean;
    conversational: boolean;
    suggestedNext: string[];
  }
  ```

  1b. Agent Definitions — src/lib/agents/definitions.ts

  Define 10 agents (cut from 14 — drop manuscript-reader, world-researcher, publishing-editor, market-reader for Phase 4; they can be added later):

  - Writing Coach: sonnet, conversational, no context needed, guides writers through process
  - Ghostwriter: opus, writes prose in author's voice, needs fingerprint + architecture + chapter plan + brief
  - Style Analyst: opus, analyzes writing samples, creates FINGERPRINT document, no context needed
  - Story Architect: opus, designs act/chapter structure, needs story bible + architecture
  - Scene Planner: sonnet, creates beat sheets, needs architecture + chapter brief
  - Dev Editor: sonnet, 18 structural checks, needs story bible + architecture + chapter plan + brief
  - Line Editor: sonnet, 23 prose checks, needs fingerprint + chapter plan
  - Beta Reader: sonnet, 10-persona simulation, needs architecture + chapter plan
  - Manuscript Analyst: haiku, readability/pacing metrics, no context needed
  - Continuity Checker: sonnet, 6 tracking domains, needs story bible + architecture

  Include getAgentDefinition(type) and getModelId(tier) helpers (opus → claude-opus-4-6, sonnet → claude-sonnet-4-5-20250929, haiku → claude-haiku-4-5-20251001).

  1c. Workflow Definitions — src/lib/agents/workflows.ts

  Define 15 core workflows (cut from 26 — keep the essential pipeline):

  Setup: new-novel, capture-style, create-story-bible, build-architecture, coach
  Writing: discuss-chapter, plan-chapter, write-chapter, freewrite
  Editing: dev-edit, line-edit, beta-read, revise, discuss-edits
  Analysis: analyze

  Each workflow has: id, label, description, writerDescription, primaryAgent, category, requiresChapter, conversational, suggestedNext[].

  Include getWorkflow(id), getWorkflowsByCategory(category) helpers.

  ---
  Step 2: Session Manager

  src/lib/agents/session-manager.ts

  In-memory session store (same pattern as reference platform):

  - ActiveSession interface: sessionId, bookId, userId, agentType, workflowId, status, messages[], listeners (Set of callbacks), completionListeners, result, conversationHistory (Anthropic.MessageParam[])
  - createSession(sessionId, bookId, userId, agentType, workflowId) → ActiveSession
  - getSession(sessionId) → ActiveSession | undefined
  - deleteSession(sessionId)
  - pushMessage(sessionId, message) → broadcasts to all SSE listeners
  - completeSession(sessionId, result) → notifies completion listeners
  - addListener(sessionId, onMessage, onComplete) → returns unsubscribe function
  - cancelSession(sessionId) → aborts orchestrator, notifies listeners
  - addUserMessage(sessionId, content) → appends to conversationHistory
  - addAssistantMessage(sessionId, content) → appends to conversationHistory

  No Redis dependency — just Map<string, ActiveSession>.

  ---
  Step 3: Tool Definitions for Agents

  src/lib/agents/tools.ts

  Agents operate on documents via the DocumentService, not the file system. Define tools that map to our document/storage system:

  ```
  ReadDocument(bookId, documentType, chapterNumber?) → reads document content via DocumentService
  WriteDocument(bookId, documentType, content, title?, chapterNumber?) → creates/updates document
  ReadChapter(bookId, chapterNumber) → reads chapter markdown via chapter content API logic
  WriteChapter(bookId, chapterId, markdown) → writes chapter content via API logic
  ListDocuments(bookId, type?) → lists documents for the book
  CreateFinding(bookId, chapterNumber, data) → inserts EditFinding record
  RequestApproval(title, description) → pauses and waits for user response (approval gate)
  ```

  Each tool returns Anthropic SDK tool format: { name, description, input_schema }.

  getToolDefinitions(toolNames: string[]) → returns filtered tool list.
  executeTool(name, args, context) → executes the tool and returns string result.

  The context object carries bookId, userId, and a DocumentService instance.

  ---
  Step 4: Prompt Assembly

  src/lib/agents/prompt-assembler.ts

  Assembles system prompts for agents:

  1. Base agent instructions (hardcoded per agent type — we inline these rather than loading .md files, since we don't have the write-my-book directory in platform-new)
  2. Project context filtered by agent's contextProfile:
     - Loads documents from DB/storage (FINGERPRINT, STORY_BIBLE, ARCHITECTURE, CHAPTER_PLAN, CHAPTER_BRIEF)
     - Wraps in XML tags: <style_fingerprint>, <story_bible>, <story_architecture>, <chapter_plan>, <chapter_brief>
     - Filters based on profile (full/summary/none, chapter-relevant, characters-only, etc.)

  Each agent gets a concise base instruction (2-3 paragraphs describing its role, output format, and constraints) + filtered project context.

  assembleAgentPrompt(definition, context, documentService) → Promise<string>

  For Phase 4, agent instructions are brief functional descriptions. Detailed prompt .md files can be authored later.

  ---
  Step 5: Orchestrator

  src/lib/agents/orchestrator.ts

  The core tool-use loop using the Anthropic SDK:

  ```typescript
  class AgentOrchestrator {
    private client: Anthropic;
    private abortController: AbortController;
    private pendingApprovals: Map<string, (response) => void>;

    constructor(apiKey: string);

    async runAgent(options: AgentSpawnOptions): Promise<AgentResult>
    // For non-conversational workflows — single execution

    async continueConversation(options, userMessage: string): Promise<void>
    // For conversational workflows — multi-turn

    cancel(): void
    // Aborts in-flight API call + rejects pending approvals

    resolveApproval(approvalId: string, response: ApprovalResponse): boolean
    // Called from the approve API endpoint
  }
  ```

  runAgent flow:
  1. Load agent definition
  2. Assemble system prompt with project context
  3. Get tool definitions for this agent
  4. Build initial user message
  5. Loop up to 50 turns:
     a. Call client.messages.stream() with model, system, messages, tools
     b. Stream events → push text/tool_use messages via onMessage callback
     c. On end_turn → break
     d. On tool_use → execute each tool, collect results, append to messages, continue
     e. On RequestApproval → emit approval_request, wait for resolveApproval(), continue
  6. Record token usage
  7. Call onComplete with result

  The orchestrator needs the user's decrypted Anthropic API key. Get it from:
  1. User's ApiKey record (provider: "anthropic", decrypt with decryptApiKey from @/lib/encryption)
  2. Fall back to process.env.ANTHROPIC_API_KEY if no user key

  ---
  Step 6: API Routes

  6a. Start Session — POST /api/books/[id]/agent/route.ts

  ```
  Body: { workflowId: string, chapterNumber?: number, message?: string }
  ```

  - requireUser(), verify book ownership
  - Look up user's API key (ApiKey where provider === "anthropic", isDefault === true) or fall back to env
  - Create AgentSession record in DB
  - Create in-memory session via session-manager
  - Spawn orchestrator.runAgent() (fire and forget — don't await)
  - Return { sessionId } immediately

  6b. Stream — GET /api/books/[id]/agent/[sessionId]/stream/route.ts

  SSE endpoint:
  - Validate session exists and belongs to user
  - Replay buffered messages first
  - Register SSE listener
  - On each message: write `data: ${JSON.stringify(message)}\n\n`
  - On complete: write `data: ${JSON.stringify({ type: "complete", ... })}\n\n`, close stream
  - On client disconnect: unsubscribe listener

  Return Response with headers:
  ```
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  ```

  6c. Send Message — POST /api/books/[id]/agent/[sessionId]/message/route.ts

  For conversational workflows:
  ```
  Body: { message: string }
  ```
  - Validate session exists and is running
  - Add user message to conversation history
  - Continue the conversation via orchestrator

  6d. Approve — POST /api/books/[id]/agent/[sessionId]/approve/route.ts

  ```
  Body: { approvalId: string, decision: "approve" | "reject" | "modify", message?: string }
  ```
  - Resolve the pending approval gate in the orchestrator

  6e. Cancel — POST /api/books/[id]/agent/[sessionId]/cancel/route.ts

  - Cancel the session via session-manager
  - Update AgentSession record status to "failed"

  6f. Post-Session — when orchestrator completes:
  - Update AgentSession record: status, tokensInput, tokensOutput, completedAt
  - Create UsageRecord with cost estimate

  ---
  Step 7: Agent Store (Zustand)

  src/stores/agent-store.ts

  Client-side state for the agent panel:

  ```typescript
  interface AgentState {
    sessionId: string | null;
    workflowId: string | null;
    agentType: AgentType | null;
    bookId: string | null;
    isRunning: boolean;
    messages: AgentStreamMessage[];
    error: string | null;
    suggestedNext: string[];

    // Actions
    startSession: (sessionId: string, workflowId: string, agentType: AgentType, bookId: string) => void;
    addMessage: (message: AgentStreamMessage) => void;
    setComplete: (result: AgentResult) => void;
    setError: (error: string) => void;
    reset: () => void;
  }
  ```

  ---
  Step 8: SSE Hook

  src/hooks/use-agent-stream.ts

  Custom hook that connects to the SSE stream endpoint:

  ```typescript
  function useAgentStream(bookId: string, sessionId: string | null) {
    // When sessionId is set:
    // 1. Create EventSource to /api/books/${bookId}/agent/${sessionId}/stream
    // 2. Parse SSE events as AgentStreamMessage
    // 3. Push to agent store via addMessage
    // 4. On "complete" message: update store via setComplete
    // 5. On error: update store via setError
    // 6. On unmount: close EventSource
    // Returns: { isConnected }
  }
  ```

  ---
  Step 9: Agent Panel UI

  Replace the placeholder at src/components/layout/agent-panel-placeholder.tsx with the real panel.
  The new component lives at: src/components/agent/agent-panel.tsx

  9a. Agent Panel — src/components/agent/agent-panel.tsx

  Main container (320px width, right side):
  - Header: "Writing Agent" + agent type badge when running + close button
  - When idle: show WorkflowSelector
  - When running: show MessageStream + (for conversational) input field at bottom
  - When complete: show completion card with suggestedNext workflows

  9b. Workflow Selector — src/components/agent/workflow-selector.tsx

  - Groups workflows by category (Setup, Writing, Editing, Analysis)
  - Each workflow shows: label, writerDescription, icon
  - Chapter-requiring workflows show a chapter number selector
  - Click → calls POST /api/books/:id/agent to start session
  - Only visible when on a /books/[bookId]/* route (needs bookId from params)

  9c. Message Stream — src/components/agent/message-stream.tsx

  Renders the array of AgentStreamMessage:
  - type "text": rendered as markdown (prose) in a chat bubble
  - type "tool_use": collapsed card showing tool name + brief input summary
  - type "tool_result": collapsed card showing result summary
  - type "thinking": dimmed italic text (optional, may not be streamed)
  - type "approval_request": card with approve/reject/modify buttons + optional text input
  - type "error": red error card
  - type "complete": green completion card with token usage + cost estimate
  - Auto-scrolls to bottom on new messages
  - Use ScrollArea from shadcn

  9d. Conversation Input — src/components/agent/conversation-input.tsx

  For conversational workflows:
  - Text input + send button at bottom of panel
  - Sends POST /api/books/:id/agent/:sessionId/message
  - Disabled when not running or when waiting for approval

  9e. Update (app)/layout.tsx:
  - Replace AgentPanelPlaceholder with real AgentPanel
  - AgentPanel only shows when agentOpen === true AND user is on a book route

  ---
  Step 10: React Query Hooks for Agent

  src/hooks/use-agent.ts

  ```typescript
  useStartSession(bookId) — POST mutation to start agent session
  useSendMessage(bookId, sessionId) — POST mutation to send conversational message
  useApproveAction(bookId, sessionId) — POST mutation for approval gate
  useCancelSession(bookId, sessionId) — POST mutation to cancel
  ```

  ---
  New Files Summary (~20 files)
  ┌─────────────────────────────────────────────────────────┬──────────────────────────────────┐
  │                          File                           │            Purpose               │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/types.ts                                 │ Agent type definitions            │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/definitions.ts                           │ 10 agent definitions             │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/workflows.ts                             │ 15 workflow definitions           │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/session-manager.ts                       │ In-memory session store           │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/tools.ts                                 │ Agent tool definitions            │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/prompt-assembler.ts                      │ System prompt assembly            │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/orchestrator.ts                          │ Core tool-use loop               │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/lib/agents/index.ts                                 │ Barrel export                    │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/app/api/books/[id]/agent/route.ts                   │ Start session API                │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/app/api/books/[id]/agent/[sessionId]/stream/route.ts│ SSE stream endpoint              │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/app/api/books/[id]/agent/[sessionId]/message/route.ts│ Send message (conversational)   │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/app/api/books/[id]/agent/[sessionId]/approve/route.ts│ Approval gate resolution        │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/app/api/books/[id]/agent/[sessionId]/cancel/route.ts│ Cancel session                   │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/stores/agent-store.ts                               │ Zustand store (rename existing)  │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/hooks/use-agent-stream.ts                           │ SSE connection hook               │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/hooks/use-agent.ts                                  │ Agent React Query hooks           │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/components/agent/agent-panel.tsx                    │ Main agent panel                  │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/components/agent/workflow-selector.tsx               │ Workflow picker UI               │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/components/agent/message-stream.tsx                  │ Message display                  │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/components/agent/conversation-input.tsx              │ Chat input                       │
  ├─────────────────────────────────────────────────────────┼──────────────────────────────────┤
  │ src/app/(app)/layout.tsx                                │ Update to use real AgentPanel     │
  └─────────────────────────────────────────────────────────┴──────────────────────────────────┘

  Modified files:
  - src/app/(app)/layout.tsx — swap placeholder for real panel
  - src/stores/agent-store.ts — repurpose for agent state (currently editor-store.ts is separate, keep both)

  ---
  Implementation Order

  Build in this order to minimize unresolvable imports:

  1. types.ts (no deps)
  2. definitions.ts (depends on types)
  3. workflows.ts (depends on types)
  4. tools.ts (depends on types, uses db + DocumentService)
  5. prompt-assembler.ts (depends on types + definitions, uses DocumentService)
  6. session-manager.ts (depends on types)
  7. orchestrator.ts (depends on all above + @anthropic-ai/sdk)
  8. agent/index.ts (barrel)
  9. API routes (depend on orchestrator + session-manager)
  10. agent-store.ts (Zustand, client-side)
  11. use-agent.ts + use-agent-stream.ts (hooks)
  12. UI components (agent-panel, workflow-selector, message-stream, conversation-input)
  13. Update layout.tsx

  ---
  Verification

  1. Type check: npx tsc --noEmit passes
  2. Build: npm run build succeeds
  3. Agent panel: clicking the bot icon in the header shows the real agent panel with workflow selector
  4. Workflow categories: workflows grouped by setup/writing/editing/analysis
  5. Session start: clicking a workflow triggers POST /api/books/:id/agent, returns sessionId
  6. SSE stream: GET /api/books/:id/agent/:sessionId/stream connects and receives events
  7. Message display: text, tool_use, tool_result messages render correctly in the panel
  8. Conversational: for conversational workflows, chat input appears and sends messages
  9. Approval: approval_request renders buttons, clicking sends approve/reject
  10. Cancel: cancel button stops the running session
  11. Cost tracking: after session completes, UsageRecord exists in DB with cost estimate
  12. Token display: completion card shows tokens used + estimated cost

  ---
  Notes

  - For Phase 4, agent base prompts are brief inline instructions (2-3 paragraphs each). Full detailed .md prompt files will be authored in Phase 5.
  - The orchestrator uses the raw Anthropic SDK (not the Agent SDK) because we need SSE streaming to a web UI, not CLI interaction.
  - Tool execution happens server-side through our DocumentService, not filesystem access.
  - Users need an Anthropic API key configured (ApiKey model with provider "anthropic") or ANTHROPIC_API_KEY env var must be set.
  - The agent panel should gracefully handle the case where no API key is configured — show a message directing users to add one.
  - Don't over-engineer the UI — keep it functional. Fancy message formatting and animations can come later.
