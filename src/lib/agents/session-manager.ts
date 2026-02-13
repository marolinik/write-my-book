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

/** Append a user message to the conversation history. */
export function addUserMessage(sessionId: string, content: string): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.conversationHistory.push({ role: "user", content });
}

/** Append an assistant message to the conversation history. */
export function addAssistantMessage(
  sessionId: string,
  content: Anthropic.ContentBlock[]
): void {
  const session = sessions.get(sessionId);
  if (!session) return;
  session.conversationHistory.push({ role: "assistant", content });
}

/** Clean up completed sessions with no listeners. */
export function cleanupSessions(): void {
  for (const [id, session] of sessions) {
    if (session.status !== "running" && session.listeners.size === 0) {
      sessions.delete(id);
    }
  }
}
