"use client";

import { useMemo } from "react";
import { CheckCircle2Icon, Loader2Icon, CircleIcon } from "lucide-react";
import type { AgentStreamMessage } from "@/lib/agents/types";

interface AnalysisStep {
  id: string;
  label: string;
  status: "pending" | "active" | "complete";
}

interface AnalysisProgressProps {
  /** Stream messages from the agent session. */
  messages: AgentStreamMessage[];
}

/**
 * Visual checklist for onboarding analysis pipeline progress.
 * Maps delegation_start/delegation_complete SSE events to step status.
 */
export function AnalysisProgress({ messages }: AnalysisProgressProps) {
  const steps = useMemo(() => {
    const stepDefs: Array<{ id: string; label: string; agentTypes: string[] }> = [
      { id: "read", label: "Reading manuscript...", agentTypes: ["manuscript-reader"] },
      { id: "style", label: "Capturing writing style...", agentTypes: ["style-analyst"] },
      { id: "bible", label: "Building story bible...", agentTypes: ["writing-coach"] },
      { id: "arch", label: "Designing story structure", agentTypes: ["story-architect"] },
    ];

    const delegationStarts = new Set<string>();
    const delegationCompletes = new Set<string>();

    for (const msg of messages) {
      const agentType = msg.metadata?.agentType as string | undefined;
      if (!agentType) continue;

      if (msg.type === "delegation_start") {
        delegationStarts.add(agentType);
      }
      if (msg.type === "delegation_complete") {
        delegationCompletes.add(agentType);
      }
    }

    return stepDefs.map((def): AnalysisStep => {
      const started = def.agentTypes.some((t) => delegationStarts.has(t));
      const completed = def.agentTypes.some((t) => delegationCompletes.has(t));

      // For bible step (writing-coach), check if a STORY_BIBLE was written
      if (def.id === "bible") {
        const hasBibleWrite = messages.some(
          (m) =>
            m.type === "tool_result" &&
            m.metadata?.tool === "WriteDocument" &&
            (m.content?.includes("STORY_BIBLE") ?? false)
        );
        if (hasBibleWrite) {
          return { id: def.id, label: def.label, status: "complete" };
        }
      }

      if (completed) return { id: def.id, label: def.label, status: "complete" };
      if (started) return { id: def.id, label: def.label, status: "active" };
      return { id: def.id, label: def.label, status: "pending" };
    });
  }, [messages]);

  const completedCount = steps.filter((s) => s.status === "complete").length;
  const allDone = completedCount === steps.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Analysis Progress</span>
        <span className="text-xs text-muted-foreground">
          {completedCount}/{steps.length} complete
        </span>
      </div>

      <div className="space-y-2">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-3">
            <StepIcon status={step.status} />
            <span
              className={`text-sm ${
                step.status === "complete"
                  ? "text-green-600 dark:text-green-400"
                  : step.status === "active"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
              }`}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      {allDone && (
        <div className="rounded-md bg-green-50 dark:bg-green-950/30 p-3 text-sm text-green-700 dark:text-green-300">
          All foundational documents created. Review them in the setup wizard.
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: AnalysisStep["status"] }) {
  switch (status) {
    case "complete":
      return <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400 shrink-0" />;
    case "active":
      return <Loader2Icon className="size-4 text-primary animate-spin shrink-0" />;
    case "pending":
      return <CircleIcon className="size-4 text-muted-foreground/50 shrink-0" />;
  }
}
