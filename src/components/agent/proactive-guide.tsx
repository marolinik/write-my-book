"use client";

import { useState } from "react";
import {
  SparklesIcon,
  ImportIcon,
  BookOpenIcon,
  BookPlusIcon,
  LayoutTemplateIcon,
  PenToolIcon,
  ListIcon,
  Loader2Icon,
  ZapIcon,
  CheckCircleIcon,
  MapIcon,
  MessageCircleIcon,
  SendIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBookState } from "@/hooks/use-book-state";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { getWorkflow } from "@/lib/agents/workflows";
import { getJourney } from "@/lib/agents/journeys";
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

// ── Greenfield conversational onboarding ─────────────────────

interface GreenfieldProps {
  bookId: string;
  bookName: string;
  onSelectJourney: (journeyId: string) => void;
  onSelectWorkflow: (workflowId: string, chapterNumber?: number) => void;
  onBrowseAll: () => void;
  disabled?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;
}

function GreenfieldOnboarding({
  bookId,
  bookName,
  onSelectJourney,
  onSelectWorkflow,
  onBrowseAll,
  disabled,
  t,
}: GreenfieldProps) {
  const [chatInput, setChatInput] = useState("");
  const openWithMessage = useAgentUIStore((s) => s.openWithMessage);

  const handleSendMessage = () => {
    const msg = chatInput.trim();
    if (!msg) return;
    // Start freeform coaching workflow with the user's message
    openWithMessage(bookId, msg);
    setChatInput("");
  };

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {/* Welcome message */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-primary/10 p-1.5">
            <MessageCircleIcon className="size-4 text-primary" />
          </div>
          <h3 className="text-sm font-semibold">
            {t.workingOn} {bookName}
          </h3>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Hi! Tell me about the book you want to write. What&apos;s the story about?
          I&apos;ll help you get started.
        </p>
      </div>

      {/* Chat input area */}
      <div className="relative">
        <textarea
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder="Tell me about your book..."
          className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 pr-10 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[72px]"
          disabled={disabled}
        />
        <Button
          variant="ghost"
          size="icon"
          className="absolute bottom-2 right-2 size-7"
          onClick={handleSendMessage}
          disabled={disabled || !chatInput.trim()}
        >
          <SendIcon className="size-4" />
        </Button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          or choose a path
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Journey cards */}
      <button
        onClick={() => onSelectJourney("new-novel")}
        disabled={disabled}
        className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
      >
        <div className="mt-0.5 rounded-md bg-blue-500/10 p-2">
          <BookPlusIcon className="size-5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">New Novel</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start from scratch — concept, style, story bible, architecture.
          </p>
        </div>
      </button>

      <button
        onClick={() => onSelectJourney("existing-manuscript")}
        disabled={disabled}
        className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
      >
        <div className="mt-0.5 rounded-md bg-amber-500/10 p-2">
          <ImportIcon className="size-5 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">Existing Manuscript</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            Import, analyze, then edit and polish.
          </p>
        </div>
      </button>

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

// ── Main ProactiveGuide ──────────────────────────────────────

interface ProactiveGuideProps {
  bookId: string;
  onSelectWorkflow: (workflowId: string, chapterNumber?: number) => void;
  onBatchStart?: (workflowIds: string[]) => void;
  onBrowseAll: () => void;
  onSelectJourney?: (journeyId: string) => void;
  disabled?: boolean;
}

export function ProactiveGuide({
  bookId,
  onSelectWorkflow,
  onBatchStart,
  onBrowseAll,
  onSelectJourney,
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

  // Early state — no setup docs and no chapters: offer journey selection
  const isGreenfield =
    !state.hasChapters &&
    !state.hasFingerprint &&
    !state.hasStoryBible &&
    !state.hasArchitecture &&
    !state.hasImportedManuscript;

  if (isGreenfield && onSelectJourney) {
    return (
      <GreenfieldOnboarding
        bookId={bookId}
        bookName={state.bookName}
        onSelectJourney={onSelectJourney}
        onSelectWorkflow={onSelectWorkflow}
        onBrowseAll={onBrowseAll}
        disabled={disabled}
        t={t}
      />
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

  // Active journey progress
  const activeJourney = state.activeJourneyId
    ? getJourney(state.activeJourneyId)
    : null;

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

      {/* Active journey progress */}
      {activeJourney && state.journeyProgress && onSelectJourney && (
        <button
          onClick={() => onSelectJourney(activeJourney.id)}
          className="flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-left transition-colors hover:bg-primary/10"
        >
          <MapIcon className="size-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{activeJourney.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {state.journeyProgress.completed}/{state.journeyProgress.total}
              </span>
            </div>
            <div className="mt-1 h-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${(state.journeyProgress.completed / state.journeyProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        </button>
      )}

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
