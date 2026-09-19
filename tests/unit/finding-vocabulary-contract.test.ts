/**
 * A-07 / A-08 / A-45 / A-48 — one editorial vocabulary, shared by the prompt
 * that instructs it, the schema that accepts it and the code that reads it.
 *
 * The severity half of this was V-4: four consumers filtered on "major", a
 * value `CreateFinding`'s strict enum rejects, and 0 of 255 live findings were
 * ever "major". The category half was the same bug three times over:
 *
 *  - the continuity checker's prompt mandates `continuity:<domain>` in six
 *    places and the tool enum accepted only a bare "continuity", so every one
 *    of those calls was rejected at the API boundary;
 *  - the publishing editor was told to emit severities "major"/"minor" and
 *    categories like "11-dialogue-formatting" — none of which exist;
 *  - three lists of categories disagreed: the tool schema accepted pov,
 *    setting and foreshadowing (unlabelled in every language), while the
 *    filter offered plot, voice, general and tense (unemittable).
 *
 * This test fails when a fourth list appears, when a prompt instructs a value
 * the schema rejects, or when a category loses its label.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  CONTINUITY_CATEGORIES,
  FILTERABLE_FINDING_CATEGORIES,
  isContinuityCategory,
  findingCategoryLabel,
} from "@/lib/i18n/finding-labels";
import { BASE_INSTRUCTIONS, WORKFLOW_INSTRUCTION_OVERRIDES, CONDUCTOR_WORKFLOW_INSTRUCTIONS } from "@/lib/agents/prompt-assembler";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

describe("the vocabulary itself", () => {
  it("carries the six continuity domains the checker is told to file", () => {
    expect(CONTINUITY_CATEGORIES).toEqual([
      "continuity:characters",
      "continuity:timeline",
      "continuity:geography",
      "continuity:objects",
      "continuity:relationships",
      "continuity:world",
    ]);
  });

  it("gives every category a label in every language", () => {
    const unlabelled: string[] = [];
    for (const category of FINDING_CATEGORIES) {
      for (const language of LANGUAGES) {
        const label = findingCategoryLabel(category, language);
        // pick() falls back to the raw slug, which is how "pov" and
        // "foreshadowing" reached the writer as slugs.
        if (label === category) unlabelled.push(`${category} (${language})`);
      }
    }
    expect(unlabelled).toEqual([]);
  });

  it("folds the qualified continuity domains into one filter row", () => {
    expect(FILTERABLE_FINDING_CATEGORIES).toContain("continuity");
    expect(FILTERABLE_FINDING_CATEGORIES.some(isContinuityCategory)).toBe(true);
    expect(
      FILTERABLE_FINDING_CATEGORIES.filter((c) => c.startsWith("continuity:"))
    ).toEqual([]);
  });
});

describe("the CreateFinding schema", () => {
  const tools = read("lib", "agents", "tools.ts");

  it("is built from the shared vocabulary, not a second copy", () => {
    expect(tools).toContain("enum: FINDING_CATEGORIES");
    expect(tools).toContain("enum: [...FINDING_SEVERITIES]");
    expect(tools).not.toMatch(/const FINDING_CATEGORIES = \[/);
  });
});

describe("the prompts that instruct the vocabulary", () => {
  const promptText = [
    ...Object.values(BASE_INSTRUCTIONS),
    ...Object.values(WORKFLOW_INSTRUCTION_OVERRIDES),
    ...Object.values(CONDUCTOR_WORKFLOW_INSTRUCTIONS),
  ].join("\n");

  it("never instruct a severity the tool rejects", () => {
    // These read as severities in an editorial sentence and are not ones.
    const rejected = ["moderate", "minor"];
    const instructed = rejected.filter((word) =>
      new RegExp('severity[^\\n]*"' + word + '"', "i").test(promptText)
    );
    expect(instructed).toEqual([]);
    expect(promptText).not.toContain('"major" (significant formatting');
  });

  it("never instruct a category the tool rejects", () => {
    const quoted = new Set<string>();
    for (const line of promptText.split("\n")) {
      if (!/category/i.test(line)) continue;
      for (const m of line.matchAll(/"([a-z][\w:-]{2,})"/g)) quoted.add(m[1]);
    }
    const unknown = [...quoted].filter(
      (value) =>
        !(FINDING_CATEGORIES as string[]).includes(value) &&
        !(FINDING_SEVERITIES as readonly string[]).includes(value)
    );
    expect(unknown).toEqual([]);
  });

  it("still asks the continuity checker to name its domain", () => {
    expect(promptText).toContain('"continuity:characters"');
  });
});

describe("the code that reads a finding's category", () => {
  it("promotes to the blackboard on categories that exist", () => {
    const blackboard = read("lib", "agents", "blackboard.ts");
    const block = blackboard.slice(
      blackboard.indexOf("const categoryToDomain"),
      blackboard.indexOf("};", blackboard.indexOf("const categoryToDomain"))
    );
    const keys = [...block.matchAll(/^\s+"?([\w:-]+)"?:/gm)].map((m) => m[1]);
    const unknown = keys.filter((k) => !(FINDING_CATEGORIES as string[]).includes(k));
    expect(unknown).toEqual([]);
    expect(keys.length).toBeGreaterThan(5);
  });

  it("cascades warnings from categories that exist", () => {
    const postSession = read("lib", "agents", "post-session.ts");
    expect(postSession).toContain("...CONTINUITY_CATEGORIES");
    expect(postSession).not.toContain('"world-building",');
  });

  it("asks the API for the whole continuity domain, not the bare slug", () => {
    const route = read(
      "app", "api", "books", "[id]", "editorial", "findings", "route.ts"
    );
    expect(route).toContain('startsWith: "continuity"');
  });
});
