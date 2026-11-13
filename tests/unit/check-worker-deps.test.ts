// Wave 7 Task 5: the worker does not load Next. scripts/check-worker-deps.mjs
// runs inside the worker image at build time; it walks the require graph from
// the compiled worker entry (tsc compiles all of src/lib, including route
// helpers that import next/server but the worker never reaches) and fails the
// build when a reachable module requires Next.
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = join(__dirname, "..", "..");
const SCRIPT = join(ROOT, "scripts", "check-worker-deps.mjs");

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A fake dist-worker tree: path -> file body. */
function dist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "worker-dist-"));
  dirs.push(dir);
  for (const [rel, body] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return dir;
}

function check(dir: string) {
  const run = spawnSync(process.execPath, [SCRIPT, dir], { cwd: ROOT, encoding: "utf8" });
  return { code: run.status, out: `${run.stdout}${run.stderr}` };
}

describe("check-worker-deps", () => {
  it("passes a worker whose reachable modules require installed packages only", () => {
    const res = check(
      dist({
        "worker.js": 'require("./lib/a");\nrequire("bullmq");',
        "lib/a.js": 'require("./b");\nrequire("zod");',
        "lib/b/index.js": 'require("node:fs");',
      })
    );
    expect(res.out).toContain("resolve");
    expect(res.code).toBe(0);
  });

  it("ignores compiled files the worker never reaches, even if they require next", () => {
    const res = check(
      dist({
        "worker.js": 'require("./lib/a");',
        "lib/a.js": 'require("zod");',
        "lib/api/route-helper.js": 'require("next/server");',
      })
    );
    expect(res.code).toBe(0);
  });

  it("fails when a reachable module requires next", () => {
    const res = check(
      dist({
        "worker.js": 'require("./lib/a");',
        "lib/a.js": 'require("next/server");',
      })
    );
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/next\/server/);
    expect(res.out).toMatch(/lib[\\/]a\.js/);
  });

  it("reads single-quoted requires too (tsc keeps the source's quotes)", () => {
    const res = check(
      dist({
        "worker.js": "require('./lib/logger');",
        "lib/logger.js": "Promise.resolve().then(() => __importStar(require('@sentry/nextjs')));",
      })
    );
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/@sentry\/nextjs/);
  });

  it("fails when a reachable module requires @sentry/nextjs (it loads next)", () => {
    const res = check(
      dist({
        "worker.js": 'require("./lib/logger");',
        "lib/logger.js": 'Promise.resolve().then(() => require("@sentry/nextjs"));',
      })
    );
    expect(res.code).toBe(1);
    expect(res.out).toMatch(/@sentry\/nextjs/);
  });
});
