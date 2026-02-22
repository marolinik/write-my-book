/**
 * Post-session processing: after an agent session completes, parse its output
 * and update database records (findings, chapter status, word counts).
 */

import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { parseAgentOutput } from "@/lib/parsers";
import type { EditFindingParsed } from "@/lib/parsers";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { onSessionCompleted, onDocumentChanged } from "@/lib/vector/memory-manager";
import { promoteFindings } from "./blackboard";

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

    // Handle edit workflows — verify findings created via tool calls
    if (ctx.workflowId === "dev-edit" || ctx.workflowId === "line-edit") {
      result.findingsCreated = await verifySessionFindings(ctx);

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

    // ─── Knowledge Graph Update (fire-and-forget) ────────────
    // After write-chapter or revise, update the graph with entities from the chapter content.
    if (
      ctx.chapterNumber &&
      (ctx.workflowId === "write-chapter" || ctx.workflowId === "revise")
    ) {
      updateChapterGraph(ctx.bookId, ctx.chapterNumber, docService).catch(
        (err) => console.error("[PostSession] Graph update failed (non-fatal):", err)
      );
    }

    // ─── Vector Memory Indexing (fire-and-forget) ────────────
    // Index updated documents into vector collections for semantic search.
    onSessionCompleted(
      ctx.bookId,
      ctx.sessionId,
      ctx.agentType,
      ctx.workflowId,
      ctx.chapterNumber
    ).catch((err) =>
      console.error("[PostSession] Vector session indexing failed (non-fatal):", err)
    );

    // ─── Blackboard: Promote Critical Findings to Insights ──
    // After edit sessions, promote critical/major findings to the blackboard.
    if (ctx.workflowId === "dev-edit" || ctx.workflowId === "line-edit") {
      promoteFindings(
        ctx.bookId,
        ctx.sessionId,
        ctx.agentType,
        ctx.chapterNumber
      ).catch((err) =>
        console.error("[PostSession] Insight promotion failed (non-fatal):", err)
      );
    }
  } catch (error) {
    console.error(
      `[PostSession] Error processing session ${ctx.sessionId}:`,
      error instanceof Error ? error.message : error
    );
  }

  return result;
}

/**
 * Verify findings created during an edit session via tool calls.
 * No longer parses report documents - findings are created exclusively via CreateFinding tool.
 */
async function verifySessionFindings(
  ctx: PostSessionContext
): Promise<number> {
  if (!ctx.chapterNumber) return 0;
  const findings = await db.editFinding.findMany({
    where: {
      bookId: ctx.bookId,
      chapterNumber: ctx.chapterNumber,
      sessionId: ctx.sessionId,
      status: { not: "rejected" },
    },
  });
  const rejectedCount = await db.editFinding.count({
    where: {
      bookId: ctx.bookId,
      chapterNumber: ctx.chapterNumber,
      sessionId: ctx.sessionId,
      status: "rejected",
    },
  });
  if (rejectedCount > 0) {
    console.info(
      `[PostSession] Session ${ctx.sessionId}: ${findings.length} findings created, ${rejectedCount} rejected during validation`
    );
  }
  if (findings.length > 0) {
    await db.editAction.create({
      data: {
        bookId: ctx.bookId,
        chapterNumber: ctx.chapterNumber,
        actionType: "session_complete",
        sessionId: ctx.sessionId,
        description: `${ctx.workflowId} completed: ${findings.length} findings created via tool calls${rejectedCount > 0 ? `, ${rejectedCount} rejected` : ""}`,
      },
    });
  }
  return findings.length;
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

/**
 * Update the knowledge graph with entities extracted from chapter content.
 * Fire-and-forget — errors are caught and logged by the caller.
 */
async function updateChapterGraph(
  bookId: string,
  chapterNumber: number,
  docService: DocumentService
): Promise<void> {
  const doc = await docService.findByType(
    DocumentType.CHAPTER_CONTENT,
    chapterNumber
  );
  if (!doc) return;

  const content = await docService.read(doc.id);
  if (!content?.content) return;

  await updateFromChapter(bookId, chapterNumber, content.content);

  // Also index into vector memory
  await onDocumentChanged(bookId, "CHAPTER_CONTENT", content.content, chapterNumber);
}
