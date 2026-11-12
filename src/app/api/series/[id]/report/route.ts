import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUIStrings, localeFor } from "@/lib/i18n/ui-strings";
import { db } from "@/lib/db";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * UDG round-9 (Olivera/later Igor): a server-rendered, print-friendly whole-series
 * report (series title, genre, per-book word/chapter/progress summary, and totals).
 * Served as text/html so the browser "print" produces the report directly.
 */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    // M-5: a printable report formatted its numbers in the SERVER locale.
    const language = user.preferredLanguage ?? "en";
    const locale = localeFor(language);
    // Wave 7: every word of the report comes from the writer's dictionary.
    const r = getUIStrings(language).seriesReport;
    const { id: seriesId } = await params;

    const series = await db.series.findFirst({
      where: { id: seriesId, userId: user.id },
    });
    if (!series) {
      return NextResponse.json({ error: "Series not found" }, { status: 404 });
    }

    const books = await db.book.findMany({
      where: { seriesId },
      orderBy: { bookNumber: "asc" },
      select: {
        bookNumber: true,
        name: true,
        status: true,
        wordCount: true,
        createdAt: true,
        _count: { select: { chapters: true, documents: true } },
      },
    });

    const totalWords = books.reduce((s, b) => s + b.wordCount, 0);
    const totalChapters = books.reduce((s, b) => s + b._count.chapters, 0);
    const totalDocs = books.reduce((s, b) => s + b._count.documents, 0);
    const date = new Date().toISOString().slice(0, 10);
    const statusLabels: Record<string, string> = {
      concept: r.concept,
      planning: r.planning,
      writing: r.writing,
      editing: r.editing,
      beta: r.beta,
      export: r.export,
      complete: r.complete,
    };
    const statusLabel = (s: string) => statusLabels[s] ?? s;

    const rows = books
      .map(
        (b) => `
      <tr>
        <td>${b.bookNumber}</td>
        <td>${escapeHtml(b.name)}</td>
        <td>${escapeHtml(statusLabel(b.status || "concept"))}</td>
        <td class="num">${b._count.chapters}</td>
        <td class="num">${b._count.documents}</td>
        <td class="num">${b.wordCount.toLocaleString(locale)}</td>
      </tr>`
      )
      .join("\n");

    const html = `<!DOCTYPE html>
<html lang="${escapeHtml(language)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(r.title)}: ${escapeHtml(series.title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, sans-serif; color: #111; max-width: 820px; margin: 32px auto; padding: 0 16px; line-height: 1.5; }
  h1 { margin: 0 0 2px; font-size: 26px; }
  .meta { color: #555; font-size: 14px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 14px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e2e2; }
  th { background: #f6f6f6; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .totals { display: flex; gap: 24px; margin-top: 18px; font-size: 15px; font-weight: 600; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
  <h1>${escapeHtml(series.title)}</h1>
  <div class="meta">
    ${escapeHtml(r.title)} · ${series.genre ? escapeHtml(series.genre) + " · " : ""}${books.length} ${escapeHtml(books.length === 1 ? r.bookOne : r.bookMany)} · ${escapeHtml(r.generated.replace("{date}", date))}
    ${series.description ? `<p style="margin:8px 0 0;max-width:70ch">${escapeHtml(series.description)}</p>` : ""}
  </div>
  <table>
    <thead>
      <tr><th>#</th><th>${escapeHtml(r.book)}</th><th>${escapeHtml(r.status)}</th><th class="num">${escapeHtml(r.chapters)}</th><th class="num">${escapeHtml(r.documents)}</th><th class="num">${escapeHtml(r.words)}</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <span>${escapeHtml(r.books)}: ${books.length}</span>
    <span>${escapeHtml(r.chapters)}: ${totalChapters}</span>
    <span>${escapeHtml(r.documents)}: ${totalDocs}</span>
    <span>${escapeHtml(r.words)}: ${totalWords.toLocaleString(locale)}</span>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("GET /api/series/:id/report error:", error);
    return NextResponse.json(
      { error: "Failed to generate series report" },
      { status: 500 }
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}