/**
 * V-3 — "a finding without a suggestion is a complaint", and the tool had no
 * field for one.
 *
 * Four prompts instruct the agents to send `suggestion: REQUIRED — what the
 * writer should DO about it`. CreateFinding's schema is strict and had no
 * `suggestion` property, so the model's sentence was dropped by the API and the
 * executor wrote `suggestion: sanitizedRationale` under a "Legacy fields"
 * comment. On the owner's book 199 of 255 findings carry a suggestion that is
 * byte-identical to the rationale: the column the UI presents as "what to do"
 * was a copy of "why this is a problem".
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TOOLS = readFileSync(
  join(__dirname, "..", "..", "src", "lib", "agents", "tools.ts"),
  "utf-8"
);

/** The CreateFinding tool definition, schema and required list included. */
function createFindingDef(): string {
  const at = TOOLS.indexOf("const createFindingDef");
  expect(at, "CreateFinding definition not found").toBeGreaterThan(-1);
  const end = TOOLS.indexOf("const requestApprovalDef", at);
  return TOOLS.slice(at, end);
}

describe("CreateFinding's suggestion", () => {
  const def = createFindingDef();

  it("is a field the model can fill", () => {
    expect(def).toMatch(/suggestion: \{/);
  });

  it("is required, like the prompts say it is", () => {
    // The last `required` in the definition is the tool's own; the earlier ones
    // belong to the nested alternative and cross-reference objects.
    const lists = [...def.matchAll(/required: \[([^\]]*)\]/g)];
    expect(lists.length).toBeGreaterThan(0);
    expect(lists[lists.length - 1][1]).toMatch(/"suggestion"/);
  });

  it("is persisted as what the model wrote, not as the rationale", () => {
    const executor = TOOLS.slice(
      TOOLS.indexOf("async function executeCreateFinding"),
      TOOLS.indexOf("async function executeReadSeriesDocument")
    );
    expect(executor).not.toMatch(/suggestion: sanitizedRationale,/);
    // Persisted as the model's own sentence, script-enforced like the rest of
    // the finding, and only falling back to the rationale when it is empty.
    expect(executor).toMatch(
      /suggestion: enforceBookScript\(sanitizedSuggestion \|\| sanitizedRationale, lang\)/
    );
  });

  it("is sanitized the same way the description and rationale are", () => {
    const executor = TOOLS.slice(
      TOOLS.indexOf("async function executeCreateFinding"),
      TOOLS.indexOf("async function executeReadSeriesDocument")
    );
    expect(executor).toMatch(/const sanitizedSuggestion = stripFabricatedFingerprintQuotes\(/);
  });
});
