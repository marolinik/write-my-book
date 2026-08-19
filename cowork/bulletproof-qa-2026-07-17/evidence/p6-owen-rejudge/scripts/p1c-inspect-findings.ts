// Phase 1c: dump the FULL raw records of the new ch5 findings + the LINE_EDIT_REPORT
// document, to verify device-protection-by-name (not flatten), inspect the empty
// finding, the critical finding's real anchor, and scan the report for self-talk
// (D-50) and fabricated fingerprint quotations (D-49).
import { api, saveTrace, BOOK_ID } from "./_client";

const RUN_START = "2026-07-20T11:"; // this session's runs are 2026-07-20; filter loosely then refine

async function main() {
  const out: Record<string, unknown> = {};

  // Full findings for ch5
  const f = await api("GET", `/api/books/${BOOK_ID}/editorial/findings?chapterNumber=5&limit=100`);
  const all = (f.body as { findings?: Array<Record<string, unknown>> }).findings ?? [];
  // new = created today (2026-07-20)
  const news = all.filter((x) => (x.createdAt as string).startsWith("2026-07-20"));
  out["new-findings-full"] = news.map((x) => ({
    id: x.id,
    createdAt: x.createdAt,
    severity: x.severity,
    category: x.category,
    status: x.status,
    paragraphNumber: x.paragraphNumber,
    originalText: x.originalText,
    anchorQuote: x.anchorQuote,
    newText: x.newText,
    description: x.description,
    rationale: x.rationale,
    alternatives: x.alternatives,
  }));

  // Documents — find the latest LINE_EDIT_REPORT
  const docs = await api("GET", `/api/books/${BOOK_ID}/documents`);
  const dbody = docs.body as { documents?: Array<Record<string, unknown>> };
  const docList = dbody.documents ?? (docs.body as Array<Record<string, unknown>>) ?? [];
  const reports = (Array.isArray(docList) ? docList : []).filter(
    (d) => (d.type as string) === "LINE_EDIT_REPORT" || String(d.title ?? "").toLowerCase().includes("line edit")
  );
  out["report-docs-meta"] = reports.map((d) => ({
    id: d.id,
    type: d.type,
    title: d.title,
    chapterNumber: d.chapterNumber,
    updatedAt: d.updatedAt,
    createdAt: d.createdAt,
  }));

  // Fetch the newest report's content
  const newest = reports.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
  if (newest) {
    const doc = await api("GET", `/api/books/${BOOK_ID}/documents/${newest.id}`);
    const content = ((doc.body as { content?: string; markdown?: string }).content ??
      (doc.body as { markdown?: string }).markdown ?? "") as string;
    out["newest-report"] = {
      id: newest.id,
      chapterNumber: newest.chapterNumber,
      updatedAt: newest.updatedAt,
      length: content.length,
      content,
    };
    // Scan for self-talk / glitch tokens
    const selfTalkPatterns = [/wait, no/i, /— wait/i, /let me/i, /actually,? I/i, /hmm/i, /oops/i];
    const glitchTokens = ["nicht", "die-sel", "asnaczyni", "semdp", "无意", "internal-monoolog", "internal-monolog"];
    out["report-hygiene-scan"] = {
      selfTalkHits: selfTalkPatterns.map((p) => ({ p: p.toString(), hit: p.test(content) })).filter((x) => x.hit),
      glitchTokenHits: glitchTokens.filter((t) => content.includes(t)),
    };
  }

  saveTrace("p1c-inspect-findings.json", out);
  console.log(JSON.stringify(out["new-findings-full"], null, 1));
  console.log("\n--- REPORT META ---");
  console.log(JSON.stringify(out["report-docs-meta"], null, 1));
  console.log("\n--- HYGIENE SCAN ---");
  console.log(JSON.stringify(out["report-hygiene-scan"], null, 1));
}
main().catch((e) => {
  console.error("ERR", e?.stack ?? e?.message ?? e);
  process.exit(1);
});
