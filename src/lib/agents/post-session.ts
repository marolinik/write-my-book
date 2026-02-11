/**
 * Post-session processing: after an agent session completes, parse its output
 * and update database records (findings, chapter status, word counts).
 */

import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { parseAgentOutput } from "@/lib/parsers";
import type { EditFindingParsed } from "@/lib/parsers";

export interface PostSessionContext {
  sessionId: string;
  bookId: string;
  userId: string;
  workflowId: string;
  agentType: string;
  chapterNumber?: number;
}

export interface PostSessionResult {
  suggestedNext: string[];
  findingsCreated: number;
  statusAdvanced: boolean;
}

const WORKFLOW_SUGGESTED_NEXT: Record<string, string[]> = {
  "dev-edit": ["line-edit", "revise"],
  "line-edit": ["beta-read"],
  "beta-read": ["revise", "discuss-edits"],
  "revise": ["dev-edit"],
  "write-chapter": ["dev-edit"],
  "plan-chapter": ["write-chapter"],
  "discuss-chapter": ["plan-chapter"],
  "analyze": [],
  "capture-style": ["new-novel"],
  "create-story-bible": ["build-architecture"],
  "build-architecture": ["plan-chapter"],
  "coach": [],
  "freewrite": [],
  "discuss-edits": ["revise"],
  "new-novel": ["create-story-bible"],
  "init-series": ["create-series-bible"],
  "create-series-bible": ["create-series-architecture"],
  "create-series-architecture": ["check-series-continuity"],
  "check-series-continuity": [],
};

const CHAPTER_STATUS_ADVANCE: Record<string, string> = {
  "dev-edit": "dev_edited",
  "line-edit": "line_edited",
  "beta-read": "beta_read",
  "write-chapter": "drafted",
  "plan-chapter": "planned",
  "discuss-chapter": "discussed",
};

/**
 * Process the results of a completed agent session.
 * Parses output documents, stores findings, advances chapter status.
 */
export async function processPostSession(
  ctx: PostSessionContext
): Promise<PostSessionResult> {
  const result: PostSessionResult = {
    suggestedNext: WORKFLOW_SUGGESTED_NEXT[ctx.workflowId] ?? [],
    findingsCreated: 0,
    statusAdvanced: false,
  };

  try {
    const docService = new DocumentService(ctx.userId, ctx.bookId);

    // Handle edit workflows — parse report and store findings
    if (ctx.workflowId === "dev-edit" || ctx.workflowId === "line-edit") {
      result.findingsCreated = await processEditSession(ctx, docService);
    }

    // Handle beta-read — parse gate result
    if (ctx.workflowId === "beta-read") {
      await processBetaReadSession(ctx, docService);
    }

    // Advance chapter status if applicable
    if (ctx.chapterNumber) {
      const targetStatus = CHAPTER_STATUS_ADVANCE[ctx.workflowId];
      if (targetStatus) {
        result.statusAdvanced = await advanceChapterStatus(
          ctx.bookId,
          ctx.chapterNumber,
          targetStatus
        );
      }
    }

    // Recalculate book word count
    await recalculateBookWordCount(ctx.bookId);
  } catch (error) {
    console.error(
      `[PostSession] Error processing session ${ctx.sessionId}:`,
      error instanceof Error ? error.message : error
    );
  }

  return result;
}

/**
 * Parse a dev-edit or line-edit report and create EditFinding records.
 * Deduplicates against existing findings for the same session.
 */
async function processEditSession(
  ctx: PostSessionContext,
  docService: DocumentService
): Promise<number> {
  if (!ctx.chapterNumber) return 0;

  // Determine report document type
  const reportType =
    ctx.workflowId === "dev-edit"
      ? DocumentType.DEV_EDIT_REPORT
      : DocumentType.LINE_EDIT_REPORT;

  // Read the report document
  const reportDoc = await docService.findByType(reportType, ctx.chapterNumber);
  if (!reportDoc) return 0;

  const reportContent = await docService.read(reportDoc.id);
  if (!reportContent) return 0;

  // Parse the report
  const parsed = parseAgentOutput(ctx.workflowId, reportContent.content);
  if (!parsed.parseSuccess || parsed.type !== "edit") return 0;

  const findings = parsed.data as EditFindingParsed[];
  if (findings.length === 0) return 0;

  // Get existing findings for this session to avoid duplicates
  const existingFindings = await db.editFinding.findMany({
    where: {
      bookId: ctx.bookId,
      chapterNumber: ctx.chapterNumber,
      sessionId: ctx.sessionId,
    },
    select: { description: true, category: true },
  });

  const existingSet = new Set(
    existingFindings.map((f) => `${f.category}::${f.description}`)
  );

  // Create new findings, skipping duplicates
  const newFindings = findings.filter(
    (f) => !existingSet.has(`${f.category}::${f.description}`)
  );

  if (newFindings.length === 0) return 0;

  await db.editFinding.createMany({
    data: newFindings.map((f) => ({
      bookId: ctx.bookId,
      chapterNumber: ctx.chapterNumber!,
      sessionId: ctx.sessionId,
      agentType: ctx.agentType,
      severity: f.severity,
      category: f.category,
      description: f.description,
      suggestion: f.suggestion,
      locationStart: f.locationStart,
      locationEnd: f.locationEnd,
    })),
  });

  // Log edit action
  await db.editAction.create({
    data: {
      bookId: ctx.bookId,
      chapterNumber: ctx.chapterNumber,
      actionType: "session_complete",
      sessionId: ctx.sessionId,
      description: `${ctx.workflowId} completed: ${newFindings.length} findings created`,
    },
  });

  return newFindings.length;
}

/**
 * Parse a beta-read report and update chapter beta score/gate.
 */
async function processBetaReadSession(
  ctx: PostSessionContext,
  docService: DocumentService
): Promise<void> {
  if (!ctx.chapterNumber) return;

  const reportDoc = await docService.findByType(
    DocumentType.BETA_READ_REPORT,
    ctx.chapterNumber
  );
  if (!reportDoc) return;

  const reportContent = await docService.read(reportDoc.id);
  if (!reportContent) return;

  const parsed = parseAgentOutput("beta-read", reportContent.content);
  if (!parsed.parseSuccess || parsed.type !== "beta-read") return;

  const { gate } = parsed.data;

  // Update the chapter with beta score and gate result
  const chapter = await db.chapter.findFirst({
    where: { bookId: ctx.bookId, chapterNumber: ctx.chapterNumber },
  });
  if (!chapter) return;

  const avgScore =
    gate.totalVotes > 0 ? gate.consensus : null;

  await db.chapter.update({
    where: { id: chapter.id },
    data: {
      betaScore: avgScore,
      betaGate: gate.result.toLowerCase(),
    },
  });

  // If gate passed, advance status
  if (gate.result === "PASSED") {
    await db.chapter.update({
      where: { id: chapter.id },
      data: { status: "beta_passed" },
    });
  }
}

/**
 * Advance chapter status only if it's at an earlier stage.
 */
async function advanceChapterStatus(
  bookId: string,
  chapterNumber: number,
  targetStatus: string
): Promise<boolean> {
  const statusOrder = [
    "undiscussed",
    "discussed",
    "planned",
    "drafted",
    "dev_edited",
    "line_edited",
    "beta_read",
    "beta_passed",
  ];

  const chapter = await db.chapter.findFirst({
    where: { bookId, chapterNumber },
  });
  if (!chapter) return false;

  const currentIdx = statusOrder.indexOf(chapter.status);
  const targetIdx = statusOrder.indexOf(targetStatus);

  // Only advance forward, never regress
  if (targetIdx <= currentIdx) return false;

  await db.chapter.update({
    where: { id: chapter.id },
    data: { status: targetStatus },
  });

  return true;
}

/**
 * Recalculate total word count for a book from all chapters.
 */
async function recalculateBookWordCount(bookId: string): Promise<void> {
  const result = await db.chapter.aggregate({
    where: { bookId },
    _sum: { wordCount: true },
  });

  await db.book.update({
    where: { id: bookId },
    data: { wordCount: result._sum.wordCount ?? 0 },
  });
}
