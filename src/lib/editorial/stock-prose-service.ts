/**
 * The pass that reads a chapter for stock prose and leaves a note to check.
 *
 * A marked paragraph becomes a `prose` finding with severity `suggestion`, so
 * it appears in Lektura, is triaged with everything else and is applied or
 * dismissed like any other note. It is a prompt to look again, never a
 * verdict on who wrote the paragraph, and never labelled as an AI tell. The
 * judge produces no prose of its own, so the note is written in the book's
 * language from the dictionary.
 *
 * OFF unless the owner sets both `TYPESAFE_API_KEY` and
 * `STOCK_PROSE_ENABLED=1`. A failure writes nothing: the chapter keeps
 * exactly the findings it had.
 */

import { createHash } from "node:crypto";
import {
  splitPassages,
  buildStockProseRequests,
  readStockProseAnswers,
  selectForCheck,
  type StockProseJudgement,
} from "./stock-prose";
import { readChapterText } from "./book-evidence";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

/** A paragraph already carrying a pending note of these kinds is not asked about again. */
const OVERLAPPING_CATEGORIES = ["prose", "ai-tell", "anti-ai", "crutch-phrase"];

export function stockProseConfigured(env: Record<string, string | undefined>): boolean {
  return env.STOCK_PROSE_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

export interface StockProseResult {
  judged: number;
  marked: number;
  requests: number;
  reason?: "disabled" | "no-chapter-text" | "nothing-to-judge" | "failed";
}

/**
 * Same paragraph, same hash: a second run over unchanged prose writes nothing
 * new, and an edited paragraph is judged afresh.
 */
function hashFor(chapterNumber: number, text: string): string {
  return createHash("sha256")
    .update(`stock-prose:${chapterNumber}:${text}`)
    .digest("hex")
    .slice(0, 32);
}

export async function checkChapterStockProse(input: {
  bookId: string;
  chapterNumber: number;
  sessionId?: string;
  env?: Record<string, string | undefined>;
}): Promise<StockProseResult> {
  const env = input.env ?? process.env;
  const empty: StockProseResult = { judged: 0, marked: 0, requests: 0 };
  if (!stockProseConfigured(env)) return { ...empty, reason: "disabled" };

  const { db } = await import("@/lib/db");

  const chapterText = await readChapterText(input.bookId, input.chapterNumber);
  if (!chapterText) return { ...empty, reason: "no-chapter-text" };

  const alreadyNoted = await db.editFinding.findMany({
    where: {
      bookId: input.bookId,
      chapterNumber: input.chapterNumber,
      category: { in: OVERLAPPING_CATEGORIES },
      status: "pending",
    },
    select: { paragraphNumber: true },
  });
  const skip = new Set(alreadyNoted.map((f) => f.paragraphNumber));
  const passages = splitPassages(chapterText).filter((p) => !skip.has(p.paragraphNumber));
  if (passages.length === 0) return { ...empty, reason: "nothing-to-judge" };

  const requests = buildStockProseRequests(passages);
  let judged: StockProseJudgement[];
  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient();
    // In parallel: each request is small on purpose, and none waits on another.
    const answered = await Promise.all(
      requests.map(async (request) => {
        const response = await client.systemOne({
          state: request.state,
          questions: request.questions,
        } as never);
        return readStockProseAnswers(
          response.answers as Record<string, unknown>,
          request.passages
        );
      })
    );
    judged = answered.flat();
  } catch (error) {
    console.error(
      "[StockProse] pass failed, chapter left as it was:",
      error instanceof Error ? error.message : error
    );
    return { ...empty, reason: "failed" };
  }

  const marked = selectForCheck(judged);
  if (marked.length > 0) {
    const book = await db.book.findUnique({
      where: { id: input.bookId },
      select: { language: true },
    });
    const strings = getAgentStrings(book?.language ?? "en");
    await db.editFinding.createMany({
      data: marked.map((j) => ({
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        sessionId: input.sessionId ?? null,
        agentType: "stock-prose-judge",
        category: "prose",
        severity: "suggestion",
        description: strings.stockProseFinding,
        suggestion: strings.stockProseSuggestion,
        paragraphNumber: j.paragraphNumber,
        anchorQuote: j.text,
        confidence: j.confidence,
        contentHash: hashFor(input.chapterNumber, j.text),
        status: "pending",
      })),
      skipDuplicates: true,
    });
  }

  return { judged: judged.length, marked: marked.length, requests: requests.length };
}
