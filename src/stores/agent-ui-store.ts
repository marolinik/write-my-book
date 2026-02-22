import { create } from "zustand";
import type { PageContext } from "@/lib/agents/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelMode = "hidden" | "bubble" | "mini" | "overlay" | "panel";

// ---------------------------------------------------------------------------
// Persistence helpers (localStorage for panel mode)
// ---------------------------------------------------------------------------

function getStoredPanelMode(): PanelMode {
  try {
    const stored = localStorage.getItem("wmb-agent-panel");
    if (
      stored === "hidden" ||
      stored === "bubble" ||
      stored === "mini" ||
      stored === "overlay" ||
      stored === "panel"
    ) {
      return stored;
    }
  } catch {
    // ignore
  }
  return "bubble";
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AgentUIState {
  panelMode: PanelMode;
  pendingWorkflowId: string | null;
  pendingMessage: { bookId: string; message: string } | null;
  unreadCount: number;
  pageContext: PageContext | null;

  // Actions
  setPanelMode: (mode: PanelMode) => void;
  openWithWorkflow: (workflowId: string) => void;
  openWithMessage: (bookId: string, message: string) => void;
  clearPendingWorkflow: () => void;
  clearPendingMessage: () => void;
  incrementUnread: () => void;
  clearUnread: () => void;
  setPageContext: (ctx: PageContext) => void;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAgentUIStore = create<AgentUIState>((set, get) => ({
  panelMode: "bubble" as PanelMode,
  pendingWorkflowId: null,
  pendingMessage: null,
  unreadCount: 0,
  pageContext: null,

  setPanelMode: (mode) => {
    try {
      localStorage.setItem("wmb-agent-panel", mode);
      if (mode === "overlay" || mode === "panel") {
        localStorage.setItem("wmb-agent-expanded-mode", mode);
      }
    } catch {
      // ignore
    }
    set({
      panelMode: mode,
      unreadCount:
        mode !== "hidden" && mode !== "bubble" ? 0 : get().unreadCount,
    });
  },

  openWithWorkflow: (workflowId) => {
    try {
      localStorage.setItem("wmb-agent-panel", "overlay");
    } catch {
      // ignore
    }
    set({
      pendingWorkflowId: workflowId,
      panelMode: "overlay" as PanelMode,
    });
  },

  openWithMessage: (bookId, message) => {
    try {
      localStorage.setItem("wmb-agent-panel", "overlay");
    } catch {
      // ignore
    }
    set({
      pendingMessage: { bookId, message },
      panelMode: "overlay" as PanelMode,
    });
  },

  clearPendingWorkflow: () => set({ pendingWorkflowId: null }),

  clearPendingMessage: () => set({ pendingMessage: null }),

  incrementUnread: () =>
    set((state) => ({
      unreadCount:
        state.panelMode === "bubble" || state.panelMode === "hidden"
          ? state.unreadCount + 1
          : 0,
    })),

  clearUnread: () => set({ unreadCount: 0 }),

  setPageContext: (ctx) => set({ pageContext: ctx }),

  reset: () => {
    try {
      localStorage.setItem("wmb-agent-panel", "bubble");
    } catch {
      // ignore
    }
    set({
      panelMode: "bubble" as PanelMode,
      pendingWorkflowId: null,
      pendingMessage: null,
      unreadCount: 0,
    });
  },
}));

// ---------------------------------------------------------------------------
// Hydration (call once from layout useEffect)
// ---------------------------------------------------------------------------

let hydrated = false;

export function hydrateAgentUIStore() {
  if (hydrated) return;
  hydrated = true;

  useAgentUIStore.setState({
    panelMode: getStoredPanelMode(),
  });
}
