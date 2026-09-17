import { db } from "@/lib/db";
import { getWorkflow } from "./workflows";
import type { WorkflowPrerequisite } from "./types";

export interface PrerequisiteResult {
  satisfied: boolean;
  missing: Array<{
    description: string;
    satisfiedBy?: string;
  }>;
}

/**
 * Validate that all prerequisites for a workflow are met.
 * Single DB query fetches all document types for the book,
 * then checks each prerequisite against the result set.
 */
export async function validatePrerequisites(
  workflowId: string,
  bookId: string,
  chapterNumber?: number
): Promise<PrerequisiteResult> {
  const workflow = getWorkflow(workflowId);
  if (!workflow?.prerequisites || workflow.prerequisites.length === 0) {
    return { satisfied: true, missing: [] };
  }

  // Fetch all document types for this book in one query
  const docs = await db.document.findMany({
    where: { bookId },
    select: { type: true, chapterNumber: true },
  });

  const docTypeSet = new Set(docs.map((d) => d.type));
  // An imported manuscript is chapter text, nothing else — this is what lets a
  // book that arrived finished satisfy "manuscript" prerequisites.
  const hasManuscript = docs.some((d) => d.type === "CHAPTER_CONTENT");
  const chapterDocs = chapterNumber
    ? docs.filter((d) => d.chapterNumber === chapterNumber)
    : [];
  const chapterDocTypes = new Set(chapterDocs.map((d) => d.type));

  const missing: PrerequisiteResult["missing"] = [];

  for (const prereq of workflow.prerequisites) {
    const satisfied =
      checkPrerequisite(prereq, docTypeSet, chapterDocTypes, chapterNumber, hasManuscript) ||
      (prereq.anyOf ?? []).some((alt) =>
        checkPrerequisite(
          { ...prereq, type: alt.type, value: alt.value },
          docTypeSet,
          chapterDocTypes,
          chapterNumber,
          hasManuscript,
        ),
      );
    if (!satisfied) {
      missing.push({
        description: prereq.description,
        satisfiedBy: prereq.satisfiedBy,
      });
    }
  }

  return { satisfied: missing.length === 0, missing };
}

function checkPrerequisite(
  prereq: WorkflowPrerequisite,
  bookDocTypes: Set<string>,
  chapterDocTypes: Set<string>,
  chapterNumber?: number,
  hasManuscript = false
): boolean {
  switch (prereq.type) {
    case "document":
      return bookDocTypes.has(prereq.value);

    case "manuscript":
      return hasManuscript;

    case "chapter_content":
      // Check that chapter content exists for the specified chapter
      if (!chapterNumber) return true; // No chapter specified — skip
      return chapterDocTypes.has("CHAPTER_CONTENT");

    case "chapter_status":
      // This would require a separate query; for now, return true
      // (chapter status checks are handled by the proactive guide)
      return true;

    default:
      return true;
  }
}
