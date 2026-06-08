/**
 * Journey definitions — preset authoring paths through the WMB workflow system.
 * Each journey is a sequence of workflow steps that guide the writer through
 * a complete process (e.g. writing a novel from scratch, or editing an existing manuscript).
 */

export interface JourneyStep {
  workflowId: string;
  /** Step is run once per chapter (vs. once for the whole book). */
  perChapter?: boolean;
  /** Step is optional — can be skipped. */
  optional?: boolean;
  /** Step can loop back to an earlier step. */
  loopTo?: string;
}

export interface JourneyDefinition {
  id: string;
  label: string;
  description: string;
  icon: string;
  category: "book" | "editorial" | "publishing" | "style" | "series" | "freeform";
  steps: JourneyStep[];
}

const JOURNEYS: JourneyDefinition[] = [
  {
    id: "new-novel",
    label: "New Novel (Greenfield)",
    description: "Start a novel from scratch — from concept to publication-ready manuscript.",
    icon: "BookPlus",
    category: "book",
    steps: [
      { workflowId: "new-novel" },
      { workflowId: "capture-style" },
      { workflowId: "create-story-bible" },
      { workflowId: "build-architecture" },
      { workflowId: "discuss-chapter", perChapter: true },
      { workflowId: "plan-chapter", perChapter: true },
      { workflowId: "write-chapter", perChapter: true },
      { workflowId: "dev-edit", perChapter: true },
      { workflowId: "line-edit", perChapter: true },
      { workflowId: "beta-read", perChapter: true },
      { workflowId: "revise", perChapter: true, loopTo: "dev-edit" },
      { workflowId: "publishing-check" },
    ],
  },
  {
    id: "existing-manuscript",
    label: "Existing Manuscript",
    description: "Import and analyze an existing manuscript — build context, then edit and polish.",
    icon: "FileInput",
    category: "book",
    steps: [
      { workflowId: "read-manuscript" },
      { workflowId: "capture-style" },
      { workflowId: "create-story-bible" },
      { workflowId: "build-architecture" },
      { workflowId: "analyze" },
      { workflowId: "dev-edit", perChapter: true },
      { workflowId: "line-edit", perChapter: true },
      { workflowId: "beta-read", perChapter: true },
      { workflowId: "revise", perChapter: true, loopTo: "dev-edit" },
      { workflowId: "market-analysis" },
      { workflowId: "publishing-check" },
    ],
  },
  {
    id: "chapter-cycle",
    label: "Chapter Writing Cycle",
    description: "Plan, write, and edit a single chapter through the full pipeline.",
    icon: "RotateCcw",
    category: "book",
    steps: [
      { workflowId: "discuss-chapter" },
      { workflowId: "plan-chapter" },
      { workflowId: "write-chapter" },
      { workflowId: "dev-edit" },
      { workflowId: "discuss-edits", optional: true },
      { workflowId: "line-edit" },
      { workflowId: "beta-read" },
      { workflowId: "revise", loopTo: "dev-edit" },
    ],
  },
  {
    id: "editorial-pipeline",
    label: "Full Editorial Pipeline",
    description: "Run dev edit, line edit, beta read, and revise across all chapters.",
    icon: "PenTool",
    category: "editorial",
    steps: [
      { workflowId: "dev-edit", perChapter: true },
      { workflowId: "discuss-edits", optional: true },
      { workflowId: "line-edit", perChapter: true },
      { workflowId: "beta-read", perChapter: true },
      { workflowId: "revise", perChapter: true, loopTo: "dev-edit" },
      { workflowId: "publishing-check" },
    ],
  },
  {
    id: "publishing-readiness",
    label: "Publishing Readiness",
    description: "Analyze manuscript metrics, market positioning, and run pre-publication checks.",
    icon: "Rocket",
    category: "publishing",
    steps: [
      { workflowId: "analyze" },
      { workflowId: "market-analysis" },
      { workflowId: "publishing-check" },
    ],
  },
  {
    id: "style-mastery",
    label: "Style Mastery",
    description: "Capture, refresh, and evolve your writing voice.",
    icon: "Palette",
    category: "style",
    steps: [
      { workflowId: "capture-style" },
      { workflowId: "refresh-style" },
      { workflowId: "evolve-style" },
    ],
  },
  {
    id: "series-authoring",
    label: "Series Management",
    description: "Initialize, plan, and maintain continuity across a multi-book series.",
    icon: "Library",
    category: "series",
    steps: [
      { workflowId: "init-series" },
      { workflowId: "create-series-bible" },
      { workflowId: "create-series-architecture" },
      { workflowId: "check-series-continuity" },
    ],
  },
  {
    id: "freeform-coaching",
    label: "Writing Coach (Freeform)",
    description: "Open-ended conversation with your Writing Coach — ask anything about your project.",
    icon: "MessageCircle",
    category: "freeform",
    steps: [
      { workflowId: "coach" },
      { workflowId: "free-drive", optional: true },
      { workflowId: "freewrite", optional: true },
    ],
  },
];

/** Get a journey definition by ID. */
export function getJourney(id: string): JourneyDefinition | undefined {
  return JOURNEYS.find((j) => j.id === id);
}

/** Get all journey definitions. */
export function getAllJourneys(): JourneyDefinition[] {
  return JOURNEYS;
}

/**
 * Detect the most likely active journey based on existing documents and book state.
 * Returns null if no clear journey is detected (custom path).
 */
export function detectActiveJourney(state: {
  hasChapters: boolean;
  hasFingerprint: boolean;
  hasStoryBible: boolean;
  hasArchitecture: boolean;
  hasImportedManuscript: boolean;
}): string | null {
  if (state.hasImportedManuscript) return "existing-manuscript";
  if (!state.hasChapters && !state.hasFingerprint && !state.hasStoryBible && !state.hasArchitecture) {
    return null; // Fresh book — no journey yet
  }
  if (!state.hasChapters && (state.hasFingerprint || state.hasStoryBible || state.hasArchitecture)) {
    return "new-novel"; // Setup docs exist but no chapters
  }
  return null; // Could be any journey — don't guess
}

/**
 * Calculate progress through a journey given completed workflow IDs.
 * For per-chapter steps, counts as complete if at least one chapter has done that workflow.
 */
export function getJourneyProgress(
  journeyId: string,
  completedWorkflows: Set<string>
): { completed: number; total: number } | null {
  const journey = getJourney(journeyId);
  if (!journey) return null;

  const total = journey.steps.filter((s) => !s.optional).length;
  let completed = 0;
  for (const step of journey.steps) {
    if (step.optional) continue;
    if (completedWorkflows.has(step.workflowId)) completed++;
  }

  return { completed, total };
}

// ─── STEP COMPLETION DETECTION ──────────────────────────────────────

export interface StepCompletionInput {
  hasFingerprint: boolean;
  hasStoryBible: boolean;
  hasArchitecture: boolean;
  hasAnalysisReport: boolean;
  hasMarketReport: boolean;
  hasContinuityReport: boolean;
  hasImportedManuscript: boolean;
  chapterCount: number;
  /** Map of chapter status string to count of chapters in that status. */
  chapterStatuses: Record<string, number>;
}

/**
 * Chapter statuses that satisfy a given per-chapter workflow step.
 * A chapter at any listed status (or later) means it has passed through that workflow.
 */
const PER_CHAPTER_VALID_STATUSES: Record<string, string[]> = {
  "discuss-chapter": ["discussed", "planned", "drafted", "dev_edited", "line_edited", "beta_read", "beta_passed"],
  "plan-chapter": ["planned", "drafted", "dev_edited", "line_edited", "beta_read", "beta_passed"],
  "write-chapter": ["drafted", "dev_edited", "line_edited", "beta_read", "beta_passed"],
  "dev-edit": ["dev_edited", "line_edited", "beta_read", "beta_passed"],
  "line-edit": ["line_edited", "beta_read", "beta_passed"],
  "beta-read": ["beta_read", "beta_passed"],
  "revise": ["dev_edited", "line_edited", "beta_read", "beta_passed"],
};

/**
 * Determine if a single journey step is complete given the book's current state.
 *
 * For book-level steps: checks document existence flags.
 * For per-chapter steps: ALL chapters must have reached the required status.
 */
export function isStepComplete(step: JourneyStep, input: StepCompletionInput): boolean {
  const wf = step.workflowId;

  // Per-chapter workflows — ALL chapters must pass
  if (step.perChapter) {
    const validStatuses = PER_CHAPTER_VALID_STATUSES[wf];
    if (!validStatuses) return false;
    if (input.chapterCount === 0) return false;
    let passedCount = 0;
    for (const status of validStatuses) {
      passedCount += input.chapterStatuses[status] ?? 0;
    }
    return passedCount >= input.chapterCount;
  }

  // Book-level workflows — check document existence
  switch (wf) {
    case "capture-style":
    case "refresh-style":
    case "evolve-style":
      return input.hasFingerprint;
    case "create-story-bible":
    case "new-novel":
      return input.hasStoryBible;
    case "build-architecture":
      return input.hasArchitecture;
    case "analyze":
    case "publishing-check":
      return input.hasAnalysisReport;
    case "market-analysis":
      return input.hasMarketReport;
    case "read-manuscript":
      return input.hasImportedManuscript;
    // Optional/freeform steps — never block progress
    case "coach":
    case "free-drive":
    case "freewrite":
    case "discuss-edits":
      return true;
    // Series workflows — not tracked per-book
    case "init-series":
    case "create-series-bible":
    case "create-series-architecture":
    case "check-series-continuity":
      return false;
    default:
      return false;
  }
}

// ─── STEP STATE & DETAILED PROGRESS ─────────────────────────────────

export interface StepState {
  workflowId: string;
  label: string;
  completed: boolean;
  isCurrent: boolean;
  optional: boolean;
  perChapter: boolean;
  href: (bookId: string) => string;
  warning?: string;
}

export interface SnapshotEntry {
  completedAt: string;
  chapterCount: number;
}

/**
 * Returns per-step completion array for a journey with warnings.
 * Warnings indicate when chapters have been added since a step was completed.
 */
export function getDetailedJourneyProgress(
  journeyId: string,
  input: StepCompletionInput,
  snapshot?: Record<string, SnapshotEntry> | null,
): {
  steps: StepState[];
  completedCount: number;
  totalCount: number;
  currentStepIndex: number;
} | null {
  const journey = getJourney(journeyId);
  if (!journey) return null;

  let foundCurrent = false;
  const steps: StepState[] = [];
  let completedCount = 0;
  let totalCount = 0;
  let currentStepIndex = -1;

  for (let i = 0; i < journey.steps.length; i++) {
    const step = journey.steps[i];
    const completed = isStepComplete(step, input);
    const isOptional = step.optional ?? false;

    if (!isOptional) {
      totalCount++;
      if (completed) completedCount++;
    }

    // Current step = first incomplete non-optional step
    let isCurrent = false;
    if (!completed && !isOptional && !foundCurrent) {
      isCurrent = true;
      foundCurrent = true;
      currentStepIndex = i;
    }

    // Warning: step was completed but chapters were added since
    let warning: string | undefined;
    if (completed && step.perChapter && snapshot?.[step.workflowId]) {
      const snapshotEntry = snapshot[step.workflowId];
      const delta = input.chapterCount - snapshotEntry.chapterCount;
      if (delta > 0) {
        warning = `${delta} new chapter(s) added since this step was completed`;
      }
    }

    steps.push({
      workflowId: step.workflowId,
      label: getStepLabel(step.workflowId),
      completed,
      isCurrent,
      optional: isOptional,
      perChapter: step.perChapter ?? false,
      href: (bookId: string) => getStepNavHref(step.workflowId, bookId),
      warning,
    });
  }

  return { steps, completedCount, totalCount, currentStepIndex };
}

// ─── STEP NAVIGATION MAP ────────────────────────────────────────────

/**
 * Maps workflow IDs to the page path a user should navigate to for that step.
 * Functions receive bookId and return the full path.
 */
const STEP_NAV_MAP: Record<string, (bookId: string) => string> = {
  "new-novel": (id) => `/books/${id}/setup`,
  "read-manuscript": (id) => `/books/${id}/import`,
  "capture-style": (id) => `/books/${id}/style`,
  "refresh-style": (id) => `/books/${id}/style`,
  "evolve-style": (id) => `/books/${id}/style`,
  "create-story-bible": (id) => `/books/${id}/documents`,
  "build-architecture": (id) => `/books/${id}/documents`,
  "discuss-chapter": (id) => `/books/${id}`,
  "plan-chapter": (id) => `/books/${id}`,
  "write-chapter": (id) => `/books/${id}`,
  "dev-edit": (id) => `/books/${id}/editorial`,
  "line-edit": (id) => `/books/${id}/editorial`,
  "beta-read": (id) => `/books/${id}/editorial`,
  "revise": (id) => `/books/${id}/editorial`,
  "discuss-edits": (id) => `/books/${id}/editorial`,
  "analyze": (id) => `/books/${id}/reports`,
  "market-analysis": (id) => `/books/${id}/reports`,
  "publishing-check": (id) => `/books/${id}/reports`,
  "coach": (id) => `/books/${id}`,
  "free-drive": (id) => `/books/${id}`,
  "freewrite": (id) => `/books/${id}`,
  "init-series": (id) => `/books/${id}`,
  "create-series-bible": (id) => `/books/${id}/documents`,
  "create-series-architecture": (id) => `/books/${id}/documents`,
  "check-series-continuity": (id) => `/books/${id}/reports`,
};

/** Get the navigation href for a workflow step. Falls back to book overview. */
export function getStepNavHref(workflowId: string, bookId: string): string {
  const fn = STEP_NAV_MAP[workflowId];
  return fn ? fn(bookId) : `/books/${bookId}`;
}

// ─── STEP LABELS ────────────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  "new-novel": "Start New Novel",
  "read-manuscript": "Import Manuscript",
  "capture-style": "Capture Writing Style",
  "refresh-style": "Refresh Style Profile",
  "evolve-style": "Evolve Writing Voice",
  "create-story-bible": "Create Story Bible",
  "build-architecture": "Build Architecture",
  "discuss-chapter": "Discuss Chapters",
  "plan-chapter": "Plan Chapters",
  "write-chapter": "Write Chapters",
  "dev-edit": "Developmental Edit",
  "line-edit": "Line Edit",
  "beta-read": "Beta Read",
  "revise": "Revise",
  "discuss-edits": "Discuss Edits",
  "analyze": "Analyze Manuscript",
  "market-analysis": "Market Analysis",
  "publishing-check": "Publishing Check",
  "coach": "Writing Coach",
  "free-drive": "Free Drive",
  "freewrite": "Freewrite",
  "init-series": "Initialize Series",
  "create-series-bible": "Create Series Bible",
  "create-series-architecture": "Create Series Architecture",
  "check-series-continuity": "Check Series Continuity",
};

/** Get a human-readable label for a workflow step. Falls back to the workflowId. */
export function getStepLabel(workflowId: string): string {
  return STEP_LABELS[workflowId] ?? workflowId;
}

// ─── JOURNEY RECOMMENDATION ────────────────────────────────────────

/**
 * Recommend a journey preset based on the book's current content state.
 * Returns the journey ID and a short reason, or null if no recommendation.
 */
export function getRecommendedJourney(state: {
  hasChapters: boolean;
  hasFingerprint: boolean;
  hasStoryBible: boolean;
  hasArchitecture: boolean;
  hasImportedManuscript: boolean;
  chapterCount: number;
  chapterStatuses: Record<string, number>;
}): { journeyId: string; reason: string } | null {
  // Imported manuscript — editorial pipeline is the natural path
  if (state.hasImportedManuscript) {
    return { journeyId: "existing-manuscript", reason: "Imported manuscript detected" };
  }

  // Fresh book — no docs, no chapters
  if (!state.hasChapters && !state.hasFingerprint && !state.hasStoryBible && !state.hasArchitecture) {
    return { journeyId: "new-novel", reason: "Start from scratch" };
  }

  // Has chapters but no style/bible — existing manuscript path
  if (state.hasChapters && !state.hasFingerprint && !state.hasStoryBible) {
    return { journeyId: "existing-manuscript", reason: "Chapters exist but no style profile" };
  }

  // Setup docs exist, no chapters — new novel
  if (!state.hasChapters && (state.hasFingerprint || state.hasStoryBible || state.hasArchitecture)) {
    return { journeyId: "new-novel", reason: "Setup started, ready to write" };
  }

  // All chapters drafted or beyond — editorial pipeline
  const draftedOrBeyond = (state.chapterStatuses["drafted"] ?? 0)
    + (state.chapterStatuses["dev_edited"] ?? 0)
    + (state.chapterStatuses["line_edited"] ?? 0)
    + (state.chapterStatuses["beta_read"] ?? 0)
    + (state.chapterStatuses["beta_passed"] ?? 0);
  if (state.chapterCount > 0 && draftedOrBeyond === state.chapterCount) {
    return { journeyId: "editorial-pipeline", reason: "All chapters ready for editing" };
  }

  return null;
}
