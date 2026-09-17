"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";
import {
  formatMissingPrerequisites,
  type MissingPrerequisite,
} from "@/lib/agents/prerequisite-message";
import type { PageContext } from "@/lib/agents/types";

/** Start a new agent session. Automatically includes the current page context. */
export function useStartSession(bookId: string) {
  const router = useRouter();
  const { language } = useLanguage();

  return useMutation({
    mutationFn: async (data: {
      workflowId: string;
      chapterNumber?: number;
      message?: string;
      pageContext?: PageContext | null;
    }) => {
      // Read pageContext from store if not explicitly provided
      const ctx = data.pageContext !== undefined
        ? data.pageContext
        : useAgentUIStore.getState().pageContext;

      const res = await fetch(`/api/books/${bookId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: data.workflowId,
          chapterNumber: data.chapterNumber,
          message: data.message,
          ...(ctx ? { pageContext: ctx } : {}),
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));

        // SETUP-07: Intercept setupIncomplete 422 and redirect to setup wizard
        if (res.status === 422 && body.setupIncomplete) {
          toast.info("Please complete book setup first");
          router.push(`/books/${bookId}/setup`);
          throw new Error("Setup incomplete");
        }

        if (res.status === 401) {
          if (typeof window !== "undefined") {
            window.location.href = "/login";
          }
          throw new Error("Unauthorized");
        }

        // O4: a prerequisite refusal used to reach the writer as nothing at all
        // — the panel rendered no error, so pressing start simply did nothing.
        // Name what is missing, in his language, and offer the run that fixes it.
        if (res.status === 422 && Array.isArray(body.missing)) {
          const a = getAgentStrings(language);
          const notice = formatMissingPrerequisites(
            body.missing as MissingPrerequisite[],
            {
              title: a.prereqTitle,
              needs: a.prereqNeeds,
              action: a.prereqAction,
              docTypes: getDocumentTypeLabels(language),
              workflows: { ...a.stepLabels, ...a.workflows },
            }
          );
          toast.error(notice.title, {
            description: notice.lines.join(" · "),
            ...(notice.action
              ? {
                  action: {
                    label: notice.action.label,
                    onClick: () =>
                      useAgentUIStore
                        .getState()
                        .openWithWorkflow(notice.action!.workflowId),
                  },
                }
              : {}),
          });
          throw new Error(notice.text);
        }

        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      return res.json() as Promise<{ sessionId: string; queued?: boolean; jobId?: string }>;
    },
  });
}

/** Start a series-aware agent session. */
export function useStartSeriesSession(seriesId: string) {
  return useMutation({
    mutationFn: async (data: {
      workflowId: string;
      bookId: string;
      chapterNumber?: number;
      message?: string;
    }) => {
      const res = await fetch(`/api/series/${seriesId}/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      return res.json() as Promise<{ sessionId: string; queued?: boolean; jobId?: string }>;
    },
  });
}

/** Send a message to a conversational session. Automatically includes the current page context. */
export function useSendMessage(bookId: string, sessionId: string | null) {
  return useMutation({
    mutationFn: async (message: string) => {
      if (!sessionId) throw new Error("No active session");
      const ctx = useAgentUIStore.getState().pageContext;

      const res = await fetch(
        `/api/books/${bookId}/agent/${sessionId}/message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            ...(ctx ? { pageContext: ctx } : {}),
          }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      return res.json() as Promise<{ ok: boolean }>;
    },
  });
}

/** Resolve an approval gate. */
export function useApproveAction(bookId: string, sessionId: string | null) {
  return useMutation({
    mutationFn: async (data: {
      approvalId: string;
      decision: "approve" | "reject" | "modify";
      message?: string;
    }) => {
      if (!sessionId) throw new Error("No active session");

      const res = await fetch(
        `/api/books/${bookId}/agent/${sessionId}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      return res.json() as Promise<{ ok: boolean }>;
    },
  });
}

/** Cancel a running session. */
export function useCancelSession(bookId: string, sessionId: string | null) {
  return useMutation({
    mutationFn: async () => {
      if (!sessionId) throw new Error("No active session");

      const res = await fetch(
        `/api/books/${bookId}/agent/${sessionId}/cancel`,
        { method: "POST" }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed: ${res.status}`);
      }

      return res.json() as Promise<{ ok: boolean }>;
    },
  });
}
