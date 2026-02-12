"use client";

import {
  SparklesIcon,
  ImportIcon,
  BookOpenIcon,
  LayoutTemplateIcon,
  PenToolIcon,
  ListIcon,
  Loader2Icon,
  ZapIcon,
  CheckCircleIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBookState } from "@/hooks/use-book-state";
import { getWorkflow } from "@/lib/agents/workflows";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

const WORKFLOW_ICONS: Record<string, React.ElementType> = {
  "read-manuscript": ImportIcon,
  "capture-style": SparklesIcon,
  "create-story-bible": BookOpenIcon,
  "build-architecture": LayoutTemplateIcon,
  "new-novel": BookOpenIcon,
  "dev-edit": PenToolIcon,
  "line-edit": PenToolIcon,
  "beta-read": BookOpenIcon,
  "write-chapter": PenToolIcon,
  "plan-chapter": LayoutTemplateIcon,
  "discuss-chapter": BookOpenIcon,
  "discuss-edits": PenToolIcon,
  "publishing-check": CheckCircleIcon,
  "market-analysis": BookOpenIcon,
};

interface ProactiveGuideProps {
  bookId: string;
  onSelectWorkflow: (workflowId: string, chapterNumber?: number) => void;
  onBatchStart?: (workflowIds: string[]) => void;
  onBrowseAll: () => void;
  disabled?: boolean;
}

export function ProactiveGuide({
  bookId,
  onSelectWorkflow,
  onBatchStart,
  onBrowseAll,
  disabled,
}: ProactiveGuideProps) {
  const state = useBookState(bookId);
  const t = getAgentStrings(state.language);

  if (state.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const primaryWorkflow = state.nextRecommendedWorkflow
    ? getWorkflow(state.nextRecommendedWorkflow)
    : null;

  const PrimaryIcon = state.nextRecommendedWorkflow
    ? (WORKFLOW_ICONS[state.nextRecommendedWorkflow] ?? SparklesIcon)
    : SparklesIcon;

  // State summary
  const stateParts: string[] = [];
  if (state.hasChapters) {
    stateParts.push(`${state.chapterCount} ${t.chapters}`);
  }
  if (!state.hasFingerprint) stateParts.push(t.noFingerprint);
  if (!state.hasStoryBible) stateParts.push(t.noStoryBible);
  if (!state.hasArchitecture) stateParts.push(t.noArchitecture);
  if (state.pendingFindingsCount > 0) {
    stateParts.push(`${state.pendingFindingsCount} ${t.pendingFindings}`);
  }

  // Setup completeness
  const setupTotal = 3; // fingerprint, bible, architecture
  const setupDone =
    (state.hasFingerprint ? 1 : 0) +
    (state.hasStoryBible ? 1 : 0) +
    (state.hasArchitecture ? 1 : 0);
  const setupComplete = setupDone === setupTotal;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {/* Book context */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">
          {t.workingOn} {state.bookName}
        </h3>
        {stateParts.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {stateParts.join(" · ")}
          </p>
        )}
      </div>

      {/* Setup progress bar */}
      {!setupComplete && state.hasChapters && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t.setupProgress}</span>
            <span className="font-medium">
              {setupDone}/{setupTotal}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(setupDone / setupTotal) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Primary CTA */}
      {primaryWorkflow && (
        <Button
          className="w-full justify-start gap-2 h-auto py-3"
          onClick={() => onSelectWorkflow(primaryWorkflow.id)}
          disabled={disabled}
        >
          <PrimaryIcon className="size-5 shrink-0" />
          <div className="flex flex-col items-start text-left">
            <span className="font-medium">
              {t.workflows[primaryWorkflow.id] ?? primaryWorkflow.label}
            </span>
            <span className="text-xs font-normal opacity-80">
              {primaryWorkflow.writerDescription}
            </span>
          </div>
        </Button>
      )}

      {/* Secondary suggestions */}
      {state.secondaryWorkflows.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t.alsoRecommended}</span>
          {state.secondaryWorkflows.map(({ id, reason }) => {
            const wf = getWorkflow(id);
            if (!wf) return null;
            const Icon = WORKFLOW_ICONS[id] ?? SparklesIcon;
            return (
              <Button
                key={id}
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2 h-auto py-2"
                onClick={() => onSelectWorkflow(id)}
                disabled={disabled}
              >
                <Icon className="size-4 shrink-0" />
                <div className="flex flex-col items-start text-left">
                  <span className="text-xs font-medium">
                    {t.workflows[id] ?? wf.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {reason}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      )}

      {/* Run all setup (parallel batch) */}
      {state.setupWorkflows.length >= 2 && state.hasChapters && onBatchStart && (
        <Button
          variant="secondary"
          size="sm"
          className="w-full gap-2"
          onClick={() => onBatchStart(state.setupWorkflows)}
          disabled={disabled}
        >
          <ZapIcon className="size-4" />
          {t.runAllSetup}
          <Badge variant="outline" className="ml-auto text-[10px]">
            {state.setupWorkflows.length} {t.agents}
          </Badge>
        </Button>
      )}

      {/* Browse all workflows */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-2 text-xs text-muted-foreground"
        onClick={onBrowseAll}
      >
        <ListIcon className="size-3" />
        {t.browseAll}
      </Button>
    </div>
  );
}
