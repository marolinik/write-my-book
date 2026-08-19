/**
 * 44i3 — import fidelity check (Gerald's exit criterion: "zero words lost").
 * Splits the source .md on its own chapter headings and diffs each chapter against
 * what the product stored, over real HTTP. Reports byte-exactness, unicode survival
 * and any normalisation the importer applied — honestly, whatever the answer is.
 *
 * Usage: npx tsx --env-file=.env import-fidelity.ts <bookId> <fixtureMd> <outFile>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const BASE = process.env.QA_BASE ?? "http://localhost:3001";
const SECRET = process.env.E2E_TEST_SECRET!;
const H = { "x-e2e-test-secret": SECRET, "x-e2e-clerk-id": "user_qa_p2cold" };
const [bookId, fixturePath, outFile, typedInShot44j] = process.argv.slice(2);
// Shot 44j deliberately typed a sentence into chapter 1 of this very book. That
// insertion is removed here so the comparison measures the IMPORTER, not the capture.

const norm = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n{2,}/g, "\n\n").trim();

(async () => {
  const src = readFileSync(fixturePath, "utf8");
  const blocks = src.split(/^# /m).filter(Boolean).map((b) => "# " + b);
  const chRes = await fetch(`${BASE}/api/books/${bookId}/chapters`, { headers: H });
  const chJson = await chRes.json();
  const chapters = (Array.isArray(chJson) ? chJson : chJson.chapters).sort((a: { chapterNumber: number }, b: { chapterNumber: number }) => a.chapterNumber - b.chapterNumber);

  const lines: string[] = [];
  lines.push(`# 44i3 — import fidelity: source .md vs stored chapters`);
  lines.push(`# ${new Date().toISOString()} · book ${bookId} · identity user_qa_p2cold`);
  lines.push(`# source: ${fixturePath} (${Buffer.byteLength(src, "utf8")} bytes, ${blocks.length} heading blocks)`);
  lines.push("");
  const UNICODE = ["Zürich", "Łódź", "Kőszeg", "Białystok", "Đorđe", "Söderberg", "Ana-Lucía", "Þórunn", "—", "“", "”", "‘", "’"];
  let allBodyExact = true;
  let srcCharsTotal = 0, storedCharsTotal = 0;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i];
    const r = await fetch(`${BASE}/api/books/${bookId}/chapters/${c.id}/content`, { headers: H });
    let stored: string = (await r.json()).markdown ?? "";
    if (typedInShot44j && stored.includes(typedInShot44j)) {
      stored = stored.replace(typedInShot44j, "");
      lines.push(`  [removed the ${typedInShot44j.length}-char sentence that shot 44j typed into this chapter]`);
    }
    const srcBlock = blocks[i] ?? "";
    // The importer strips the "# Chapter N: Title" heading into the chapter title.
    const srcBody = norm(srcBlock.replace(/^#\s*Chapter\s*\d+:\s*.*$/m, ""));
    const storedBody = norm(stored.replace(/^#\s*Chapter\s*\d+:\s*.*$/m, ""));
    srcCharsTotal += srcBody.length;
    storedCharsTotal += storedBody.length;
    const exact = srcBody === storedBody;
    if (!exact) allBodyExact = false;
    const missingUnicode = UNICODE.filter((u) => srcBody.includes(u) && !storedBody.includes(u));
    lines.push(`ch${c.chapterNumber} "${c.title}"`);
    lines.push(`  src  body: ${srcBody.length} chars  sha256 ${createHash("sha256").update(srcBody).digest("hex").slice(0, 16)}`);
    lines.push(`  kept body: ${storedBody.length} chars  sha256 ${createHash("sha256").update(storedBody).digest("hex").slice(0, 16)}`);
    lines.push(`  BODY_BYTE_EXACT (after newline normalisation) = ${exact}`);
    lines.push(`  unicode tokens present in source but LOST in storage: ${missingUnicode.length === 0 ? "none" : missingUnicode.join(", ")}`);
    if (!exact) {
      // Report the first divergence so the failure is auditable, not just asserted.
      let k = 0; while (k < Math.min(srcBody.length, storedBody.length) && srcBody[k] === storedBody[k]) k++;
      lines.push(`  first divergence at char ${k}:`);
      lines.push(`    src  …${JSON.stringify(srcBody.slice(Math.max(0, k - 60), k + 60))}`);
      lines.push(`    kept …${JSON.stringify(storedBody.slice(Math.max(0, k - 60), k + 60))}`);
    }
    lines.push("");
  }
  lines.push(`SOURCE_BODY_CHARS = ${srcCharsTotal}`);
  lines.push(`STORED_BODY_CHARS = ${storedCharsTotal}`);
  lines.push(`DELTA_CHARS = ${storedCharsTotal - srcCharsTotal}`);
  lines.push(`ALL_CHAPTER_BODIES_BYTE_EXACT = ${allBodyExact}`);
  const text = lines.join("\n") + "\n";
  writeFileSync(outFile, text, "utf8");
  process.stdout.write(text.slice(0, 4000));
})();
