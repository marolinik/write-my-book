// P2-83 / P2-84: one tiptap version with no overrides block hiding peer
// mismatches, and a worker image that installs production dependencies only
// (devDependencies such as shadcn, vitest and playwright carried advisories
// the worker never loads).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));

describe("tiptap (P2-83)", () => {
  const tiptap = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([name]) =>
    name.startsWith("@tiptap/")
  ) as Array<[string, string]>;

  it("every @tiptap package is pinned to one exact version", () => {
    expect(tiptap.length).toBeGreaterThan(5);
    const versions = new Set(tiptap.map(([, v]) => v));
    expect(versions.size).toBe(1);
    expect([...versions][0]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("no overrides block forces tiptap", () => {
    expect(Object.keys(pkg.overrides ?? {}).filter((k) => k.startsWith("@tiptap/"))).toEqual([]);
  });

  it("the lockfile holds one copy of @tiptap/core", () => {
    const copies = Object.keys(lock.packages ?? {}).filter((p) => p.endsWith("node_modules/@tiptap/core"));
    expect(copies).toEqual(["node_modules/@tiptap/core"]);
  });
});

describe("worker image (P2-84)", () => {
  const dockerfile = readFileSync(join(ROOT, "Dockerfile.worker"), "utf8");

  it("installs production dependencies only for the runtime stage", () => {
    expect(dockerfile).toMatch(/npm ci[^\n]*--omit=dev/);
    expect(dockerfile).toMatch(/AS prod-deps/);
  });

  it("dotenv, which the worker imports, is a runtime dependency", () => {
    expect(readFileSync(join(ROOT, "src", "worker.ts"), "utf8")).toMatch(/dotenv/);
    expect(pkg.dependencies.dotenv).toBeTruthy();
  });

  it("the prisma CLI and shadcn are not runtime dependencies", () => {
    expect(pkg.dependencies.prisma).toBeUndefined();
    // shadcn stays a devDependency: globals.css imports shadcn/tailwind.css at build time.
    expect(pkg.dependencies.shadcn).toBeUndefined();
  });
});

describe("web image (Wave 6 CI)", () => {
  it("every repository directory the Dockerfile copies from the build exists in the tree", () => {
    const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    const copied = [...dockerfile.matchAll(/COPY --from=builder \/app\/(public|export-templates|prisma)\b/g)].map((m) => m[1]);
    expect(copied).toContain("public");
    // An emptied public/ (git keeps no empty directory) broke `docker build`.
    for (const dir of copied) expect(existsSync(join(ROOT, dir)), dir).toBe(true);
  });
});
