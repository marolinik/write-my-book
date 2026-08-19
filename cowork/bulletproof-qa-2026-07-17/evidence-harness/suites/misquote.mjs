// suites/misquote.mjs — G4: finding-misquote rate, >=100 findings, >=5 chapters, 0/N.
//
// (W-F3 §3.2 row 1, T9.) Seeds a book for user_qa_h1 from the committed corpus,
// runs editorial agent passes until >=N findings accumulate, then byte-searches
// EVERY finding's anchorText in the chapter content fetched FRESH from the API. A
// finding whose anchor text is not a verbatim substring of the chapter is a
// misquote (the D-40/D-49 fabrication class, mechanized).
//
// Needs: live app + single worker + qwen key. Long wall-clock — run in background.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { byteSubstring } from "../core/assertions.mjs";
import { withBracket, coverageCheck } from "./_lib.mjs";

const CORPUS_DIR = join(process.cwd(), "cowork/bulletproof-qa-2026-07-17/evidence-harness/corpora/misquote");

export async function run(ctx) {
  const { http, store, scenario } = ctx;
  const targetN = scenario?.preRegistered?.n ?? 100;
  if (!existsSync(CORPUS_DIR)) throw new Error(`[misquote] corpus missing at ${CORPUS_DIR} — assemble + commit it first (T9)`);

  const chapterFiles = readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md") || f.endsWith(".txt")).sort();
  if (chapterFiles.length < 5) throw new Error(`[misquote] need >=5 chapters, corpus has ${chapterFiles.length}`);

  const checks = [];

  return withBracket(ctx, "wp-misquote-1", async (bracket) => {
    // 1. Create book + import chapters.
    const created = await http.request("create-book", { method: "POST", path: "/api/books", body: { title: "Harness Misquote Corpus" }, bracket });
    const book = JSON.parse(created.bodyBytes.toString("utf8"));
    const bookId = book.id ?? book.book?.id;

    /** @type {Array<{ chapterId: string, contentArtifact: string }>} */
    const chapters = [];
    for (const f of chapterFiles) {
      const content = readFileSync(join(CORPUS_DIR, f), "utf8");
      const imp = await http.request(`import-${f}`, { method: "POST", path: `/api/books/${bookId}/import`, body: { title: f, content }, bracket });
      const ch = JSON.parse(imp.bodyBytes.toString("utf8"));
      const chapterId = ch.id ?? ch.chapter?.id;
      // Fetch the stored content FRESH — the anchor must match what the product stored.
      const fresh = await http.request(`content-${f}`, { method: "GET", path: `/api/books/${bookId}/chapters/${chapterId}/content`, bracket });
      chapters.push({ chapterId, file: f, contentArtifact: fresh.resArtifact.path });
    }

    // 2. Run editorial passes until >=N findings accumulate.
    const findingsByChapter = new Set();
    let findings = [];
    let round = 0;
    while (findings.length < targetN && round < 12) {
      round += 1;
      for (const kind of ["dev-edit", "line-edit", "beta-read"]) {
        await http.request(`agent-${kind}-r${round}`, { method: "POST", path: `/api/books/${bookId}/agent`, body: { kind, scope: "book" }, bracket, measurement: true });
      }
      const fres = await http.request(`findings-r${round}`, { method: "GET", path: `/api/books/${bookId}/editorial/findings`, bracket, measurement: true });
      const payload = JSON.parse(fres.bodyBytes.toString("utf8"));
      findings = payload.findings ?? payload ?? [];
    }

    // 3. One byte-match check per finding against the fresh chapter content.
    const contentByChapter = new Map(chapters.map((c) => [c.chapterId, c.contentArtifact]));
    findings.slice(0, Math.max(findings.length, 0)).forEach((f, i) => {
      const anchor = f.anchorText ?? f.anchor ?? "";
      const artifact = contentByChapter.get(f.chapterId) ?? chapters[0]?.contentArtifact;
      if (!anchor || !artifact) return;
      findingsByChapter.add(f.chapterId);
      const read = (rel) => readFileSync(join(ctx.bundleDir, rel));
      checks.push(byteSubstring(read, { id: `anchor-${i}`, needle: anchor, artifact }));
    });

    checks.push(coverageCheck(scenario, findings.length, "coverage-findings"));
    checks.push({ id: "chapter-spread", method: "countAtLeast", args: { declaredN: 5, unit: "chapters" }, source: null, observed: findingsByChapter.size, pass: findingsByChapter.size >= 5, verdict: findingsByChapter.size >= 5 ? "MET" : "UNDER-N" });

    const misquotes = checks.filter((c) => c.method === "byteSubstring" && !c.pass).length;
    return {
      checks,
      coverage: { metric: "finding-misquote-rate", findings: findings.length, chapters: findingsByChapter.size, misquotes, declaredN: targetN },
      extra: { threshold: "0/N verbatim-anchor mismatches", bookId },
    };
  });
}
