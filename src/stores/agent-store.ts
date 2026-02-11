import { create } from "zustand";
import type { AgentType, AgentStreamMessage, AgentResult } from "@/lib/agents/types";

interface AgentState {
  sessionId: string | null;
  workflowId: string | null;
  agentType: AgentType | null;
  bookId: string | null;
  seriesId: string | null;
  isRunning: boolean;
  messages: AgentStreamMessage[];
  error: string | null;
  suggestedNext: string[];

  startSession: (
    sessionId: string,
    workflowId: string,
    agentType: AgentType,
    bookId: string,
    seriesId?: string
  ) => void;
  addMessage: (message: AgentStreamMessage) => void;
  setComplete: (result: AgentResult, suggestedNext: string[]) => void;
  setError: (error: string) => void;
  reset: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  sessionId: null,
  workflowId: null,
  agentType: null,
  bookId: null,
  seriesId: null,
  isRunning: false,
  messages: [],
  error: null,
  suggestedNext: [],

  startSession: (sessionId, workflowId, agentType, bookId, seriesId) =>
    set({
      sessionId,
      workflowId,
      agentType,
      bookId,
      seriesId: seriesId ?? null,
      isRunning: true,
      messages: [],
      error: null,
      suggestedNext: [],
    }),

  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setComplete: (_result, suggestedNext) =>
    set({ isRunning: false, suggestedNext }),

  setError: (error) => set({ isRunning: false, error }),

  reset: () =>
    set({
      sessionId: null,
      workflowId: null,
      agentType: null,
      bookId: null,
      seriesId: null,
      isRunning: false,
      messages: [],
      error: null,
      suggestedNext: [],
    }),
}));
