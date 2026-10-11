import type { WorkflowPrerequisite } from "./types";

/**
 * The one definition of "is this workflow prerequisite met", shared by the
 * server gate (prerequisites.ts, which reads the facts from the database) and
 * the agent panel (workflow-selector.tsx, which reads them from the book state
 * it already has). Pure and client-safe: no database, no server imports.
 *
 * P6-S08: the panel kept its own copy of this check and never read `anyOf`,
 * so an imported book — chapter text only — showed World Research and Write
 * Synopsis locked although the server accepts them (R-201). One function
 * means the two can no longer disagree.
 */

/** What is known about a book when a prerequisite is checked. */
export interface PrerequisiteFacts {
  /** Every document type the book has. */
  docTypes: ReadonlySet<string>;
  /** Any chapter text (CHAPTER_CONTENT) exists — imported or written here. */
  hasManuscript: boolean;
  /**
   * Whether a `chapter_content` requirement holds. The server knows the
   * chosen chapter and checks that chapter's text; the panel, before a
   * chapter is picked, can only say whether the book has chapters at all.
   */
  chapterContent: boolean;
  /**
   * Document types the chosen chapter has. Undefined before a chapter is
   * picked (the panel), when only the book-wide answer is knowable.
   */
  chapterDocTypes?: ReadonlySet<string>;
}

/**
 * Document types that belong to one chapter rather than the book. A plan for
 * chapter 1 says nothing about chapter 5, so these are checked against the
 * chosen chapter — and the artifact contract files them under it.
 *
 * Not the same list as tools.ts CHAPTER_SCOPED_DOC_TYPES, which names every
 * type WriteDocument requires a chapterNumber for. This one holds only the
 * types a workflow prerequisite or a declared deliverable treats per chapter.
 */
export const CHAPTER_SCOPED_DOCUMENT_TYPES: ReadonlySet<string> = new Set(["CHAPTER_PLAN"]);

function checkOne(
  condition: Pick<WorkflowPrerequisite, "type" | "value">,
  facts: PrerequisiteFacts
): boolean {
  switch (condition.type) {
    case "document":
      if (CHAPTER_SCOPED_DOCUMENT_TYPES.has(condition.value) && facts.chapterDocTypes) {
        return facts.chapterDocTypes.has(condition.value);
      }
      return facts.docTypes.has(condition.value);
    case "manuscript":
      return facts.hasManuscript;
    case "chapter_content":
      return facts.chapterContent;
    default:
      return true;
  }
}

/** A prerequisite holds when its own condition OR any `anyOf` alternative does. */
export function isPrerequisiteMet(
  prereq: WorkflowPrerequisite,
  facts: PrerequisiteFacts
): boolean {
  return (
    checkOne(prereq, facts) ||
    (prereq.anyOf ?? []).some((alt) => checkOne(alt, facts))
  );
}
