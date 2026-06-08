/**
 * @deprecated — Import from @/stores/agent-session-store or @/stores/agent-ui-store instead.
 *
 * This file is a backward-compatibility shim. It re-exports everything from the
 * two new split stores so that any remaining barrel imports continue to work.
 */

// Re-export session store
export {
  useAgentSessionStore,
  hydrateAgentSessionStore,
  type SessionState,
  type SessionResultMeta,
} from "./agent-session-store";

// Re-export UI store
export {
  useAgentUIStore,
  hydrateAgentUIStore,
  type PanelMode,
} from "./agent-ui-store";

// Re-export the session store as the default "useAgentStore" for any lingering imports.
// @deprecated — use useAgentSessionStore or useAgentUIStore directly.
export { useAgentSessionStore as useAgentStore } from "./agent-session-store";

/**
 * Combined hydration — calls both store hydration functions.
 * Used by layout.tsx for backward compat.
 */
import { hydrateAgentSessionStore } from "./agent-session-store";
import { hydrateAgentUIStore } from "./agent-ui-store";

export function hydrateAgentStore() {
  hydrateAgentUIStore();
  hydrateAgentSessionStore();
}
