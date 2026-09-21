import { describe, it, expect } from "vitest";
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";
import {
  FINDING_CATEGORIES,
  FINDING_SEVERITIES,
  FINDING_STATUSES,
  findingCategoryLabel,
  findingSeverityLabel,
  findingStatusLabel,
} from "@/lib/i18n/finding-labels";
import { UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

/**
 * The sixth dimension: copy that lives in `lib/`.
 *
 * The four JSX scans read `src/app` and `src/components`, because that is
 * where markup is. But the writer also reads the tables behind it — the
 * document-type names the agent stream prints, the vocabulary of a finding —
 * and those live in `lib/`, one table per language, where no scan reaches.
 *
 * A parallel table is translated by hand, so it fails the same way every
 * time: the first hand fills in six languages, the next hand adds a row to
 * English only, and the other six keep the English word. This is the contract
 * that catches that row.
 */

const OTHER_LANGUAGES = UI_SUPPORTED_LANGUAGES.map((lang) => lang.code).filter(
  (code) => code !== "en"
);

/**
 * Entries that are genuinely the same word in a language, listed as
 * `<language>.<key>` with the reason beside them.
 */
const COGNATES = new Set<string>([
  // French spells these exactly as English does, and the Académie's word for
  // each is the English one: a concept, a synopsis, the architecture of a
  // book, a dialogue, the prose, the tension, the structure.
  "fr.CONCEPT",
  "fr.SYNOPSIS",
  "fr.ARCHITECTURE",
  "fr.dialogue",
  "fr.prose",
  "fr.tension",
  "fr.structure",
  // "Important" and "Suggestion" are French words too — the severity a
  // reviewer picks and the mildest thing an editor can say.
  "fr.important",
  "fr.suggestion",
  // German capitalises the noun it borrowed whole: die Emotion.
  "de.emotion",
  // Spanish "general" is the same adjective, used the same way.
  "es.general",
]);

function offenders(
  keys: readonly string[],
  label: (key: string, language: string) => string
): string[] {
  const found: string[] = [];
  for (const language of OTHER_LANGUAGES) {
    for (const key of keys) {
      const english = label(key, "en");
      if (COGNATES.has(`${language}.${key}`)) continue;
      if (label(key, language) === english) found.push(`${language}.${key} — ${english}`);
    }
  }
  return found;
}

describe("the copy tables behind the agent stream", () => {
  it("name every document type in the writer's language", () => {
    const types = Object.keys(getDocumentTypeLabels("en"));
    expect(types.length).toBeGreaterThan(20);
    expect(
      offenders(types, (key, language) => getDocumentTypeLabels(language)[key])
    ).toEqual([]);
  });
});

describe("the vocabulary of a finding", () => {
  it("names every category in the writer's language", () => {
    expect(offenders(FINDING_CATEGORIES, findingCategoryLabel)).toEqual([]);
  });

  it("names every severity in the writer's language", () => {
    expect(offenders(FINDING_SEVERITIES, findingSeverityLabel)).toEqual([]);
  });

  it("names every status in the writer's language", () => {
    expect(offenders(FINDING_STATUSES, findingStatusLabel)).toEqual([]);
  });
});
