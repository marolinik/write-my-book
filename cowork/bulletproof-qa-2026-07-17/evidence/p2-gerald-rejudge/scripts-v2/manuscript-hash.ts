/**
 * Byte-integrity ledger for Gerald's canonical manuscript.
 * Fetches every chapter's markdown over real HTTP as user_qa_p2 and prints
 * sha256 + byte length + word count. Run before and after the capture wave;
 * the two outputs must be byte-identical (P2's persona core = never lose a word).
 *
 * Usage: npx tsx --env-file=.env manuscript-hash.ts <outFile>
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET;
const BOOK = "636a1f02-8520-4b66-8e78-08c8e0fee5f0";
if (!SECRET) { console.error("FATAL: E2E_TEST_SECRET missing"); process.exit(1); }
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2" };
const out = process.argv[2];

(async () => {
  const lines: string[] = [];
  lines.push(`# Manuscript byte-integrity ledger — "Dead Reckoning 31 QA P2" (${BOOK})`);
  lines.push(`# captured ${new Date().toISOString()} · base ${BASE} · identity user_qa_p2 (e2e headers)`);
  const chRes = await fetch(`${BASE}/api/books/${BOOK}/chapters`, { headers: H });
  const chJson = await chRes.json();
  const chapters = (Array.isArray(chJson) ? chJson : chJson.chapters) as Array<{ id: string; chapterNumber: number; title: string | null; wordCount: number }>;
  lines.push(`# chapter rows: ${chapters.length}`);
  lines.push("");
  lines.push("chNo | title | wordCount(row) | bytes | words(text) | sha256");
  let totalBytes = 0;
  for (const c of chapters.sort((a, b) => a.chapterNumber - b.chapterNumber)) {
    const r = await fetch(`${BASE}/api/books/${BOOK}/chapters/${c.id}/content`, { headers: H });
    const j = await r.json();
    const md: string = j.markdown ?? "";
    const buf = Buffer.from(md, "utf8");
    totalBytes += buf.length;
    const sha = createHash("sha256").update(buf).digest("hex");
    const words = md.trim() ? md.trim().split(/\s+/).length : 0;
    lines.push(`${c.chapterNumber} | ${c.title} | ${c.wordCount} | ${buf.length} | ${words} | ${sha}`);
  }
  lines.push("");
  lines.push(`TOTAL_BYTES = ${totalBytes}`);
  const text = lines.join("\n") + "\n";
  if (out) writeFileSync(out, text, "utf8");
  process.stdout.write(text);
})();
