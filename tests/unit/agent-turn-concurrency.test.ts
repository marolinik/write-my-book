// P1-13 / P2-28 / P2-14 / P2-34: two concurrent /message turns ran two
// orchestrators over one shared history, and cancel reached only the newest;
// cancel never reached delegated specialists, a background session waiting
// for an approval, or the running children of a cancelled batch.
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSession,
  beginTurn,
  endTurn,
  cancelSession,
  getSession,
} from "@/lib/agents/session-manager";

const SRC = join(__dirname, "..", "..", "src");
const read = (...p: string[]) => readFileSync(join(SRC, ...p), "utf-8");

function newSession(id: string) {
  createSession(id, "b1", "u1", "writing-coach", "coach");
  return getSession(id)!;
}

describe("one turn at a time", () => {
  it("refuses a second turn while one is running, and allows the next once it ends", () => {
    newSession("s-turn");
    expect(beginTurn("s-turn")).toBe(true);
    expect(beginTurn("s-turn")).toBe(false);
    endTurn("s-turn");
    expect(beginTurn("s-turn")).toBe(true);
    endTurn("s-turn");
  });

  it("/message answers 409 TURN_IN_PROGRESS before creating an orchestrator", () => {
    const route = read("app", "api", "books", "[id]", "agent", "[sessionId]", "message", "route.ts");
    const guard = route.indexOf("beginTurn(");
    expect(guard).toBeGreaterThan(-1);
    expect(route).toContain('"TURN_IN_PROGRESS"');
    expect(guard).toBeLessThan(route.indexOf("new AgentOrchestrator("));
    expect(route).toMatch(/\.finally\(\(\) => endTurn\(/);
  });
});

describe("cancel reaches everything", () => {
  it("cancelSession cancels the coach and every delegated specialist", () => {
    const session = newSession("s-cancel");
    session.status = "running";
    const coach = { cancel: vi.fn() };
    const specialist = { cancel: vi.fn() };
    session.orchestrator = coach as never;
    session.subOrchestrators.set("d1", specialist as never);
    cancelSession("s-cancel");
    expect(coach.cancel).toHaveBeenCalled();
    expect(specialist.cancel).toHaveBeenCalled();
  });

  it("the worker polls cancel on a timer and inside the approval wait, and cancels its specialists", () => {
    const worker = read("lib", "queue", "agent-worker.ts");
    expect(worker).toMatch(/setInterval\(\s*\(\)\s*=>\s*void checkCancellation\(\)/);
    expect(worker).toMatch(/while \(Date\.now\(\) < deadline\) \{\s*await checkCancellation\(\);/);
    expect(worker).toContain("registerSpecialist");
  });

  it("batch cancel signals every running child", () => {
    const route = read("app", "api", "books", "[id]", "batch", "[batchId]", "cancel", "route.ts");
    expect(route).toMatch(/session:\$\{child\.id\}:cancel/);
  });
});
