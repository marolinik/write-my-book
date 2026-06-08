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
  const chapterDocs = chapterNumber
    ? docs.filter((d) => d.chapterNumber === chapterNumber)
    : [];
  const chapterDocTypes = new Set(chapterDocs.map((d) => d.type));

  const missing: PrerequisiteResult["missing"] = [];

  for (const prereq of workflow.prerequisites) {
    if (!checkPrerequisite(prereq, docTypeSet, chapterDocTypes, chapterNumber)) {
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
  chapterNumber?: number
): boolean {
  switch (prereq.type) {
    case "document":
      return bookDocTypes.has(prereq.value);

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
