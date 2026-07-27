// src/lib/onboarding/setup-surface.ts
//
// ONE accounting for book-setup progress, shared by every surface that talks
// about it (D-160). Before this module three surfaces disagreed about the same
// state: the wizard header said "2/6", the overview banner "2/5", and the
// sidebar "Getting Started" badge "0/2" (it was counting only Story Bible +
// Architecture).
//
// The accounting chosen here:
//   * There are FIVE substantive setup steps — basics, import, style, story
//     bible, architecture. The wizard's sixth "Done" card is a confirmation of
//     those five, not a sixth unit of work, so counting it (the old "/6")
//     inflated the denominator and could never be satisfied from inside the
//     wizard.
//   * A step is "done" when it is RESOLVED, not only when it produced an
//     artifact — a deliberately skipped import counts, exactly as the wizard's
//     own step bar has always rendered it (green check on skip).
//   * `setupComplete` (the writer pressed "Start Writing!") is a STATE, not a
//     sixth step. It is what flips surfaces from soliciting to settled; the
//     N/5 count keeps telling the truth about how many steps actually ran.
//
// Pure and dependency-free on purpose: the client wizard/sidebar and the server
// -rendered overview page all import it, so no two surfaces can drift again.

/** Number of substantive setup steps. The wizard's "Done" card is not one. */
export const SETUP_STEP_TOTAL = 5;

/** The five substantive setup steps, resolved-or-not. */
export interface SetupStepFlags {
  /** Book name + genre saved. */
  basicsComplete: boolean;
  /** Manuscript imported OR import explicitly skipped. */
  importComplete: boolean;
  /** Style fingerprint captured. */
  styleComplete: boolean;
  /** Story bible created. */
  bibleComplete: boolean;
  /** Architecture created. */
  archComplete: boolean;
}

/** How many of the five substantive setup steps are resolved (0..5). */
export function countSetupStepsDone(flags: SetupStepFlags): number {
  return [
    flags.basicsComplete,
    flags.importComplete,
    flags.styleComplete,
    flags.bibleComplete,
    flags.archComplete,
  ].filter(Boolean).length;
}

/** Roll-up state for the sidebar's "Getting Started" section. */
export type SetupSurfaceStatus = "done" | "partial" | "none";

/**
 * Sidebar/section status for setup. "done" when the writer finished the wizard
 * (`setupComplete`) — the completion the chrome used to hide entirely — or when
 * all five steps are resolved even though the wizard flag was never written
 * (same escape hatch the overview banner already had).
 */
export function setupSurfaceStatus(
  flags: SetupStepFlags,
  setupComplete: boolean
): SetupSurfaceStatus {
  const done = countSetupStepsDone(flags);
  if (setupComplete || done === SETUP_STEP_TOTAL) return "done";
  return done > 0 ? "partial" : "none";
}

/** Setup-artifact workflows, in the order they are recommended. */
export type SetupWorkflowId =
  | "capture-style"
  | "create-story-bible"
  | "build-architecture";

export interface SetupArtifactState {
  /** Writer pressed "Start Writing!" — setup is theirs to consider finished. */
  setupComplete: boolean;
  hasFingerprint: boolean;
  hasStoryBible: boolean;
  hasArchitecture: boolean;
}

/**
 * The setup artifact still worth recommending, or null when setup should no
 * longer be recommended at all.
 *
 * Returning null on `setupComplete` is the point: a writer who finished the
 * wizard having skipped style has made a decision, and the app must stop
 * presenting that skipped step as the blocking next action. The skipped
 * workflows stay reachable (Style page, `setupWorkflows` batch offer) — they
 * are just offers now, not the next step.
 */
export function nextSetupWorkflow(state: SetupArtifactState): SetupWorkflowId | null {
  if (state.setupComplete) return null;
  if (!state.hasFingerprint) return "capture-style";
  if (!state.hasStoryBible) return "create-story-bible";
  if (!state.hasArchitecture) return "build-architecture";
  return null;
}

/** Sidebar nav keys that belong to the setup phase. */
const SETUP_PHASE_NAV_KEYS: ReadonlySet<string> = new Set(["setup", "style"]);

/** True when this sidebar nav key is part of the setup phase. */
export function isSetupPhaseNavKey(navKey: string): boolean {
  return SETUP_PHASE_NAV_KEYS.has(navKey);
}

/**
 * Whether to render the "Next Step" badge on a sidebar item. Setup-phase items
 * go quiet once setup is complete, so finishing the wizard visibly changes the
 * chrome instead of leaving it pixel-identical (D-160).
 */
export function showNextStepBadge(
  navKey: string,
  recommendedNavKey: string | null,
  setupComplete: boolean
): boolean {
  if (recommendedNavKey !== navKey) return false;
  return !(setupComplete && isSetupPhaseNavKey(navKey));
}

/** Minimal chapter shape needed to resolve a writing target. */
export interface ChapterRef {
  id: string;
  chapterNumber: number;
}

/**
 * The chapter "Start Writing!" should open — the lowest-numbered one, matching
 * how the overview's own Edit action resolves a row (D-161). Returns null when
 * the book has no chapter yet and one must be created first.
 */
export function pickStartWritingChapter<T extends ChapterRef>(
  chapters: readonly T[]
): T | null {
  let best: T | null = null;
  for (const chapter of chapters) {
    if (best === null || chapter.chapterNumber < best.chapterNumber) {
      best = chapter;
    }
  }
  return best;
}
