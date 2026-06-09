"use client";

import { useMemo } from "react";
import {
  BookOpenIcon,
  SearchIcon,
  PenToolIcon,
  FileTextIcon,
  CheckCircle2Icon,
  Loader2Icon,
  CircleDotIcon,
  CoinsIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Issue 9: Rich Session Progress Pipeline
// Shows a visual step-by-step pipeline for the currently running agent session.
// Infers the current step from tool_use events in the message stream.
// ---------------------------------------------------------------------------

interface PipelineStep {
  id: string;
  label: string;
  icon: React.ElementType;
  status: "pending" | "active" | "complete";
}

/** Map tool names to pipeline stages */
const TOOL_TO_STAGE: Record<string, string> = {
  ReadDocument: "reading",
  ReadChapter: "reading",
  ReadAllChapters: "reading",
  ListDocuments: "reading",
  ReadSeriesDocument: "reading",
  SearchMemory: "reading",
  ReadInsights: "reading",
  QueryGraph: "reading",
  // Analysis/processing tools
  CreateFinding: "analyzing",
  PostInsight: "analyzing",
  RememberInsight: "analyzing",
  SetVoiceMetrics: "analyzing",
  // Writing/output tools
  WriteDocument: "writing",
  WriteChapter: "writing",
  WriteSeriesDocument: "writing",
  UpdateGraphEntity: "writing",
  // Delegation
  DelegateToSpecialist: "delegating",
  // Approval
  RequestApproval: "approval",
};

/** Default pipeline stages for common workflow categories */
const WORKFLOW_PIPELINES: Record<string, Array<{ id: string; label: string; icon: React.ElementType }>> = {
  setup: [
    { id: "reading", label: "Reading context", icon: BookOpenIcon },
    { id: "analyzing", label: "Analyzing", icon: SearchIcon },
    { id: "writing", label: "Creating documents", icon: FileTextIcon },
    { id: "complete", label: "Complete", icon: CheckCircle2Icon },
  ],
  editing: [
    { id: "reading", label: "Reading chapter", icon: BookOpenIcon },
    { id: "analyzing", label: "Reviewing prose", icon: SearchIcon },
    { id: "writing", label: "Creating findings", icon: PenToolIcon },
    { id: "complete", label: "Complete", icon: CheckCircle2Icon },
  ],
  writing: [
    { id: "reading", label: "Reading plan", icon: BookOpenIcon },
    { id: "analyzing", label: "Planning", icon: SearchIcon },
    { id: "writing", label: "Writing", icon: PenToolIcon },
    { id: "complete", label: "Complete", icon: CheckCircle2Icon },
  ],
  analysis: [
    { id: "reading", label: "Reading manuscript", icon: BookOpenIcon },
    { id: "analyzing", label: "Analyzing", icon: SearchIcon },
    { id: "writing", label: "Generating report", icon: FileTextIcon },
    { id: "complete", label: "Complete", icon: CheckCircle2Icon },
  ],
};

interface SessionProgressPipelineProps {
  /** Workflow category (setup, editing, writing, analysis, etc.) */
  category: string;
  /** List of tool names that have been called so far */
  toolsCalled: string[];
  /** Whether the session is complete */
  isComplete: boolean;
  /** Current accumulated cost */
  currentCost?: number;
  /** Whether a delegation is in progress */
  isDelegating?: boolean;
  /** Delegation target agent name */
  delegationTarget?: string;
}

export function SessionProgressPipeline({
  category,
  toolsCalled,
  isComplete,
  currentCost,
  isDelegating,
  delegationTarget,
}: SessionProgressPipelineProps) {
  const steps = useMemo(() => {
    const template = WORKFLOW_PIPELINES[category] ?? WORKFLOW_PIPELINES.setup;

    // Determine the furthest stage reached based on tools called
    const stagesReached = new Set<string>();
    for (const tool of toolsCalled) {
      const stage = TOOL_TO_STAGE[tool];
      if (stage) stagesReached.add(stage);
    }

    // Determine the active stage (the last one reached)
    let activeStageId: string | null = null;
    for (const step of template) {
      if (stagesReached.has(step.id)) {
        activeStageId = step.id;
      }
    }

    // Build pipeline steps with statuses
    const pipeline: PipelineStep[] = [];
    let pastActive = false;
    for (const step of template) {
      if (step.id === "complete") {
        pipeline.push({
          ...step,
          status: isComplete ? "complete" : "pending",
        });
      } else if (pastActive) {
        pipeline.push({ ...step, status: "pending" });
      } else if (step.id === activeStageId) {
        pipeline.push({ ...step, status: isComplete ? "complete" : "active" });
        pastActive = false; // Allow further stages to be checked
      } else if (stagesReached.has(step.id)) {
        pipeline.push({ ...step, status: "complete" });
      } else {
        pipeline.push({ ...step, status: "pending" });
        pastActive = true;
      }
    }

    return pipeline;
  }, [category, toolsCalled, isComplete]);

  return (
    <div className="space-y-2 px-4 py-3">
      {/* Pipeline steps */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1 flex-1">
            {/* Step dot/icon */}
            <div
              className={`flex items-center justify-center size-6 rounded-full shrink-0 transition-colors ${
                step.status === "complete"
                  ? "bg-green-500/10 text-green-500"
                  : step.status === "active"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground/40"
              }`}
            >
              {step.status === "complete" ? (
                <CheckCircle2Icon className="size-3.5" />
              ) : step.status === "active" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <CircleDotIcon className="size-3" />
              )}
            </div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 rounded-full transition-colors ${
                  step.status === "complete"
                    ? "bg-green-500/30"
                    : "bg-muted"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Active step label */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {steps.find((s) => s.status === "active")?.label ?? (isComplete ? "Complete" : "Starting...")}
        </span>
        {/* Cost ticker */}
        {currentCost != null && currentCost > 0 && (
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CoinsIcon className="size-3" />
            ${currentCost.toFixed(3)}
          </span>
        )}
      </div>

      {/* Delegation indicator */}
      {isDelegating && delegationTarget && (
        <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-md px-2 py-1">
          <Loader2Icon className="size-3 animate-spin" />
          <span>Delegated to {delegationTarget}</span>
        </div>
      )}
    </div>
  );
}
