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
  "read-manuscript": ["capture-style", "create-story-bible"],
  "refresh-style": ["write-chapter"],
  "evolve-style": [],
  "market-analysis": [],
  "publishing-check": [],
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

    // Bridge FINGERPRINT document to StyleProfile table
    if (ctx.workflowId === "capture-style" || ctx.workflowId === "refresh-style") {
      await bridgeFingerprintToStyleProfile(ctx, docService);
    }

    // Handle edit workflows — parse report and store findings
    if (ctx.workflowId === "dev-edit" || ctx.workflowId === "line-edit") {
      result.findingsCreated = await processEditSession(ctx, docService);

      // Cascade warnings are best-effort — don't fail the whole post-session
      if (ctx.workflowId === "dev-edit" && result.findingsCreated > 0) {
        try {
          await createCascadeWarnings(ctx);
        } catch (cascadeErr) {
          console.error(
            `[PostSession] Cascade warnings failed (non-fatal):`,
            cascadeErr instanceof Error ? cascadeErr.message : cascadeErr
          );
        }
      }
    }

    // Handle beta-read — parse gate result
    if (ctx.workflowId === "beta-read") {
      await processBetaReadSession(ctx, docService);

      // Circuit breaker: block auto-revise after repeated beta failures
      if (ctx.chapterNumber) {
        const cb = await checkCircuitBreaker(ctx.bookId, ctx.chapterNumber);
        if (cb.triggered) {
          result.suggestedNext = [];
          console.warn(
            `[PostSession] Circuit breaker triggered for chapter ${ctx.chapterNumber} ` +
              `(${cb.failCount} failed beta reads). Auto-revise blocked.`
          );
        }
      }
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
 * Uses transaction with read-validate-write to prevent race conditions.
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

  return db.$transaction(async (tx) => {
    const chapter = await tx.chapter.findFirst({
      where: { bookId, chapterNumber },
    });
    if (!chapter) return false;

    const currentIdx = statusOrder.indexOf(chapter.status);
    const targetIdx = statusOrder.indexOf(targetStatus);

    // Only advance forward, never regress
    if (targetIdx <= currentIdx) return false;

    // Warn if skipping steps (but allow it)
    if (targetIdx > currentIdx + 1) {
      console.warn(
        `[PostSession] Chapter ${chapterNumber} skipping from "${chapter.status}" to "${targetStatus}" (${targetIdx - currentIdx} steps)`
      );
    }

    await tx.chapter.update({
      where: { id: chapter.id },
      data: { status: targetStatus },
    });

    return true;
  });
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

/**
 * Circuit breaker: after 3+ failed beta reads for a chapter, block auto-revise
 * to prevent infinite edit-revise loops.
 */
async function checkCircuitBreaker(
  bookId: string,
  chapterNumber: number
): Promise<{ triggered: boolean; failCount: number }> {
  const chapter = await db.chapter.findFirst({
    where: { bookId, chapterNumber },
  });
  if (!chapter) return { triggered: false, failCount: 0 };

  // Count completed beta-read sessions for this chapter via edit actions
  const failedBetaReads = await db.editAction.count({
    where: {
      bookId,
      chapterNumber,
      actionType: "session_complete",
      description: { contains: "beta-read" },
    },
  });

  // If beta gate is currently failed and 3+ beta-reads have run, trigger breaker
  if (chapter.betaGate === "failed" && failedBetaReads >= 3) {
    return { triggered: true, failCount: failedBetaReads };
  }

  return { triggered: false, failCount: failedBetaReads };
}

/**
 * Bridge FINGERPRINT document to StyleProfile table.
 * After capture-style or refresh-style workflows, upsert a StyleProfile
 * so the style page can display it without a separate query path.
 */
async function bridgeFingerprintToStyleProfile(
  ctx: PostSessionContext,
  docService: DocumentService
): Promise<void> {
  const doc = await docService.findByType(DocumentType.FINGERPRINT);
  if (!doc) return;

  const content = await docService.read(doc.id);
  if (!content) return;

  const book = await db.book.findUnique({
    where: { id: ctx.bookId },
    select: { name: true, bookNumber: true },
  });

  const existing = await db.styleProfile.findFirst({
    where: { userId: ctx.userId, sourceBookId: ctx.bookId },
  });

  if (existing) {
    await db.styleProfile.update({
      where: { id: existing.id },
      data: {
        fingerprint: content.content,
        name: `Style — ${book?.name ?? "Book"}`,
      },
    });
  } else {
    await db.styleProfile.create({
      data: {
        userId: ctx.userId,
        sourceBookId: ctx.bookId,
        sourceBookNumber: book?.bookNumber ?? 1,
        name: `Style — ${book?.name ?? "Book"}`,
        description: `Auto-generated from ${ctx.workflowId} workflow`,
        fingerprint: content.content,
      },
    });
  }
}

/**
 * Cascade warnings: when a dev-edit creates entity-related findings (character,
 * continuity, world-building, timeline), scan other chapters and create linked
 * warning findings so the user knows to review them for consistency.
 */
async function createCascadeWarnings(
  ctx: PostSessionContext
): Promise<number> {
  if (!ctx.chapterNumber) return 0;

  const entityCategories = [
    "character",
    "continuity",
    "world-building",
    "timeline",
  ];

  // Fetch this session's entity-related findings (critical/major only)
  const entityFindings = await db.editFinding.findMany({
    where: {
      bookId: ctx.bookId,
      chapterNumber: ctx.chapterNumber,
      sessionId: ctx.sessionId,
      category: { in: entityCategories },
      severity: { in: ["critical", "major"] },
    },
  });

  if (entityFindings.length === 0) return 0;

  // Get all other chapters
  const chapters = await db.chapter.findMany({
    where: { bookId: ctx.bookId, chapterNumber: { not: ctx.chapterNumber } },
    select: { chapterNumber: true },
  });

  if (chapters.length === 0) return 0;

  let warningsCreated = 0;

  for (const finding of entityFindings) {
    for (const ch of chapters) {
      await db.editFinding.create({
        data: {
          bookId: ctx.bookId,
          chapterNumber: ch.chapterNumber,
          sessionId: ctx.sessionId,
          agentType: "cascade-warning",
          severity: "suggestion",
          category: "continuity",
          description: `[Cascade] Ch.${ctx.chapterNumber} finding may affect this chapter: ${finding.description}`,
          suggestion: `Review this chapter for consistency after changes in Chapter ${ctx.chapterNumber}.`,
        },
      });
      warningsCreated++;
    }
  }

  return warningsCreated;
}
