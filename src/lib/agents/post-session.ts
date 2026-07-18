/**
 * Post-session processing: after an agent session completes, parse its output
 * and update database records (findings, chapter status, word counts).
 */

import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { parseAgentOutput, extractNumericScore } from "@/lib/parsers";
import type { EditFindingParsed } from "@/lib/parsers";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { getExtractionKeysForUser } from "./extraction-keys";
import { onSessionCompleted, onDocumentChanged, onFindingsCreated } from "@/lib/vector/memory-manager";
import { promoteFindings } from "./blackboard";
import { synthesizeToSeries } from "@/lib/series/series-synthesizer";

export interface PostSessionContext {
  sessionId: string;
  bookId: string;
  userId: string;
  workflowId: string;
  agentType: string;
  chapterNumber?: number;
  /**
   * Parent BatchRun id, if this session is a batch child. When set, chapter
   * STATUS auto-advance (dev_edited/line_edited/beta_read/beta_passed) is
   * SUPPRESSED — the morning digest surfaces the findings and the writer
   * advances status manually (owner decision #7, BATCH-SPEC §6.3). Findings and
   * beta score/gate data are still recorded; only the pipeline status moves are
   * held back so an overnight run never silently advances a chapter's stage.
   */
  batchId?: string;
}

export interface PostSessionResult {
  suggestedNext: string[];
  findingsCreated: number;
  statusAdvanced: boolean;
  newStatus?: string;
  betaGateResult?: string; // "passed" | "failed" | "near_miss"
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
  "research-world": ["create-story-bible", "build-architecture"],
  "research-topic": [],
  "onboard-new-book": ["discuss-chapter", "plan-chapter"],
  "onboard-imported-book": ["dev-edit", "discuss-chapter"],
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
 * Derive suggested next workflows based on session outcome.
 * Unlike the static WORKFLOW_SUGGESTED_NEXT map, this reads the actual
 * chapter state (betaGate, status) to route writers to the right next step.
 *
 * MUST be called AFTER processBetaReadSession and advanceChapterStatus
 * so the chapter state reflects the session's changes.
 */
async function deriveSuggestedNext(
  workflowId: string,
  bookId: string,
  chapterNumber?: number
): Promise<string[]> {
  switch (workflowId) {
    case "beta-read": {
      if (!chapterNumber) return ["discuss-edits"];
      const chapter = await db.chapter.findFirst({
        where: { bookId, chapterNumber },
        select: { betaGate: true },
      });
      if (chapter?.betaGate === "passed") return ["publishing-check"];
      if (chapter?.betaGate === "near_miss") return ["discuss-edits", "revise"];
      return ["revise"];
    }
    case "dev-edit":
      return ["line-edit", "discuss-edits"];
    case "line-edit":
      return ["beta-read"];
    case "write-chapter":
      return ["dev-edit"];
    case "plan-chapter":
      return ["write-chapter"];
    case "revise":
      return ["line-edit", "beta-read"];
    case "capture-style":
    case "refresh-style":
      return ["dev-edit"];
    case "evolve-style":
      return [];
    case "build-architecture":
      return ["plan-chapter"];
    case "read-manuscript":
      return ["build-architecture", "capture-style"];
    case "publishing-check":
      return [];
    case "continuity-check":
      return ["revise"];
    case "market-analysis":
      return [];
    case "research-world":
      return ["create-story-bible", "build-architecture"];
    case "research-topic":
      return [];
    case "onboard-new-book":
      return ["discuss-chapter", "plan-chapter"];
    case "onboard-imported-book":
      return ["dev-edit", "discuss-chapter"];
    default:
      return WORKFLOW_SUGGESTED_NEXT[workflowId] ?? [];
  }
}

/**
 * Process the results of a completed agent session.
 * Parses output documents, stores findings, advances chapter status.
 */
export async function processPostSession(
  ctx: PostSessionContext
): Promise<PostSessionResult> {
  const result: PostSessionResult = {
    suggestedNext: [],
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

      // Index findings into vector memory (fire-and-forget)
      if (result.findingsCreated > 0) {
        const findingsForVector = await db.editFinding.findMany({
          where: {
            bookId: ctx.bookId,
            sessionId: ctx.sessionId,
            status: { not: "rejected" },
          },
          select: { id: true, description: true, severity: true, category: true, suggestion: true },
        });
        onFindingsCreated(
          ctx.bookId,
          findingsForVector.map(f => ({
            id: f.id,
            content: `${f.category}: ${f.description}${f.suggestion ? ` — Suggestion: ${f.suggestion}` : ""}`,
            severity: f.severity,
            domain: f.category,
          })),
          ctx.userId
        ).catch(err => console.error("[PostSession] Vector findings indexing failed (non-fatal):", err));
      }

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

    // Handle beta-read — parse gate result (MUST run before deriveSuggestedNext)
    if (ctx.workflowId === "beta-read") {
      await processBetaReadSession(ctx, docService);

      // Read back the beta gate result for the PostSessionResult
      if (ctx.chapterNumber) {
        const chAfterBeta = await db.chapter.findFirst({
          where: { bookId: ctx.bookId, chapterNumber: ctx.chapterNumber },
          select: { betaGate: true },
        });
        if (chAfterBeta?.betaGate) {
          result.betaGateResult = chAfterBeta.betaGate;
        }
      }

      // Circuit breaker: block auto-revise after repeated beta failures
      if (ctx.chapterNumber) {
        const cb = await checkCircuitBreaker(ctx.bookId, ctx.chapterNumber);
        if (cb.triggered) {
          console.warn(
            `[PostSession] Circuit breaker triggered for chapter ${ctx.chapterNumber} ` +
              `(${cb.failCount} failed beta reads). Auto-revise blocked.`
          );
        }
      }
    }

    // Advance chapter status if applicable (MUST run before deriveSuggestedNext).
    // SUPPRESSED for batch children — the digest surfaces findings and the
    // writer advances status manually after reading them (BATCH-SPEC §6.3).
    if (ctx.chapterNumber && !ctx.batchId) {
      const targetStatus = CHAPTER_STATUS_ADVANCE[ctx.workflowId];
      if (targetStatus) {
        result.statusAdvanced = await advanceChapterStatus(
          ctx.bookId,
          ctx.chapterNumber,
          targetStatus
        );
        if (result.statusAdvanced) {
          result.newStatus = targetStatus;
        }
      }
    }

    // ─── Outcome-Driven Routing ──────────────────────────────
    // MUST come after processBetaReadSession + advanceChapterStatus
    // so deriveSuggestedNext reads the updated chapter state.
    result.suggestedNext = await deriveSuggestedNext(
      ctx.workflowId,
      ctx.bookId,
      ctx.chapterNumber
    );

    // Circuit breaker override: clear suggestions if triggered
    if (ctx.workflowId === "beta-read" && ctx.chapterNumber) {
      const cb = await checkCircuitBreaker(ctx.bookId, ctx.chapterNumber);
      if (cb.triggered) {
        result.suggestedNext = [];
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
      updateChapterGraph(ctx.userId, ctx.bookId, ctx.chapterNumber, docService).catch(
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
      { chapterNumber: ctx.chapterNumber }
    ).catch((err) =>
      console.error("[PostSession] Vector session indexing failed (non-fatal):", err)
    );

    // ─── Research Workflows: Index Research Documents ────────
    // After research-world or research-topic, index the produced research document into vector memory.
    if (ctx.workflowId === "research-world" || ctx.workflowId === "research-topic") {
      const researchDocType = ctx.workflowId === "research-world" ? "WORLD_RESEARCH" : "TOPIC_RESEARCH";
      try {
        const researchDoc = await docService.findByType(researchDocType as DocumentType);
        if (researchDoc) {
          const researchContent = await docService.read(researchDoc.id);
          if (researchContent?.content) {
            onDocumentChanged(ctx.bookId, researchDocType, researchContent.content, {
              docId: researchDoc.id,
              userId: ctx.userId,
            }).catch(err =>
              console.error("[PostSession] Research doc vector indexing failed (non-fatal):", err)
            );
          }
        }
      } catch (err) {
        console.error("[PostSession] Research doc lookup failed (non-fatal):", err);
      }
    }

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

    // ─── Series Auto-Synthesis (fire-and-forget) ────────────
    // When a book's foundational doc completes and 2+ books in the series
    // have that artifact type, auto-regenerate the series-level document.
    maybeAutoSynthesize(ctx.bookId, ctx.workflowId, ctx.userId).catch((err) =>
      console.error("[PostSession] Auto-synthesis failed (non-fatal):", err)
    );
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

  const { gate, personas } = parsed.data;

  // Update the chapter with beta score and gate result
  const chapter = await db.chapter.findFirst({
    where: { bookId: ctx.bookId, chapterNumber: ctx.chapterNumber },
  });
  if (!chapter) return;

  // Fix: Use average persona score (0-10 scale), NOT gate.consensus (0-100 percentage)
  const avgScore = extractNumericScore(personas);

  await db.chapter.update({
    where: { id: chapter.id },
    data: {
      betaScore: avgScore,
      betaGate: gate.result.toLowerCase(),
    },
  });

  // If gate passed, advance status — but NOT for batch children, whose chapter
  // status auto-advance is suppressed so the writer promotes manually after the
  // digest (BATCH-SPEC §6.3). The betaScore/betaGate DATA above is still
  // recorded; only the pipeline STATUS move is held back.
  if (gate.result === "PASSED" && !ctx.batchId) {
    await db.chapter.update({
      where: { id: chapter.id },
      data: { status: "beta_passed" },
    });
  }
}

/**
 * Advance chapter status only if it's at an earlier stage.
 * Uses transaction with read-validate-write to prevent race conditions.
 *
 * Exported for direct unit testing (D-48 idempotent re-advance): the
 * regress-vs-refresh decision is the source of truth for the statusAdvanced
 * signal the writer sees, so it is tested in isolation.
 */
export async function advanceChapterStatus(
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

    // Never regress: a genuine pass at an EARLIER stage than the chapter's
    // current status must not pull it backward (e.g. a beta-read re-run must
    // not drop a beta_passed chapter to beta_read).
    if (targetIdx < currentIdx) return false;

    // D-48 idempotent re-advance: targetIdx === currentIdx means a genuine
    // successful run landed exactly on the chapter's current stage — a second
    // real line-edit pass on an already-line_edited chapter. This previously
    // returned false (target <= current), so the genuine pass reported
    // statusAdvanced:false and could neither refresh the stage nor correct a
    // chapter left stuck here by a pre-D-36 fake-success run (the sticky half
    // of D-48). Re-writing the same status below refreshes @updatedAt and lets
    // the run honestly report the pass; forward advances are unchanged.

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
    // Only update fingerprint text and name — preserve metrics/calibrationSamples
    // if they were already set by the SetVoiceMetrics tool call during the same session
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

  // Get all other chapters — include content for relevance filtering
  const docService = new DocumentService(ctx.userId, ctx.bookId);
  const chapters = await db.chapter.findMany({
    where: { bookId: ctx.bookId, chapterNumber: { not: ctx.chapterNumber } },
    select: { chapterNumber: true },
  });

  if (chapters.length === 0) return 0;

  // Extract entity names from finding descriptions for relevance matching
  // Entity names are typically the first quoted string or capitalized noun phrase
  function extractEntityName(description: string): string | null {
    // Match quoted strings first
    const quoted = description.match(/"([^"]+)"/);
    if (quoted) return quoted[1];
    // Match text after "character" or "entity" keywords
    const entityMatch = description.match(/(?:character|entity|person|place|location)\s+['"]?(\w[\w\s]*\w)['"]?/i);
    if (entityMatch) return entityMatch[1];
    return null;
  }

  let warningsCreated = 0;

  for (const finding of entityFindings) {
    const entityName = extractEntityName(finding.description);

    for (const ch of chapters) {
      // Relevance filter: only warn for adjacent chapters OR chapters mentioning the entity
      const isAdjacent = Math.abs(ch.chapterNumber - ctx.chapterNumber) <= 1;

      let mentionsEntity = false;
      if (entityName && !isAdjacent) {
        // Check chapter content for entity mention
        try {
          const chDoc = await docService.findByType(
            DocumentType.CHAPTER_CONTENT,
            ch.chapterNumber
          );
          if (chDoc) {
            const content = await docService.read(chDoc.id);
            if (content?.content) {
              mentionsEntity = content.content.toLowerCase().includes(entityName.toLowerCase());
            }
          }
        } catch {
          // If content unavailable, skip this chapter (don't create noise)
        }
      }

      if (!isAdjacent && !mentionsEntity) continue;

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
 * Auto-synthesize series documents when a book's foundational doc workflow completes.
 *
 * LOOP GUARD: Only triggers from book-level foundational doc workflows
 * (capture-style, refresh-style, create-story-bible, build-architecture).
 * Series-level workflow IDs are NOT in the artifactMap, so they return early.
 * Onboarding workflows delegate to sub-workflows whose independent completions
 * trigger this function, so onboarding IDs are also excluded.
 */
async function maybeAutoSynthesize(
  bookId: string,
  workflowId: string,
  userId: string
): Promise<void> {
  // Only trigger from book-level foundational doc workflows — NOT series-level
  const artifactMap: Record<string, string> = {
    "capture-style": "FINGERPRINT",
    "refresh-style": "FINGERPRINT",
    "create-story-bible": "STORY_BIBLE",
    "build-architecture": "ARCHITECTURE",
  };
  const artifactType = artifactMap[workflowId];
  if (!artifactType) return; // Not a foundational doc workflow

  const book = await db.book.findUnique({
    where: { id: bookId },
    select: { seriesId: true, bookNumber: true },
  });
  if (!book?.seriesId) return; // Not in a series

  // Count books in series that have this artifact type
  const booksWithArtifact = await db.document.groupBy({
    by: ["bookId"],
    where: {
      book: { seriesId: book.seriesId },
      type: artifactType as DocumentType,
    },
  });

  if (booksWithArtifact.length >= 2) {
    try {
      await synthesizeToSeries(
        userId,
        book.seriesId,
        bookId,
        book.bookNumber ?? 1,
        artifactType
      );
      console.info(
        `[auto-synth] Synthesized ${artifactType} for series ${book.seriesId} from book ${bookId}`
      );
    } catch (err) {
      console.error(
        `[auto-synth] Failed to synthesize ${artifactType} for series ${book.seriesId}:`,
        err
      );
    }
  }
}

/**
 * Update the knowledge graph with entities extracted from chapter content.
 * Fire-and-forget — errors are caught and logged by the caller.
 */
async function updateChapterGraph(
  userId: string,
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

  // Route extraction through the user's OWN provider (not hardcoded anthropic)
  // AND with their OWN decrypted keys — without the keys, createExtractionClient
  // throws "No API key available" and the continuity graph silently never
  // populates (the loss the readiness audit surfaced). Mirror the worker's
  // validatedAt-gated fetch.
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: { defaultModel: true },
  });
  const keys = await getExtractionKeysForUser(userId);
  await updateFromChapter(
    bookId,
    chapterNumber,
    content.content,
    dbUser?.defaultModel ?? undefined,
    keys
  );

  // Also index into vector memory
  await onDocumentChanged(bookId, "CHAPTER_CONTENT", content.content, { chapterNumber });
}
