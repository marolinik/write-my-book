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
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import {
  deriveDevelopmentStages,
  type DevelopmentStageKey,
  type StageStatus,
} from "@/lib/book/development-stages";
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
const WORLD_RESEARCH = "WORLD_RESEARCH";
const TOPIC_RESEARCH = "TOPIC_RESEARCH";

interface StageDef {
  key: DevelopmentStageKey;
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
      chapters: { select: { id: true, chapterNumber: true, status: true } },
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
            select: { id: true, bookNumber: true, status: true, wordCount: true },
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

  const firstDraftChapter = book.chapters[0];
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

  // UDG round-3 (Filip/Olivera): series continuation state — per-volume status
  // and the next volume number to start.
  const seriesBooks = book.series?.books ?? [];
  const seriesTitle = book.series?.title ?? "";
  const seriesNext = book.series
    ? computeSeriesNextBook(book.series.books as never)
    : null;

  return (
    <div className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate font-medium text-foreground">{book.name}</span>
          <ArrowRightIcon className="size-3.5 shrink-0" />
          <span>{s.title}</span>
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight">{s.title}</h1>
        <p className="max-w-2xl text-muted-foreground">{s.subtitle}</p>
      </header>

      {/* Pipeline visual */}
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stages.map((stage, i) => {
          const str = stageStrings[stage.key];
          const Icon = stage.icon;
          const isDone = stage.status === "done";
          const hasArtifact = !!stage.viewArtifactId;
          const isRecommended = recommendedNext === stage.key;
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
                    {stage.runWorkflow && (
                      <StartWorkflowButton
                        workflowId={stage.runWorkflow}
                        label={s.runWorkflow}
                      />
                    )}
                    {hasArtifact && stage.viewArtifactId ? (
                      <ButtonLink
                        href={`/books/${bookId}/documents/${stage.viewArtifactId}`}
                        label={`${s.viewArtifact} ${str.artifact}`}
                      />
                    ) : null}
                    {stage.jumpHref ? (
                      <ButtonLink
                        href={stage.jumpHref}
                        label={stage.key === "draft" ? s.startWriting : (stage.jumpLabel ?? s.nextStep)}
                      />
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <span className={`font-medium ${statusColor[stage.status]}`}>
                      {statusLabel[stage.status]}
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
                        <span className="font-medium">
                          {b.bookNumber}. {seriesTitle}
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

function ButtonLink({ href, label }: { href: string; label: string }) {
  return (
    <Button size="sm" variant="outline" className="shrink-0" asChild>
      <Link href={href}>{label}</Link>
    </Button>
  );
}