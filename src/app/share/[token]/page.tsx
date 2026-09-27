import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { isValidShareToken, clientIpFrom, publicShareLimiter } from "@/lib/share/token";
import { loadShareBook, loadShareEditorial } from "@/lib/share/snapshot-data";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ token: string }> };

/**
 * The one decision about whether this request may see the snapshot: a
 * well-formed token, a client inside the public rate limit, a link that exists
 * and has not expired. Null means Not Found.
 *
 * P4-S21: generateMetadata looked the book up for any token that existed,
 * while only the page checked the limiter and the expiry — so an expired or
 * throttled link's 404 still streamed the book's current name in its metadata.
 * Both now ask this. React's cache runs it once per request, so a page view
 * counts against the limiter once, not twice.
 */
const resolveShare = cache(async (token: string) => {
  if (!isValidShareToken(token)) return null;
  if (!publicShareLimiter.allow(clientIpFrom(await headers()))) return null;
  const snap = await db.sharedSnapshot.findUnique({ where: { token } });
  if (!snap || (snap.expiresAt && snap.expiresAt < new Date())) return null;
  return snap;
});

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { token } = await params;
  const snap = await resolveShare(token);
  if (!snap) return {};
  const book = await db.book.findFirst({
    where: { id: snap.bookId },
    select: { name: true, language: true },
  });
  if (!book) return {};
  // P4-S04: in the book's language, like the page itself (M-6).
  const s = getUIStrings(book.language).snapshot;
  return { title: `${book.name} · ${snap.kind === "editorial" ? s.editorialBrief : s.title}` };
}

export default async function SharePage({ params }: RouteParams) {
  const { token } = await params;
  const snap = await resolveShare(token);
  if (!snap) notFound();

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

  // M-6: the page is account-less, but it is not language-less — it is about
  // one book, and the people a writer shares it with read that book's
  // language. English chrome and US number formatting on a Serbian novel was
  // a choice nobody made.
  const t = getUIStrings(data.bookLanguage);
  const s = t.snapshot;
  const locale = localeFor(data.bookLanguage);

  const exportedOn = new Date().toLocaleDateString(locale, {
    year: "numeric", month: "long", day: "numeric",
  });

  // P4-S04: <html lang> follows the VIEWER (root layout), and an account-less
  // reader of a Serbian book got "en-US" around Serbian text. The content says
  // which language it is in, so a screen reader and spellcheck read it as that.
  return (
      <div lang={locale} className="min-h-screen bg-background p-4 lg:p-8 print:p-0" data-share>
        <main className="mx-auto max-w-3xl space-y-8">
          <header className="border-b pb-4">
            <h1 className="font-display text-3xl font-bold">{data.bookName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.series ? `${data.series} · ` : ""}
              {data.kind === "editorial" ? s.editorialBrief : s.title} · {s.exportedOn}: {exportedOn}
            </p>
          </header>

          <section className="grid gap-4 sm:grid-cols-2">
            <Stat label={s.words} value={data.wordCount.toLocaleString(locale)} />
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