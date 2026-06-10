/**
 * Writer Memory Service — GAP M1 + M4
 * 
 * Manages persistent writer preferences and corrections that feed into
 * every agent prompt. Makes the AI remember what the writer told it.
 * 
 * Categories:
 * - style: "I prefer short sentences" / "Don't use em dashes"
 * - name: "Spell it Jón, not Jon" / "Her name is María with accent"
 * - preference: "Be more direct in suggestions" / "I like detailed feedback"
 * - constraint: "Don't change my dialogue" / "Leave chapter 7 as-is"
 * - correction: "I intentionally use fragments" / "The timeline jump is on purpose"
 * - learned: Agent-discovered patterns ("Author uses dual POV intentionally")
 */

import { db } from "@/lib/db";

export interface WriterMemoryEntry {
  id: string;
  category: string;
  content: string;
  source: string;
  bookId: string | null;
  active: boolean;
  createdAt: Date;
}

// ─── CRUD Operations ─────────────────────────────────────────

/** Add a new writer memory entry */
export async function addWriterMemory(
  userId: string,
  category: string,
  content: string,
  options?: {
    bookId?: string;
    source?: "user" | "agent" | "system";
  }
): Promise<WriterMemoryEntry> {
  const entry = await db.writerMemory.create({
    data: {
      userId,
      bookId: options?.bookId ?? null,
      category,
      content,
      source: options?.source ?? "user",
    },
  });
  return entry as unknown as WriterMemoryEntry;
}

/** Get all active writer memories for a user+book context */
export async function getWriterMemories(
  userId: string,
  bookId?: string
): Promise<WriterMemoryEntry[]> {
  const memories = await db.writerMemory.findMany({
    where: {
      userId,
      active: true,
      OR: [
        { bookId: null }, // Global preferences
        ...(bookId ? [{ bookId }] : []), // Book-specific preferences
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100, // Cap prompt-injection volume — newest 100 win
  });
  return memories as unknown as WriterMemoryEntry[];
}

/** Deactivate a writer memory (soft delete) */
export async function deactivateWriterMemory(
  userId: string,
  memoryId: string
): Promise<void> {
  await db.writerMemory.updateMany({
    where: { id: memoryId, userId },
    data: { active: false },
  });
}

/** Update a writer memory's content */
export async function updateWriterMemory(
  userId: string,
  memoryId: string,
  content: string
): Promise<void> {
  await db.writerMemory.updateMany({
    where: { id: memoryId, userId },
    data: { content, updatedAt: new Date() },
  });
}

// ─── Prompt Injection ────────────────────────────────────────

/**
 * Format writer memories for injection into agent prompts.
 * Returns XML block that goes into every agent's system prompt.
 */
export async function formatWriterMemoryForPrompt(
  userId: string,
  bookId?: string
): Promise<string> {
  const memories = await getWriterMemories(userId, bookId);
  if (memories.length === 0) return "";

  const grouped: Record<string, string[]> = {};
  for (const m of memories) {
    const cat = m.category;
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m.content);
  }

  let xml = "\n<writer_memory>\n";
  xml += "IMPORTANT: The writer has told you the following. Respect these across all interactions.\n\n";

  for (const [category, items] of Object.entries(grouped)) {
    xml += `## ${category.charAt(0).toUpperCase() + category.slice(1)} Preferences\n`;
    for (const item of items) {
      xml += `- ${item}\n`;
    }
    xml += "\n";
  }

  xml += "</writer_memory>\n";
  return xml;
}

// ─── Auto-Detection from Dismissed Findings ──────────────────

/**
 * When a writer dismisses a finding repeatedly, infer a preference.
 * Called from the editorial actions when status changes to "dismissed".
 */
export async function inferPreferenceFromDismissals(
  userId: string,
  bookId: string,
  findingCategory: string,
  findingDescription: string
): Promise<void> {
  // Count how many times this category has been dismissed for this book
  const dismissCount = await db.editFinding.count({
    where: {
      bookId,
      category: findingCategory,
      status: "dismissed",
    },
  });

  // After 5+ dismissals in the same category, auto-create a preference
  if (dismissCount >= 5) {
    // Check if we already have an auto-preference for this
    const existing = await db.writerMemory.findFirst({
      where: {
        userId,
        bookId,
        category: "learned",
        content: { contains: findingCategory },
        source: "system",
      },
    });

    if (!existing) {
      await addWriterMemory(
        userId,
        "learned",
        `Writer frequently dismisses "${findingCategory}" findings. They may intentionally use this pattern. Reduce flag frequency for this category.`,
        { bookId, source: "system" }
      );
    }
  }
}

/**
 * When a writer explicitly rates suggestions of a category unhelpful,
 * infer a preference. Threshold is lower than dismissals (3 vs 5):
 * thumbs-down is an active signal, dismissal a passive one.
 *
 * The learned content must contain the raw category string verbatim —
 * dedup (here and in inferPreferenceFromDismissals) relies on `contains`.
 * One learned note per category is by design.
 */
export async function inferPreferenceFromNegativeFeedback(
  userId: string,
  bookId: string,
  suggestionType: string
): Promise<void> {
  const negativeCount = await db.suggestionFeedback.count({
    where: {
      bookId,
      suggestionType,
      positive: false,
    },
  });

  if (negativeCount >= 3) {
    const existing = await db.writerMemory.findFirst({
      where: {
        userId,
        bookId,
        category: "learned",
        content: { contains: suggestionType },
        source: "system",
      },
    });

    if (!existing) {
      await addWriterMemory(
        userId,
        "learned",
        `Writer rated "${suggestionType}" suggestions unhelpful multiple times. Adjust approach for this category.`,
        { bookId, source: "system" }
      );
    }
  }
}
