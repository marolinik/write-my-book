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
  AI_TELL_DETECTION,
  PUBLISHING_STANDARDS,
  SENSITIVITY_GUIDELINES,
} from "./writing-craft";
import { getSkillsForAgent } from "./advanced-craft";
import {
  getGenreGuide,
  formatGenreGuideForPrompt,
  type GenreGuide,
} from "./genre-guides";

/** writing-craft extras layered on top of the advanced-craft per-agent mapping */
const CRAFT_EXTRAS: Record<string, readonly string[]> = {
  "writing-coach": [NARRATIVE_TECHNIQUES],
  // NOT ghostwriter — its BASE_INSTRUCTIONS already embed the AI-tell list
  "line-editor": [AI_TELL_DETECTION],
  "beta-reader": [SENSITIVITY_GUIDELINES],
  "world-researcher": [SENSITIVITY_GUIDELINES],
  "market-reader": [PUBLISHING_STANDARDS],
  "publishing-editor": [PUBLISHING_STANDARDS],
};

/** Agents that get the full 7-section genre guide (~3.1-3.6k chars) */
const FULL_GENRE_AGENTS = new Set(["dev-editor", "beta-reader", "story-architect"]);

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
 * Returns "" for agents with no mapped skills (e.g. style-analyst).
 */
export function selectSkillsForAgent(
  agentType: string,
  genre?: string | null
): string {
  const parts: string[] = [
    ...getSkillsForAgent(agentType),
    ...(CRAFT_EXTRAS[agentType] ?? []),
  ];

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
