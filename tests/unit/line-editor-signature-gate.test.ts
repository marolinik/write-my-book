import { describe, it, expect, vi } from "vitest";

// prompt-assembler transitively imports @/lib/db (real Prisma init at load).
// Mock it so importing the module for its static BASE_INSTRUCTIONS is side-effect free.
vi.mock("@/lib/db", () => ({ db: {} }));

import { BASE_INSTRUCTIONS } from "@/lib/agents/prompt-assembler";

const prompt = BASE_INSTRUCTIONS["line-editor"];

describe("line-editor: PROTECTED SIGNATURE DEVICES gate", () => {
  it("declares the precedence gate that outranks the 23 checks", () => {
    expect(prompt).toContain("PROTECTED SIGNATURE DEVICES");
    expect(prompt).toContain("OUTRANKS");
    // The apply-before-every-finding gate must exist.
    expect(prompt).toContain("before EVERY CreateFinding");
  });

  it("positions the gate BEFORE the 23 numbered checks", () => {
    const gateIdx = prompt.indexOf("PROTECTED SIGNATURE DEVICES");
    const phaseIdx = prompt.indexOf("## PHASE DECOMPOSITION");
    const firstCheckIdx = prompt.indexOf("1. Sentence variety");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(phaseIdx).toBeGreaterThan(-1);
    expect(firstCheckIdx).toBeGreaterThan(-1);
    // Gate is introduced ahead of the check list, so its precedence is read first.
    expect(gateIdx).toBeLessThan(phaseIdx);
    expect(gateIdx).toBeLessThan(firstCheckIdx);
  });

  it("keys protection off the per-book fingerprint, not a hardcoded book", () => {
    // Precedence is defined by THIS book's fingerprint — generic, multi-book safe.
    expect(prompt).toContain("<style_fingerprint>");
    expect(prompt).toMatch(/PER-BOOK|per-book|THIS book's fingerprint/);
    // No book-specific exemptions leaked into a multi-book prompt.
    expect(prompt).not.toMatch(/Salt Letters|Vera|Danilo|Milan/);
    // "and"-stacking is framed conditionally on the fingerprint, never as a blanket allowance.
    expect(prompt).not.toMatch(/always allow[^\n]*and/i);
  });

  it("tags the colliding checks with the exemption pointer", () => {
    // Each check the validation flagged as colliding points back at the gate.
    const seeGate = "see PROTECTED SIGNATURE DEVICES";
    for (const check of [
      "1. Sentence variety",
      "2. Crutch phrases",
      "3. Filter words",
      "6. Echoes",
      "9. Show vs. tell",
      "20. Over-explanation",
    ]) {
      const idx = prompt.indexOf(check);
      expect(idx, `${check} present`).toBeGreaterThan(-1);
      const line = prompt.slice(idx, prompt.indexOf("\n", idx));
      expect(line, `${check} carries exemption tag`).toContain(seeGate);
    }
  });
});
