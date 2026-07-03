import { db } from "@/lib/db";
import type { AgentStreamMessage, AgentResult } from "./types";
import type { AgentOrchestrator } from "./orchestrator";
import type Anthropic from "@anthropic-ai/sdk";

export interface ActiveSession {
  sessionId: string;
  bookId: string;
  userId: string;
  agentType: string;
  workflowId: string;
  orchestrator: AgentOrchestrator | null;
  /** Sub-orchestrators for specialist delegations (Coach → Specialist). */
  subOrchestrators: Map<string, AgentOrchestrator>;
  status: "running" | "completed" | "failed";
  messages: AgentStreamMessage[];
  conversationHistory: Anthropic.MessageParam[];
  listeners: Set<(message: AgentStreamMessage, index: number) => void>;
  completionListeners: Set<(result: AgentResult, suggestedNext: string[]) => void>;
  result: AgentResult | null;
  suggestedNext: string[];
}

/**
 * In-memory session store. Uses globalThis so sessions survive
 * Turbopack HMR module reloads during development.
 */
const globalForSessions = globalThis as unknown as {
  __agentSessions?: Map<string, ActiveSession>;
};
if (!globalForSessions.__agentSessions) {
  globalForSessions.__agentSessions = new Map();
}
const sessions = globalForSessions.__agentSessions;

export function createSession(
  sessionId: string,
  bookId: string,
  userId: string,
  agentType: string,
  workflowId: string
): ActiveSession {
  const session: ActiveSession = {
    sessionId,
    bookId,
    userId,
    agentType,
    workflowId,
    orchestrator: null,
    subOrchestrators: new Map(),
    status: "running",
    messages: [],
    conversationHistory: [],
    listeners: new Set(),
    completionListeners: new Set(),
    result: null,
    suggestedNext: [],
  };
  sessions.set(sessionId, session);
  return session;
}

export function getSession(sessionId: string): ActiveSession | undefined {
  return sessions.get(sessionId);
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}

/** Push a message to all connected SSE listeners and buffer it. */
export function pushMessage(
  sessionId: string,
  message: AgentStreamMessage
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.messages.push(message);
  const index = session.messages.length - 1;
  for (const listener of session.listeners) {
    listener(message, index);
  }
}

/** Mark session as complete and notify listeners. */
export function completeSession(
  sessionId: string,
  result: AgentResult,
  suggestedNext: string[] = []
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.status = result.success ? "completed" : "failed";
  session.result = result;
  session.suggestedNext = suggestedNext;
  for (const listener of session.completionListeners) {
    listener(result, suggestedNext);
  }
}

/** Register an SSE listener. Returns unsubscribe function. */
export function addListener(
  sessionId: string,
  onMessage: (message: AgentStreamMessage, index: number) => void,
  onComplete: (result: AgentResult, suggestedNext: string[]) => void
): (() => void) | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.listeners.add(onMessage);
  session.completionListeners.add(onComplete);
  return () => {
    session.listeners.delete(onMessage);
    session.completionListeners.delete(onComplete);
  };
}

/** Cancel a running session. */
export function cancelSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "running") return;

  session.status = "failed";

  if (session.orchestrator) {
    session.orchestrator.cancel();
  }

  const result: AgentResult = {
    success: false,
    tokensInput: 0,
    tokensOutput: 0,
    documentIds: [],
    sessionId,
  };
  session.result = result;
  for (const listener of session.completionListeners) {
    listener(result, []);
  }
}

/** Max ConversationTurn rows rehydrated into a continued session (bounds token cost). */
const MAX_REHYDRATED_TURNS = 40;

/**
 * Persist a user turn to the DB for cross-restart conversation continuity.
 *
 * Persistence-only: the in-memory `conversationHistory` is maintained by the
 * orchestrator via reference mutation (continueConversation/runToolLoop push
 * onto the same array), so this deliberately does NOT touch it — doing so would
 * double-append. `turnIndex` is derived from the current row count so it stays
 * unique+monotonic (satisfying @@unique([sessionId, turnIndex])) WITHOUT
 * depending on an in-memory session — the background worker has none. Turns
 * within a session are written strictly sequentially (user → assistant reply
 * seconds later), so the count read is race-free in practice; the unique
 * constraint plus this try/catch are the backstop. Fire-safe: a persistence
 * failure is logged and never propagates to the session.
 */
export async function addUserMessage(
  sessionId: string,
  content: string
): Promise<void> {
  try {
    const turnIndex = await db.conversationTurn.count({ where: { sessionId } });
    await db.conversationTurn.create({
      data: { sessionId, turnIndex, role: "user", content: JSON.stringify(content) },
    });
  } catch (e) {
    console.error("[SessionManager] Failed to persist user turn:", e);
  }
}

/**
 * Persist an assistant turn (final reply TEXT only) to the DB.
 *
 * Only the final text is stored — NOT the raw content blocks — so a rehydrated
 * history can never contain a tool_use block without its matching tool_result
 * (which the provider API rejects). See addUserMessage for the turnIndex /
 * fire-safe / persistence-only rationale.
 */
export async function addAssistantMessage(
  sessionId: string,
  text: string
): Promise<void> {
  try {
    const turnIndex = await db.conversationTurn.count({ where: { sessionId } });
    await db.conversationTurn.create({
      data: { sessionId, turnIndex, role: "assistant", content: JSON.stringify(text) },
    });
  } catch (e) {
    console.error("[SessionManager] Failed to persist assistant turn:", e);
  }
}

/**
 * Load conversation history from the DB for session reconstruction (used when
 * the in-memory session is lost, e.g. a server restart).
 *
 * Returns the LAST MAX_REHYDRATED_TURNS turns in chronological (createdAt) order,
 * trimmed so the result is a valid provider message list: it starts on a user
 * turn (a leading assistant turn — possible once the cap drops older rows — is
 * dropped) and ends on an assistant turn (a dangling user turn from an
 * interrupted session is dropped, so the caller appending the new user message
 * cannot produce two consecutive user turns).
 */
export async function loadConversationHistory(
  sessionId: string
): Promise<Anthropic.MessageParam[]> {
  // Newest-first under the cap, then reverse to chronological — this keeps the
  // most RECENT turns when the history exceeds MAX_REHYDRATED_TURNS.
  const rows = await db.conversationTurn.findMany({
    where: { sessionId },
    orderBy: [{ createdAt: "desc" }, { turnIndex: "desc" }],
    take: MAX_REHYDRATED_TURNS,
  });
  rows.reverse();

  const messages: Anthropic.MessageParam[] = rows.map((turn) => ({
    role: turn.role === "assistant" ? "assistant" : "user",
    content: JSON.parse(turn.content) as string | Anthropic.ContentBlockParam[],
  }));

  // Enforce valid user/assistant alternation for the provider API.
  while (messages.length > 0 && messages[0].role === "assistant") {
    messages.shift();
  }
  while (messages.length > 0 && messages[messages.length - 1].role === "user") {
    messages.pop();
  }

  return messages;
}

/** Clean up completed sessions with no listeners. */
export function cleanupSessions(): void {
  for (const [id, session] of sessions) {
    if (session.status !== "running" && session.listeners.size === 0) {
      sessions.delete(id);
    }
  }
}
