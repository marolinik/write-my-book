import type { AgentDefinition, AgentType, ModelTier } from "./types";

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    name: "Writing Coach",
    type: "writing-coach",
    description:
      "The user's trusted creative partner and conductor of the specialist agent team. Always the agent the user talks to.",
    writerDescription:
      "Your personal writing coach. Guides you through the entire writing process and coordinates specialist agents.",
    defaultModel: "opus",
    allowedModels: ["opus"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ReadChapter",
      "ReadAllChapters",
      "ListDocuments",
      "RequestApproval",
      "QueryGraph",
      "PostInsight",
      "ReadInsights",
      "SearchMemory",
      "RememberInsight",
      "DelegateToSpecialist",
      "WebSearch",
      "FetchWebPage",
    ],
    contextProfile: {
      fingerprint: "full",
      storyBible: "full",
      synopsis: "none",
      architecture: "full",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: true,
      chapterBrief: true,
      // discuss-edits and revise both open by reading the chapter's findings,
      // and no tool anywhere can read one. The only route is this injection.
      findingHistory: true,
      bookMeta: false,
      seriesContext: "summary",
    },
  },
  {
    name: "Ghostwriter",
    type: "ghostwriter",
    description:
      "Writes prose in the author's established voice using the style fingerprint, story architecture, and chapter plan.",
    writerDescription:
      "Writes chapter drafts in your voice. Needs a style fingerprint and chapter plan to work from.",
    defaultModel: "opus",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ReadChapter",
      "WriteChapter",
      "ListDocuments",
      "RequestApproval",
      "QueryGraph",
      "UpdateGraphEntity",
      "SearchMemory",
      "RememberInsight",
      "ReadInsights",
    ],
    contextProfile: {
      fingerprint: "full",
      storyBible: "chapter-relevant",
      synopsis: "full",
      architecture: "full",
      chapterContent: true,
      adjacentChapters: "one-each",
      chapterPlan: true,
      chapterBrief: true,
      // REVISION MODE revises against editorial findings; passing them through
      // the delegation task alone lost them whenever the task was summarised.
      findingHistory: true,
      bookMeta: true,
      seriesContext: "summary",
    },
  },
  {
    name: "Style Analyst",
    type: "style-analyst",
    description:
      "Analyzes writing samples to create a detailed FINGERPRINT document capturing the author's unique voice.",
    writerDescription:
      "Analyzes your writing to capture your unique voice and style patterns.",
    defaultModel: "opus",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      // A fingerprint is derived from prose. Without an enumeration tool the
      // analyst knew no chapter numbers, and ReadChapter alone was a guess.
      "ListChapters",
      "ReadChapter",
      "ReadAllChapters",
      "ListDocuments",
      "SearchMemory",
      "RememberInsight",
      "SetVoiceMetrics",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "none",
      synopsis: "none",
      architecture: "none",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "none",
    },
  },
  {
    name: "Story Architect",
    type: "story-architect",
    description:
      "Designs act and chapter structure, builds the story architecture document with beats, arcs, and pacing.",
    writerDescription:
      "Designs your story structure — acts, chapters, character arcs, and pacing.",
    defaultModel: "opus",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ListDocuments",
      // O12 — the restructure pass reasons over the chapter table and the prose
      // of the chapters it wants to move, then files each move as a proposal.
      "ListChapters",
      "ReadChapter",
      "ProposeStructureMove",
      "RequestApproval",
      "ReadSeriesDocument",
      "WriteSeriesDocument",
      "QueryGraph",
      "UpdateGraphEntity",
      "SearchMemory",
      "RememberInsight",
      "ReadInsights",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "full",
      synopsis: "full",
      architecture: "full",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "full",
    },
  },
  {
    name: "Scene Planner",
    type: "scene-planner",
    description:
      "Creates detailed beat sheets and scene breakdowns for individual chapters.",
    writerDescription:
      "Plans scenes and beats for a chapter, creating a detailed writing roadmap.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ListDocuments",
      // write-synopsis on an imported manuscript works backwards from the prose
      // that is already there; both tools are named in that prompt.
      "ListChapters",
      "ReadChapter",
      "ReadAllChapters",
      "QueryGraph",
      "SearchMemory",
      "ReadInsights",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "chapter-relevant",
      synopsis: "none",
      architecture: "full",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: true,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "summary",
    },
  },
  {
    name: "Developmental Editor",
    type: "dev-editor",
    description:
      "Performs 18 structural checks on a chapter: pacing, character arc, tension, dialogue, POV consistency, etc.",
    writerDescription:
      "Deep structural edit — checks pacing, character arcs, tension, dialogue, and more.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ReadChapter",
      "ListDocuments",
      "CreateFinding",
      "QueryGraph",
      "SearchMemory",
      "PostInsight",
      "ReadInsights",
    ],
    contextProfile: {
      fingerprint: "full",
      storyBible: "full",
      synopsis: "full",
      architecture: "full",
      chapterContent: true,
      adjacentChapters: "summaries-all",
      chapterPlan: true,
      chapterBrief: true,
      findingHistory: true,
      bookMeta: true,
      seriesContext: "summary",
    },
  },
  {
    name: "Line Editor",
    type: "line-editor",
    description:
      "Performs 23 prose-level checks: sentence variety, crutch phrases, filter words, show-vs-tell, AI tells, etc.",
    writerDescription:
      "Line-by-line prose polish — catches crutch phrases, weak verbs, and AI-sounding language.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ReadChapter",
      "ListDocuments",
      "CreateFinding",
      "SearchMemory",
      "PostInsight",
      "ReadInsights",
    ],
    contextProfile: {
      fingerprint: "full",
      storyBible: "chapter-relevant",
      synopsis: "none",
      architecture: "none",
      chapterContent: true,
      adjacentChapters: "one-each",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "none",
    },
  },
  {
    name: "Beta Reader Panel",
    type: "beta-reader",
    description:
      "Simulates 10 distinct reader personas who each evaluate the chapter independently.",
    writerDescription:
      "Simulates a panel of diverse readers giving you honest feedback on your chapter.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ReadChapter",
      "ListDocuments",
      "CreateFinding",
      "PostInsight",
      "ReadInsights",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "characters-only",
      synopsis: "none",
      architecture: "full",
      chapterContent: true,
      adjacentChapters: "summaries-all",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: true,
      bookMeta: true,
      seriesContext: "none",
    },
  },
  {
    name: "Manuscript Analyst",
    type: "manuscript-analyst",
    description:
      "Calculates readability metrics, pacing analysis, word frequency, and chapter-level statistics.",
    writerDescription:
      "Generates statistics and readability metrics for your manuscript.",
    defaultModel: "haiku",
    allowedModels: ["sonnet", "haiku"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      // Total word count, chapter-length comparison and a book-wide pacing
      // curve are all book-level questions; ReadChapter alone could not
      // answer one of them without knowing what the chapters are.
      "ListChapters",
      "ReadChapter",
      "ReadAllChapters",
      "ListDocuments",
      "SearchMemory",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "none",
      synopsis: "none",
      architecture: "none",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "none",
    },
  },
  {
    name: "Continuity Checker",
    type: "continuity-checker",
    description:
      "Tracks 6 domains: character details, timeline, geography, objects, world rules, and foreshadowing.",
    writerDescription:
      "Catches continuity errors — character details, timeline, geography, and world consistency.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: [
      "ReadDocument",
      "WriteDocument",
      "ReadChapter",
      "ReadAllChapters",
      "ListChapters",
      "ListDocuments",
      "CreateFinding",
      "ReadSeriesDocument",
      "WriteSeriesDocument",
      // O9: cross-book checking used to run off concatenated series documents,
      // where a book that never contributed was simply invisible. These reach
      // a sibling book's actual prose.
      "ListSeriesBooks",
      "ReadSiblingChapter",
      "QueryGraph",
      "SearchMemory",
      "PostInsight",
      "ReadInsights",
      "ResolveInsight",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "full",
      synopsis: "full",
      architecture: "full",
      chapterContent: true,
      adjacentChapters: "summaries-all",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: true,
      bookMeta: true,
      seriesContext: "full",
    },
  },
  {
    name: "Manuscript Reader",
    type: "manuscript-reader",
    description:
      "Analyzes existing manuscripts through 5 passes — structure, characters, themes, style, and gaps — to build a comprehensive understanding of a brownfield project.",
    writerDescription:
      "Analyze an existing manuscript through 5 passes to understand its structure, characters, themes, style, and gaps.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    // The 5-pass analysis is whole-manuscript by definition — it opens with a
    // chapter table — so it needs the enumeration and bulk-read tools.
    tools: ["ReadDocument", "ListChapters", "ReadChapter", "ReadAllChapters", "WriteDocument", "ListDocuments", "SearchMemory", "PostInsight", "ReadInsights"],
    contextProfile: {
      fingerprint: "full",
      storyBible: "none",
      synopsis: "none",
      architecture: "none",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "none",
    },
  },
  {
    name: "World Researcher",
    type: "world-researcher",
    description:
      "Researches settings, genres, historical periods, and cultural contexts to ensure world-building authenticity and accuracy.",
    writerDescription:
      "Research your setting, genre, and historical context for authentic world-building.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: ["ReadDocument", "WriteDocument", "ListDocuments", "QueryGraph", "UpdateGraphEntity", "SearchMemory", "ReadInsights", "WebSearch", "FetchWebPage"],
    contextProfile: {
      fingerprint: "none",
      storyBible: "full",
      synopsis: "none",
      architecture: "full",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "none",
    },
  },
  {
    name: "Market Reader",
    type: "market-reader",
    description:
      "Analyzes book positioning across 5 cultural markets (US, EU, RU, CN, RS) for genre fit, comparable titles, and market trends.",
    writerDescription:
      "Analyze your book's market positioning across 5 cultural markets.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: ["ReadDocument", "WriteDocument", "ListDocuments", "SearchMemory", "ReadInsights", "WebSearch", "FetchWebPage"],
    contextProfile: {
      fingerprint: "summary",
      storyBible: "full",
      synopsis: "none",
      architecture: "full",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "none",
    },
  },
  {
    name: "Publishing Editor",
    type: "publishing-editor",
    description:
      "Runs 13 pre-export production-readiness checks including formatting, front/back matter, typography, and consistency.",
    writerDescription:
      "Run 13 pre-export production checks on your manuscript before publishing.",
    defaultModel: "haiku",
    allowedModels: ["sonnet", "haiku"],
    // Several of the 13 checks (chapter numbering, heading consistency, front
    // and back matter) are manuscript-wide; the editor used to see one chapter.
    tools: ["ReadDocument", "ListChapters", "ReadChapter", "ReadAllChapters", "ListDocuments", "CreateFinding", "PostInsight", "ReadInsights"],
    contextProfile: {
      fingerprint: "full",
      storyBible: "full",
      synopsis: "none",
      architecture: "full",
      chapterContent: false,
      adjacentChapters: "none",
      chapterPlan: false,
      chapterBrief: false,
      findingHistory: false,
      bookMeta: false,
      seriesContext: "summary",
    },
  },
];

/** Look up an agent definition by type. */
export function getAgentDefinition(
  type: AgentType
): AgentDefinition | undefined {
  return AGENT_DEFINITIONS.find((d) => d.type === type);
}

/** Get all agent definitions. */
export function getAllAgentDefinitions(): AgentDefinition[] {
  return AGENT_DEFINITIONS;
}

/** Map a model tier to the full Anthropic model ID. */
export function getModelId(tier: ModelTier): string {
  switch (tier) {
    case "opus":
      return "claude-opus-4-6";
    case "sonnet":
      return "claude-sonnet-4-5-20250929";
    case "haiku":
      return "claude-haiku-4-5-20251001";
  }
}
