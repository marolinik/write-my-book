// src/lib/onboarding/overview-recommendation.ts
//
// The book-overview page's "Recommended: X / [Start]" ladder (D-173).
//
// D-160 gave the app ONE accounting for setup progress
// (`setup-surface.ts`), and routed the sidebar badge and the ProactiveGuide
// recommendation through it. The server-rendered overview page kept a FOURTH
// ladder inline — `if (!hasFingerprint) → "capture-style"` — which never read
// `setupComplete`. So a writer who finished the wizard having skipped Style was
// still met with "Recommended: Capture Style" on the overview while every other
// surface had moved on to the chapter pipeline.
//
// Extracting the ladder does two things: the setup half now comes from
// `nextSetupWorkflow()` (same module, same semantics — skipped artifacts stay
// reachable OFFERS via the Style page / Setup wizard / ProactiveGuide's batch
// offer, they are never the "Recommended next step" again), and the whole thing
// becomes unit-testable instead of being inline in a server component.
//
// Pure and dependency-free, like `setup-surface.ts`.

import { nextSetupWorkflow, type SetupArtifactState } from "./setup-surface";

/** Minimal chapter shape the ladder needs. */
export interface RecommendationChapter {
  chapterNumber: number;
  status: string;
}

export interface OverviewRecommendationInput extends SetupArtifactState {
  /** The book's chapters, in any order (never mutated or reordered here). */
  chapters: readonly RecommendationChapter[];
  /** Count of findings still awaiting the writer's review. */
  pendingFindings: number;
}

export interface OverviewRecommendation {
  /** Workflow id to hand to `getWorkflow()` / `StartWorkflowButton`. */
  workflowId: string;
  /** One-line "why this next" shown under the label. */
  reason: string;
}

/**
 * The single next action to recommend on the book overview.
 *
 * Priority: unfinished setup artifacts (only while the wizard has NOT been
 * finished) → chapter pipeline (dev-edit → line-edit → beta-read → the first
 * unwritten chapter) → pending editorial findings → pre-publication check.
 *
 * Always returns something startable; the overview's card is only rendered when
 * the returned id resolves to a known workflow.
 */
export function nextOverviewRecommendation(
  input: OverviewRecommendationInput
): OverviewRecommendation {
  const pendingSetup = nextSetupWorkflow(input);

  if (pendingSetup === "capture-style") {
    return {
      workflowId: "capture-style",
      reason: "Capture your writing style fingerprint to guide all AI agents",
    };
  }
  if (pendingSetup === "create-story-bible") {
    return {
      workflowId: "create-story-bible",
      reason: "Create a Story Bible to define characters, world, and lore",
    };
  }
  if (pendingSetup === "build-architecture") {
    return {
      workflowId: "build-architecture",
      reason: "Build the narrative architecture and plot structure",
    };
  }

  // Setup is settled (finished, or every artifact exists) — the pipeline decides.
  const { chapters, pendingFindings } = input;

  const needsDevEdit = chapters.find((ch) => ch.status === "drafted");
  if (needsDevEdit) {
    return {
      workflowId: "dev-edit",
      reason: `Ch. ${needsDevEdit.chapterNumber} is drafted and ready for developmental editing`,
    };
  }

  const needsLineEdit = chapters.find((ch) => ch.status === "dev_edited");
  if (needsLineEdit) {
    return {
      workflowId: "line-edit",
      reason: `Ch. ${needsLineEdit.chapterNumber} is dev-edited and ready for line editing`,
    };
  }

  const needsBetaRead = chapters.find((ch) => ch.status === "line_edited");
  if (needsBetaRead) {
    return {
      workflowId: "beta-read",
      reason: `Ch. ${needsBetaRead.chapterNumber} is line-edited and ready for beta reading`,
    };
  }

  const undrafted = chapters.find(
    (ch) =>
      ch.status === "undiscussed" ||
      ch.status === "discussed" ||
      ch.status === "planned"
  );
  if (undrafted) {
    if (undrafted.status === "planned") {
      return {
        workflowId: "write-chapter",
        reason: `Ch. ${undrafted.chapterNumber} is planned and ready to be written`,
      };
    }
    if (undrafted.status === "discussed") {
      return {
        workflowId: "plan-chapter",
        reason: `Ch. ${undrafted.chapterNumber} has been discussed and needs a plan`,
      };
    }
    return {
      workflowId: "discuss-chapter",
      reason: `Ch. ${undrafted.chapterNumber} is ready to be discussed with the AI`,
    };
  }

  if (pendingFindings > 0) {
    return {
      workflowId: "discuss-edits",
      reason: `${pendingFindings} editorial findings need review`,
    };
  }

  if (chapters.length === 0) {
    // No chapters at all. The old ladder fell through to "All chapters complete"
    // here — a lie this fix makes reachable more often (setupComplete now falls
    // through), so it is answered explicitly. Matches `use-book-state`'s
    // greenfield branch: start the first chapter.
    return {
      workflowId: "discuss-chapter",
      reason: "No chapters yet — start Chapter 1 by discussing it with the AI",
    };
  }

  return {
    workflowId: "publishing-check",
    reason: "All chapters complete — run a pre-publication check",
  };
}
