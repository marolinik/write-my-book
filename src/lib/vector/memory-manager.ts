/**
 * Unified memory management orchestrating the indexer and retriever.
 *
 * All document types are indexed into the single wmb_memory collection.
 * Called from post-session.ts and prompt-assembler.ts.
 */

import { indexDocument, scheduleIndex } from "./indexer";
import { searchMemory, formatSearchResults } from "./retriever";
import { isEmbeddingAvailable } from "./embeddings";
import { db } from "@/lib/db";
import type { DocType } from "./types";

// ─── Document Type Mapping ───────────────────────────────────

/**
 * Map Prisma DocumentType enum values to our DocType for vector indexing.
 */
function mapDocumentType(documentType: string): DocType {
  switch (documentType) {
    case "CHAPTER_CONTENT":
    case "CHAPTER_BRIEF":
    case "CHAPTER_PLAN":
      return "chapter";
    case "STORY_BIBLE":
    case "SERIES_BIBLE":
      return "story_bible";
    case "ARCHITECTURE":
    case "SERIES_ARCHITECTURE":
      return "architecture";
    case "FINGERPRINT":
    case "SERIES_FINGERPRINT":
      return "style";
    default:
      // For DEV_EDIT_REPORT, LINE_EDIT_REPORT, BETA_READ_REPORT, etc.
      return "finding";
  }
}

// ─── Document Change Handler ────────────────────────────────

/**
 * Index a document change. Called from post-session.ts when documents are written.
 * Routes ALL document types to scheduleIndex (debounced).
 */
export async function onDocumentChanged(
  bookId: string,
  documentType: string,
  content: string,
  metadata?: {
    docId?: string;
    userId?: string;
    seriesId?: string | null;
    chapterId?: string | null;
    chapterNumber?: number;
    language?: string | null;
    version?: number;
  }
): Promise<void> {
  if (!isEmbeddingAvailable()) return;
  if (!content || content.trim().length === 0) return;

  const docType = mapDocumentType(documentType);
  const docId = metadata?.docId ?? `${bookId}:${documentType}`;

  scheduleIndex(bookId, docType, docId, content, {
    userId: metadata?.userId,
    seriesId: metadata?.seriesId ?? null,
    chapterId: metadata?.chapterId ?? null,
    chapterNumber: metadata?.chapterNumber ?? null,
    language: metadata?.language ?? null,
    version: metadata?.version ?? 1,
  });
}

// ─── Session Completion Handler ─────────────────────────────

/**
 * Record session memory. Called from post-session.ts when a session completes.
 * Indexes conversation history from ConversationTurn records.
 */
export async function onSessionCompleted(
  bookId: string,
  sessionId: string,
  agentType: string,
  workflowId: string,
  options?: {
    userId?: string;
    chapterNumber?: number;
    language?: string | null;
  }
): Promise<void> {
  if (!isEmbeddingAvailable()) return;

  // Load conversation history from DB
  let conversationContent = "";
  try {
    const turns = await db.conversationTurn.findMany({
      where: { sessionId },
      orderBy: { turnIndex: "asc" },
    });

    if (turns.length > 0) {
      conversationContent = turns
        .map((t) => `[${t.role}] ${t.content}`)
        .join("\n\n");
    }
  } catch {
    // If ConversationTurn query fails, fall back to a basic summary
  }

  // If no conversation content, create a basic summary
  if (!conversationContent) {
    conversationContent = `${agentType} completed ${workflowId}${
      options?.chapterNumber !== undefined
        ? ` for chapter ${options.chapterNumber}`
        : ""
    }`;
  }

  // Index as conversation type
  await indexDocument(bookId, "conversation", sessionId, conversationContent, {
    userId: options?.userId,
    chapterNumber: options?.chapterNumber ?? null,
    language: options?.language ?? null,
    version: 1,
  }).catch((err) => {
    console.error("[memory-manager] Failed to index session:", err);
  });
}

// ─── Findings Handler ────────────────────────────────────────

/**
 * Index editorial findings as vector memory.
 * Called when findings are created by post-session processing.
 */
export async function onFindingsCreated(
  bookId: string,
  findings: Array<{
    id: string;
    content: string;
    severity: string;
    domain: string;
  }>,
  userId: string
): Promise<void> {
  if (!isEmbeddingAvailable()) return;

  for (const finding of findings) {
    const content = `[${finding.severity}/${finding.domain}] ${finding.content}`;
    scheduleIndex(bookId, "finding", finding.id, content, {
      userId,
    });
  }
}

// ─── Prompt Context Retrieval ───────────────────────────────

/**
 * Get relevant context for a prompt. Called from prompt-assembler.ts.
 * Searches the unified wmb_memory collection and formats results
 * as a text block for injection into agent prompts.
 *
 * Returns empty string if embeddings are not available.
 */
export async function getRelevantMemory(
  bookId: string,
  query: string,
  options?: { limit?: number; chapterNumber?: number }
): Promise<string> {
  if (!isEmbeddingAvailable()) return "";

  const limit = options?.limit ?? 5;

  // Search unified memory with optional chapter filter
  const results = await searchMemory(bookId, query, {
    chapterNumber: options?.chapterNumber,
    limit,
  }).catch(() => []);

  if (results.length === 0) return "";

  return formatSearchResults(results);
}

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Derive a session summary category from the agent type and workflow ID.
 */
function deriveCategory(
  agentType: string,
  workflowId: string
): "decision" | "observation" | "style" | "continuity" | "structure" {
  // Style-related workflows
  if (
    workflowId.includes("style") ||
    workflowId.includes("fingerprint") ||
    agentType === "style-analyst" ||
    agentType === "voice-coach"
  ) {
    return "style";
  }

  // Continuity-related workflows
  if (
    workflowId.includes("continuity") ||
    agentType === "continuity-tracker" ||
    agentType === "series-continuity"
  ) {
    return "continuity";
  }

  // Structure-related workflows
  if (
    workflowId.includes("architecture") ||
    workflowId.includes("plan") ||
    agentType === "story-architect" ||
    agentType === "scene-planner"
  ) {
    return "structure";
  }

  // Edit workflows are decisions about what to change
  if (
    workflowId.includes("edit") ||
    workflowId.includes("revise") ||
    agentType === "dev-editor" ||
    agentType === "line-editor"
  ) {
    return "decision";
  }

  // Default: observation
  return "observation";
}
