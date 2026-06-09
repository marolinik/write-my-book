import { create } from "zustand";
import type { PageContext } from "@/lib/agents/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PanelMode = "hidden" | "bubble" | "mini" | "overlay" | "panel";

// ---------------------------------------------------------------------------
// Route-based panel preferences (Issue 1: Context-Awareness)
// ---------------------------------------------------------------------------

/** Routes that need full width — force overlay instead of docked panel */
const FULL_WIDTH_ROUTES = ["/chapters/", "/editorial"];

/** Check if a route needs full width (editor, editorial review) */
export function isFullWidthRoute(pathname: string): boolean {
  return FULL_WIDTH_ROUTES.some((r) => pathname.includes(r));
}

/** Get the stored panel mode preference for a specific route pattern */
function getRoutePreference(pathname: string): PanelMode | null {
  try {
    const key = isFullWidthRoute(pathname)
      ? "wmb-agent-panel:fullwidth"
      : "wmb-agent-panel:default";
    const stored = localStorage.getItem(key);
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
  return null;
}

/** Store panel mode preference keyed by route type */
function setRoutePreference(pathname: string, mode: PanelMode) {
  try {
    const key = isFullWidthRoute(pathname)
      ? "wmb-agent-panel:fullwidth"
      : "wmb-agent-panel:default";
    localStorage.setItem(key, mode);
  } catch {
    // ignore
  }
}

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
  pendingWorkflowMessage: string | null;
  pendingMessage: { bookId: string; message: string } | null;
  unreadCount: number;
  pageContext: PageContext | null;

  // Actions
  setPanelMode: (mode: PanelMode) => void;
  /** Adjust panel mode when route changes (Issue 1: Context-Awareness) */
  adjustForRoute: (pathname: string) => void;
  openWithWorkflow: (workflowId: string, initialMessage?: string) => void;
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
  pendingWorkflowMessage: null,
  pendingMessage: null,
  unreadCount: 0,
  pageContext: null,

  setPanelMode: (mode) => {
    const ctx = get().pageContext;
    const pathname = ctx?.currentRoute ?? "";
    try {
      localStorage.setItem("wmb-agent-panel", mode);
      setRoutePreference(pathname, mode);
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

  adjustForRoute: (pathname: string) => {
    const { panelMode } = get();
    // If user is on a full-width route and panel is docked, switch to overlay
    if (isFullWidthRoute(pathname) && panelMode === "panel") {
      set({ panelMode: "overlay" });
      return;
    }
    // If user navigates AWAY from full-width route, restore route preference
    if (!isFullWidthRoute(pathname) && panelMode !== "hidden") {
      const pref = getRoutePreference(pathname);
      if (pref && pref !== panelMode) {
        // Only auto-restore docked panel on wide routes, not force it
        // Don't override if user manually set bubble/mini
        if (pref === "panel" && (panelMode === "overlay" || panelMode === "bubble")) {
          // Offer to restore but don't force — keep current mode
        }
      }
    }
  },

  openWithWorkflow: (workflowId, initialMessage) => {
    try {
      localStorage.setItem("wmb-agent-panel", "overlay");
    } catch {
      // ignore
    }
    set({
      pendingWorkflowId: workflowId,
      pendingWorkflowMessage: initialMessage ?? null,
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

  clearPendingWorkflow: () => set({ pendingWorkflowId: null, pendingWorkflowMessage: null }),

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
      pendingWorkflowMessage: null,
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
