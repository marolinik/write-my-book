"use client";

/**
 * Surfaces agent approval requests that the writer cannot see.
 *
 * The approval gate blocks the run for ten minutes and then fails it. When the
 * agent panel is collapsed to the bubble (the default while writing), the
 * request rendered into a panel nobody was looking at: the writer's first sign
 * of it was a "Timed Out" card long after the run had died.
 *
 * Mounted once in the app layout so it fires regardless of which panel mode is
 * active. Approvals raised while the panel IS open are left alone — they are
 * already on screen.
 */

import { useEffect, useRef } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { toast } from "sonner";
import { useAgentSessionStore } from "@/stores/agent-session-store";
import { useAgentUIStore } from "@/stores/agent-ui-store";

/** Panel modes in which the writer can actually see the agent transcript. */
const VISIBLE_MODES = new Set(["panel", "overlay", "mini"]);

export function ApprovalNotifier() {
  const { t } = useLanguage();
  const sessions = useAgentSessionStore((s) => s.sessions);
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);

  // Approval ids already announced — a toast must never repeat on re-render.
  const announced = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const session of Object.values(sessions)) {
      for (const message of session.messages) {
        if (message.type !== "approval_request") continue;

        const approvalId =
          (message.metadata?.approvalId as string | undefined) ?? null;
        if (!approvalId || announced.current.has(approvalId)) continue;
        announced.current.add(approvalId);

        // Visible already — the panel is showing the request itself.
        if (VISIBLE_MODES.has(panelMode)) continue;

        const title =
          (message.metadata?.approvalTitle as string | undefined) ??
          "Approval needed";

        toast.warning(title, {
          description: message.content,
          // The gate waits ten minutes; a toast that vanishes in five seconds
          // would reproduce the very problem this exists to fix.
          duration: 120_000,
          action: {
            label: t.appUI.open,
            onClick: () => setPanelMode("panel"),
          },
        });
      }
    }
  }, [sessions, panelMode, setPanelMode]);

  return null;
}
