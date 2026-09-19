/**
 * Which domain a continuity problem belongs to.
 *
 * Two vocabularies reach this tab and only one of them was ever consulted:
 *
 *  - EditFinding.category — the tab fetches with `?category=continuity`, so by
 *    the time a row arrives this field is the constant "continuity". Classifying
 *    by it answered "other" for every finding, which is why six domain cards sat
 *    permanently empty while Ostalo held all 27 (S3-22).
 *  - ContinuityFlag.type — `dead_character_reappears`, `timeline_violation`,
 *    `location_conflict`, `relationship_contradiction`, `attribute_conflict`.
 *    This one names the domain outright, and was never read here.
 *
 * A bare "continuity" still goes to Other. Guessing a domain from a sentence
 * would make the cards look informative while being wrong, which is worse than
 * an honest Other.
 */

/** Flag types, which say the domain in their name. */
const BY_FLAG_TYPE: Record<string, string> = {
  dead_character_reappears: "characters",
  character_conflict: "characters",
  timeline_violation: "timeline",
  location_conflict: "geography",
  relationship_contradiction: "relationships",
  attribute_conflict: "objects",
  world_rule_violation: "world",
};

/** Substrings of a finding category that name a domain. */
const BY_CATEGORY: Array<[string, string[]]> = [
  ["characters", ["character", "characters", "character-consistency"]],
  ["timeline", ["timeline", "chronology", "time-consistency"]],
  ["geography", ["geography", "location", "setting"]],
  ["objects", ["object", "prop", "item", "attribute"]],
  ["relationships", ["relationship", "relations"]],
  ["world", ["world", "worldbuilding", "rules", "magic"]],
];

/**
 * Resolves a domain from either vocabulary, or "other" when neither names one.
 */
export function categorizeContinuity(value: string): string {
  const lower = (value ?? "").toLowerCase().trim();
  if (lower.length === 0) return "other";

  const byType = BY_FLAG_TYPE[lower];
  if (byType) return byType;

  // "continuity:characters" — what the checker should write so a finding
  // carries its own domain instead of leaving the tab to infer one.
  const qualified = lower.startsWith("continuity:")
    ? lower.slice("continuity:".length)
    : null;
  if (qualified) {
    for (const [domain, needles] of BY_CATEGORY) {
      if (domain === qualified || needles.includes(qualified)) return domain;
    }
    return "other";
  }

  // A bare "continuity" says nothing about WHICH domain the conflict is in.
  if (lower === "continuity") return "other";

  for (const [domain, needles] of BY_CATEGORY) {
    if (needles.some((needle) => lower.includes(needle))) return domain;
  }
  return "other";
}
