import Link from "next/link";
import { ResearchGate } from "@/components/book/research-gate";
import { notFound } from "next/navigation";
import {
  LightbulbIcon,
  BookOpenIcon,
  NetworkIcon,
  SearchIcon,
  ListChecksIcon,
  PenLineIcon,
  CheckIcon,
  CircleIcon,
  ArrowRightIcon,
  LibraryIcon,
  FileInputIcon,
  FingerprintIcon,
  BookMarkedIcon,
  BarChart3Icon,
  ScissorsIcon,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { countWithNoun } from "@/lib/i18n/plural";
import {
  deriveDevelopmentStages,
  type DevelopmentStageKey,
  type StageStatus,
} from "@/lib/book/development-stages";
import {
  deriveManuscriptStages,
  isImportedManuscript,
} from "@/lib/book/manuscript-stages";
import { RefreshOnSessionComplete } from "@/components/book/refresh-on-session-complete";
import { computeSeriesNextBook, isBookFinished } from "@/lib/series/next-book";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { StartWorkflowButton } from "@/components/book/start-workflow-button";

export const dynamic = "force-dynamic";

const CONCEPT = "CONCEPT";
const SYNOPSIS = "SYNOPSIS";
const ARCHITECTURE = "ARCHITECTURE";
const BOOK_PLAN = "BOOK_PLAN";
const FINGERPRINT = "FINGERPRINT";
const STORY_BIBLE = "STORY_BIBLE";
const ANALYSIS_REPORT = "ANALYSIS_REPORT";
const WORLD_RESEARCH = "WORLD_RESEARCH";
const TOPIC_RESEARCH = "TOPIC_RESEARCH";

interface StageDef {
  key: DevelopmentStageKey | string;
  icon: React.ElementType;
  status: StageStatus;
  /** Workflow to launch for a "Run" stage, if any. */
  runWorkflow?: string;
  /** When present, linking to this artifact id views the produced doc. */
  viewArtifactId?: string;
  /** View-all / jump target (libraries, chapters), as href when artifact view isn't single-doc. */
  jumpHref?: string;
  /** Label for the jump action; defaults to the generic "Next" label. */
  jumpLabel?: string;
  /**
   * Replaces the generic status word. A stage can be "partial" for reasons the
   * writer reads very differently: the restructure pass is partial because it
   * is waiting on HIM, and "in progress" made it look like the agent was still
   * thinking (S3-4).
   */
  statusNote?: string;
  /** Lead with the jump, not the run button — the work is done, the decision is not. */
  jumpFirst?: boolean;
}

export default async function BookDevelopmentPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;
  const lang = localeFor(user.preferredLanguage ?? "en");
  const t = getUIStrings(lang);
  const s = t.bookDevelopment;

  // UDG-7/9 (Petar): world/topic research needs a web-search provider key
  // (Perplexity/Serper/Firecrawl). Only check presence — never expose the value.
  const hasResearchProvider = Boolean(
    process.env.PERPLEXITY_API_KEY ||
      process.env.SERPER_API_KEY ||
      process.env.FIRECRAWL_API_KEY
  );

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: {
        select: {
          id: true,
          chapterNumber: true,
          status: true,
          importedAt: true,
        },
      },
      documents: {
        where: { chapterNumber: null },
        select: { id: true, type: true, title: true },
        orderBy: { updatedAt: "desc" },
      },
      series: {
        select: {
          id: true,
          title: true,
          plannedBooks: true,
          books: {
            select: {
              id: true,
              name: true,
              bookNumber: true,
              status: true,
              wordCount: true,
            },
            orderBy: { bookNumber: "asc" },
          },
        },
      },
    },
  });
  if (!book) notFound();

  // Derive stage presences from the planning book's documents + chapters.
  const docTypeOf = (type: string) =>
    book.documents.find((d) => d.type === type);

  const concept = docTypeOf(CONCEPT);
  const synopsis = docTypeOf(SYNOPSIS);
  const architecture = docTypeOf(ARCHITECTURE);
  // UDG round-8 (Katarina): persisted whole-book outline (BOOK_PLAN) surfaces here.
  const bookPlan = docTypeOf(BOOK_PLAN);
  const researchDocCount = book.documents.filter(
    (d) => d.type === WORLD_RESEARCH || d.type === TOPIC_RESEARCH
  ).length;

  const chapterCount = book.chapters.length;
  const drafted = book.chapters.filter((c) =>
    ["drafted", "dev_edited", "line_edited", "beta_read", "final"].includes(
      c.status
    )
  ).length;

  const report = deriveDevelopmentStages({
      hasConcept: !!concept,
      hasSynopsis: !!synopsis,
      hasArchitecture: !!architecture,
      researchDocCount,
      chapterCount,
      draftedCount: drafted,
    });
  const byStage = new Map(
    report.stages.map((s) => [s.key, s.status] as const)
  );
  const stageStatus = (key: DevelopmentStageKey): StageStatus =>
    byStage.get(key) ?? "none";
  const recommendedNext = report.nextStage;

  // O11 — a book that arrived finished follows a different path. Which board
  // the writer sees is decided by the data (an import stamp, or chapters that
  // never had a concept or synopsis), not by a toggle he has to find.
  const imported = isImportedManuscript({
    importedChapterCount: book.chapters.filter((c) => c.importedAt).length,
    chapterCount,
    hasConcept: !!concept,
    hasSynopsis: !!synopsis,
  });

  const fingerprint = docTypeOf(FINGERPRINT);
  const storyBible = docTypeOf(STORY_BIBLE);
  const analysisReport = docTypeOf(ANALYSIS_REPORT);

  const [readRuns, structureMovesTotal, structureMovesPending, structureMovesApplied] =
    imported
      ? await Promise.all([
          db.agentSession.count({
            where: { bookId, workflowId: "read-manuscript", status: "completed" },
          }),
          db.structureMove.count({ where: { bookId } }),
          db.structureMove.count({ where: { bookId, status: "pending" } }),
          // Applied and still standing. An undone move left no mark on the book.
          db.structureMove.count({ where: { bookId, status: "applied" } }),
        ])
      : [0, 0, 0, 0];

  const editedCount = book.chapters.filter((c) =>
    ["dev_edited", "line_edited", "beta_read", "beta_passed", "final"].includes(
      c.status
    )
  ).length;

  const manuscriptReport = deriveManuscriptStages({
    hasReadManuscriptRun: readRuns > 0,
    hasFingerprint: !!fingerprint,
    hasStoryBible: !!storyBible,
    hasArchitecture: !!architecture,
    hasAnalysisReport: !!analysisReport,
    structureMovesTotal,
    structureMovesPending,
    structureMovesApplied,
    chapterCount,
    editedCount,
  });
  const manuscriptStatus = new Map(
    manuscriptReport.stages.map((st) => [st.key, st.status] as const)
  );

  const firstDraftChapter = book.chapters[0];

  // UDG round-5 (Bojan): the next unfinished chapter for the "keep going" block —
  // first chapter not yet drafted (undiscussed/discussed/planned), else the first.
  const nextChapter =
    book.chapters.find((c) =>
      ["undiscussed", "discussed", "planned"].includes(c.status)
    ) ?? firstDraftChapter;
  const nextChapterId = nextChapter?.id ?? "";
  const chaptersHref = `/books/${bookId}/chapters`;

  const stages: StageDef[] = [
    {
      key: "idea",
      icon: LightbulbIcon,
      status: stageStatus("idea"),
      runWorkflow: "new-novel",
      viewArtifactId: concept?.id,
    },
    {
      key: "synopsis",
      icon: BookOpenIcon,
      status: stageStatus("synopsis"),
      runWorkflow: "write-synopsis",
      viewArtifactId: synopsis?.id,
    },
    {
      key: "structure",
      icon: NetworkIcon,
      status: stageStatus("structure"),
      runWorkflow: "build-architecture",
      viewArtifactId: architecture?.id,
    },
    {
      key: "research",
      icon: SearchIcon,
      status: stageStatus("research"),
      runWorkflow: "research-world",
      jumpHref: `/books/${bookId}/library`,
      jumpLabel: s.researchDoc,
    },
    {
      key: "plan",
      icon: ListChecksIcon,
      status: stageStatus("plan"),
      runWorkflow: "discuss-chapter",
      viewArtifactId: bookPlan?.id,
      jumpHref: chaptersHref,
      jumpLabel: s.chapterPlan,
    },
    {
      key: "draft",
      icon: PenLineIcon,
      status: stageStatus("draft"),
      jumpHref: firstDraftChapter
        ? `/books/${bookId}/chapters/${firstDraftChapter.id}`
        : chaptersHref,
    },
  ];

  const manuscriptStages: StageDef[] = [
    {
      key: "read",
      icon: FileInputIcon,
      status: manuscriptStatus.get("read") ?? "none",
      runWorkflow: "read-manuscript",
    },
    {
      key: "style",
      icon: FingerprintIcon,
      status: manuscriptStatus.get("style") ?? "none",
      runWorkflow: "capture-style",
      viewArtifactId: fingerprint?.id,
    },
    {
      key: "bible",
      icon: BookOpenIcon,
      status: manuscriptStatus.get("bible") ?? "none",
      runWorkflow: "create-story-bible",
      viewArtifactId: storyBible?.id,
    },
    {
      key: "architecture",
      icon: NetworkIcon,
      status: manuscriptStatus.get("architecture") ?? "none",
      runWorkflow: "build-architecture",
      viewArtifactId: architecture?.id,
    },
    {
      key: "analyze",
      icon: BarChart3Icon,
      status: manuscriptStatus.get("analyze") ?? "none",
      runWorkflow: "analyze",
      viewArtifactId: analysisReport?.id,
    },
    {
      key: "restructure",
      icon: ScissorsIcon,
      status: manuscriptStatus.get("restructure") ?? "none",
      runWorkflow: "restructure",
      jumpHref: `/books/${bookId}/reports?tab=structure`,
      // Proposals on the table are the whole point of the pass, so they become
      // the headline and the first button.
      jumpLabel:
        structureMovesPending > 0 ? t.structure.decidePending : t.structure.tab,
      jumpFirst: structureMovesPending > 0,
      statusNote:
        structureMovesPending > 0
          ? t.structure.awaitingDecision.replace(
              "{n}",
              countWithNoun(
                structureMovesPending,
                t.structure.proposalOne,
                t.structure.proposalMany,
                { few: t.structure.proposalFew, language: lang }
              )
            )
          : undefined,
    },
    {
      key: "edit",
      icon: BookMarkedIcon,
      status: manuscriptStatus.get("edit") ?? "none",
      runWorkflow: "dev-edit",
      jumpHref: chaptersHref,
      jumpLabel: s.manuscript,
    },
  ];

  const manuscriptStrings: Record<
    string,
    { title: string; desc: string; artifact: string }
  > = {
    read: { title: s.impRead, desc: s.impReadDesc, artifact: s.manuscript },
    style: { title: s.impStyle, desc: s.impStyleDesc, artifact: s.concept },
    bible: { title: s.impBible, desc: s.impBibleDesc, artifact: s.concept },
    architecture: {
      title: s.impArchitecture,
      desc: s.impArchitectureDesc,
      artifact: s.architecture,
    },
    analyze: { title: s.impAnalyze, desc: s.impAnalyzeDesc, artifact: s.manuscript },
    restructure: {
      title: s.impRestructure,
      desc: s.impRestructureDesc,
      artifact: s.manuscript,
    },
    edit: { title: s.impEdit, desc: s.impEditDesc, artifact: s.manuscript },
  };

  const statusLabel: Record<StageStatus, string> = {
    done: s.done,
    partial: s.inProgress,
    none: s.notStarted,
  };
  const statusColor: Record<StageStatus, string> = {
    done: "text-green-700 dark:text-green-500",
    partial: "text-amber-700 dark:text-amber-500",
    none: "text-muted-foreground",
  };
  const stageStrings: Record<
    string,
    { title: string; desc: string; artifact: string }
  > = {
    idea: { title: s.idea, desc: s.ideaDesc, artifact: s.concept },
    synopsis: { title: s.synopsis, desc: s.synopsisDesc, artifact: s.synopsisDoc },
    structure: { title: s.structure, desc: s.structureDesc, artifact: s.architecture },
    research: { title: s.research, desc: s.researchDesc, artifact: s.researchDoc },
    plan: { title: s.plan, desc: s.planDesc, artifact: s.chapterPlan },
    draft: { title: s.draft, desc: s.draftDesc, artifact: s.manuscript },
  };

  // From here the board renders one path. The importer never meets the
  // greenfield cards, and the greenfield writer never meets the importer ones.
  const boardStages = imported ? manuscriptStages : stages;
  const boardStrings = imported ? manuscriptStrings : stageStrings;
  const boardNext = imported ? manuscriptReport.nextStage : recommendedNext;
  const boardTitle = imported ? s.importedTitle : s.title;
  const boardSubtitle = imported ? s.importedSubtitle : s.subtitle;

  // UDG round-3 (Filip/Olivera): series continuation state — per-volume status
  // and the next volume number to start.
  const seriesBooks = book.series?.books ?? [];
  const seriesNext = book.series
    ? computeSeriesNextBook(book.series.books as never)
    : null;

  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate font-medium text-foreground">{book.name}</span>
          <ArrowRightIcon className="size-3.5 shrink-0" />
          <span>{boardTitle}</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{boardTitle}</h1>
        <p className="max-w-2xl text-muted-foreground">{boardSubtitle}</p>
        {imported && (
          <p className="text-sm text-muted-foreground">{s.impPathNote}</p>
        )}
      </header>

      {/* O8 — a background workflow writes its document on the server; without
          this the board keeps reading "not started" and the writer runs the same
          job again. */}
      <RefreshOnSessionComplete bookId={bookId} />

      {/* UDG round-5 (Ana): guided "start here" arrow for first-time novelists —
          surface THE single next stage and its action above the six equal cards,
          gated on the concept-first path (pipeline incomplete, no drafts yet). */}
      {boardNext &&
        (imported || drafted === 0) &&
        (() => {
          const recom = boardStages.find((st) => st.key === boardNext)!;
          return (
            <section className="rounded-xl border-2 border-primary/50 bg-primary/[0.04] p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ArrowRightIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-foreground">
                      {s.startHere}
                      {recom?.viewArtifactId
                        ? ""
                        : ` - ${boardStrings[boardNext]?.title ?? ""}`}
                    </p>
                    <p className="text-sm text-muted-foreground">{s.startHereDesc}</p>
                  </div>
                </div>
                {recom?.runWorkflow ? (
                  <StartWorkflowButton
                    workflowId={recom.runWorkflow}
                    label={s.runWorkflow}
                  />
                ) : recom?.jumpHref ? (
                  <ButtonLink href={recom.jumpHref} label={recom.jumpLabel ?? s.runWorkflow} />
                ) : null}
              </div>
            </section>
          );
        })()}

      {/* UDG round-5 (Bojan): quick "keep going" on the current chapter once
          drafting has begun. The hub already fetches chapters; deep-link the next
          unfinished chapter (else the first) straight into the editor. */}
      {chapterCount > 0 && (
        <section className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-3">
            {nextChapter ? (
              <PenLineIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ListChecksIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <div>
              <p className="font-medium text-sm">
                {s.keepGoing} · {s.currentChapter}
              </p>
            </div>
          </div>
          <ButtonLink href={nextChapterId ? `/books/${bookId}/chapters/${nextChapterId}` : chaptersHref} label={s.runWorkflow} />
        </section>
      )}

      {/* Pipeline visual */}
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boardStages.map((stage, i) => {
          const str = boardStrings[stage.key];
          const Icon = stage.icon;
          const isDone = stage.status === "done";
          const hasArtifact = !!stage.viewArtifactId;
          const isRecommended = boardNext === stage.key;
          return (
            <li key={stage.key}>
              <Card
                className={
                  "relative flex h-full flex-col " +
                  (isRecommended
                    ? "border-primary/60 ring-1 ring-primary/20"
                    : isDone
                      ? "border-green-500/40 bg-green-500/[0.03]"
                      : "")
                }
              >
                {isRecommended && (
                  <Badge
                    variant="default"
                    className="absolute -top-2 right-4 text-[10px] px-2 py-0.5"
                  >
                    {s.nextStep}
                  </Badge>
                )}
                <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                      <h3 className="text-sm font-semibold leading-none">
                        {i + 1}. {str.title}
                      </h3>
                    </div>
                    <CardDescription className="mt-2 text-xs leading-relaxed">
                      {str.desc}
                    </CardDescription>
                  </div>
                  {isDone ? (
                    <CheckIcon
                      className="size-5 shrink-0 text-green-600"
                      aria-label={statusLabel.done}
                    />
                  ) : (
                    <CircleIcon
                      className={
                        "size-4 shrink-0 " +
                        (stage.status === "partial"
                          ? "fill-amber-500/30 text-amber-600"
                          : "fill-muted-foreground/10 text-muted-foreground/40")
                      }
                    />
                  )}
                </CardHeader>
                <CardContent className="mt-auto pt-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* When the stage is waiting on the writer, his decision
                        leads and re-running the pass comes second. */}
                    {stage.jumpFirst && stage.jumpHref ? (
                      <ButtonLink
                        href={stage.jumpHref}
                        label={stage.jumpLabel ?? s.nextStep}
                        primary
                      />
                    ) : null}
                    {stage.runWorkflow && (
                      <StartWorkflowButton
                        workflowId={stage.runWorkflow}
                        label={s.runWorkflow}
                      />
                    )}
                    {stage.key === "plan" && synopsis && (
                      <StartWorkflowButton
                        workflowId="plan-chapters-from-synopsis"
                        label={s.generateBeats}
                        initialMessage={`Read the book's SYNOPSIS document, then produce a chapter-by-chapter beat sheet for the whole book inline in the chat.`}
                      />
                    )}
                    {hasArtifact && stage.viewArtifactId ? (
                      <ButtonLink
                        href={`/books/${bookId}/documents/${stage.viewArtifactId}`}
                        label={`${s.viewArtifact} ${str.artifact}`}
                      />
                    ) : null}
                    {!stage.jumpFirst && stage.jumpHref ? (
                      <ButtonLink
                        href={stage.jumpHref}
                        label={stage.key === "draft" ? s.startWriting : (stage.jumpLabel ?? s.nextStep)}
                      />
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className={`font-medium ${statusColor[stage.status]}`}>
                      {stage.statusNote ?? statusLabel[stage.status]}
                    </span>
                  </div>
                  {stage.key === "research" &&
                    stage.status === "none" && (
                      <ResearchGate
                        hasResearchProvider={hasResearchProvider}
                        hint={s.researchHint}
                        apiKeysLabel={t.settings.apiKeys}
                        href="/settings#api-keys"
                      />
                    )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>

      {/* UDG-5 + round-3 (Miloš/Filip/Olivera): series continuity + continuation state.
          When the book belongs to a series, show per-volume status, the next
          volume to start, and a link to the cross-book continuity report. */}
      {book.series ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <LibraryIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            <span>{s.nextBookTitle}</span>
          </div>
          <Card>
            <CardContent className="space-y-4">
              {seriesBooks.length > 0 && (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {seriesBooks.map((b) => {
                    const done = isBookFinished(b.status);
                    const isNext = seriesNext?.nextBookNumber === b.bookNumber;
                    return (
                      <li
                        key={b.id}
                        className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs ${
                          isNext
                            ? "border-primary/50 bg-primary/[0.04]"
                            : done
                              ? "border-green-500/30 bg-green-500/[0.03]"
                              : ""
                        }`}
                      >
                        {/* The volume's OWN title. This printed the series
                            title, so every row read "1. Legat, 2. Legat,
                            3. Legat" and named no book at all (S3-15). */}
                        <span className="min-w-0 truncate font-medium" title={b.name}>
                          {b.bookNumber}. {b.name}
                        </span>
                        <Badge
                          variant={isNext ? "default" : done ? "secondary" : "outline"}
                          className="text-[10px] capitalize"
                        >
                          {isNext
                            ? s.nextStart
                            : done
                              ? s.done
                              : s.inProgress}
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">
                {s.nextBookDesc} —{" "}
                {seriesNext?.nextBookNumber
                  ? `${s.nextStart}: ${s.volumeStatus} ${seriesNext.nextBookNumber}`
                  : ""}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="shrink-0" asChild>
                  <Link href={`/books/${bookId}/reports`}>{s.continuityLink}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function ButtonLink({
  href,
  label,
  primary,
}: {
  href: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={primary ? "default" : "outline"}
      className="shrink-0"
      asChild
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}