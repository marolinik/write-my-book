import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getDailyWordCounts, computeStreaks } from "@/lib/writing-stats";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { bookProgressPercent } from "@/lib/book/progress";
import { PrintButton } from "@/components/reports/print-button";

// UDG round-6 (Darko): a printable/shareable one-page snapshot of a book's
// status and analytics. Server-rendered (owner-scoped, requireUser), reuses the
// same computations as the overview page, and is optimized for Cmd+P via
// `print:` utilities (first use in the app). A co-editor on the account can open
// this URL and print/export it; account-less external sharing is a later fix.

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ bookId: string }>;
}): Promise<Metadata> {
  const user = await requireUser();
  const { bookId } = await params;
  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { name: true },
  });
  if (!book) return { title: "Not found" };
  return { title: `${book.name} — Snapshot` };
}

export default async function BookSnapshotPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;

  const [book, health, pendingFindings, appliedFindings] = await Promise.all([
    db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: {
        chapters: {
          select: { id: true, chapterNumber: true, title: true, status: true, betaScore: true },
          orderBy: { chapterNumber: "asc" },
        },
        series: { select: { id: true, title: true } },
      },
    }),
    db.bookHealthSnapshot.findUnique({ where: { bookId } }),
    db.editFinding.count({ where: { bookId, status: "pending" } }),
    db.editFinding.count({ where: { bookId, status: "applied" } }),
  ]);
  if (!book) notFound();

  const t = getUIStrings(user.preferredLanguage ?? "en");
  const locale = localeFor(user.preferredLanguage ?? "en");
  const s = t.snapshot;

  const totalChapters = book.chapters.length;
  const statusCounts: Record<string, number> = {};
  for (const ch of book.chapters) statusCounts[ch.status] = (statusCounts[ch.status] ?? 0) + 1;
  const draftedPlus =
    (statusCounts.drafted ?? 0) + (statusCounts.dev_edited ?? 0) + (statusCounts.line_edited ?? 0) + (statusCounts.beta_read ?? 0) + (statusCounts.beta_passed ?? 0);
  const betaPassedCount = statusCounts.beta_passed ?? 0;
  const pctDrafted = totalChapters > 0 ? Math.round((draftedPlus / totalChapters) * 100) : 0;
  const pctPassed = totalChapters > 0 ? Math.round((betaPassedCount / totalChapters) * 100) : 0;

  const targetWords = book.targetWordCount ?? 0;
  const wordPct = targetWords > 0 ? Math.min(Math.round((book.wordCount / targetWords) * 100), 100) : 0;

  const chaptersWithScores = book.chapters.filter((ch) => ch.betaScore != null);
  const avgBetaScore =
    chaptersWithScores.length > 0
      ? (chaptersWithScores.reduce((sum, ch) => sum + (ch.betaScore ?? 0), 0) / chaptersWithScores.length).toFixed(1)
      : null;

  const dailyCounts = await getDailyWordCounts({ bookId, days: 30 });
  const { currentStreak, bestStreak, activeDays } = computeStreaks(dailyCounts);

  const progress = bookProgressPercent(book as never);

  const exportedOn = new Date().toLocaleDateString(locale, {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8 print:p-0" data-snapshot>
      {/* Print/app chrome toggle: hide the toolbar in print via print:hidden */}
      <div className="mb-6 flex max-w-3xl items-center justify-between print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold">{s.title}</h1>
          <p className="text-sm text-muted-foreground">{s.subtitle}</p>
        </div>
        <PrintButton />
      </div>

      <main className="mx-auto max-w-3xl space-y-8">
        {/* Header block */}
        <header className="border-b pb-4">
          <h1 className="font-display text-3xl font-bold">{book.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {book.series ? `${book.series.title} · ` : ""} {s.exportedOn}: {exportedOn}
          </p>
        </header>

        {/* Progress row */}
        <section className="grid gap-4 sm:grid-cols-2">
          <Stat label={s.bookProgress} value={`${progress}%`} />
          <Stat label={s.words} value={book.wordCount.toLocaleString(locale)} />
          <Stat label={s.chapters} value={`${draftedPlus}/${totalChapters}`} detail={s.chaptersDrafted} />
          <Stat label={s.betaAvg} value={avgBetaScore ?? "–"} detail={s.editedPlus} />
        </section>

        {/* Health / status details */}
        <section className="rounded-lg border p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {s.status}
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <Detail label={s.draftedV} value={`${pctDrafted}%`} />
            <Detail label={`${s.passBeta}${s.colon}`} value={`${pctPassed}%`} />
            <Detail label={s.wordsOfTarget} value={targetWords > 0 ? `${wordPct}%` : "–"} />
            <Detail label={s.currentStreak} value={currentStreak > 0 ? `${currentStreak}` : "–"} />
            <Detail label={s.bestStreak} value={bestStreak > 0 ? `${bestStreak}` : "–"} />
            <Detail label={s.activeDays} value={`${activeDays}`} />
            <Detail label={s.pendingFindingsLabel} value={`${pendingFindings}`} />
            <Detail label={s.appliedFindingsLabel} value={`${appliedFindings}`} />
            <Detail
              label={s.healthScore}
              value={health?.overallScore != null ? String(health.overallScore) : "–"}
            />
          </dl>
          {health?.alerts && Array.isArray(health.alerts) && health.alerts.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {s.alerts}: {(health.alerts as unknown as string[]).join(" · ")}
            </p>
          )}
        </section>

        {/* Per-chapter table */}
        <section className="rounded-lg border">
          <div className="border-b px-4 py-2 text-sm font-semibold">{s.chapterStatus}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">{s.colon.replace(":", "")} #</th>
                <th className="px-4 py-2">{s.name}</th>
                <th className="px-4 py-2">{s.status}</th>
                <th className="px-4 py-2">{s.betaScore}</th>
              </tr>
            </thead>
            <tbody>
              {book.chapters.map((ch) => (
                <tr key={ch.id} className="border-b last:border-0">
                  <td className="px-4 py-2">{ch.chapterNumber}</td>
                  <td className="px-4 py-2">{ch.title ?? `Ch. ${ch.chapterNumber}`}</td>
                  <td className="px-4 py-2">{ch.status}</td>
                  <td className="px-4 py-2">{ch.betaScore != null ? ch.betaScore.toFixed(1) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}