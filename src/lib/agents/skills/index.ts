/**
 * Skill selection for agent prompt assembly.
 *
 * Maps each agent type to its relevant craft skills (advanced-craft per-agent
 * mapping + writing-craft extras) and matches genre guides to the book's
 * genre. Selective by design: full skill dumps duplicate BASE_INSTRUCTIONS
 * and waste budget — each agent gets only what its role uses.
 */

import {
  NARRATIVE_TECHNIQUES,
  PUBLISHING_STANDARDS,
  SENSITIVITY_GUIDELINES,
} from "./writing-craft";
import { getAiTellGuidance } from "../ai-tells";
import { getSkillsForAgent } from "./advanced-craft";
import {
  getGenreGuide,
  formatGenreGuideForPrompt,
  type GenreGuide,
} from "./genre-guides";

/** writing-craft extras layered on top of the advanced-craft per-agent mapping */
const CRAFT_EXTRAS: Record<string, readonly string[]> = {
  "writing-coach": [NARRATIVE_TECHNIQUES],
  "beta-reader": [SENSITIVITY_GUIDELINES],
  "world-researcher": [SENSITIVITY_GUIDELINES],
  "market-reader": [PUBLISHING_STANDARDS],
  "publishing-editor": [PUBLISHING_STANDARDS],
};

/** Agents that get the full 7-section genre guide (~3.1-3.6k chars) */
// market-reader judges genre fit across five markets — the genre guide is
// the one thing its job cannot be done without, and it used to get none.
const FULL_GENRE_AGENTS = new Set([
  "dev-editor",
  "beta-reader",
  "story-architect",
  "market-reader",
]);

/** Prose-focused agents get only the proseStyle + pitfalls slice (~1.1k chars) */
const PROSE_GENRE_AGENTS = new Set(["ghostwriter", "line-editor"]);

function formatGenreProseStyle(guide: GenreGuide): string {
  return `<genre_guide genre="${guide.genre}">
## Prose Style for This Genre
${guide.proseStyle}

## Common Pitfalls to Avoid
${guide.commonPitfalls}
</genre_guide>`;
}

/**
 * Select craft skills + genre guidance for an agent.
 * Every agent type has a mapping; "" means a genuinely unknown agent type.
 */
/** The agents that hunt or avoid AI tells, and so need them in their own language. */
const AI_TELL_AGENTS = new Set(["line-editor", "ghostwriter"]);

export function selectSkillsForAgent(
  agentType: string,
  genre?: string | null,
  language?: string | null
): string {
  const parts: string[] = [
    ...getSkillsForAgent(agentType),
    ...(CRAFT_EXTRAS[agentType] ?? []),
  ];

  // A-23: the tells belong to the book's language. The English list was
  // injected regardless, so on a Serbian book the line editor's AI-tell check
  // could not fire once.
  if (AI_TELL_AGENTS.has(agentType)) {
    parts.push(getAiTellGuidance(language ?? undefined));
  }

  const guide = getGenreGuide(genre);
  if (guide) {
    if (FULL_GENRE_AGENTS.has(agentType)) {
      parts.push(formatGenreGuideForPrompt(guide));
    } else if (PROSE_GENRE_AGENTS.has(agentType)) {
      parts.push(formatGenreProseStyle(guide));
    }
  }

  return parts.join("\n\n");
}
