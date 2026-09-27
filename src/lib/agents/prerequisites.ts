import { db } from "@/lib/db";
import { NOT_AWAITING_REVIEW } from "@/lib/documents/review-gate";
import { getWorkflow } from "./workflows";
import { isPrerequisiteMet, type PrerequisiteFacts } from "./prerequisite-check";

export interface PrerequisiteResult {
  satisfied: boolean;
  missing: Array<{
    description: string;
    /** O4: the requirement itself, so the client can name it in the writer's
     *  language instead of echoing an English sentence or nothing at all. */
    type: string;
    value: string;
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
  if (!workflow) return { satisfied: true, missing: [] };

  // C3: a chapter-scoped workflow started without a chapter is unrunnable, not
  // unchecked. The chapter_content gate below used to answer "satisfied" when
  // chapterNumber was undefined, so a one-click chip could start a full-chapter
  // ghostwriter rewrite with no chapter at all and no content gate — the shape
  // that destroyed prose twice on this project.
  if (workflow.requiresChapter && !chapterNumber) {
    return {
      satisfied: false,
      missing: [
        {
          description: "Choose a chapter before starting this workflow.",
          type: "chapter_scope",
          value: workflowId,
        },
      ],
    };
  }

  if (!workflow.prerequisites || workflow.prerequisites.length === 0) {
    return { satisfied: true, missing: [] };
  }

  // Fetch all document types for this book in one query
  const docs = await db.document.findMany({
    where: { bookId, ...NOT_AWAITING_REVIEW },
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

  // The same check the agent panel runs (prerequisite-check.ts, P6-S08).
  const facts: PrerequisiteFacts = {
    docTypes: docTypeSet,
    hasManuscript,
    // Check that chapter content exists for the specified chapter. A missing
    // chapterNumber is caught above for chapter-scoped workflows; anything
    // else asking for chapter content book-wide has nothing to check.
    chapterContent: !chapterNumber || chapterDocTypes.has("CHAPTER_CONTENT"),
  };

  const missing: PrerequisiteResult["missing"] = [];

  for (const prereq of workflow.prerequisites) {
    const satisfied = isPrerequisiteMet(prereq, facts);
    if (!satisfied) {
      missing.push({
        description: prereq.description,
        type: prereq.type,
        value: prereq.value,
        satisfiedBy: prereq.satisfiedBy,
      });
    }
  }

  return { satisfied: missing.length === 0, missing };
}
