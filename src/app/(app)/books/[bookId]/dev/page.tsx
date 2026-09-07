import Link from "next/link";
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
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import {
  deriveDevelopmentStages,
  type DevelopmentStageKey,
  type StageStatus,
} from "@/lib/book/development-stages";
import { Button } from "@/components/ui/button";
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

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: { select: { id: true, chapterNumber: true, status: true } },
      documents: {
        where: { chapterNumber: null },
        select: { id: true, type: true, title: true },
        orderBy: { updatedAt: "desc" },
      },
      series: { select: { id: true, title: true } },
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

  const byStage = new Map(
    deriveDevelopmentStages({
      hasConcept: !!concept,
      hasSynopsis: !!synopsis,
      hasArchitecture: !!architecture,
      researchDocCount,
      chapterCount,
      draftedCount: drafted,
    }).map((s) => [s.key, s.status] as const)
  );
  const stageStatus = (key: DevelopmentStageKey): StageStatus =>
    byStage.get(key) ?? "none";

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
          return (
            <li key={stage.key}>
              <Card
                className={
                  "flex h-full flex-col " +
                  (isDone ? "border-green-500/40 bg-green-500/[0.03]" : "")
                }
              >
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
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
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