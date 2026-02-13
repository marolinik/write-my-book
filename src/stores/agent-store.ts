import { create } from "zustand";
import type { AgentType, AgentStreamMessage, AgentResult } from "@/lib/agents/types";

export interface SessionState {
  sessionId: string;
  workflowId: string;
  agentType: AgentType;
  bookId: string;
  seriesId?: string;
  status: "running" | "completed" | "failed";
  messages: AgentStreamMessage[];
  error: string | null;
  suggestedNext: string[];
}

interface AgentState {
  panelOpen: boolean;
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
  pendingWorkflowId: string | null;

  setPanelOpen: (open: boolean) => void;
  startSession: (
    sessionId: string,
    workflowId: string,
    agentType: AgentType,
    bookId: string,
    seriesId?: string
  ) => void;
  addMessage: (sessionId: string, message: AgentStreamMessage) => void;
  setSessionComplete: (
    sessionId: string,
    result: AgentResult,
    suggestedNext: string[]
  ) => void;
  setSessionRunning: (sessionId: string) => void;
  setSessionError: (sessionId: string, error: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  openWithWorkflow: (workflowId: string) => void;
  clearPendingWorkflow: () => void;
  removeSession: (sessionId: string) => void;
  reset: () => void;

  // Convenience getters (derived from active session)
  getActiveSession: () => SessionState | undefined;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  panelOpen: false,
  sessions: {},
  activeSessionId: null,
  pendingWorkflowId: null,

  setPanelOpen: (open) => set({ panelOpen: open }),

  startSession: (sessionId, workflowId, agentType, bookId, seriesId) =>
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: {
          sessionId,
          workflowId,
          agentType,
          bookId,
          seriesId,
          status: "running",
          messages: [],
          error: null,
          suggestedNext: [],
        },
      },
      activeSessionId: sessionId,
    })),

  addMessage: (sessionId, message) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const msgs = session.messages;
      const last = msgs[msgs.length - 1];

      // Merge consecutive non-user text deltas into a single message
      // to avoid O(n) array growth per SSE character delta
      if (
        message.type === "text" &&
        message.metadata?.role !== "user" &&
        last &&
        last.type === "text" &&
        last.metadata?.role !== "user"
      ) {
        const merged = [...msgs];
        merged[merged.length - 1] = {
          ...last,
          content: last.content + message.content,
        };
        return {
          sessions: {
            ...state.sessions,
            [sessionId]: { ...session, messages: merged },
          },
        };
      }

      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            messages: [...session.messages, message],
          },
        },
      };
    }),

  setSessionComplete: (sessionId, _result, suggestedNext) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            status: "completed",
            suggestedNext,
          },
        },
      };
    }),

  setSessionRunning: (sessionId) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            status: "running",
          },
        },
      };
    }),

  setSessionError: (sessionId, error) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            status: "failed",
            error,
          },
        },
      };
    }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  openWithWorkflow: (workflowId) =>
    set({ pendingWorkflowId: workflowId, panelOpen: true }),

  clearPendingWorkflow: () => set({ pendingWorkflowId: null }),

  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions;
      return {
        sessions: rest,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    }),

  reset: () =>
    set({
      sessions: {},
      activeSessionId: null,
      pendingWorkflowId: null,
    }),

  getActiveSession: () => {
    const state = get();
    if (!state.activeSessionId) return undefined;
    return state.sessions[state.activeSessionId];
  },
}));
