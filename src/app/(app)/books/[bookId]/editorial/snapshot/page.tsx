import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { PrintButton } from "@/components/reports/print-button";
import { ShareSnapshotButton } from "@/components/book/share-snapshot-button";

// UDG round-6 (Luka): a printable/shareable editorial / beta-read brief. The
// exported editorial review presented as a clean, server-rendered snapshot a
// co-editor on the account can open and print/email. Owner-scoped (requireUser);
// account-less external sharing is a later increment.
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
  return { title: `${book.name} — Editorial brief` };
}

export default async function EditorialSnapshotPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;

  const [book, findings] = await Promise.all([
    db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: {
        chapters: {
          select: { id: true, chapterNumber: true, title: true },
          orderBy: { chapterNumber: "asc" },
        },
      },
    }),
    db.editFinding.findMany({
      where: { bookId, status: "pending" },
      orderBy: [{ chapterNumber: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        chapterNumber: true,
        agentType: true,
        severity: true,
        category: true,
        description: true,
        suggestion: true,
        originalText: true,
        newText: true,
        anchorQuote: true,
        createdAt: true,
      },
    }),
  ]);
  if (!book) notFound();

  const t = getUIStrings(user.preferredLanguage ?? "en");
  const locale = localeFor(user.preferredLanguage ?? "en");
  const s = t.snapshot;

  const bySeverity: Record<string, number> = {};
  for (const f of findings) bySeverity[f.severity] = (bySeverity[f.severity] ?? 0) + 1;

  const exportedOn = new Date().toLocaleDateString(locale, {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="min-h-screen bg-background p-4 lg:p-8 print:p-0" data-snapshot>
      <div className="mb-6 flex max-w-3xl items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="font-display text-2xl font-bold">{s.editorialBrief}</h1>
          <p className="text-sm text-muted-foreground">{s.subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <ShareSnapshotButton bookId={bookId} kind="editorial" />
          <PrintButton />
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-8">
        <header className="border-b pb-4">
          <h1 className="font-display text-3xl font-bold">{book.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {s.editorialBrief} · {s.exportedOn}: {exportedOn}
          </p>
        </header>

        {/* Severity summary */}
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label={s.allFindings} value={findings.length} />
          {Object.entries(bySeverity).map(([sev, n]) => (
            <Summary key={sev} label={sev} value={n} />
          ))}
        </section>

        {/* Findings grouped by chapter */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {s.findingsList}
          </h2>
          {findings.length === 0 && <p className="text-sm text-muted-foreground">{s.noFindings}</p>}
          {book.chapters.map((ch) => {
            const chFindings = findings.filter((f) => f.chapterNumber === ch.chapterNumber);
            if (chFindings.length === 0) return null;
            return (
              <div key={ch.id} className="rounded-lg border">
                <div className="border-b px-4 py-2 text-sm font-semibold">
                  {s.chapter} {ch.chapterNumber}{ch.title ? ` — ${ch.title}` : ""}
                </div>
                <ul className="divide-y">
                  {chFindings.map((f) => (
                    <li key={f.id} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{f.severity}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5">{f.category}</span>
                        <span className="text-muted-foreground">{f.agentType}</span>
                      </div>
                      <p className="mt-1 text-sm">{f.description}</p>
                      {f.suggestion ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {s.suggestion}: {f.suggestion}
                        </p>
                      ) : null}
                      {f.anchorQuote ? (
                        <blockquote className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground">
                          “{f.anchorQuote}”
                        </blockquote>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}