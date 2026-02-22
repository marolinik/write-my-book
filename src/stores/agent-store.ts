import { create } from "zustand";
import type { AgentType, AgentStreamMessage, AgentResult, PageContext } from "@/lib/agents/types";

export interface SessionResultMeta {
  findingsCreated: number;
  statusAdvanced: boolean;
  newStatus?: string;
  betaGateResult?: string; // "passed" | "failed" | "near_miss"
}

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
  resultMeta?: SessionResultMeta;
}

export type PanelMode = "hidden" | "bubble" | "mini" | "overlay" | "panel";

interface AgentState {
  panelMode: PanelMode;
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
  pendingWorkflowId: string | null;
  pendingMessage: { bookId: string; message: string } | null;
  unreadCount: number;
  workflowQueue: Array<{ workflowId: string; chapterNumber?: number }>;
  pageContext: PageContext | null;

  setPageContext: (ctx: PageContext) => void;
  setPanelMode: (mode: PanelMode) => void;
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
    suggestedNext: string[],
    resultMeta?: SessionResultMeta
  ) => void;
  setSessionRunning: (sessionId: string) => void;
  setSessionError: (sessionId: string, error: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  openWithWorkflow: (workflowId: string) => void;
  openWithMessage: (bookId: string, message: string) => void;
  clearPendingWorkflow: () => void;
  clearPendingMessage: () => void;
  incrementUnread: () => void;
  clearUnread: () => void;
  addToQueue: (workflowId: string, chapterNumber?: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  popQueue: () => { workflowId: string; chapterNumber?: number } | undefined;
  removeSession: (sessionId: string) => void;
  reset: () => void;

  // Convenience getters (derived from active session)
  getActiveSession: () => SessionState | undefined;
  hasRunningSessions: () => boolean;
}

const SESSION_STORAGE_KEY = "wmb-active-sessions";

interface PersistedSession {
  sessionId: string;
  workflowId: string;
  agentType: AgentType;
  bookId: string;
  seriesId?: string;
}

function persistSessions(sessions: Record<string, SessionState>) {
  try {
    const running = Object.values(sessions)
      .filter((s) => s.status === "running")
      .map((s): PersistedSession => ({
        sessionId: s.sessionId,
        workflowId: s.workflowId,
        agentType: s.agentType,
        bookId: s.bookId,
        seriesId: s.seriesId,
      }));
    if (running.length > 0) {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(running));
    } else {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable (SSR, private mode, etc.)
  }
}

function loadPersistedSessions(): Record<string, SessionState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return {};
    const persisted: PersistedSession[] = JSON.parse(raw);
    const sessions: Record<string, SessionState> = {};
    for (const p of persisted) {
      sessions[p.sessionId] = {
        sessionId: p.sessionId,
        workflowId: p.workflowId,
        agentType: p.agentType,
        bookId: p.bookId,
        seriesId: p.seriesId,
        status: "running",
        messages: [],
        error: null,
        suggestedNext: [],
      };
    }
    return sessions;
  } catch {
    return {};
  }
}

function getStoredPanelMode(): PanelMode {
  try {
    const stored = localStorage.getItem("wmb-agent-panel");
    if (stored === "hidden" || stored === "bubble" || stored === "mini" || stored === "overlay" || stored === "panel") {
      return stored;
    }
  } catch {
    // ignore
  }
  return "bubble";
}

// Always start with SSR-safe defaults ("bubble", no sessions).
// Client-side hydration happens in useAgentStoreHydration() below.
export const useAgentStore = create<AgentState>((set, get) => ({
  panelMode: "bubble" as PanelMode,
  sessions: {},
  activeSessionId: null,
  pendingWorkflowId: null,
  pendingMessage: null,
  unreadCount: 0,
  workflowQueue: [],
  pageContext: null,

  setPageContext: (ctx) => set({ pageContext: ctx }),

  setPanelMode: (mode) => {
    try {
      localStorage.setItem("wmb-agent-panel", mode);
      if (mode === "overlay" || mode === "panel") {
        localStorage.setItem("wmb-agent-expanded-mode", mode);
      }
    } catch {
      // ignore
    }
    set({ panelMode: mode, unreadCount: mode !== "hidden" && mode !== "bubble" ? 0 : get().unreadCount });
  },

  startSession: (sessionId, workflowId, agentType, bookId, seriesId) => {
    try {
      localStorage.setItem("wmb-agent-panel", "overlay");
    } catch {
      // ignore
    }
    set((state) => {
      const newSessions = {
        ...state.sessions,
        [sessionId]: {
          sessionId,
          workflowId,
          agentType,
          bookId,
          seriesId,
          status: "running" as const,
          messages: [],
          error: null,
          suggestedNext: [],
        },
      };
      persistSessions(newSessions);
      return {
        sessions: newSessions,
        activeSessionId: sessionId,
        panelMode: "overlay" as PanelMode,
      };
    });
  },

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

  setSessionComplete: (sessionId, _result, suggestedNext, resultMeta) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      const newSessions = {
        ...state.sessions,
        [sessionId]: {
          ...session,
          status: "completed" as const,
          suggestedNext,
          resultMeta,
        },
      };
      persistSessions(newSessions);
      return {
        sessions: newSessions,
        unreadCount:
          state.panelMode === "bubble" || state.panelMode === "hidden"
            ? state.unreadCount + 1
            : state.unreadCount,
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
      const newSessions = {
        ...state.sessions,
        [sessionId]: {
          ...session,
          status: "failed" as const,
          error,
        },
      };
      persistSessions(newSessions);
      return { sessions: newSessions };
    }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

  openWithWorkflow: (workflowId) => {
    try {
      localStorage.setItem("wmb-agent-panel", "overlay");
    } catch {
      // ignore
    }
    set({ pendingWorkflowId: workflowId, panelMode: "overlay" as PanelMode });
  },

  openWithMessage: (bookId, message) => {
    try {
      localStorage.setItem("wmb-agent-panel", "overlay");
    } catch {
      // ignore
    }
    set({ pendingMessage: { bookId, message }, panelMode: "overlay" as PanelMode });
  },

  clearPendingWorkflow: () => set({ pendingWorkflowId: null }),

  clearPendingMessage: () => set({ pendingMessage: null }),

  incrementUnread: () =>
    set((state) => ({
      unreadCount: state.panelMode === "bubble" || state.panelMode === "hidden" ? state.unreadCount + 1 : 0,
    })),

  clearUnread: () => set({ unreadCount: 0 }),

  addToQueue: (workflowId, chapterNumber) =>
    set((state) => ({
      workflowQueue: [...state.workflowQueue, { workflowId, chapterNumber }],
    })),

  removeFromQueue: (index) =>
    set((state) => ({
      workflowQueue: state.workflowQueue.filter((_, i) => i !== index),
    })),

  reorderQueue: (fromIndex, toIndex) =>
    set((state) => {
      const queue = [...state.workflowQueue];
      const [item] = queue.splice(fromIndex, 1);
      queue.splice(toIndex, 0, item);
      return { workflowQueue: queue };
    }),

  clearQueue: () => set({ workflowQueue: [] }),

  popQueue: () => {
    const state = get();
    if (state.workflowQueue.length === 0) return undefined;
    const [first, ...rest] = state.workflowQueue;
    set({ workflowQueue: rest });
    return first;
  },

  removeSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _, ...rest } = state.sessions;
      persistSessions(rest);
      return {
        sessions: rest,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    }),

  reset: () => {
    persistSessions({});
    set({
      sessions: {},
      activeSessionId: null,
      pendingWorkflowId: null,
      pendingMessage: null,
      panelMode: "bubble" as PanelMode,
      unreadCount: 0,
      workflowQueue: [],
    });
  },

  getActiveSession: () => {
    const state = get();
    if (!state.activeSessionId) return undefined;
    return state.sessions[state.activeSessionId];
  },

  hasRunningSessions: () => {
    return Object.values(get().sessions).some((s) => s.status === "running");
  },
}));

/**
 * Call this once in a top-level layout useEffect to hydrate the store from
 * localStorage / sessionStorage after the first client render, avoiding
 * SSR hydration mismatches.
 */
let hydrated = false;
export function hydrateAgentStore() {
  if (hydrated) return;
  hydrated = true;

  const recovered = loadPersistedSessions();
  const recoveredActiveId = Object.keys(recovered)[0] ?? null;
  const hasRecovered = Object.keys(recovered).length > 0;

  useAgentStore.setState({
    panelMode: hasRecovered ? "overlay" : getStoredPanelMode(),
    sessions: recovered,
    activeSessionId: recoveredActiveId,
  });
}
