/**
 * Blackboard: Inter-Agent Communication system.
 * Agents post insights (warnings, suggestions, flags, constraints) to a shared
 * per-book blackboard. Other agents read relevant insights before starting work,
 * enabling cross-agent knowledge sharing without direct coupling.
 */

import { db } from "@/lib/db";

// ─── Types ───────────────────────────────────────────────────────

export type InsightType = "WARNING" | "SUGGESTION" | "FLAG" | "CONSTRAINT";
export type InsightStatus = "active" | "resolved" | "expired" | "dismissed";

export interface CreateInsightInput {
  bookId: string;
  sourceSessionId?: string;
  sourceAgentType: string;
  insightType: InsightType;
  domain: string;
  summary: string;
  detail: string;
  targetAgents?: string[];
  chapterScope?: number[];
  expiresAt?: Date;
}

export interface InsightRow {
  id: string;
  insightType: string;
  domain: string;
  summary: string;
  detail: string;
  sourceAgentType: string;
  createdAt: Date;
}

// ─── Create ──────────────────────────────────────────────────────

/** Create a new insight on the blackboard. */
export async function createInsight(
  input: CreateInsightInput
): Promise<{ id: string }> {
  const insight = await db.bookInsight.create({
    data: {
      bookId: input.bookId,
      sourceSessionId: input.sourceSessionId ?? null,
      sourceAgentType: input.sourceAgentType,
      insightType: input.insightType,
      domain: input.domain,
      summary: input.summary,
      detail: input.detail,
      targetAgents: input.targetAgents ?? [],
      chapterScope: input.chapterScope ?? [],
      expiresAt: input.expiresAt ?? null,
    },
    select: { id: true },
  });

  return { id: insight.id };
}

// ─── Read ────────────────────────────────────────────────────────

/**
 * Get relevant insights for a specific agent and chapter context.
 *
 * Filtering logic:
 * - status = "active"
 * - not expired (expiresAt is null OR in the future)
 * - targetAgents is empty (visible to all) OR includes the given agentType
 * - chapterScope is empty (applies to all chapters) OR includes chapterNumber
 */
export async function getRelevantInsights(
  bookId: string,
  agentType: string,
  chapterNumber?: number,
  limit: number = 20
): Promise<InsightRow[]> {
  const insights = await db.bookInsight.findMany({
    where: {
      bookId,
      status: "active",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      insightType: true,
      domain: true,
      summary: true,
      detail: true,
      sourceAgentType: true,
      targetAgents: true,
      chapterScope: true,
      createdAt: true,
    },
  });

  // Filter in-memory for array containment (Prisma doesn't support
  // "array is empty OR array contains value" in a single where clause
  // across all adapters cleanly).
  const filtered = insights.filter((insight) => {
    // targetAgents: empty = visible to all, otherwise must include agentType
    if (insight.targetAgents.length > 0 && !insight.targetAgents.includes(agentType)) {
      return false;
    }
    // chapterScope: empty = all chapters, otherwise must include chapterNumber
    if (
      chapterNumber !== undefined &&
      insight.chapterScope.length > 0 &&
      !insight.chapterScope.includes(chapterNumber)
    ) {
      return false;
    }
    return true;
  });

  return filtered.slice(0, limit).map((r) => ({
    id: r.id,
    insightType: r.insightType,
    domain: r.domain,
    summary: r.summary,
    detail: r.detail,
    sourceAgentType: r.sourceAgentType,
    createdAt: r.createdAt,
  }));
}

// ─── Prompt Injection ────────────────────────────────────────────

/**
 * Format insights as an XML block for prompt injection.
 * Returns empty string if no relevant insights exist.
 */
export async function formatInsightsForPrompt(
  bookId: string,
  agentType: string,
  chapterNumber?: number
): Promise<string> {
  const insights = await getRelevantInsights(bookId, agentType, chapterNumber);

  if (insights.length === 0) return "";

  const items = insights
    .map(
      (i) =>
        `  <insight type="${i.insightType}" domain="${i.domain}" from="${i.sourceAgentType}">
    <summary>${escapeXml(i.summary)}</summary>
    <detail>${escapeXml(i.detail)}</detail>
  </insight>`
    )
    .join("\n");

  return `<blackboard_insights count="${insights.length}">
${items}
</blackboard_insights>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Status Updates ──────────────────────────────────────────────

/** Resolve an insight (mark as resolved by a session). */
export async function resolveInsight(
  insightId: string,
  sessionId: string
): Promise<void> {
  await db.bookInsight.update({
    where: { id: insightId },
    data: {
      status: "resolved",
      resolvedBy: sessionId,
    },
  });
}

/** Dismiss an insight. */
export async function dismissInsight(insightId: string): Promise<void> {
  await db.bookInsight.update({
    where: { id: insightId },
    data: { status: "dismissed" },
  });
}

// ─── Maintenance ─────────────────────────────────────────────────

/**
 * Expire stale insights (those past their expiresAt date).
 * Returns count of insights expired.
 */
export async function expireStaleInsights(bookId: string): Promise<number> {
  const result = await db.bookInsight.updateMany({
    where: {
      bookId,
      status: "active",
      expiresAt: { not: null, lte: new Date() },
    },
    data: { status: "expired" },
  });

  return result.count;
}

/**
 * Auto-resolve insights after a document update.
 * When a document is updated, mark related active insights (same domain/chapter)
 * for review by changing their status to "resolved".
 * Returns count of insights resolved.
 */
export async function autoResolveAfterDocumentUpdate(
  bookId: string,
  documentType: string,
  chapterNumber?: number
): Promise<number> {
  // Map document types to insight domains they likely address
  const domainMap: Record<string, string[]> = {
    CHAPTER_CONTENT: ["pacing", "style", "continuity", "structure"],
    STORY_BIBLE: ["character", "world-rules", "continuity"],
    ARCHITECTURE: ["structure", "pacing", "foreshadowing"],
    CONTINUITY_REPORT: ["continuity", "timeline"],
    FINGERPRINT: ["style"],
  };

  const domains = domainMap[documentType];
  if (!domains || domains.length === 0) return 0;

  // Build the where clause: match domain AND (chapter scope is empty OR includes chapterNumber)
  const insights = await db.bookInsight.findMany({
    where: {
      bookId,
      status: "active",
      domain: { in: domains },
    },
    select: { id: true, chapterScope: true },
  });

  // Filter by chapter scope in-memory
  const toResolve = insights.filter((i) => {
    if (i.chapterScope.length === 0) return true;
    if (chapterNumber !== undefined && i.chapterScope.includes(chapterNumber)) return true;
    return false;
  });

  if (toResolve.length === 0) return 0;

  const result = await db.bookInsight.updateMany({
    where: {
      id: { in: toResolve.map((i) => i.id) },
    },
    data: { status: "resolved" },
  });

  return result.count;
}

// ─── Finding Promotion ───────────────────────────────────────────

/**
 * Promote critical/major findings to blackboard insights.
 * After an edit session, this scans for severe findings and creates
 * corresponding insights with a 7-day TTL so other agents can see them.
 * Returns count of insights created.
 */
export async function promoteFindings(
  bookId: string,
  sessionId: string,
  agentType: string,
  chapterNumber?: number
): Promise<number> {
  const where: Record<string, unknown> = {
    bookId,
    sessionId,
    severity: { in: ["critical", "major"] },
    status: "pending",
  };
  if (chapterNumber !== undefined) {
    where.chapterNumber = chapterNumber;
  }

  const findings = await db.editFinding.findMany({ where });

  if (findings.length === 0) return 0;

  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  // Map finding categories to blackboard domains
  const categoryToDomain: Record<string, string> = {
    character: "character",
    continuity: "continuity",
    "world-building": "world-rules",
    timeline: "timeline",
    pacing: "pacing",
    style: "style",
    structure: "structure",
    dialogue: "style",
    "anti-ai": "style",
    foreshadowing: "foreshadowing",
  };

  let created = 0;

  for (const finding of findings) {
    const domain = categoryToDomain[finding.category] ?? finding.category;

    await db.bookInsight.create({
      data: {
        bookId,
        sourceSessionId: sessionId,
        sourceAgentType: agentType,
        insightType: finding.severity === "critical" ? "WARNING" : "FLAG",
        domain,
        summary: finding.description.substring(0, 200),
        detail: [
          finding.description,
          finding.suggestion ? `Suggestion: ${finding.suggestion}` : null,
        ]
          .filter(Boolean)
          .join("\n\n"),
        chapterScope: chapterNumber !== undefined ? [chapterNumber] : [],
        expiresAt: sevenDaysFromNow,
      },
    });
    created++;
  }

  return created;
}
