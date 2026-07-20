/**
 * D-8 byte-verify — every finding's anchor must be a VERBATIM substring of the
 * chapter it points at. For run1's batch, pull each EditFinding's originalText
 * + anchorQuote and byte-compare against the chapter markdown fetched from the
 * live content GET route. Any anchor/original that is NOT an exact substring is
 * a misquote defect.
 *
 * Usage: tsx 06-d8-byteverify.ts <batchId> <run-label>
 */
import { db } from "@/lib/db";
import { api } from "./_helper";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const OUT = join(__dirname, "..");
const batchId = process.argv[2];
const runLabel = process.argv[3] ?? "run1";

async function main() {
  const fixture = JSON.parse(readFileSync(join(OUT, "fixture.json"), "utf8"));
  const bookId = fixture.bookId as string;
  const chapterIdByNum: Record<number, string> = {};
  for (const c of fixture.chapters) chapterIdByNum[c.chapterNumber] = c.chapterId;

  // child sessions of this batch
  const sessions = await db.agentSession.findMany({
    where: { batchId },
    select: { id: true, chapterNumber: true, status: true },
  });
  const childIds = sessions.map((s) => s.id);

  const findings = await db.editFinding.findMany({
    where: { sessionId: { in: childIds } },
    select: {
      id: true,
      sessionId: true,
      chapterNumber: true,
      severity: true,
      category: true,
      originalText: true,
      anchorQuote: true,
      locationStart: true,
      locationEnd: true,
      status: true,
      rationale: true,
    },
    orderBy: [{ chapterNumber: "asc" }, { id: "asc" }],
  });

  // fetch live chapter markdown per chapter (source of truth for the compare)
  const markdownByNum: Record<number, string> = {};
  for (const num of [1, 2, 3]) {
    const chId = chapterIdByNum[num];
    const r = await api<{ markdown: string }>(
      "GET",
      `/api/books/${bookId}/chapters/${chId}/content`
    );
    markdownByNum[num] = (r.body as { markdown: string }).markdown ?? "";
  }

  const results = findings.map((f) => {
    const md = markdownByNum[f.chapterNumber] ?? "";
    const orig = f.originalText ?? null;
    const anchor = f.anchorQuote ?? null;
    const origMatch = orig ? md.includes(orig) : null;
    const anchorMatch = anchor ? md.includes(anchor) : null;
    return {
      id: f.id,
      sessionId: f.sessionId,
      chapterNumber: f.chapterNumber,
      severity: f.severity,
      category: f.category,
      status: f.status,
      originalText: orig,
      anchorQuote: anchor,
      originalText_verbatim: origMatch,
      anchorQuote_verbatim: anchorMatch,
      rationale: f.rationale?.slice(0, 160) ?? null,
    };
  });

  // rate over findings that carry an anchor of each kind
  const withOrig = results.filter((r) => r.originalText != null);
  const withAnchor = results.filter((r) => r.anchorQuote != null);
  const origVerbatim = withOrig.filter((r) => r.originalText_verbatim);
  const anchorVerbatim = withAnchor.filter((r) => r.anchorQuote_verbatim);
  const misquotes = results.filter(
    (r) =>
      (r.originalText != null && !r.originalText_verbatim) ||
      (r.anchorQuote != null && !r.anchorQuote_verbatim)
  );

  const summary = {
    runLabel,
    batchId,
    totalFindings: findings.length,
    findingsWithOriginalText: withOrig.length,
    findingsWithAnchorQuote: withAnchor.length,
    originalText_verbatim_rate: `${origVerbatim.length}/${withOrig.length}`,
    anchorQuote_verbatim_rate: `${anchorVerbatim.length}/${withAnchor.length}`,
    misquoteCount: misquotes.length,
    misquotes: misquotes.map((m) => ({
      id: m.id,
      chapterNumber: m.chapterNumber,
      originalText: m.originalText,
      anchorQuote: m.anchorQuote,
      originalText_verbatim: m.originalText_verbatim,
      anchorQuote_verbatim: m.anchorQuote_verbatim,
    })),
    findings: results,
  };
  writeFileSync(
    join(OUT, "api-traces", `d8-byteverify-${runLabel}.json`),
    JSON.stringify(summary, null, 2)
  );
  console.log(
    JSON.stringify(
      {
        totalFindings: summary.totalFindings,
        originalText_verbatim_rate: summary.originalText_verbatim_rate,
        anchorQuote_verbatim_rate: summary.anchorQuote_verbatim_rate,
        misquoteCount: summary.misquoteCount,
      },
      null,
      2
    )
  );
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("D8 ERROR", e);
  try { await db.$disconnect(); } catch {}
  process.exit(1);
});
