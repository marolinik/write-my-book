/**
 * Phase B — Drive REAL extraction through the fixed product pipeline.
 *
 * updateFromChapter() is the EXACT function the live scan route invokes
 * (src/app/api/books/[id]/continuity/scan/route.ts calls `void updateFromChapter(...)`).
 * We invoke it AWAITED so landing is deterministic and the honest result envelope
 * (updated / entitiesFound / failed / suspiciousEmpty / lowYield) is captured —
 * exercising the real entity-extractor (P3's OpenRouter/qwen3.6 BYOK key) + the
 * fixed graph-builder + Neo4j. No src edits; capture only.
 */
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { getExtractionKeysForUser } from "@/lib/agents/extraction-keys";
import { loadState, EVID, BOOK1_CHAPTERS, BOOK2_CHAPTERS, log } from "./_lib";

async function main() {
  const state = loadState();
  const p3 = await db.user.findUnique({ where: { clerkId: "user_qa_p3" } });
  if (!p3) throw new Error("P3 not found");
  const keys = await getExtractionKeysForUser(p3.id);
  const providers = Object.keys(keys);
  log("=== PHASE B: REAL EXTRACTION (product updateFromChapter, awaited) ===");
  log("P3 id:", p3.id, "defaultModel:", p3.defaultModel, "key-providers:", providers.join(","));
  if (providers.length === 0) throw new Error("P3 has no usable extraction keys — STOP");

  const results: any[] = [];
  const jobs: Array<[string, string, number, string]> = [];
  for (const n of Object.keys(BOOK1_CHAPTERS).map(Number)) {
    jobs.push(["book1", state.book1Id, n, BOOK1_CHAPTERS[n]]);
  }
  for (const n of Object.keys(BOOK2_CHAPTERS).map(Number)) {
    jobs.push(["book2", state.book2Id, n, BOOK2_CHAPTERS[n]]);
  }

  for (const [label, bookId, n, content] of jobs) {
    const t0 = Date.now();
    let env: any;
    try {
      env = await updateFromChapter(
        bookId,
        n,
        content,
        p3.defaultModel ?? undefined,
        keys,
        p3.id
      );
    } catch (e) {
      env = { threw: true, error: (e as Error).message };
    }
    const ms = Date.now() - t0;
    const row = { label, bookId, chapter: n, ms, envelope: env };
    results.push(row);
    log(`  ${label} ch${n}: ${ms}ms ->`, JSON.stringify(env));
  }

  fs.writeFileSync(
    path.join(EVID, "_extraction_results.json"),
    JSON.stringify({ capturedAt: new Date().toISOString(), p3Id: p3.id, defaultModel: p3.defaultModel, keyProviders: providers, results }, null, 2)
  );
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error("PHASE B ERROR:", e);
  process.exit(1);
});
