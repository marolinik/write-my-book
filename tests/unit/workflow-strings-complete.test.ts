/**
 * H-4 / H-5 — every workflow has a name and a description in every language.
 *
 * `agent-strings.ts` typed its two maps as `Record<string, string>`, so a
 * missing translation was invisible to TypeScript: sr was short 10 labels and
 * 16 descriptions, de/es/fr/ru/zh were short 22 and 31, and even English was
 * short 10 and 16. Nobody noticed because the fallback was the registry's
 * ENGLISH label — a missing Serbian translation rendered as ordinary English,
 * which passes any test that only asserts "it renders something".
 *
 * The maps are keyed by WorkflowId now, so the next gap is a build error. This
 * test guards the half TypeScript cannot see: that WORKFLOW_IDS still matches
 * the registry, and that no language quietly shipped the English string.
 */

import { describe, it, expect } from "vitest";
import { getAllWorkflows, WORKFLOW_IDS } from "@/lib/agents/workflows";
import { getAgentStrings, workflowLabel, workflowDescription } from "@/lib/i18n/agent-strings";

const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

describe("the workflow id list", () => {
  it("is exactly the registry's, so a new workflow must be translated", () => {
    const registry = getAllWorkflows().map((w) => w.id).sort();
    expect([...WORKFLOW_IDS].sort()).toEqual(registry);
  });
});

describe("every language names every workflow", () => {
  for (const lang of LANGUAGES) {
    it(`${lang} has a label and a description for all ${WORKFLOW_IDS.length}`, () => {
      const strings = getAgentStrings(lang);
      const missingLabels = WORKFLOW_IDS.filter((id) => !workflowLabel(strings, id));
      const missingDescriptions = WORKFLOW_IDS.filter((id) => !workflowDescription(strings, id));
      expect(missingLabels).toEqual([]);
      expect(missingDescriptions).toEqual([]);
    });
  }

  it("does not ship English as a translation", () => {
    const en = getAgentStrings("en");
    for (const lang of LANGUAGES.filter((l) => l !== "en")) {
      const strings = getAgentStrings(lang);
      const echoed = WORKFLOW_IDS.filter(
        (id) =>
          workflowLabel(strings, id) === workflowLabel(en, id) &&
          // Proper nouns and borrowings legitimately match across languages.
          !["freewrite", "beta-read", "coach"].includes(id)
      );
      expect(echoed, `${lang} repeats the English label`).toEqual([]);
    }
  });
});
