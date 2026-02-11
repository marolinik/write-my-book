import type { AgentDefinition, AgentType, ModelTier } from "./types";

const AGENT_DEFINITIONS: AgentDefinition[] = [
  {
    name: "Writing Coach",
    type: "writing-coach",
    description:
      "Conversational guide that helps writers through the creative process, offering advice on structure, voice, and workflow.",
    writerDescription:
      "Your personal writing coach. Ask questions about craft, get unstuck, or talk through your story ideas.",
    defaultModel: "sonnet",
    allowedModels: ["opus", "sonnet"],
    tools: ["ReadDocument", "ListDocuments"],
    contextProfile: {
      fingerprint: "none",
      storyBible: "none",
      architecture: "none",
      chapterPlan: false,
      chapterBrief: false,
      seriesContext: "none",
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
    ],
    contextProfile: {
      fingerprint: "full",
      storyBible: "chapter-relevant",
      architecture: "full",
      chapterPlan: true,
      chapterBrief: true,
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
      "ReadChapter",
      "ListDocuments",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "none",
      architecture: "none",
      chapterPlan: false,
      chapterBrief: false,
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
      "RequestApproval",
      "ReadSeriesDocument",
      "WriteSeriesDocument",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "full",
      architecture: "full",
      chapterPlan: false,
      chapterBrief: false,
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
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "chapter-relevant",
      architecture: "full",
      chapterPlan: false,
      chapterBrief: true,
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
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "full",
      architecture: "full",
      chapterPlan: true,
      chapterBrief: true,
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
    ],
    contextProfile: {
      fingerprint: "full",
      storyBible: "none",
      architecture: "none",
      chapterPlan: true,
      chapterBrief: false,
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
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "none",
      architecture: "full",
      chapterPlan: true,
      chapterBrief: false,
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
      "ReadChapter",
      "ListDocuments",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "none",
      architecture: "none",
      chapterPlan: false,
      chapterBrief: false,
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
      "ListDocuments",
      "CreateFinding",
      "ReadSeriesDocument",
      "WriteSeriesDocument",
    ],
    contextProfile: {
      fingerprint: "none",
      storyBible: "full",
      architecture: "full",
      chapterPlan: false,
      chapterBrief: false,
      seriesContext: "full",
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
