/**
 * A finding without a suggestion is a complaint.
 *
 * S3-18: the owner read a list of 27 continuity problems with no action on any
 * of them. Eight genuinely had none — the continuity checker's contract asked
 * for `alternatives` but never for `suggestion`, so the field was optional in
 * practice and the agent often skipped it. The dev-editor, line-editor and
 * beta-reader contracts had the same hole.
 *
 * This guards the contract, not the model: every agent that is told to create
 * findings must also be told to propose what to do about them.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
  join(__dirname, "..", "..", "src", "lib", "agents", "prompt-assembler.ts"),
  "utf-8"
);

/** Each block that instructs an agent to fill in CreateFinding's fields. */
function fieldBlocks(): string[] {
  const blocks: string[] = [];
  const marker = "call CreateFinding with ALL required fields:";
  let from = 0;
  for (;;) {
    const at = SOURCE.indexOf(marker, from);
    if (at === -1) break;
    blocks.push(SOURCE.slice(at, at + 1200));
    from = at + marker.length;
  }
  return blocks;
}

describe("every finding-writing contract asks for a suggestion", () => {
  const blocks = fieldBlocks();

  it("finds the contracts", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(4);
  });

  it("requires a suggestion in each one", () => {
    const missing = blocks.filter((b) => !/- suggestion: REQUIRED/.test(b));
    expect(missing).toEqual([]);
  });

  it("tells the continuity checker to name the domain", () => {
    expect(SOURCE).toContain('"continuity:characters"');
    expect(SOURCE).toContain('"continuity:timeline"');
  });
});
