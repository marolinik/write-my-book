// core/worker-proof.mjs — automated worker census + bracket lifecycle (W-F3 §4).
//
// Fixes the D-60 / "worker hygiene" class by CODE instead of eyeballing:
//   - OS census via `Get-CimInstance Win32_Process` (the exact capture the P6
//     proof established), parsed by code.
//   - Chain collapse: npm run worker:dev -> npx tsx -> tsx cli -> node collapses to
//     ONE logical worker.
//   - Refuse-to-start assertions: exactly 1 logical worker chain inside this repo,
//     0 from any other checkout (a foreign-checkout worker on the shared Redis
//     silently steals jobs and runs OLD code — the #3 confound), and (best-effort)
//     a BullMQ getWorkers() cross-check so OS + Redis must agree.
//   - Bracket open/close with UTC+monotonic stamps; PID-set drift voids the bracket.
//
// Windows-specific (PowerShell). Node built-ins only for the census; the optional
// Redis cross-check lazy-imports the existing ioredis/bullmq deps.

import { execFileSync } from "node:child_process";
import { now } from "./clock.mjs";

const REPO_MARKER = "wmb-pub"; // this checkout
const FOREIGN_MARKERS = ["wmb-wave1", "wmb-worktree", "wmb-clone"]; // known other checkouts

/**
 * Raw OS census of node/tsx processes.
 * @returns {{ raw: string, procs: Array<{ pid: number, ppid: number, created: string, cmd: string }> }}
 */
export function census() {
  const ps =
    "Get-CimInstance Win32_Process | " +
    "Where-Object { $_.Name -match 'node|tsx' } | " +
    "Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine | " +
    "ConvertTo-Json -Depth 3";
  const raw = execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  let parsed;
  try {
    parsed = JSON.parse(raw || "[]");
  } catch {
    parsed = [];
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const procs = arr
    .filter(Boolean)
    .map((p) => ({
      pid: Number(p.ProcessId),
      ppid: Number(p.ParentProcessId),
      created: String(p.CreationDate ?? ""),
      cmd: String(p.CommandLine ?? ""),
    }));
  return { raw, procs };
}

/**
 * Identify worker chains from a census. A "worker" process runs src/worker.ts or
 * dist-worker; we then walk to its chain root for the logical-worker collapse.
 * @param {Array<{pid:number,ppid:number,cmd:string}>} procs
 */
export function analyze(procs) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const isWorkerCmd = (cmd) => /worker\.ts|dist-worker[\\/]worker\.js|worker:dev/i.test(cmd);

  const workerProcs = procs.filter((p) => isWorkerCmd(p.cmd));
  // Collapse each worker proc to its topmost ancestor within the census (logical worker).
  const chains = new Map(); // rootPid -> { pids:Set, cmds:[], repo:string|'foreign'|'unknown' }
  for (const w of workerProcs) {
    let node = w;
    const pids = new Set([w.pid]);
    const cmds = [w.cmd];
    let guard = 0;
    while (byPid.has(node.ppid) && guard < 20) {
      node = byPid.get(node.ppid);
      pids.add(node.pid);
      cmds.push(node.cmd);
      guard += 1;
    }
    const root = node.pid;
    const allCmd = cmds.join(" \n ");
    let repo = "unknown";
    if (new RegExp(REPO_MARKER, "i").test(allCmd) || new RegExp(REPO_MARKER, "i").test(w.cmd)) repo = "this";
    for (const fm of FOREIGN_MARKERS) if (new RegExp(fm, "i").test(allCmd)) repo = "foreign";
    if (chains.has(root)) {
      const ex = chains.get(root);
      for (const p of pids) ex.pids.add(p);
    } else {
      chains.set(root, { rootPid: root, pids, cmds, repo });
    }
  }

  const logical = [...chains.values()];
  const thisRepo = logical.filter((c) => c.repo === "this");
  const foreign = logical.filter((c) => c.repo === "foreign");
  const unknown = logical.filter((c) => c.repo === "unknown");
  const allPids = new Set();
  for (const c of logical) for (const p of c.pids) allPids.add(p);

  return {
    logicalWorkers: logical.length,
    thisRepoWorkers: thisRepo.length,
    foreignWorkers: foreign.length,
    unknownWorkers: unknown.length,
    pidSet: [...allPids].sort((a, b) => a - b),
    chains: logical.map((c) => ({ rootPid: c.rootPid, pids: [...c.pids].sort((a, b) => a - b), repo: c.repo })),
  };
}

/**
 * Best-effort BullMQ Redis cross-check: connected worker count on the agent queue.
 * Returns null when Redis/bullmq are unavailable (recorded as such — not fatal by
 * itself, but a mismatch when available IS a refusal).
 * @returns {Promise<{ agentQueueWorkers: number|null, error: string|null }>}
 */
export async function bullmqWorkerCount() {
  try {
    const { Queue } = await import("bullmq");
    const IORedis = (await import("ioredis")).default;
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    const connection = new IORedis(url, { maxRetriesPerRequest: null, enableReadyCheck: false, lazyConnect: true });
    await connection.connect();
    const q = new Queue("agent-sessions", { connection });
    const workers = await q.getWorkers();
    await q.close();
    await connection.quit();
    return { agentQueueWorkers: workers.length, error: null };
  } catch (e) {
    return { agentQueueWorkers: null, error: e.message };
  }
}

/**
 * Full assertion: OS census + optional Redis cross-check must agree on exactly one
 * runtime. Returns { pass, reasons, os, redis }.
 * @param {{ requireRedisAgreement?: boolean }} [opts]
 */
export async function assertSingleWorker(opts = {}) {
  const { procs } = census();
  const os = analyze(procs);
  const redis = await bullmqWorkerCount();
  const reasons = [];
  if (os.thisRepoWorkers !== 1) reasons.push(`expected exactly 1 worker in this checkout, found ${os.thisRepoWorkers}`);
  if (os.foreignWorkers > 0) reasons.push(`${os.foreignWorkers} worker(s) from a FOREIGN checkout on the shared Redis (steals jobs, runs old code)`);
  if (redis.agentQueueWorkers !== null) {
    if (redis.agentQueueWorkers !== os.thisRepoWorkers) {
      reasons.push(`OS says ${os.thisRepoWorkers} worker(s) but BullMQ getWorkers()=${redis.agentQueueWorkers} — signals disagree`);
    }
  } else if (opts.requireRedisAgreement) {
    reasons.push(`Redis cross-check required but unavailable: ${redis.error}`);
  }
  return { pass: reasons.length === 0, reasons, os, redis };
}

// ── bracket lifecycle (measurement binding, §2.2) ──────────────────────────────

/**
 * Open a worker-proof bracket: census + write open artifacts to the store.
 * @param {object} store  artifact store
 * @param {string} bracketId  e.g. "wp-001"
 */
export async function openBracket(store, bracketId) {
  const t = now();
  const { raw, procs } = census();
  const os = analyze(procs);
  const redis = await bullmqWorkerCount();
  store.writeRaw(Buffer.from(raw), { label: `${bracketId}-open-census`, kind: "worker-proof-census-raw", ext: ".json", meta: { bracketId, phase: "open" } });
  store.writeJson({ bracketId, phase: "open", os, redis, openedAtUtc: t.utc, openedAtMono: t.mono }, { label: `${bracketId}-open`, kind: "worker-proof-open", meta: { bracketId, pidSet: os.pidSet, phase: "open" } });
  return { bracketId, openMono: t.mono, pidSet: os.pidSet, os, redis };
}

/**
 * Close a bracket: re-census, compare PID sets. Drift => the sealer will VOID
 * every measurement in the bracket.
 * @param {object} store
 * @param {{ bracketId: string, pidSet: number[] }} open
 */
export async function closeBracket(store, open) {
  const t = now();
  const { raw, procs } = census();
  const os = analyze(procs);
  const drift = JSON.stringify(os.pidSet) !== JSON.stringify(open.pidSet);
  store.writeRaw(Buffer.from(raw), { label: `${open.bracketId}-close-census`, kind: "worker-proof-census-raw", ext: ".json", meta: { bracketId: open.bracketId, phase: "close" } });
  store.writeJson(
    { bracketId: open.bracketId, phase: "close", os, drift, closedAtUtc: t.utc, closedAtMono: t.mono },
    { label: `${open.bracketId}-close`, kind: "worker-proof-close", meta: { bracketId: open.bracketId, pidSet: os.pidSet, phase: "close", drift } },
  );
  return { bracketId: open.bracketId, closeMono: t.mono, pidSet: os.pidSet, drift, voided: drift };
}
