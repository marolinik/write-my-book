// suites/voice-flattening.mjs — G4: >=30 blind hunk pairs, sealed key (§3.2 row 2).
//
// (T11.) Runs line-edit passes on the committed corpora (qwen + a stronger model
// when a key is present, both labeled), extracts before/after hunks MECHANICALLY
// (diff, no model), and builds blinded A/B pairs with a seeded PRNG. The pairing
// key is SEALED separately and its hash pinned in the manifest — judges file blind
// verdicts first, open the key second. Re-pairing after the fact breaks the seal.
//
// The harness does NOT judge voice quality (that stays a blind-judge call, §8); it
// only guarantees the pairs are real, blind, and sealed.
//
// Needs: live app + single worker + qwen key.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { extractHunks, buildBlindPairs } from "../core/blind-pairing.mjs";
import { seedFromString } from "../core/prng.mjs";
import { withBracket, coverageCheck } from "./_lib.mjs";

const CORPUS = join(process.cwd(), "cowork/bulletproof-qa-2026-07-17/evidence-harness/corpora/voice");

export async function run(ctx) {
  const { http, store, scenario, bundleDir } = ctx;
  if (!existsSync(CORPUS)) throw new Error(`[voice] corpus missing at ${CORPUS} (T11)`);
  const files = readdirSync(CORPUS).filter((f) => f.endsWith(".md") || f.endsWith(".txt")).sort();
  const checks = [];

  return withBracket(ctx, "wp-voice-1", async (bracket) => {
    const bookRes = await http.request("create-voice-book", { method: "POST", path: "/api/books", body: { title: "Harness Voice Corpus" }, bracket });
    const bookId = JSON.parse(bookRes.bodyBytes.toString("utf8")).id;

    /** @type {Array<{before:string, after:string}>} */
    const allHunks = [];
    const modelLabel = process.env.ANTHROPIC_API_KEY ? "qwen36+anthropic" : "openrouter-qwen36";
    for (const f of files) {
      const before = readFileSync(join(CORPUS, f), "utf8");
      const imp = await http.request(`import-${f}`, { method: "POST", path: `/api/books/${bookId}/import`, body: { title: f, content: before }, bracket });
      const chapterId = JSON.parse(imp.bodyBytes.toString("utf8")).id;
      await http.request(`line-edit-${f}`, { method: "POST", path: `/api/books/${bookId}/agent`, body: { kind: "line-edit", scope: "chapter", chapterId }, bracket, measurement: true });
      const after = await http.request(`content-after-${f}`, { method: "GET", path: `/api/books/${bookId}/chapters/${chapterId}/content`, bracket, measurement: true });
      const afterText = after.bodyBytes.toString("utf8");
      for (const h of extractHunks(before, afterText)) allHunks.push(h);
    }

    // Seed recorded so the pairing is regenerable; key sealed + hashed in manifest.
    const seed = seedFromString(`voice-${bookId}-${files.length}`);
    const { pairs } = buildBlindPairs(allHunks, { dir: bundleDir, seed, store });

    checks.push(coverageCheck(scenario, pairs, "coverage-pairs"));
    return {
      checks,
      coverage: { metric: "voice-flattening-blind-pairs", pairs, model: modelLabel, seed },
      extra: { note: "quality is a blind-judge call; harness guarantees real+blind+sealed pairs", bookId },
    };
  });
}
