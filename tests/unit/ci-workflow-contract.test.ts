import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const ci = readFileSync(".github/workflows/ci.yml", "utf8");
const deploySmoke = readFileSync(".github/workflows/deploy-smoke.yml", "utf8");

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

  it("deploy smoke is skipped, not green, without a target", () => {
    const guard = deploySmoke.slice(deploySmoke.indexOf("guard:"), deploySmoke.indexOf("runs-on:"));
    expect(guard).toContain("if:");
    expect(guard).toContain("github.event.inputs.base_url");
    expect(guard).toContain("vars.PLAYWRIGHT_BASE_URL");
  });
});
