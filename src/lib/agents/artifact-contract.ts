/**
 * D-188 — completion contract for workflows that DECLARE a document artifact.
 *
 * Captured, reproduced 2/2 on a clean import: `create-story-bible` returned
 * 200, streamed a complete Story Bible into the chat, and terminated with
 * `success: true`, `endReason: "natural"`, `documentIds: []` and the assistant
 * text "**Story Bible Status:** Complete and ready for reference." — while no
 * STORY_BIBLE row was ever written, because the model simply never elected to
 * call `WriteDocument`. The next step the product itself recommended
 * (`build-architecture`) then 422'd on the missing bible, `dev-edit` 422'd
 * "Setup incomplete", and both attempts were billed to the writer's own key.
 *
 * Two mechanisms, in this order:
 *   1. RECOVERY — if the run's own final text is a document (long AND
 *      structured) and the declared artifact does not exist, persist it. The
 *      writer already paid for those tokens; throwing the artifact away and
 *      calling it success was the defect.
 *   2. HONESTY — after recovery, a run that has no artifact may not claim to
 *      have produced one. `honest: false` is the signal callers use to report
 *      the session as FAILED instead of a clean completion.
 *
 * Deliberately conservative about writing: never overwrite an existing
 * artifact, never synthesise a document out of ordinary conversation, and never
 * cry failure on an in-progress conversational turn that promised nothing.
 */

import type { DocumentType } from "@/generated/prisma/enums";
import { getWorkflow } from "./workflows";

/** Minimum words before the run's text can be treated as a document. */
export const MIN_DELIVERABLE_WORDS = 300;
/** Minimum markdown headings before the text is treated as structured. */
const MIN_DELIVERABLE_HEADINGS = 2;

/** `change_source` stamped on a document recovered from a session transcript. */
export const TRANSCRIPT_RECOVERY_SOURCE = "transcript-recovery";

/** Just enough of DocumentService for this module to stay db-free and testable. */
export interface ArtifactDocumentStore {
  findByType(
    type: DocumentType,
    chapterNumber?: number
  ): Promise<{ id: string } | null>;
  create(
    type: DocumentType,
    content: string,
    title?: string,
    chapterNumber?: number,
    actNumber?: number,
    changeSource?: string
  ): Promise<{ id: string }>;
}

export interface ArtifactContractInput {
  workflowId: string;
  bookId: string;
  userId: string;
  /** The run's final assistant text — the only recovery source. */
  assistantText?: string;
  /** Document ids the run actually wrote (AgentResult.documentIds). */
  documentIds?: string[];
  documentService: ArtifactDocumentStore;
}

export interface ArtifactContractOutcome {
  workflowId: string;
  /** DocumentType the workflow promises to produce. */
  expectedType: DocumentType;
  /** True when the artifact exists after this evaluation (incl. recovery). */
  artifactExists: boolean;
  /** True when THIS evaluation persisted it from the run's transcript. */
  recovered: boolean;
  /** True when the run's own text told the writer the artifact was done. */
  claimedComplete: boolean;
  /**
   * False ⇒ the run must NOT be reported as a success: it either claimed a
   * deliverable it does not have, or produced one that could not be persisted.
   */
  honest: boolean;
  /** Id of the recovered document, when recovery happened. */
  documentId?: string;
  /** Writer-facing sentence for the stream. Undefined when there is nothing to say. */
  message?: string;
}

/** "STORY_BIBLE" → "Story Bible" for writer-facing copy. */
export function artifactLabel(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Whether the run's text IS the deliverable rather than talk about it.
 *
 * Both length and structure are required. Length alone would let a long
 * conversational reply be persisted as a reference document — replacing one
 * lie with another — so a document must also look like one.
 */
export function looksLikeDeliverable(text: string | undefined): boolean {
  if (!text) return false;
  if (wordCount(text) < MIN_DELIVERABLE_WORDS) return false;
  const headings = text.match(/^#{1,6}\s+\S/gm)?.length ?? 0;
  return headings >= MIN_DELIVERABLE_HEADINGS;
}

const ARTIFACT_NOUN =
  /\b(story bible|series bible|architecture|fingerprint|outline|beat sheet|document)\b/i;
const DONE_MARKER =
  /\b(complete|completed|is saved|saved|created|written|finished|ready|in place|persisted)\b/i;
/**
 * Hedges that make a sentence a question, a plan or a condition rather than a
 * claim ("Once your story bible is complete…", "Shall I write it?").
 */
const NOT_A_CLAIM = /\?|\b(once|when|after|before|if|will|shall|would|could|can|let's|need to|going to)\b/i;

/**
 * Whether the run told the writer the declared artifact is done.
 *
 * Sentence-scoped so a hedge in one clause cannot excuse a claim in another,
 * and English-only — a deliberate limitation, because the honest-failure branch
 * is the BACKSTOP: the recovery path above is language-independent (word count
 * plus markdown structure) and covers the captured symptom in any language.
 */
export function claimsArtifactComplete(text: string | undefined): boolean {
  if (!text) return false;
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  return sentences.some(
    (s) => ARTIFACT_NOUN.test(s) && DONE_MARKER.test(s) && !NOT_A_CLAIM.test(s)
  );
}

/**
 * Evaluate (and where possible repair) the artifact contract of one run.
 * Returns null for workflows that declare no document deliverable.
 */
export async function evaluateArtifactContract(
  input: ArtifactContractInput
): Promise<ArtifactContractOutcome | null> {
  const workflow = getWorkflow(input.workflowId);
  const expectedType = workflow?.producesDocument;
  if (!expectedType) return null;

  const label = artifactLabel(expectedType);
  const text = input.assistantText ?? "";
  const claimedComplete = claimsArtifactComplete(text);

  const existing = await input.documentService.findByType(expectedType);
  let artifactExists = existing !== null;
  let recovered = false;
  let recoveryAttempted = false;
  let documentId: string | undefined;

  // Recover only when there is nothing to lose: no artifact of this type, and
  // the run wrote no documents of its own (if it wrote something, respect its
  // judgement instead of adding a synthesised sibling).
  const wroteNothing = (input.documentIds?.length ?? 0) === 0;
  if (!artifactExists && wroteNothing && looksLikeDeliverable(text)) {
    recoveryAttempted = true;
    try {
      const created = await input.documentService.create(
        expectedType,
        text,
        label,
        undefined,
        undefined,
        TRANSCRIPT_RECOVERY_SOURCE
      );
      documentId = created.id;
      artifactExists = true;
      recovered = true;
    } catch (e) {
      console.error(
        `[ArtifactContract] Recovery of ${expectedType} failed for book ${input.bookId}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  // A run is dishonest when it has no artifact AND either claimed one or
  // actually produced one it could not persist. An ordinary in-progress
  // conversational turn (no claim, nothing document-shaped) stays honest.
  const honest = artifactExists || (!claimedComplete && !recoveryAttempted);

  let message: string | undefined;
  if (recovered) {
    message =
      `Saved your ${label} as a document — the assistant wrote it into the chat ` +
      `but never saved it, so the product persisted it for you. You can find it ` +
      `in this book's documents.`;
  } else if (!honest) {
    message =
      `The ${label} was NOT saved — no ${expectedType} document exists for this ` +
      `book, so any step that needs it will refuse to run. Nothing was persisted ` +
      `by this session; please try again.`;
  }

  return {
    workflowId: input.workflowId,
    expectedType,
    artifactExists,
    recovered,
    claimedComplete,
    honest,
    documentId,
    message,
  };
}

export type PrerequisiteValidator = (workflowId: string) => Promise<{
  satisfied: boolean;
  /** Shape of PrerequisiteResult["missing"] — description is carried but unused here. */
  missing: Array<{ description?: string; satisfiedBy?: string }>;
}>;

/**
 * D-188, second link of the consequence chain: the failed run still advertised
 * `suggestedNext: ["build-architecture"]`, whose prerequisite is the STORY_BIBLE
 * that does not exist — so the product recommended the step it was about to
 * reject with 422. A blocked suggestion is replaced by the workflow that
 * unblocks it, or dropped when nothing can.
 */
export async function filterBlockedNextSteps(
  suggested: string[],
  validate: PrerequisiteValidator
): Promise<string[]> {
  const out: string[] = [];
  for (const id of suggested) {
    const res = await validate(id);
    if (res.satisfied) {
      out.push(id);
      continue;
    }
    const unblocker = res.missing.find((m) => m.satisfiedBy)?.satisfiedBy;
    if (unblocker) out.push(unblocker);
  }
  return [...new Set(out)];
}
