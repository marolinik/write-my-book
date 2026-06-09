/**
 * Chapter Evolution Tracker — GAP M3
 * 
 * Tracks how chapters change over revisions, giving agents
 * context about the editorial history of each chapter.
 */

import { db } from "@/lib/db";

export interface ChapterEvolution {
  chapterNumber: number;
  revisionCount: number;
  statusHistory: string[];
  wordCountHistory: Array<{ version: number; wordCount: number; date: string }>;
  /** Summary of what changed in the most recent revision */
  latestChangeSummary: string | null;
  /** Agent sessions that touched this chapter */
  sessionHistory: Array<{
    workflowId: string;
    agentType: string;
    date: string;
    findingsCreated: number;
  }>;
}

/**
 * Get the evolution history of a chapter.
 * Used by agents to understand the chapter's editorial journey.
 */
export async function getChapterEvolution(
  bookId: string,
  chapterNumber: number
): Promise<ChapterEvolution | null> {
  const chapter = await db.chapter.findFirst({
    where: { bookId, chapterNumber },
    select: {
      chapterNumber: true,
      revisionCount: true,
      status: true,
    },
  });

  if (!chapter) return null;

  // Get document versions for word count history
  const versions = await db.documentVersion.findMany({
    where: {
      document: {
        bookId,
        chapterNumber,
        type: "CHAPTER_CONTENT",
      },
    },
    orderBy: { createdAt: "asc" },
    select: {
      versionNumber: true,
      wordCount: true,
      createdAt: true,
      changeSummary: true,
    },
  });

  // Get agent sessions for this chapter
  const sessions = await db.agentSession.findMany({
    where: {
      bookId,
      chapterNumber,
      status: "completed",
    },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: {
      workflowId: true,
      agentType: true,
      completedAt: true,
      _count: {
        select: {
          /* findings count would go here if there was a direct relation */
        },
      },
    },
  });

  // Count findings per session
  const findingCounts = await db.editFinding.groupBy({
    by: ["sessionId"],
    where: {
      bookId,
      chapterNumber,
    },
    _count: true,
  });
  const findingCountMap = new Map(
    findingCounts.map(f => [f.sessionId, f._count])
  );

  return {
    chapterNumber: chapter.chapterNumber,
    revisionCount: chapter.revisionCount,
    statusHistory: [chapter.status], // Would need a status history table for full tracking
    wordCountHistory: versions.map(v => ({
      version: v.versionNumber,
      wordCount: v.wordCount,
      date: v.createdAt.toISOString(),
    })),
    latestChangeSummary: versions.length > 0
      ? versions[versions.length - 1].changeSummary
      : null,
    sessionHistory: sessions.map(s => ({
      workflowId: s.workflowId ?? "",
      agentType: s.agentType,
      date: s.completedAt?.toISOString() ?? "",
      findingsCreated: 0, // Would need sessionId on findings
    })),
  };
}

/**
 * Format chapter evolution for prompt injection.
 */
export async function formatEvolutionForPrompt(
  bookId: string,
  chapterNumber: number
): Promise<string> {
  const evolution = await getChapterEvolution(bookId, chapterNumber);
  if (!evolution) return "";

  let text = `\n<chapter_evolution chapter="${chapterNumber}">\n`;
  text += `Revision count: ${evolution.revisionCount}\n`;

  if (evolution.wordCountHistory.length > 1) {
    const first = evolution.wordCountHistory[0];
    const last = evolution.wordCountHistory[evolution.wordCountHistory.length - 1];
    const delta = last.wordCount - first.wordCount;
    text += `Word count progression: ${first.wordCount} → ${last.wordCount} (${delta >= 0 ? "+" : ""}${delta} words over ${evolution.wordCountHistory.length} versions)\n`;
  }

  if (evolution.latestChangeSummary) {
    text += `Latest revision: ${evolution.latestChangeSummary}\n`;
  }

  if (evolution.sessionHistory.length > 0) {
    text += `Recent sessions: ${evolution.sessionHistory.slice(0, 5).map(s => s.workflowId.replace(/-/g, " ")).join(", ")}\n`;
  }

  text += "</chapter_evolution>\n";
  return text;
}
