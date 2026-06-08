import { create } from "zustand";
import type {
  AgentType,
  AgentStreamMessage,
  AgentResult,
} from "@/lib/agents/types";
import { useAgentUIStore } from "@/stores/agent-ui-store";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  /** Timestamp (Date.now()) when the session was created */
  startedAt: number;
  /** Estimated min duration from workflow definition */
  estimatedMinMinutes?: number;
  /** Estimated max duration from workflow definition */
  estimatedMaxMinutes?: number;
  /** Number of +15 min extensions used (0, 1, or 2) */
  extensionsUsed: number;
  /** Running cost in USD, updated via cost_update SSE events */
  currentCost: number;
  /** Whether this session is running as a background job (queued via BullMQ) */
  isBackground: boolean;
}

// ---------------------------------------------------------------------------
// Persistence helpers (sessionStorage for running sessions)
// ---------------------------------------------------------------------------

const SESSION_STORAGE_KEY = "wmb-active-sessions";

interface PersistedSession {
  sessionId: string;
  workflowId: string;
  agentType: AgentType;
  bookId: string;
  seriesId?: string;
  startedAt: number;
  estimatedMinMinutes?: number;
  estimatedMaxMinutes?: number;
  extensionsUsed: number;
  isBackground: boolean;
}

function persistSessions(sessions: Record<string, SessionState>) {
  try {
    const running = Object.values(sessions)
      .filter((s) => s.status === "running")
      .map(
        (s): PersistedSession => ({
          sessionId: s.sessionId,
          workflowId: s.workflowId,
          agentType: s.agentType,
          bookId: s.bookId,
          seriesId: s.seriesId,
          startedAt: s.startedAt,
          estimatedMinMinutes: s.estimatedMinMinutes,
          estimatedMaxMinutes: s.estimatedMaxMinutes,
          extensionsUsed: s.extensionsUsed,
          isBackground: s.isBackground,
        })
      );
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
        startedAt: p.startedAt || Date.now(), // fallback for old persisted sessions
        estimatedMinMinutes: p.estimatedMinMinutes,
        estimatedMaxMinutes: p.estimatedMaxMinutes,
        extensionsUsed: p.extensionsUsed ?? 0,
        currentCost: 0,
        isBackground: p.isBackground ?? false,
      };
    }
    return sessions;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AgentSessionState {
  sessions: Record<string, SessionState>;
  activeSessionId: string | null;
  workflowQueue: Array<{ workflowId: string; chapterNumber?: number }>;

  // Session mutations
  startSession: (
    sessionId: string,
    workflowId: string,
    agentType: AgentType,
    bookId: string,
    seriesId?: string,
    timing?: {
      estimatedMinMinutes?: number;
      estimatedMaxMinutes?: number;
    },
    isBackground?: boolean
  ) => void;
  extendSession: (sessionId: string) => void;
  addMessage: (sessionId: string, message: AgentStreamMessage) => void;
  setSessionComplete: (
    sessionId: string,
    result: AgentResult,
    suggestedNext: string[],
    resultMeta?: SessionResultMeta
  ) => void;
  setSessionRunning: (sessionId: string) => void;
  setSessionError: (sessionId: string, error: string) => void;
  updateSessionCost: (sessionId: string, costUsd: number) => void;
  setActiveSession: (sessionId: string | null) => void;
  removeSession: (sessionId: string) => void;

  // Queue mutations
  addToQueue: (workflowId: string, chapterNumber?: number) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  popQueue: () => { workflowId: string; chapterNumber?: number } | undefined;

  // Reset
  reset: () => void;

  // Convenience getters
  getActiveSession: () => SessionState | undefined;
  hasRunningSessions: () => boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAgentSessionStore = create<AgentSessionState>((set, get) => ({
  sessions: {},
  activeSessionId: null,
  workflowQueue: [],

  startSession: (sessionId, workflowId, agentType, bookId, seriesId, timing, isBackground) => {
    // Cross-store: open panel via UI store
    useAgentUIStore.getState().setPanelMode("overlay");
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
          startedAt: Date.now(),
          estimatedMinMinutes: timing?.estimatedMinMinutes,
          estimatedMaxMinutes: timing?.estimatedMaxMinutes,
          extensionsUsed: 0,
          currentCost: 0,
          isBackground: isBackground ?? false,
        },
      };
      persistSessions(newSessions);
      return {
        sessions: newSessions,
        activeSessionId: sessionId,
      };
    });
  },

  extendSession: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session || session.extensionsUsed >= 2) return state;
      const newSessions = {
        ...state.sessions,
        [sessionId]: {
          ...session,
          extensionsUsed: session.extensionsUsed + 1,
        },
      };
      persistSessions(newSessions);
      return { sessions: newSessions };
    });
  },

  addMessage: (sessionId, message) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;

      const msgs = session.messages;
      const last = msgs[msgs.length - 1];

      // Merge consecutive non-user text deltas into a single message
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

      // Cross-store: increment unread if panel is hidden/bubble
      const uiState = useAgentUIStore.getState();
      if (uiState.panelMode === "bubble" || uiState.panelMode === "hidden") {
        uiState.incrementUnread();
      }

      return { sessions: newSessions };
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

  updateSessionCost: (sessionId, costUsd) =>
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: {
            ...session,
            currentCost: costUsd,
          },
        },
      };
    }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId }),

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

  reset: () => {
    persistSessions({});
    set({
      sessions: {},
      activeSessionId: null,
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

// ---------------------------------------------------------------------------
// Hydration (call once from layout useEffect)
// ---------------------------------------------------------------------------

let hydrated = false;

export function hydrateAgentSessionStore() {
  if (hydrated) return;
  hydrated = true;

  const recovered = loadPersistedSessions();
  const recoveredActiveId = Object.keys(recovered)[0] ?? null;

  if (Object.keys(recovered).length > 0) {
    useAgentSessionStore.setState({
      sessions: recovered,
      activeSessionId: recoveredActiveId,
    });
  }
}
