import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const deploySmoke = readFileSync(".github/workflows/deploy-smoke.yml", "utf8");
const e2e = readFileSync(".github/workflows/e2e.yml", "utf8");

/** The YAML text of one step: from its `- name:` line up to the next step. */
function stepBlock(workflow: string, name: string): string {
  const start = workflow.indexOf(`- name: ${name}`);
  expect(start, `step "${name}" exists`).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("- name:", start + 1);
  return next === -1 ? workflow.slice(start) : workflow.slice(start, next);
}

describe("CI workflow contract", () => {
  it.each([
    "Typecheck (tsc --noEmit)",
    "Run unit tests",
    "Build Next.js app",
    "Build worker",
  ])("every gate after lint runs even when lint fails: %s", (name) => {
    expect(stepBlock(ci, name)).toContain("if: ${{ !cancelled() }}");
  });

  // 2026-11-10: ubuntu-latest started resolving to 26.04, where Playwright
  // 1.58 refuses to install chromium; every job that installs browsers runs
  // on an image Playwright supports.
  it("every job that installs Playwright browsers runs on ubuntu-24.04", () => {
    for (const workflow of [e2e, deploySmoke]) {
      // Jobs are the two-space-indented keys under `jobs:`.
      const jobs = workflow.split(/\r?\n {2}(?=[a-z][\w-]*:\r?\n)/);
      for (const job of jobs.filter((j) => j.includes("playwright install"))) {
        expect(job).toMatch(/runs-on: ubuntu-24\.04/);
      }
    }
  });

  it("deploy smoke is skipped, not green, without a target", () => {
    const guard = deploySmoke.slice(deploySmoke.indexOf("guard:"), deploySmoke.indexOf("runs-on:"));
    expect(guard).toContain("if:");
    expect(guard).toContain("github.event.inputs.base_url");
    expect(guard).toContain("vars.PLAYWRIGHT_BASE_URL");
  });

  it("the dev server serves the host the e2e suite browses (127.0.0.1)", () => {
    const config = readFileSync("next.config.ts", "utf8");
    expect(config).toMatch(/allowedDevOrigins:\s*\[[^\]]*"127\.0\.0\.1"/);
  });
});
