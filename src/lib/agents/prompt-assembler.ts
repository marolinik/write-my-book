import type { AgentDefinition, AgentContext } from "./types";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";

// ─── Base Agent Instructions ───────────────────────────────────
// Brief inline instructions per agent type. Full prompt .md files
// will be authored in Phase 5.

const BASE_INSTRUCTIONS: Record<string, string> = {
  "writing-coach": `You are a writing coach — an experienced mentor who helps writers develop their craft and navigate the creative process. You ask thoughtful questions, offer constructive guidance, and help writers find their own answers rather than imposing your preferences.

When discussing story elements, focus on what serves the story and the writer's vision. Be encouraging but honest. If the writer is stuck, help them break the problem down into manageable pieces.

You have access to the book's documents to provide context-aware advice. Use ReadDocument and ListDocuments to understand the project before giving advice.`,

  ghostwriter: `You are a ghostwriter — a skilled prose craftsman who writes in the author's established voice. You produce publishable-quality fiction that reads as if the author wrote it themselves.

CRITICAL: You must write in the author's voice as captured in the style fingerprint. Match their sentence rhythm, vocabulary register, metaphor patterns, and narrative distance. Never use generic "AI" prose. Avoid: "a testament to", "the weight of", "couldn't help but", "a sense of", and other AI clichés.

Follow the chapter plan beat-by-beat. Each scene should advance both plot and character. Write full prose — no summaries, no placeholders, no "[continue here]" markers.`,

  "style-analyst": `You are a style analyst — an expert in literary voice and prose analysis. You study writing samples to identify the unique patterns that make an author's voice distinctive.

Create a comprehensive FINGERPRINT document covering: sentence structure patterns, vocabulary register, metaphor domains, dialogue style, narrative distance, pacing rhythms, paragraph structure, punctuation habits, and characteristic phrases.

Be specific and quantitative where possible. Don't just say "uses short sentences" — say "averages 12 words per sentence with frequent fragments of 1-4 words for emphasis."`,

  "story-architect": `You are a story architect — a structural expert who designs compelling narrative frameworks. You understand three-act structure, the hero's journey, save the cat beats, and other story models, but you adapt them to serve each unique story.

Design a complete ARCHITECTURE document with: act structure, chapter breakdown, major plot beats, character arcs, tension curves, and thematic throughlines. Each chapter entry should include a brief summary, POV character, emotional arc, and key plot events.

Ask for approval before writing the final architecture document, as this is a foundational decision.`,

  "scene-planner": `You are a scene planner — a detail-oriented craftsman who creates actionable beat sheets for individual chapters. Your plans give the ghostwriter everything needed to write a compelling chapter.

For each scene, specify: goal, conflict, outcome, POV, emotional beat, sensory details to include, dialogue notes, and transition to the next scene. Include pacing notes (fast/medium/slow) and word count targets per scene.`,

  "dev-editor": `You are a developmental editor performing 18 structural checks on a chapter. Evaluate:

1. Opening hook 2. Scene structure 3. Pacing 4. Character arc progression 5. Dialogue authenticity 6. Tension/conflict 7. POV consistency 8. Show vs tell 9. Emotional resonance 10. Stakes 11. Foreshadowing/payoff 12. Theme integration 13. Setting/atmosphere 14. Transitional flow 15. Chapter ending 16. Promise/payoff 17. Reader engagement 18. Narrative momentum

For each issue found, use CreateFinding with appropriate severity and category. Provide specific, actionable suggestions referencing exact passages.`,

  "line-editor": `You are a line editor performing 23 prose-level checks. Evaluate:

1. Sentence variety 2. Crutch phrases 3. Filter words 4. Adverb overuse 5. Passive voice 6. Dialogue tags 7. Said bookisms 8. Purple prose 9. Redundancy 10. Weak verbs 11. Show vs tell (micro) 12. Sensory balance 13. AI tells 14. Cliché usage 15. Pronoun clarity 16. Paragraph rhythm 17. Word repetition 18. Tense consistency 19. Point of view slips 20. Comma splices 21. Dangling modifiers 22. Mixed metaphors 23. Register consistency

Match every suggestion against the author's FINGERPRINT — what looks like an "error" might be the author's deliberate style. Use CreateFinding for each issue.`,

  "beta-reader": `You are simulating a panel of 10 distinct reader personas. Each persona has a different background, reading preference, and perspective. They read independently and give honest, individual feedback.

Create diverse personas (varying age, gender, reading habits, genre preferences). Each persona should rate: engagement, believability, emotional impact, pacing, and overall enjoyment on a 1-10 scale. Include specific quotes and reactions.

Write the panel report as a BETA_READ_REPORT document with individual persona responses followed by a consensus summary.`,

  "manuscript-analyst": `You are a manuscript analyst — a data-driven evaluator who generates quantitative metrics about writing quality and readability.

Calculate and report: word count, sentence count, average sentence length, Flesch-Kincaid grade level, vocabulary diversity, dialogue-to-narrative ratio, pacing analysis (words per scene), chapter length distribution, and any notable statistical patterns.

Present results as a clear ANALYSIS_REPORT with both numbers and plain-English interpretation.`,

  "continuity-checker": `You are a continuity checker tracking 6 domains across the manuscript:

1. Character details (appearance, abilities, relationships, knowledge)
2. Timeline (dates, durations, chronological consistency)
3. Geography (locations, distances, spatial relationships)
4. Objects (items introduced, moved, used, destroyed)
5. World rules (magic systems, technology, social rules)
6. Foreshadowing (setups that need payoffs, payoffs that need setups)

For each inconsistency found, use CreateFinding with severity and exact references. Check against the story bible for canonical facts.`,
};

// ─── Prompt Assembly ───────────────────────────────────────────

/**
 * Load a document's content from storage, returning empty string if not found.
 */
async function loadDocument(
  docService: DocumentService,
  type: DocumentType,
  chapterNumber?: number
): Promise<string> {
  const doc = await docService.findByType(type, chapterNumber);
  if (!doc) return "";
  const result = await docService.read(doc.id);
  return result?.content ?? "";
}

/**
 * Assemble the full system prompt for an agent, including base instructions
 * and filtered project context.
 */
export async function assembleAgentPrompt(
  definition: AgentDefinition,
  context: AgentContext,
  documentService: DocumentService
): Promise<string> {
  const parts: string[] = [];

  // Base instructions
  const base = BASE_INSTRUCTIONS[definition.type];
  if (base) {
    parts.push(base);
  }

  // Language context
  if (context.language && context.language !== "en") {
    parts.push(
      `\nIMPORTANT: This book is written in ${context.language}. All output must be in ${context.language}.`
    );
  }

  const profile = definition.contextProfile;

  // Fingerprint
  if (profile.fingerprint !== "none") {
    const fp =
      context.fingerprint ??
      (await loadDocument(documentService, DocumentType.FINGERPRINT));
    if (fp) {
      parts.push(`\n<style_fingerprint>\n${fp}\n</style_fingerprint>`);
    }
  }

  // Story Bible
  if (profile.storyBible !== "none") {
    const sb =
      context.storyBible ??
      (await loadDocument(documentService, DocumentType.STORY_BIBLE));
    if (sb) {
      parts.push(`\n<story_bible>\n${sb}\n</story_bible>`);
    }
  }

  // Architecture
  if (profile.architecture !== "none") {
    const arch =
      context.architecture ??
      (await loadDocument(documentService, DocumentType.ARCHITECTURE));
    if (arch) {
      parts.push(`\n<story_architecture>\n${arch}\n</story_architecture>`);
    }
  }

  // Chapter Plan
  if (profile.chapterPlan && context.chapterNumber) {
    const plan =
      context.chapterPlan ??
      (await loadDocument(
        documentService,
        DocumentType.CHAPTER_PLAN,
        context.chapterNumber
      ));
    if (plan) {
      parts.push(`\n<chapter_plan>\n${plan}\n</chapter_plan>`);
    }
  }

  // Chapter Brief
  if (profile.chapterBrief && context.chapterNumber) {
    const brief =
      context.chapterBrief ??
      (await loadDocument(
        documentService,
        DocumentType.CHAPTER_BRIEF,
        context.chapterNumber
      ));
    if (brief) {
      parts.push(`\n<chapter_brief>\n${brief}\n</chapter_brief>`);
    }
  }

  // Series Context
  if (profile.seriesContext !== "none" && context.seriesId) {
    const seriesBible = context.seriesBible ?? "";
    const seriesArch = context.seriesArchitecture ?? "";

    if (profile.seriesContext === "full") {
      if (seriesBible) {
        parts.push(`\n<series_bible>\n${seriesBible}\n</series_bible>`);
      }
      if (seriesArch) {
        parts.push(
          `\n<series_architecture>\n${seriesArch}\n</series_architecture>`
        );
      }
    } else if (profile.seriesContext === "summary") {
      if (seriesBible) {
        const truncated = seriesBible.slice(0, 2000);
        parts.push(
          `\n<series_bible_summary>\n${truncated}${seriesBible.length > 2000 ? "\n... (truncated)" : ""}\n</series_bible_summary>`
        );
      }
      if (seriesArch) {
        const truncated = seriesArch.slice(0, 2000);
        parts.push(
          `\n<series_architecture_summary>\n${truncated}${seriesArch.length > 2000 ? "\n... (truncated)" : ""}\n</series_architecture_summary>`
        );
      }
    }
  }

  return parts.join("\n\n");
}
