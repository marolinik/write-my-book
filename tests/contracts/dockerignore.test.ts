import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const entries = readFileSync(".dockerignore", "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));

describe(".dockerignore", () => {
  it.each([
    ".env*",
    "!.env.example",
    "cowork/",
    "coverage/",
    "test-results/",
    "playwright-report*/",
    "uat-screenshots/",
    "tmp-*",
    "tmp-audit/",
    "dist-worker/",
    "brag-output*/",
  ])("keeps %s out of the build context", (entry) => {
    expect(entries).toContain(entry);
  });
});

// Wave 5 Task 11: the image build type-checks every file left in the
// context. A file that imports from an ignored directory (cowork/) breaks
// `next build` inside Docker while passing everywhere the directory exists —
// the production image did not build from Wave 1 until this was caught.
describe("files that import from cowork/", () => {
  it("are themselves kept out of the build context", async () => {
    const { readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const roots = ["scripts", "src"];
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx|mts|mjs)$/.test(entry.name) && /from\s+["'][./]*cowork\//.test(readFileSync(path, "utf8"))) {
          offenders.push(path.split("\\").join("/"));
        }
      }
    };
    roots.forEach(walk);
    expect(offenders.filter((file) => !entries.includes(file))).toEqual([]);
  });
});
