import { describe, it, expect } from "vitest";
import { getAllJourneys } from "@/lib/agents/journeys";
import { getAllWorkflows } from "@/lib/agents/workflows";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

/**
 * A journey and a workflow are named twice: once in `lib/agents`, in English,
 * because that is where the definition lives, and once per language in the
 * agent dictionary. Every surface renders the dictionary and falls back to the
 * definition — `as.journeyLabels[id] ?? journey.label`.
 *
 * That fallback is invisible. A journey added to the definition file and not
 * to the dictionary renders in English in all seven languages and nothing
 * reports it, because the code path is the same one a working translation
 * takes. This is the contract that makes the fallback unreachable.
 *
 * `workflowLabel` falls back to the English dictionary before it falls back
 * to the definition, so asking it for a label can never come up empty. The
 * contract reads each language's own table instead, and asks the second
 * question too: whether what it holds is the English word again.
 */

const LANGUAGES = UI_SUPPORTED_LANGUAGES.map((lang) => lang.code);
const OTHER_LANGUAGES = LANGUAGES.filter((code) => code !== "en");

/**
 * Names that are the same word in a language as in English, with the reason
 * beside them.
 */
const COGNATES = new Set<string>([]);

/** Every id, read straight from one language's own table. */
function untranslated(
  ids: readonly string[],
  table: (language: string) => Record<string, string | undefined>
): string[] {
  const missing = LANGUAGES.flatMap((language) =>
    ids.filter((id) => !table(language)[id]).map((id) => `${language}.${id} — missing`)
  );
  const english = table("en");
  const copied = OTHER_LANGUAGES.flatMap((language) =>
    ids
      .filter(
        (id) =>
          !COGNATES.has(`${language}.${id}`) &&
          !!table(language)[id] &&
          table(language)[id] === english[id]
      )
      .map((id) => `${language}.${id} — still English`)
  );
  return [...missing, ...copied];
}

describe("every journey the selector offers", () => {
  const journeys = getAllJourneys();

  const ids = journeys.map((journey) => journey.id);

  it("is named in every language", () => {
    expect(ids.length).toBeGreaterThan(2);
    expect(untranslated(ids, (language) => getAgentStrings(language).journeyLabels)).toEqual([]);
  });

  it("is described in every language", () => {
    expect(
      untranslated(ids, (language) => getAgentStrings(language).journeyDescriptions)
    ).toEqual([]);
  });
});

describe("every workflow an agent can run", () => {
  const workflows = getAllWorkflows();

  const ids = workflows.map((workflow) => workflow.id);

  it("is named in every language", () => {
    expect(ids.length).toBeGreaterThan(5);
    expect(
      untranslated(ids, (language) =>
        getAgentStrings(language).workflows as Record<string, string | undefined>
      )
    ).toEqual([]);
  });

  it("is described in every language", () => {
    expect(
      untranslated(ids, (language) =>
        getAgentStrings(language).workflowDescriptions as Record<string, string | undefined>
      )
    ).toEqual([]);
  });
});
