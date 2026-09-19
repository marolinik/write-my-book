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
import { getDocumentTypeLabels } from "./tool-labels";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { enforceBookScript } from "./serbian-script";

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
  /**
   * A-13: the chapter in play. Required for a workflow whose deliverable IS
   * the chapter (write-chapter, revise) — the contract then asks about
   * CHAPTER_CONTENT at this number rather than a book-level document.
   */
  chapterNumber?: number;
  documentService: ArtifactDocumentStore;
  /**
   * C-6/H-9: the book's language. Recovery is the one write path that bypasses
   * executeWriteDocument entirely, so it enforced no script; and it titled the
   * recovered document "Story Bible" and told the writer about it in English
   * while the localized tables sat one import away.
   */
  language?: string;
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

/**
 * Whether the run's text IS a chapter rather than talk about one.
 *
 * The document heuristic is the wrong shape here: a chapter is prose, and
 * requiring markdown headings would reject every real draft. Prose is long,
 * paragraphed and almost unheaded — and a report about a chapter is not.
 */
export function looksLikeChapterProse(text: string | undefined): boolean {
  if (!text) return false;
  if (wordCount(text) < MIN_DELIVERABLE_WORDS) return false;
  if (text.includes("```")) return false;
  const headings = text.match(/^#{1,6}\s+\S/gm)?.length ?? 0;
  if (headings > 1) return false;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return paragraphs.length >= 3;
}

const ARTIFACT_NOUN =
  /\b(story bible|series bible|architecture|fingerprint|outline|beat sheet|document|chapter|draft|revision)\b/i;
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
 * A-13 — the same contract for a workflow whose deliverable is the prose.
 *
 * `write-chapter` mandated WriteChapter only inside REVISION MODE and declared
 * no artifact at all, so a ghostwritten chapter could be streamed into the
 * panel, praised by the model, and lost the moment the writer closed it — a
 * clean `success: true` over an empty chapter.
 *
 * The question this answers is narrower than the document one: did THIS run
 * write the chapter's content document? A chapter that merely exists proves
 * nothing, because `revise` starts from prose that is already there.
 */
async function evaluateChapterContract(
  input: ArtifactContractInput
): Promise<ArtifactContractOutcome | null> {
  const expectedType: DocumentType = "CHAPTER_CONTENT" as DocumentType;
  const chapterNumber = input.chapterNumber;
  const text = enforceBookScript(input.assistantText ?? "", input.language);
  const claimedComplete = claimsArtifactComplete(text);

  // Paths that do not carry the run's document ids (the BullMQ worker, a
  // delegation) cannot tell a saved chapter from a lost one; they report
  // nothing rather than guess.
  if (chapterNumber === undefined || input.documentIds === undefined) return null;

  const existing = await input.documentService.findByType(expectedType, chapterNumber);
  let artifactExists = existing !== null && input.documentIds.includes(existing.id);
  let recovered = false;
  let recoveryAttempted = false;
  let documentId: string | undefined;

  // Recovery writes prose ONLY into a chapter that has none. Overwriting a
  // chapter the writer already has is exactly the failure this codebase has
  // paid for twice; an existing chapter is left untouched and the run is
  // simply reported honestly.
  if (!artifactExists && existing === null && looksLikeChapterProse(text)) {
    recoveryAttempted = true;
    try {
      const created = await input.documentService.create(
        expectedType,
        text,
        `Chapter ${chapterNumber}`,
        chapterNumber,
        undefined,
        TRANSCRIPT_RECOVERY_SOURCE
      );
      documentId = created.id;
      artifactExists = true;
      recovered = true;
    } catch (e) {
      console.error(
        `[ArtifactContract] Recovery of chapter ${chapterNumber} failed for book ${input.bookId}:`,
        e instanceof Error ? e.message : e
      );
    }
  }

  // A run that produced a chapter it could not persist is dishonest even when
  // recovery was never attempted: `revise` streaming a full revised chapter
  // over prose that already exists is the exact case where the writer loses
  // the work and is told it went well.
  const producedProse = looksLikeChapterProse(text);
  const honest = artifactExists || (!claimedComplete && !producedProse);

  const strings = getAgentStrings(input.language ?? "en");
  const label =
    getDocumentTypeLabels(input.language)[expectedType] ?? artifactLabel(expectedType);
  let message: string | undefined;
  if (recovered) {
    message = strings.artifactRecovered.replace("{label}", label);
  } else if (!honest) {
    message = strings.artifactMissing.replace("{label}", label);
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

/**
 * Evaluate (and where possible repair) the artifact contract of one run.
 * Returns null for workflows that declare no document deliverable.
 */
export async function evaluateArtifactContract(
  input: ArtifactContractInput
): Promise<ArtifactContractOutcome | null> {
  const workflow = getWorkflow(input.workflowId);
  if (workflow?.producesChapter) {
    return evaluateChapterContract(input);
  }
  const expectedType = workflow?.producesDocument;
  if (!expectedType) return null;

  const label = getDocumentTypeLabels(input.language)[expectedType] ?? artifactLabel(expectedType);
  const text = enforceBookScript(input.assistantText ?? "", input.language);
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

  const strings = getAgentStrings(input.language ?? "en");
  let message: string | undefined;
  if (recovered) {
    message = strings.artifactRecovered.replace("{label}", label);
  } else if (!honest) {
    message = strings.artifactMissing.replace("{label}", label);
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
