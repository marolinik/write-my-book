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
