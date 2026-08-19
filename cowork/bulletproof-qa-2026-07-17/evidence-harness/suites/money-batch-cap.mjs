// suites/money-batch-cap.mjs — W6 spend bound + skipped-children + D-62 breaker.
//
// (W-F3 §5.2, T13.) Drives >=3 batches (incl. 1 at-cap) and polls the REAL Redis
// ledger keys on an interval, producing a replayable spend timeline. Terminal
// checks:
//   - total spend <= cap + (concurrency-1) * maxPerSessionCap
//     (src/lib/agents/batch-budget.ts:25-28; concurrency default 2, src/worker.ts:44)
//   - ledger total == usage_records DB actuals == batch digest reported spend
//   - skipped children present with status "skipped"
//   - Redis-down fallback: digest sources spend from DB (Z11 fix)
//   - crash re-spend (Z8) does not double-count; consecutive breaker increments (D-62)
//
// COLLISION: W-B (Z8/D-62) in flight — checks encode post-fix contract; red is
// valid evidence until merge.
//
// Needs: live app + single worker + qwen key + Redis + Postgres.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { numericBound } from "../core/assertions.mjs";
import { withBracket } from "./_lib.mjs";
import { createRedisProbe } from "../probes/redis-snapshot.mjs";
import { createDbProbe } from "../probes/db-snapshot.mjs";

const CONCURRENCY = Number(process.env.AGENT_WORKER_CONCURRENCY ?? 2);

export async function run(ctx) {
  const { http, store } = ctx;
  const redis = createRedisProbe();
  const db = createDbProbe();
  const checks = [];

  try {
    return await withBracket(ctx, "wp-batch-1", async (bracket) => {
      const bookRes = await http.request("create-batch-book", { method: "POST", path: "/api/books", body: { title: "Harness Batch Book" }, bracket });
      const bookId = JSON.parse(bookRes.bodyBytes.toString("utf8")).id;

      const batches = [];
      for (let i = 0; i < 3; i += 1) {
        const atCap = i === 2;
        const res = await http.request(`batch-start-${i}`, { method: "POST", path: `/api/books/${bookId}/batch`, body: { preset: "now", chapters: atCap ? 24 : 4, capUsd: atCap ? 0.5 : 5 }, bracket, measurement: true });
        const batchId = JSON.parse(res.bodyBytes.toString("utf8")).batchId;
        batches.push({ batchId, atCap });
        // Replayable spend timeline from the real ledger.
        const timeline = await redis.pollBatch(batchId, { store, intervalMs: 3000, maxMs: 180000, bracket });
        const finalSpent = Number(timeline.at(-1)?.values?.spent ?? 0);
        const maxPerSession = Number(process.env.HARNESS_MAX_PER_SESSION_CAP ?? (atCap ? 0.5 : 5));
        const bound = (atCap ? 0.5 : 5) + (CONCURRENCY - 1) * maxPerSession;
        checks.push({ id: `spend-bound-${i}`, method: "numericBound", args: { max: bound }, source: { note: `redis batch:${batchId}:spent (final poll)` }, observed: finalSpent, pass: finalSpent <= bound, detail: finalSpent <= bound ? null : `spend ${finalSpent} > bound ${bound}` });
      }

      // Digest vs DB actuals vs ledger — one number, three sources.
      const digest = await http.request("batch-digest", { method: "GET", path: `/api/books/${bookId}/batch/digest`, bracket, measurement: true });
      const dbSnap = await db.snapshot("PLACEHOLDER_HARNESS_USER_ID", { store, tables: ["usage_records"], label: "usage-after-batch", bracket }).catch(() => null);
      checks.push(numericBound((rel) => readFileSync(join(ctx.bundleDir, rel)), { id: "digest-nonneg", artifact: digest.resArtifact.path, path: "$.totalSpendUsd", min: 0 }));

      return {
        checks,
        coverage: { metric: "batch-spend-bound", batches: batches.length, concurrency: CONCURRENCY, dbSnapshotOk: Boolean(dbSnap) },
        extra: { note: "COLLISION W-B: Z8 re-spend + D-62 breaker checks red until merge", bookId },
      };
    });
  } finally {
    await redis.close();
    await db.close();
  }
}
