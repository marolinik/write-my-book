import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isValidShareToken, clientIpFrom, publicShareLimiter } from "@/lib/share/token";
import { loadShareBook, loadShareEditorial } from "@/lib/share/snapshot-data";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { token } = await params;
  if (!isValidShareToken(token)) return { title: "Share" };
  const snap = await db.sharedSnapshot.findUnique({ where: { token }, select: { bookId: true } });
  if (!snap) return { title: "Share" };
  const book = await db.book.findFirst({ where: { id: snap.bookId }, select: { name: true } });
  return { title: book ? `${book.name} · shared snapshot` : "Shared snapshot" };
}

export default async function SharePage({ params }: RouteParams) {
  const { token } = await params;
  if (!isValidShareToken(token)) notFound();

  // Public rate limit.
  const h = await headers();
  if (!publicShareLimiter.allow(clientIpFrom(h))) notFound();

  const snap = await db.sharedSnapshot.findUnique({ where: { token } });
  if (!snap || (snap.expiresAt && snap.expiresAt < new Date())) notFound();

  // Account-less: default to English chrome (share links are meant to be opened by anyone).
  const t = getUIStrings("en");
  const s = t.snapshot;

  let data: Awaited<ReturnType<typeof loadShareBook>>;
  try {
    data =
      snap.kind === "editorial"
        ? await loadShareEditorial(snap.bookId, snap.createdById)
        : await loadShareBook(snap.bookId, snap.createdById);
  } catch {
    notFound();
    return; // unreachable; keeps TS satisfied after notFound()
  }

  db.sharedSnapshot
    .update({ where: { token }, data: { lastViewedAt: new Date() } })
    .catch(() => undefined);

  const exportedOn = new Date().toLocaleDateString(localeFor("en"), {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
      <div className="min-h-screen bg-background p-4 lg:p-8 print:p-0" data-share>
        <main className="mx-auto max-w-3xl space-y-8">
          <header className="border-b pb-4">
            <h1 className="font-display text-3xl font-bold">{data.bookName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.series ? `${data.series} · ` : ""}
              {data.kind === "editorial" ? s.editorialBrief : s.title} · {s.exportedOn}: {exportedOn}
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-2">
            <Stat label={s.words} value={data.wordCount.toLocaleString("en")} />
            <Stat label={s.chapters} value={`${data.pctDrafted}% · ${data.chapters.length}`} detail={s.chaptersDrafted} />
            <Stat label={s.betaAvg} value={data.avgBetaScore ?? "–"} />
            <Stat
              label={s.bookProgress}
              value={data.pctPassed !== undefined ? `${data.pctPassed}%` : "–"}
              detail={s.bookProgress}
            />
          </section>

          <section className="rounded-lg border p-4">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {s.status}
            </h2>
            <p className="text-sm text-muted-foreground">{data.bookStatusNote}</p>
          </section>

          {snap.kind === "editorial" && data.findingsTotal > 0 && (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {s.findingsList} · {data.findingsTotal}
              </h2>
              {data.findingsByChapter.map((g) => (
                <div key={g.chapterNumber} className="rounded-lg border">
                  <div className="border-b px-4 py-2 text-sm font-semibold">
                    {s.chapter} {g.chapterNumber}
                  </div>
                  <ul className="divide-y">
                    {(g.findings as { severity: string; category: string; description: string }[]).map((f, i) => (
                      <li key={i} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{f.severity}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5">{f.category}</span>
                        </div>
                        <p className="mt-1 text-sm">{f.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          )}

          {snap.kind === "book" && data.analysisHasReport && data.readability && (
            <section className="rounded-lg border p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {s.analytics}
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Detail label={s.fleschKincaid} value={data.readability.fleschKincaid.toFixed(1)} />
                <Detail label={s.gunningFog} value={data.readability.gunningFog.toFixed(1)} />
                <Detail label={s.colemanLiau} value={data.readability.colemanLiau.toFixed(1)} />
              </dl>
            </section>
          )}
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