"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  BookPlusIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleDotIcon,
  FileInputIcon,
  LibraryIcon,
  ListPlusIcon,
  LockIcon,
  MessageCircleIcon,
  PaletteIcon,
  PenLineIcon,
  PenToolIcon,
  RepeatIcon,
  RocketIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getAllWorkflows, getWorkflow } from "@/lib/agents/workflows";
import { getAllJourneys, getJourney } from "@/lib/agents/journeys";
import type { JourneyDefinition, JourneyStep } from "@/lib/agents/journeys";
import type { WorkflowDefinition } from "@/lib/agents/types";
import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { useAgentSessionStore } from "@/stores/agent-session-store";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { toast } from "sonner";

const JOURNEY_ICONS: Record<string, React.ElementType> = {
  BookPlus: BookPlusIcon,
  FileInput: FileInputIcon,
  RotateCcw: RotateCcwIcon,
  PenTool: PenToolIcon,
  Rocket: RocketIcon,
  Palette: PaletteIcon,
  Library: LibraryIcon,
  MessageCircle: MessageCircleIcon,
};

const CATEGORY_ICONS = {
  setup: SparklesIcon,
  writing: PenLineIcon,
  editing: SearchIcon,
  analysis: BookOpenIcon,
  style: PaletteIcon,
  series: LibraryIcon,
} as const;

interface WorkflowSelectorProps {
  bookId: string;
  chapters: Array<{ chapterNumber: number; title: string | null }>;
  onSelect: (workflowId: string, chapterNumber?: number) => void;
  disabled?: boolean;
  seriesId?: string;
  /** Existing document types for the book (used for prerequisite checking). */
  existingDocTypes?: Set<string>;
  /** Whether any chapter has content. */
  hasChapterContent?: boolean;
  /** Completed workflow IDs for journey progress tracking. */
  completedWorkflows?: Set<string>;
  /** Initial tab: "journeys" or "workflows". */
  defaultTab?: "journeys" | "workflows";
}

export function WorkflowSelector({
  bookId: _bookId,
  chapters,
  onSelect,
  disabled,
  seriesId,
  existingDocTypes,
  hasChapterContent,
  completedWorkflows,
  defaultTab = "journeys",
}: WorkflowSelectorProps) {
  const { t, language } = useLanguage();
  const as = getAgentStrings(language);
  const addToQueue = useAgentSessionStore((s) => s.addToQueue);
  const pageContext = useAgentUIStore((s) => s.pageContext);
  const [selectedWorkflow, setSelectedWorkflow] =
    useState<WorkflowDefinition | null>(null);
  const [chapterNumber, setChapterNumber] = useState<number | undefined>();
  const [selectedJourney, setSelectedJourney] =
    useState<JourneyDefinition | null>(null);

  const workflows = getAllWorkflows();
  const journeys = getAllJourneys();

  // Check prerequisites client-side for visual disabling
  const unmetPrereqs = useMemo(() => {
    const result = new Map<string, string[]>();
    if (!existingDocTypes) return result;

    for (const w of workflows) {
      if (!w.prerequisites) continue;
      const missing: string[] = [];
      for (const p of w.prerequisites) {
        if (p.type === "document" && !existingDocTypes.has(p.value)) {
          missing.push(p.description);
        }
        if (p.type === "chapter_content" && !hasChapterContent) {
          missing.push(p.description);
        }
      }
      if (missing.length > 0) result.set(w.id, missing);
    }
    return result;
  }, [workflows, existingDocTypes, hasChapterContent]);

  const categoryLabels: Record<string, string> = {
    setup: t.workflowSelector.setup,
    writing: t.workflowSelector.writing,
    editing: t.workflowSelector.editing,
    analysis: t.workflowSelector.analysis,
    style: t.workflowSelector.style,
    series: t.workflowSelector.series,
  };
  const categories = [
    "setup",
    "writing",
    "editing",
    "analysis",
    "style",
    ...(seriesId ? (["series"] as const) : []),
  ] as const;

  const handleSelect = (workflow: WorkflowDefinition) => {
    if (workflow.requiresChapter) {
      setSelectedWorkflow(workflow);
      // Pre-select the chapter the user is currently viewing, falling back to first chapter
      const contextChapter = pageContext?.currentChapterNumber;
      const defaultChapter = contextChapter && chapters.some((c) => c.chapterNumber === contextChapter)
        ? contextChapter
        : chapters[0]?.chapterNumber;
      setChapterNumber(defaultChapter);
    } else {
      onSelect(workflow.id);
    }
  };

  const handleConfirm = () => {
    if (selectedWorkflow) {
      onSelect(selectedWorkflow.id, chapterNumber);
      setSelectedWorkflow(null);
    }
  };

  const handleAddToQueue = (workflow: WorkflowDefinition) => {
    if (workflow.requiresChapter) {
      // Prefer the chapter the user is currently viewing
      const contextChapter = pageContext?.currentChapterNumber;
      const ch = contextChapter && chapters.some((c) => c.chapterNumber === contextChapter)
        ? contextChapter
        : chapters[0]?.chapterNumber;
      addToQueue(workflow.id, ch);
    } else {
      addToQueue(workflow.id);
    }
    toast.success(`Added "${as.workflows[workflow.id] ?? workflow.label}" to queue`);
  };

  // Chapter selection sub-view
  if (selectedWorkflow) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <div className="text-sm font-medium">{as.workflows[selectedWorkflow.id] ?? selectedWorkflow.label}</div>
        <p className="text-xs text-muted-foreground">
          {t.workflowSelector.selectChapter}
        </p>
        <div className="flex flex-col gap-1">
          {chapters.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t.workflowSelector.noChapters}
            </p>
          ) : (
            <ScrollArea className="max-h-48">
              {chapters.map((ch) => (
                <button
                  key={ch.chapterNumber}
                  onClick={() => setChapterNumber(ch.chapterNumber)}
                  className={`w-full rounded px-3 py-1.5 text-left text-sm transition-colors ${
                    chapterNumber === ch.chapterNumber
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted"
                  }`}
                >
                  Ch {ch.chapterNumber}
                  {ch.title ? `: ${ch.title}` : ""}
                </button>
              ))}
            </ScrollArea>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedWorkflow(null)}
          >
            {t.workflowSelector.back}
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={!chapterNumber || chapters.length === 0}
          >
            {t.workflowSelector.start}
          </Button>
        </div>
      </div>
    );
  }

  // Journey detail view
  if (selectedJourney) {
    return (
      <JourneyDetailView
        journey={selectedJourney}
        completedWorkflows={completedWorkflows ?? new Set()}
        unmetPrereqs={unmetPrereqs}
        onSelectStep={(workflowId) => {
          const wf = getWorkflow(workflowId);
          if (wf) handleSelect(wf);
        }}
        onBack={() => setSelectedJourney(null)}
        disabled={disabled}
      />
    );
  }

  return (
    <Tabs defaultValue={defaultTab} className="flex flex-1 flex-col min-h-0">
      <div className="px-4 pt-3">
        <TabsList className="w-full">
          <TabsTrigger value="journeys">Journeys</TabsTrigger>
          <TabsTrigger value="workflows">All Workflows</TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="journeys" className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-2 p-4">
            <p className="text-xs text-muted-foreground">
              Choose a guided journey through your book project:
            </p>
            {journeys.map((journey) => (
              <JourneyCard
                key={journey.id}
                journey={journey}
                completedWorkflows={completedWorkflows ?? new Set()}
                onClick={() => setSelectedJourney(journey)}
                disabled={disabled}
              />
            ))}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="workflows" className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4">
            <p className="text-xs text-muted-foreground">
              {t.workflowSelector.chooseWorkflow}
            </p>
            {categories.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              const catWorkflows = workflows.filter((w) => w.category === cat);
              if (catWorkflows.length === 0) return null;

              return (
                <div key={cat} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    <Icon className="size-3" />
                    {categoryLabels[cat]}
                  </div>
                  {catWorkflows.map((w) => {
                    const missing = unmetPrereqs.get(w.id);
                    const isLocked = !!missing && missing.length > 0;
                    const isDisabled = disabled || isLocked;

                    const button = (
                      <div
                        key={w.id}
                        className="flex items-center rounded-md text-left text-sm transition-colors hover:bg-muted group"
                      >
                        <button
                          onClick={() => !isDisabled && handleSelect(w)}
                          disabled={isDisabled}
                          className="flex flex-1 items-center justify-between px-3 py-2 min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0">
                            <span className="font-medium flex items-center gap-1.5">
                              {as.workflows[w.id] ?? w.label}
                              {isLocked && (
                                <LockIcon className="size-3 text-muted-foreground" />
                              )}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {as.workflowDescriptions[w.id] ?? w.writerDescription}
                            </span>
                          </div>
                          <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                        </button>
                        {!isLocked && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="p-1.5 mr-1 rounded hover:bg-primary/10 text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToQueue(w);
                                }}
                              >
                                <ListPlusIcon className="size-4" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="text-xs">
                              Add to queue
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    );

                    if (isLocked) {
                      return (
                        <Tooltip key={w.id}>
                          <TooltipTrigger asChild>{button}</TooltipTrigger>
                          <TooltipContent side="left" className="max-w-64">
                            <p className="font-medium text-xs mb-1">
                              Prerequisites needed:
                            </p>
                            <ul className="text-xs list-disc pl-3">
                              {missing.map((m, i) => (
                                <li key={i}>{m}</li>
                              ))}
                            </ul>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return button;
                  })}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

// ─── Journey Card ──────────────────────────────────────────────────

function JourneyCard({
  journey,
  completedWorkflows,
  onClick,
  disabled,
}: {
  journey: JourneyDefinition;
  completedWorkflows: Set<string>;
  onClick: () => void;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const as = getAgentStrings(language);
  const Icon = JOURNEY_ICONS[journey.icon] ?? BookOpenIcon;
  const totalSteps = journey.steps.filter((s) => !s.optional).length;
  let completedSteps = 0;
  for (const step of journey.steps) {
    if (step.optional) continue;
    if (completedWorkflows.has(step.workflowId)) completedSteps++;
  }
  const progressPct = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  const isStarted = completedSteps > 0;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="mt-0.5 rounded-md bg-primary/10 p-2">
        <Icon className="size-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{as.journeyLabels[journey.id] ?? journey.label}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {totalSteps} steps
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {as.journeyDescriptions[journey.id] ?? journey.description}
        </p>
        {isStarted && (
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {completedSteps}/{totalSteps}
            </span>
          </div>
        )}
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground mt-1" />
    </button>
  );
}

// ─── Journey Detail View (Step Timeline) ───────────────────────────

function JourneyDetailView({
  journey,
  completedWorkflows,
  unmetPrereqs,
  onSelectStep,
  onBack,
  disabled,
}: {
  journey: JourneyDefinition;
  completedWorkflows: Set<string>;
  unmetPrereqs: Map<string, string[]>;
  onSelectStep: (workflowId: string) => void;
  onBack: () => void;
  disabled?: boolean;
}) {
  const { language } = useLanguage();
  const as = getAgentStrings(language);
  const Icon = JOURNEY_ICONS[journey.icon] ?? BookOpenIcon;

  // Find the first incomplete non-optional step
  const currentStepIndex = journey.steps.findIndex(
    (s) => !s.optional && !completedWorkflows.has(s.workflowId)
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" className="size-7" onClick={onBack}>
          <ArrowLeftIcon className="size-4" />
        </Button>
        <Icon className="size-4 text-primary" />
        <span className="text-sm font-medium">{as.journeyLabels[journey.id] ?? journey.label}</span>
      </div>

      {/* Steps timeline */}
      <ScrollArea className="flex-1">
        <div className="flex flex-col p-4">
          <p className="text-xs text-muted-foreground mb-3">
            {as.journeyDescriptions[journey.id] ?? journey.description}
          </p>

          <div className="relative flex flex-col">
            {journey.steps.map((step, index) => {
              const wf = getWorkflow(step.workflowId);
              const isCompleted = completedWorkflows.has(step.workflowId);
              const isCurrent = index === currentStepIndex;
              const isFuture = index > currentStepIndex && currentStepIndex >= 0;
              const missing = unmetPrereqs.get(step.workflowId);
              const isLocked = !!missing && missing.length > 0 && !isCompleted;
              const isLast = index === journey.steps.length - 1;

              return (
                <div key={`${step.workflowId}-${index}`} className="relative flex gap-3">
                  {/* Timeline line */}
                  {!isLast && (
                    <div className="absolute left-[11px] top-[24px] bottom-0 w-px bg-border" />
                  )}

                  {/* Status icon */}
                  <div className="relative z-10 shrink-0 mt-0.5">
                    {isCompleted ? (
                      <CheckCircle2Icon className="size-[22px] text-primary" />
                    ) : isCurrent ? (
                      <CircleDotIcon className="size-[22px] text-primary" />
                    ) : (
                      <div className="size-[22px] rounded-full border-2 border-muted-foreground/30 bg-background" />
                    )}
                  </div>

                  {/* Content */}
                  <div className={`flex-1 pb-4 min-w-0 ${isFuture && !isCurrent ? "opacity-50" : ""}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-sm ${isCurrent ? "font-semibold" : "font-medium"}`}>
                        {as.workflows[step.workflowId] ?? wf?.label ?? step.workflowId}
                      </span>
                      {step.optional && (
                        <Badge variant="outline" className="text-[9px]">
                          optional
                        </Badge>
                      )}
                      {step.perChapter && (
                        <Badge variant="secondary" className="text-[9px]">
                          per chapter
                        </Badge>
                      )}
                      {step.loopTo && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <RepeatIcon className="size-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            Can loop back to {as.workflows[step.loopTo] ?? getWorkflow(step.loopTo)?.label ?? step.loopTo}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {isLocked && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <LockIcon className="size-3 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-56 text-xs">
                            {missing?.join(", ")}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    {wf?.writerDescription && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {wf.writerDescription}
                      </p>
                    )}
                    {isCurrent && !isLocked && (
                      <Button
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={() => onSelectStep(step.workflowId)}
                        disabled={disabled}
                      >
                        Start this step
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
