import type { WorkflowDefinition } from "./types";

const WORKFLOW_DEFINITIONS: WorkflowDefinition[] = [
  // ─── SETUP ──────────────────────────────────────────────────────
  {
    id: "new-novel",
    label: "New Novel Setup",
    description: "Create story bible and initial concept document for a new book.",
    writerDescription: "Start a new novel — define your premise, characters, and themes.",
    primaryAgent: "writing-coach",
    category: "setup",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: ["capture-style", "build-architecture"],
  },
  {
    id: "capture-style",
    label: "Capture Style",
    description: "Analyze writing samples to create a FINGERPRINT document.",
    writerDescription: "Analyze your writing to capture your unique voice.",
    primaryAgent: "style-analyst",
    category: "setup",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["build-architecture", "create-story-bible"],
  },
  {
    id: "create-story-bible",
    label: "Create Story Bible",
    description: "Build or update the story bible with characters, world, and themes.",
    writerDescription: "Build your story bible — characters, world, rules, and themes.",
    primaryAgent: "writing-coach",
    category: "setup",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: ["build-architecture"],
  },
  {
    id: "build-architecture",
    label: "Build Architecture",
    description: "Design the act/chapter structure and story architecture.",
    writerDescription: "Design your story structure — acts, chapters, and pacing.",
    primaryAgent: "story-architect",
    category: "setup",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["plan-chapter"],
  },
  {
    id: "coach",
    label: "Writing Coach",
    description: "Open-ended conversation about your writing process or story.",
    writerDescription: "Talk to your writing coach about anything — craft, story, or process.",
    primaryAgent: "writing-coach",
    category: "setup",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: [],
  },
  {
    id: "read-manuscript",
    label: "Read Manuscript",
    description:
      "Analyze an existing manuscript through 5 passes — structure, characters, themes, style, and gaps.",
    writerDescription:
      "Analyze an existing manuscript through 5 passes — structure, characters, themes, style, and gaps.",
    primaryAgent: "manuscript-reader",
    category: "setup",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["capture-style", "create-story-bible"],
  },

  // ─── WRITING ────────────────────────────────────────────────────
  {
    id: "discuss-chapter",
    label: "Discuss Chapter",
    description: "Talk through a chapter's direction, themes, and approach before planning.",
    writerDescription: "Discuss a chapter's direction before writing it.",
    primaryAgent: "writing-coach",
    category: "writing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: ["plan-chapter"],
  },
  {
    id: "plan-chapter",
    label: "Plan Chapter",
    description: "Create a detailed scene-by-scene plan for a chapter.",
    writerDescription: "Create a detailed beat sheet and scene plan for a chapter.",
    primaryAgent: "scene-planner",
    category: "writing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["write-chapter"],
  },
  {
    id: "write-chapter",
    label: "Write Chapter",
    description: "Draft a chapter using the plan, fingerprint, and story context.",
    writerDescription: "Write a chapter draft in your voice using the plan.",
    primaryAgent: "ghostwriter",
    category: "writing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["dev-edit"],
  },
  {
    id: "freewrite",
    label: "Freewrite",
    description: "Write freely without a plan — experimental or exploratory writing.",
    writerDescription: "Write freely — explore ideas without a plan.",
    primaryAgent: "ghostwriter",
    category: "writing",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: [],
  },

  // ─── EDITING ────────────────────────────────────────────────────
  {
    id: "dev-edit",
    label: "Dev Edit",
    description: "Structural edit with 18 checks on pacing, arcs, tension, and more.",
    writerDescription: "Deep structural edit — checks pacing, arcs, and tension.",
    primaryAgent: "dev-editor",
    category: "editing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["line-edit", "discuss-edits"],
  },
  {
    id: "line-edit",
    label: "Line Edit",
    description: "Prose-level edit with 23 checks on style, voice, and clarity.",
    writerDescription: "Prose polish — catches weak language and AI tells.",
    primaryAgent: "line-editor",
    category: "editing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["beta-read", "discuss-edits"],
  },
  {
    id: "beta-read",
    label: "Beta Read",
    description: "Simulate 10 reader personas evaluating the chapter.",
    writerDescription: "Get feedback from a simulated panel of diverse readers.",
    primaryAgent: "beta-reader",
    category: "editing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["revise"],
  },
  {
    id: "revise",
    label: "Revise Chapter",
    description: "Apply edits and revise the chapter based on feedback.",
    writerDescription: "Revise the chapter based on editing feedback.",
    primaryAgent: "ghostwriter",
    category: "editing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["dev-edit", "line-edit"],
  },
  {
    id: "discuss-edits",
    label: "Discuss Edits",
    description: "Talk through edit findings and decide what to apply.",
    writerDescription: "Review and discuss edit findings before applying them.",
    primaryAgent: "writing-coach",
    category: "editing",
    requiresChapter: true,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: ["revise"],
  },
  {
    id: "publishing-check",
    label: "Publishing Check",
    description:
      "Run 13 pre-export production checks on your manuscript.",
    writerDescription:
      "Run 13 pre-export production checks on your manuscript.",
    primaryAgent: "publishing-editor",
    category: "editing",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: [],
  },

  // ─── ANALYSIS ───────────────────────────────────────────────────
  {
    id: "analyze",
    label: "Analyze Manuscript",
    description: "Generate readability metrics, pacing analysis, and statistics.",
    writerDescription: "Get statistics and readability metrics for your manuscript.",
    primaryAgent: "manuscript-analyst",
    category: "analysis",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: [],
  },
  {
    id: "market-analysis",
    label: "Market Analysis",
    description:
      "Analyze your book's positioning across 5 cultural markets.",
    writerDescription:
      "Analyze your book's positioning across 5 cultural markets.",
    primaryAgent: "market-reader",
    category: "analysis",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: [],
  },

  // ─── STYLE ──────────────────────────────────────────────────────
  {
    id: "refresh-style",
    label: "Refresh Style",
    description:
      "Re-analyze your writing to update your style fingerprint.",
    writerDescription:
      "Re-analyze your writing to update your style fingerprint.",
    primaryAgent: "style-analyst",
    category: "style",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: false,
    suggestedNext: ["write-chapter"],
  },
  {
    id: "evolve-style",
    label: "Evolve Style",
    description:
      "Intentionally evolve your writing style in a specific direction.",
    writerDescription:
      "Intentionally evolve your writing style in a specific direction.",
    primaryAgent: "style-analyst",
    category: "style",
    requiresChapter: false,
    requiresSeriesContext: false,
    conversational: true,
    suggestedNext: [],
  },

  // ─── SERIES ─────────────────────────────────────────────────────
  {
    id: "init-series",
    label: "Initialize Series",
    description:
      "Set up the series foundation — define overarching themes, world scope, and multi-book arc.",
    writerDescription:
      "Start a new series — define your overarching themes, world, and multi-book arc.",
    primaryAgent: "story-architect",
    category: "series",
    requiresChapter: false,
    requiresSeriesContext: true,
    conversational: false,
    suggestedNext: ["create-series-bible"],
  },
  {
    id: "create-series-bible",
    label: "Create Series Bible",
    description:
      "Build the series bible with cross-book characters, world rules, and continuity anchors.",
    writerDescription:
      "Build a series bible — shared characters, world rules, and continuity across books.",
    primaryAgent: "story-architect",
    category: "series",
    requiresChapter: false,
    requiresSeriesContext: true,
    conversational: false,
    suggestedNext: ["create-series-architecture"],
  },
  {
    id: "create-series-architecture",
    label: "Create Series Architecture",
    description:
      "Design the multi-book arc structure with per-book milestones and series-level tension.",
    writerDescription:
      "Design the multi-book arc — plot milestones, character arcs, and pacing across books.",
    primaryAgent: "story-architect",
    category: "series",
    requiresChapter: false,
    requiresSeriesContext: true,
    conversational: false,
    suggestedNext: ["check-series-continuity"],
  },
  {
    id: "check-series-continuity",
    label: "Check Series Continuity",
    description:
      "Verify cross-book continuity: characters, timelines, geography, world rules, and foreshadowing.",
    writerDescription:
      "Check for continuity errors across all books in the series.",
    primaryAgent: "continuity-checker",
    category: "series",
    requiresChapter: false,
    requiresSeriesContext: true,
    conversational: false,
    suggestedNext: [],
  },
];

/** Look up a workflow definition by ID. */
export function getWorkflow(id: string): WorkflowDefinition | undefined {
  return WORKFLOW_DEFINITIONS.find((w) => w.id === id);
}

/** Get all workflows in a category. */
export function getWorkflowsByCategory(
  category: WorkflowDefinition["category"]
): WorkflowDefinition[] {
  return WORKFLOW_DEFINITIONS.filter((w) => w.category === category);
}

/** Get all workflow definitions. */
export function getAllWorkflows(): WorkflowDefinition[] {
  return WORKFLOW_DEFINITIONS;
}
