// suites/continuity-precision.mjs — G4: continuity FP 0/>=30 + recall (W-F3 §3.2 row 3).
//
// (T10.) Ground truth is a COMMITTED file (corpus-manifest.csv), not anyone's
// memory: each corpus chapter maps to a planted defect class (or `none`) and an
// expected-flag boolean. The suite imports the corpus, runs continuity scan, joins
// captured flags against the CSV:
//   FP     = flags on clean/ + nonchron/  (MUST be 0)
//   recall = detected / planted on seeded/
// The nonchron/ subdir (flashback / frame-story / in-media-res) is the false-
// positive trap — those MUST NOT flag.
//
// COLLISION: opus-fix-sec (D-63) + W-D fixes in flight — first CERTIFIABLE run only
// after W-D lands. Build + encode post-fix contracts now.
//
// Needs: live app + single worker + qwen key + Neo4j.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { withBracket, coverageCheck } from "./_lib.mjs";
import { createNeo4jProbe } from "../probes/neo4j-snapshot.mjs";

const CORPUS = join(process.cwd(), "cowork/bulletproof-qa-2026-07-17/evidence-harness/corpora/continuity");

/** Parse the human-reviewed ground-truth CSV: file,class,expectedFlag. */
function loadGroundTruth() {
  const csv = join(CORPUS, "corpus-manifest.csv");
  if (!existsSync(csv)) throw new Error(`[continuity] ground-truth CSV missing: ${csv} (human-review required, §3.2)`);
  const lines = readFileSync(csv, "utf8").trim().split(/\r?\n/).slice(1);
  return lines.map((l) => {
    const [file, cls, expectedFlag] = l.split(",").map((s) => s.trim());
    return { file, cls, expectedFlag: expectedFlag === "true" };
  });
}

export async function run(ctx) {
  const { http, store, scenario } = ctx;
  const neo4j = createNeo4jProbe();
  const gt = loadGroundTruth();
  const checks = [];

  try {
    return await withBracket(ctx, "wp-continuity-1", async (bracket) => {
      const bookRes = await http.request("create-continuity-book", { method: "POST", path: "/api/books", body: { title: "Harness Continuity Corpus" }, bracket });
      const bookId = JSON.parse(bookRes.bodyBytes.toString("utf8")).id;

      // Import all corpus chapters (seeded/clean/nonchron).
      for (const sub of ["seeded", "clean", "nonchron"]) {
        const dir = join(CORPUS, sub);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir).filter((x) => x.endsWith(".md") || x.endsWith(".txt"))) {
          const content = readFileSync(join(dir, f), "utf8");
          await http.request(`import-${sub}-${f}`, { method: "POST", path: `/api/books/${bookId}/import`, body: { title: `${sub}/${f}`, content }, bracket });
        }
      }

      // Graph-populated precondition, evidenced.
      await neo4j.snapshot("PLACEHOLDER_HARNESS_USER_ID", { store, label: "neo4j-before-scan", bracket }).catch(() => null);

      const scan = await http.request("continuity-scan", { method: "POST", path: `/api/books/${bookId}/continuity/scan`, bracket, measurement: true });
      const flags = JSON.parse(scan.bodyBytes.toString("utf8")).flags ?? [];
      const flaggedFiles = new Set(flags.map((fl) => fl.file ?? fl.chapterTitle ?? ""));

      await neo4j.snapshot("PLACEHOLDER_HARNESS_USER_ID", { store, label: "neo4j-after-scan", bracket }).catch(() => null);

      // Join flags against committed ground truth.
      let fp = 0;
      let detected = 0;
      let planted = 0;
      for (const g of gt) {
        const wasFlagged = [...flaggedFiles].some((ff) => ff.includes(g.file));
        if (g.expectedFlag) {
          planted += 1;
          if (wasFlagged) detected += 1;
        } else if (wasFlagged) {
          fp += 1;
        }
      }
      checks.push({ id: "false-positive-zero", method: "numericBound", args: { max: 0 }, source: { note: "flags on clean/+nonchron joined to corpus-manifest.csv" }, observed: fp, pass: fp === 0, detail: fp === 0 ? null : `${fp} false positive(s)` });
      checks.push({ id: "recall", method: "numericBound", args: { min: 1 }, source: { note: "detected/planted on seeded/" }, observed: planted > 0 ? detected / planted : 0, pass: planted > 0 && detected === planted, detail: `${detected}/${planted} planted detected` });
      checks.push(coverageCheck(scenario, gt.length, "coverage-corpus"));

      return {
        checks,
        coverage: { metric: "continuity-precision", corpusItems: gt.length, falsePositives: fp, recall: planted > 0 ? detected / planted : null },
        extra: { note: "COLLISION opus-fix-sec/W-D: certifiable only after W-D merges", bookId },
      };
    });
  } finally {
    await neo4j.close();
  }
}
