/**
 * 44n2 — anchor byte-verification for D8.
 *
 * GRADING-PROTOCOL.md:21 caps D8 at 8.5 if ANY finding misquotes the manuscript, and
 * judges re-derive the anchors themselves. So this does the derivation for them and
 * publishes the table: for every finding, take its quoted anchor and search for it,
 * byte-for-byte, in the chapter content the finding points at.
 *
 * Usage: npx tsx --env-file=.env anchor-verify.ts <bookId> <outFile>
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET!;
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const [bookId, outFile] = process.argv.slice(2);

type Finding = {
  id: string; chapterNumber?: number | null; chapterId?: string | null;
  anchorQuote?: string | null; originalText?: string | null; anchorText?: string | null;
  quote?: string | null; excerpt?: string | null;
  type?: string; category?: string | null; severity?: string | null;
  agentType?: string | null; agentRole?: string | null;
  title?: string | null; description?: string | null; suggestion?: string | null;
  paragraphNumber?: number | null; locationStart?: number | null; locationEnd?: number | null;
  groundingScore?: number | null; contentHash?: string | null;
};

(async () => {
  const chRes = await fetch(`${BASE}/api/books/${bookId}/chapters`, { headers: H });
  const chJson = await chRes.json();
  const chapters = (Array.isArray(chJson) ? chJson : chJson.chapters) as Array<{ id: string; chapterNumber: number; title: string | null }>;
  const content: Record<number, string> = {};
  for (const c of chapters) {
    const r = await fetch(`${BASE}/api/books/${bookId}/chapters/${c.id}/content`, { headers: H });
    content[c.chapterNumber] = (await r.json()).markdown ?? "";
  }

  const fRes = await fetch(`${BASE}/api/books/${bookId}/editorial/findings`, { headers: H });
  const fJson = await fRes.json();
  const findings = (Array.isArray(fJson) ? fJson : fJson.findings ?? []) as Finding[];

  const rows: string[] = [];
  rows.push(`# 44n2 — dev-edit finding anchors, byte-verified against the chapter text`);
  rows.push(`# ${new Date().toISOString()} · book ${bookId} · identity user_qa_p2`);
  rows.push(`# findings endpoint: GET /api/books/:id/editorial/findings -> ${fRes.status}`);
  rows.push(`# chapters: ${chapters.map((c) => `${c.chapterNumber}:${(content[c.chapterNumber] ?? "").length}ch/sha ${createHash("sha256").update(content[c.chapterNumber] ?? "").digest("hex").slice(0, 12)}`).join("  ")}`);
  rows.push("");
  rows.push(`TOTAL_FINDINGS = ${findings.length}`);
  rows.push("");
  let anchored = 0, exact = 0, misquoted = 0;
  const misses: string[] = [];
  for (const f of findings) {
    const anchor = (f.anchorQuote ?? f.originalText ?? f.anchorText ?? f.quote ?? f.excerpt ?? "").trim();
    const chNo = f.chapterNumber ?? chapters.find((c) => c.id === f.chapterId)?.chapterNumber ?? null;
    const hay = chNo != null ? (content[chNo] ?? "") : Object.values(content).join("\n");
    rows.push(`- id=${f.id} ch=${chNo} category=${f.category ?? f.type ?? "?"} severity=${f.severity ?? "?"} agent=${f.agentType ?? f.agentRole ?? "?"} para=${f.paragraphNumber ?? "?"} grounding=${f.groundingScore ?? "?"}`);
    rows.push(`  description: ${JSON.stringify((f.title ?? f.description ?? "").slice(0, 200))}`);
    rows.push(`  suggestion:  ${JSON.stringify((f.suggestion ?? "").slice(0, 200))}`);
    if (!anchor) {
      rows.push(`  anchor: (none supplied by the finding)`);
      rows.push("");
      continue;
    }
    anchored++;
    const hit = hay.includes(anchor);
    const idx = hay.indexOf(anchor);
    if (hit) { exact++; } else { misquoted++; misses.push(f.id); }
    rows.push(`  anchor (${anchor.length} ch): ${JSON.stringify(anchor.slice(0, 200))}`);
    rows.push(`  sha256(anchor): ${createHash("sha256").update(anchor).digest("hex").slice(0, 24)}`);
    rows.push(`  VERBATIM_IN_CHAPTER = ${hit}${hit ? ` @ offset ${idx}` : ""}`);
    if (!hit) {
      // Show the closest normalised neighbourhood so the miss is auditable.
      const loose = anchor.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
      const looseHay = hay.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ");
      rows.push(`  LOOSE_MATCH (quote+whitespace normalised) = ${looseHay.includes(loose)}`);
      const probe = anchor.slice(0, 24);
      const at = hay.indexOf(probe);
      rows.push(`  first-24-char probe found = ${at >= 0}${at >= 0 ? ` → chapter reads: ${JSON.stringify(hay.slice(at, at + Math.min(anchor.length + 40, 240)))}` : ""}`);
    }
    rows.push("");
  }
  rows.push(`ANCHORED_FINDINGS = ${anchored}`);
  rows.push(`BYTE_EXACT_ANCHORS = ${exact}`);
  rows.push(`MISQUOTED_ANCHORS = ${misquoted}`);
  rows.push(`MISQUOTED_IDS = ${misses.join(", ") || "(none)"}`);
  rows.push(`D8_MISQUOTE_CAP_TRIGGERED (GRADING-PROTOCOL.md:21) = ${misquoted > 0}`);
  const text = rows.join("\n") + "\n";
  writeFileSync(outFile, text, "utf8");
  process.stdout.write(text.slice(0, 3000));
})();
