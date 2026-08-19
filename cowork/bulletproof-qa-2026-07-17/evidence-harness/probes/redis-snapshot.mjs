// probes/redis-snapshot.mjs — read-only Redis ledger polling (W-F3 §5.2, T4).
//
// Reads (GET/SCAN only — no writes) the real batch ledger keys the worker maintains
// (src/lib/queue/agent-worker.ts:124-693): batch:{id}:spent | :halted | :failures |
// :consecutive. Polled on an interval to produce a REPLAYABLE spend timeline instead
// of a single end-state claim (the D-45 lesson).
//
// Uses the existing `ioredis` dependency (no new dep).

import IORedis from "ioredis";

const LEDGER_SUFFIXES = ["spent", "halted", "failures", "consecutive"];

/**
 * @param {{ redisUrl?: string }} [cfg]
 */
export function createRedisProbe(cfg = {}) {
  const url = cfg.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379";
  const conn = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });

  async function connect() {
    if (conn.status !== "ready" && conn.status !== "connecting") await conn.connect();
  }

  /** One read of a batch's ledger keys. */
  async function readBatchLedger(batchId) {
    await connect();
    const out = { batchId, atUtc: new Date().toISOString(), values: {} };
    for (const s of LEDGER_SUFFIXES) {
      out.values[s] = await conn.get(`batch:${batchId}:${s}`);
    }
    return out;
  }

  /**
   * Poll a batch ledger every `intervalMs` for up to `maxMs`, each poll a
   * timestamped artifact. Stops early if `:halted` is set or a done predicate hits.
   * @param {string} batchId
   * @param {{ store: any, intervalMs?: number, maxMs?: number, bracket?: string|null, done?: () => Promise<boolean> }} opts
   */
  async function pollBatch(batchId, opts) {
    const interval = opts.intervalMs ?? 2000;
    const maxMs = opts.maxMs ?? 120000;
    const start = Date.now();
    const timeline = [];
    while (Date.now() - start < maxMs) {
      const reading = await readBatchLedger(batchId);
      timeline.push(reading);
      if (opts.store) opts.store.writeJson(reading, { label: `redis-${batchId}-t${timeline.length}`, kind: "redis-ledger", bracket: opts.bracket ?? null, meta: { batchId, poll: timeline.length } });
      if (reading.values.halted) break;
      if (opts.done && (await opts.done())) break;
      await new Promise((r) => setTimeout(r, interval));
    }
    if (opts.store) opts.store.writeJson({ batchId, polls: timeline.length, timeline }, { label: `redis-${batchId}-timeline`, kind: "redis-ledger-timeline", bracket: opts.bracket ?? null, meta: { batchId } });
    return timeline;
  }

  /** SCAN keys matching a pattern (read-only). */
  async function scanKeys(pattern) {
    await connect();
    const found = [];
    let cursor = "0";
    do {
      const [next, keys] = await conn.scan(cursor, "MATCH", pattern, "COUNT", 200);
      cursor = next;
      found.push(...keys);
    } while (cursor !== "0");
    return found;
  }

  async function close() {
    try {
      await conn.quit();
    } catch {
      conn.disconnect();
    }
  }

  return { readBatchLedger, pollBatch, scanKeys, close };
}
