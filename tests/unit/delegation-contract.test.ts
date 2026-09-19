/**
 * V-1 / V-2 — what the conductor hands a specialist.
 *
 * DelegateToSpecialist takes a required `task`, and for a long time
 * `input.task` appeared exactly once in tools.ts: as delegation_start UI
 * metadata. The spawn context never carried it and buildUserMessage injects a
 * task only from context.userMessage, so `revise` rewrote a chapter blind and
 * `capture-style` — whose analyst holds no chapter-reading tool — had no route
 * to any prose at all. targetWorkflowId was dropped the same way, which left
 * every WORKFLOW_INSTRUCTION_OVERRIDES entry dead interactively and live in
 * batch: one workflow, two prompts, depending on how it was started.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

/** The `context:` object of the spawn options DelegateToSpecialist builds. */
function delegationSpawnContext(): string {
  const tools = src("lib", "agents", "tools.ts");
  const at = tools.indexOf("const spawnOptions = {");
  expect(at, "delegation spawn options not found").toBeGreaterThan(-1);
  const from = tools.indexOf("context: {", at);
  return tools.slice(from, tools.indexOf("workflowId:", from));
}

describe("a delegated specialist is told what to do", () => {
  it("receives the coach's task as its user message", () => {
    expect(delegationSpawnContext()).toMatch(/userMessage: input\.task/);
  });

  it("receives the workflow it is running", () => {
    expect(delegationSpawnContext()).toMatch(/targetWorkflowId: input\.workflowId/);
  });

  it("the orchestrator still reads the task from context.userMessage", () => {
    const orchestrator = src("lib", "agents", "orchestrator.ts");
    expect(orchestrator).toMatch(/options\.context\.userMessage/);
  });

  it("the overrides the workflow id unlocks are still gated on it", () => {
    const assembler = src("lib", "agents", "prompt-assembler.ts");
    expect(assembler).toMatch(
      /context\.targetWorkflowId && WORKFLOW_INSTRUCTION_OVERRIDES\[context\.targetWorkflowId\]/
    );
  });
});

describe("a book that belongs to a series says so", () => {
  it("the agent panel passes the book's own seriesId", () => {
    const wrapper = src("components", "agent", "agent-panel-wrapper.tsx");
    expect(wrapper).toMatch(/seriesId=\{book\?\.seriesId \?\? undefined\}/);
  });

  it("both agent contexts carry it — interactive and batch", () => {
    expect(src("app", "api", "books", "[id]", "agent", "route.ts")).toMatch(
      /seriesId: book\.seriesId \?\? undefined/
    );
    expect(src("lib", "queue", "agent-worker.ts")).toMatch(
      /seriesId: book\?\.seriesId \?\? undefined/
    );
  });
});
