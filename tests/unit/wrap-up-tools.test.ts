import { describe, it, expect } from "vitest";
import { WRAP_UP_TOOLS } from "@/lib/agents/orchestrator";

// The single armed wrap-up turn at 100% budget/time executes ONLY the tools in
// this allowlist. It must persist the writer's work — including a drafted
// chapter (WriteChapter) — but must never start new/blocking work (S7).
describe("WRAP_UP_TOOLS allowlist", () => {
  it("includes every pure-DB persistence tool the FINAL nudge can request", () => {
    expect(WRAP_UP_TOOLS.has("CreateFinding")).toBe(true);
    expect(WRAP_UP_TOOLS.has("WriteDocument")).toBe(true);
    // Regression: a WriteChapter arriving on the armed wrap-up turn was
    // silently dropped and the drafted chapter discarded.
    expect(WRAP_UP_TOOLS.has("WriteChapter")).toBe(true);
  });

  it("excludes tools that start new work or block on approval", () => {
    expect(WRAP_UP_TOOLS.has("DelegateToSpecialist")).toBe(false);
    expect(WRAP_UP_TOOLS.has("RequestApproval")).toBe(false);
  });

  it("contains exactly the three persistence tools", () => {
    expect([...WRAP_UP_TOOLS].sort()).toEqual(
      ["CreateFinding", "WriteChapter", "WriteDocument"].sort()
    );
  });
});
