import Link from "next/link";
import { notFound } from "next/navigation";
import {
  SettingsIcon,
  FileTextIcon,
  SparklesIcon,
  BotIcon,
  PlayIcon,
  TargetIcon,
} from "lucide-react";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  computeStreaks,
  getDailyWordCounts,
  getTodayWords,
} from "@/lib/writing-stats";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { getWorkflow } from "@/lib/agents/workflows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BookViewSwitcher } from "@/components/book/book-view-switcher";
import { StartWorkflowButton } from "@/components/book/start-workflow-button";
import { MemoryStatsCard } from "@/components/memory/memory-stats-card";
import { StoryRadar } from "@/components/book/story-radar";
import { DailyWritingPlan } from "@/components/book/daily-writing-plan";
import { ProactiveNotifications } from "@/components/book/proactive-notifications";
import { ChapterWordGoals } from "@/components/book/chapter-word-goals";
import { WritingHeatmap } from "@/components/book/writing-heatmap";
import { MilestoneRewards } from "@/components/book/milestone-rewards";
import { LifetimeStats } from "@/components/book/lifetime-stats";
import { DraftCertificate } from "@/components/book/draft-certificate";

export const dynamic = "force-dynamic";


function getWorkflowLabel(workflowId: string | null, lang: string): string {
  if (!workflowId) return "Agent session";
  const strings = getAgentStrings(lang);
  return strings.workflows[workflowId] ?? getWorkflow(workflowId)?.label ?? workflowId;
}

function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;

  const [book, recentSessions, pendingFindings] = await Promise.all([
    db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: {
        chapters: { orderBy: { chapterNumber: "asc" } },
        documents: {
          where: { chapterNumber: null },
          orderBy: { updatedAt: "desc" },
        },
        series: { select: { id: true, title: true } },
        settings: { select: { setupComplete: true } },
        _count: { select: { documents: true } },
      },
    }),
    db.agentSession.findMany({
      where: { bookId, userId: user.id },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        workflowId: true,
        status: true,
        tokensInput: true,
        tokensOutput: true,
        completedAt: true,
        startedAt: true,
      },
    }),
    db.editFinding.count({
      where: { bookId, status: "pending" },
    }),
  ]);

  if (!book) notFound();

  // Real writing stats: per-day word deltas for the past year (UTC-bucketed)
  const dailyCounts = await getDailyWordCounts({ bookId, days: 365 });
  const { currentStreak, bestStreak, activeDays } = computeStreaks(dailyCounts);
  const todayWords = getTodayWords(dailyCounts);
  const periodWords = dailyCounts.reduce((sum, d) => sum + d.words, 0);

  const t = getUIStrings(user.preferredLanguage ?? "en");
  const locale = localeFor(user.preferredLanguage ?? "en");
  const s = t.bookOverview;

  // Progress calculations
  const totalChapters = book.chapters.length;
  const statusCounts: Record<string, number> = {};
  for (const ch of book.chapters) {
    statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
  }

  const draftedPlus =
    (statusCounts.drafted ?? 0) +
    (statusCounts.dev_edited ?? 0) +
    (statusCounts.line_edited ?? 0) +
    (statusCounts.beta_read ?? 0) +
    (statusCounts.beta_passed ?? 0);
  const editedPlus =
    (statusCounts.dev_edited ?? 0) +
    (statusCounts.line_edited ?? 0) +
    (statusCounts.beta_read ?? 0) +
    (statusCounts.beta_passed ?? 0);
  const betaPassedCount = statusCounts.beta_passed ?? 0;

  const pctDrafted = totalChapters > 0 ? Math.round((draftedPlus / totalChapters) * 100) : 0;
  const pctEdited = totalChapters > 0 ? Math.round((editedPlus / totalChapters) * 100) : 0;
  const pctPassed = totalChapters > 0 ? Math.round((betaPassedCount / totalChapters) * 100) : 0;

  // Word count target (use targetWordCount field or default)
  const targetWords = book.targetWordCount ?? 0;
  const currentWords = book.wordCount;
  const wordPct = targetWords > 0 ? Math.min(Math.round((currentWords / targetWords) * 100), 100) : 0;

  // Average beta score
  const chaptersWithScores = book.chapters.filter((ch) => ch.betaScore != null);
  const avgBetaScore =
    chaptersWithScores.length > 0
      ? (
          chaptersWithScores.reduce((sum, ch) => sum + (ch.betaScore ?? 0), 0) /
          chaptersWithScores.length
        ).toFixed(1)
      : null;

  // Next recommended workflow
  let nextWorkflowId: string | null = null;
  let nextWorkflowReason: string = "";
  const hasFingerprint = book.documents.some((d) => d.type === "FINGERPRINT");
  const hasBible = book.documents.some((d) => d.type === "STORY_BIBLE");
  const hasArch = book.documents.some((d) => d.type === "ARCHITECTURE");

  if (!hasFingerprint) {
    nextWorkflowId = "capture-style";
    nextWorkflowReason = "Capture your writing style fingerprint to guide all AI agents";
  } else if (!hasBible) {
    nextWorkflowId = "create-story-bible";
    nextWorkflowReason = "Create a Story Bible to define characters, world, and lore";
  } else if (!hasArch) {
    nextWorkflowId = "build-architecture";
    nextWorkflowReason = "Build the narrative architecture and plot structure";
  } else {
    const undrafted = book.chapters.find(
      (ch) => ch.status === "undiscussed" || ch.status === "discussed" || ch.status === "planned"
    );
    const needsDevEdit = book.chapters.find((ch) => ch.status === "drafted");
    const needsLineEdit = book.chapters.find((ch) => ch.status === "dev_edited");
    const needsBetaRead = book.chapters.find((ch) => ch.status === "line_edited");

    if (needsDevEdit) {
      nextWorkflowId = "dev-edit";
      nextWorkflowReason = `Ch. ${needsDevEdit.chapterNumber} is drafted and ready for developmental editing`;
    } else if (needsLineEdit) {
      nextWorkflowId = "line-edit";
      nextWorkflowReason = `Ch. ${needsLineEdit.chapterNumber} is dev-edited and ready for line editing`;
    } else if (needsBetaRead) {
      nextWorkflowId = "beta-read";
      nextWorkflowReason = `Ch. ${needsBetaRead.chapterNumber} is line-edited and ready for beta reading`;
    } else if (undrafted) {
      if (undrafted.status === "planned") {
        nextWorkflowId = "write-chapter";
        nextWorkflowReason = `Ch. ${undrafted.chapterNumber} is planned and ready to be written`;
      } else if (undrafted.status === "discussed") {
        nextWorkflowId = "plan-chapter";
        nextWorkflowReason = `Ch. ${undrafted.chapterNumber} has been discussed and needs a plan`;
      } else {
        nextWorkflowId = "discuss-chapter";
        nextWorkflowReason = `Ch. ${undrafted.chapterNumber} is ready to be discussed with the AI`;
      }
    } else if (pendingFindings > 0) {
      nextWorkflowId = "discuss-edits";
      nextWorkflowReason = `${pendingFindings} editorial findings need review`;
    } else {
      nextWorkflowId = "publishing-check";
      nextWorkflowReason = "All chapters complete — run a pre-publication check";
    }
  }

  const nextWorkflow = nextWorkflowId ? getWorkflow(nextWorkflowId) : null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold">{book.name}</h1>
            <Badge variant="secondary" className="capitalize">
              {book.status}
            </Badge>
          </div>
          {book.genre && (
            <p className="text-sm text-muted-foreground mt-1">{book.genre}</p>
          )}
          {book.series && (
            <p className="text-sm text-muted-foreground">
              <Link href={`/series/${book.series.id}`} className="hover:underline">
                {book.series.title}
              </Link>{" "}
              &mdash; Book #{book.bookNumber}
            </p>
          )}
          {/* Synopsis */}
          {book.description && (
            <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
              {book.description}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button asChild variant="outline" size="sm">
            <Link href={`/books/${bookId}/settings`}>
              <SettingsIcon className="mr-1 size-4" />
              {s.settingsBtn}
            </Link>
          </Button>
        </div>
      </div>

      {/* Recommended Next Step Banner */}
      {nextWorkflow && (
        <Card className="mb-8 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="rounded-full bg-primary/10 p-2 shrink-0">
                <PlayIcon className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t.journey.recommended}: {getWorkflowLabel(nextWorkflowId, user.preferredLanguage ?? "en")}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {nextWorkflowReason}
                </p>
              </div>
            </div>
            <StartWorkflowButton workflowId={nextWorkflowId!} />
          </CardContent>
        </Card>
      )}

      {/* Progress Meter + Word Target */}
      {totalChapters > 0 && (
        <div className="grid gap-4 lg:grid-cols-2 mb-8">
          {/* Book Progress Meter */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Book Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Drafted</span>
                  <span className="font-medium">{pctDrafted}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${pctDrafted}%` }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Edited</span>
                  <span className="font-medium">{pctEdited}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pctEdited}%` }} />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Beta Passed</span>
                  <span className="font-medium">{pctPassed}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctPassed}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Word Count Target */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Word Count</CardTitle>
                {targetWords > 0 && (
                  <TargetIcon className="size-4 text-muted-foreground" />
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {currentWords.toLocaleString(locale)}
              </div>
              {targetWords > 0 ? (
                <div className="mt-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">
                      of {targetWords.toLocaleString(locale)} target
                    </span>
                    <span className="font-medium">{wordPct}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${wordPct}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">
                  Set a target in book settings
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {s.words}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">
              {book.wordCount.toLocaleString(locale)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {s.chapters}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{book.chapters.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {s.documents}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{book._count.documents}</div>
          </CardContent>
        </Card>
        {avgBetaScore && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s.avgBetaScore}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xl font-bold">
                {avgBetaScore}<span className="text-sm text-muted-foreground">/10</span>
              </div>
            </CardContent>
          </Card>
        )}
        <MemoryStatsCard bookId={bookId} />
      </div>

      {/* Recent Agent Sessions + Pending Findings */}
      {(recentSessions.length > 0 || pendingFindings > 0) && (
        <div className="grid gap-4 lg:grid-cols-2 mb-8">
          {/* Recent Agent Sessions */}
          {recentSessions.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Recent Agent Sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <BotIcon className="size-3.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-medium truncate block">
                        {getWorkflowLabel(session.workflowId, user.preferredLanguage ?? "en")}
                      </span>
                      <div className="flex gap-2 text-[10px] text-muted-foreground">
                        <span>
                          {((session.tokensInput + session.tokensOutput) / 1000).toFixed(0)}k tok
                        </span>
                        {session.startedAt && (
                          <span>{timeAgo(session.startedAt)}</span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={session.status === "completed" ? "secondary" : "outline"}
                      className="text-[10px] capitalize shrink-0"
                    >
                      {session.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Pending Findings */}
          {pendingFindings > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Editorial Findings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-2xl font-bold">{pendingFindings}</span>
                    <span className="text-sm text-muted-foreground ml-2">
                      findings need review
                    </span>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/books/${bookId}/editorial`}>
                      Review
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Setup Incomplete Banner — hide if all foundational steps are done */}
      {(() => {
        const hasBasics = !!(book.name && book.genre);
        const hasChaptersLoaded = book.chapters.length > 0;
        // If all real setup steps are complete, treat as fully done (even if wizard flag was never set)
        const allRealStepsDone = hasBasics && hasChaptersLoaded && hasFingerprint && hasBible && hasArch;
        if (book.settings?.setupComplete || allRealStepsDone) return null;

        let stepsDone = 0;
        if (hasBasics) stepsDone++;
        if (hasChaptersLoaded) stepsDone++;
        if (hasFingerprint) stepsDone++;
        if (hasBible) stepsDone++;
        if (hasArch) stepsDone++;
        return (
          <Card className="mb-8 border-dashed border-primary/50 bg-primary/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <SparklesIcon className="size-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium">
                    {s.completeSetup} &mdash; {stepsDone}/5
                  </p>
                  <p className="text-xs text-muted-foreground">{s.setupDescription}</p>
                </div>
              </div>
              <Button asChild size="sm">
                <Link href={`/books/${bookId}/setup`}>{s.startSetup}</Link>
              </Button>
            </CardContent>
          </Card>
        );
      })()}

      {/* Chapters: List / Canvas / Pipeline views */}
      <BookViewSwitcher
        bookId={bookId}
        language={book.language}
        chapters={book.chapters.map((ch) => ({
          id: ch.id,
          chapterNumber: ch.chapterNumber,
          title: ch.title,
          status: ch.status,
          wordCount: ch.wordCount,
          actNumber: ch.actNumber,
          targetWordCount: ch.targetWordCount,
          betaScore: ch.betaScore,
        }))}
        labels={s}
      />

      {/* AI Insights & Writing Tools */}
      <div className="grid gap-4 lg:grid-cols-2 mt-8 mb-8">
        {/* Story Radar — proactive AI monitoring */}
        <StoryRadar bookId={bookId} />

        {/* Daily Writing Plan */}
        <DailyWritingPlan bookId={bookId} />
      </div>

      {/* Proactive Notifications */}
      <div className="mb-8">
        <ProactiveNotifications
          bookId={bookId}
          chapters={book.chapters.map((ch) => ({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            status: ch.status,
            updatedAt: ch.updatedAt.toISOString(),
          }))}
          pendingFindings={pendingFindings}
          currentStreak={currentStreak}
          todayWords={todayWords}
        />
      </div>

      {/* Writing Heatmap — daily activity over the past year */}
      <div className="mb-8">
        <WritingHeatmap
          data={dailyCounts}
          currentStreak={currentStreak}
          bestStreak={bestStreak}
          totalWords={periodWords}
          locale={localeFor(user.preferredLanguage ?? "en")}
        />
      </div>

      {/* Chapter Word Goals */}
      <div className="mb-8">
        <ChapterWordGoals
          bookId={bookId}
          chapters={book.chapters.map((ch) => ({
            id: ch.id,
            chapterNumber: ch.chapterNumber,
            title: ch.title,
            wordCount: ch.wordCount,
            targetWordCount: ch.targetWordCount,
          }))}
          bookTarget={book.targetWordCount ?? undefined}
          bookCurrentWords={book.wordCount}
        />
      </div>

      {/* Gamification: Milestones & Lifetime Stats */}
      <div className="grid gap-4 lg:grid-cols-2 mb-8">
        <MilestoneRewards
          totalWords={book.wordCount}
          currentStreak={currentStreak}
          chaptersComplete={draftedPlus}
        />
        <LifetimeStats
          totalWords={book.wordCount}
          totalChapters={totalChapters}
          totalSessions={recentSessions.length}
          longestStreak={bestStreak}
          totalDaysWriting={activeDays}
        />
      </div>

      {/* Draft Complete Certificate — celebrate when all chapters are drafted! */}
      {pctDrafted === 100 && totalChapters > 0 && (
        <div className="mb-8">
          <DraftCertificate
            bookTitle={book.name}
            authorName={user.displayName ?? "Author"}
            wordCount={book.wordCount}
            chapterCount={totalChapters}
            completionDate={book.updatedAt.toISOString()}
            daysToComplete={Math.max(1, Math.ceil((Date.now() - new Date(book.createdAt).getTime()) / (1000 * 60 * 60 * 24)))}
          />
        </div>
      )}

      {/* Documents */}
      {book.documents.length > 0 && (
        <div>
          <h2 className="font-display text-lg font-semibold mb-4">
            {s.documents}
          </h2>
          <div className="grid gap-2">
            {book.documents.map((doc) => (
              <Link
                key={doc.id}
                href={`/books/${bookId}/documents/${doc.id}`}
                className="flex items-center gap-3 rounded-md border px-4 py-2 hover:bg-muted/50 transition-colors"
              >
                <FileTextIcon className="size-4 text-muted-foreground" />
                <span className="text-sm truncate min-w-0">{doc.title || doc.type}</span>
                <Badge variant="outline" className="ml-auto text-xs">
                  {doc.type.replace(/_/g, " ")}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  v{doc.currentVersion}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
