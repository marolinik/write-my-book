/**
 * The canon check over one chapter, run while the writer types.
 *
 * Only paragraphs not yet judged against this version of the story bible are
 * asked about, so an idle scan after a small edit costs one request, not a
 * chapter's worth. A flagged paragraph is narrowed to its sentence and written
 * as a `continuity` finding: it appears in Lektura, is triaged, and shows in
 * the continuity report beside the graph's flags.
 *
 * OFF unless the owner sets both `TYPESAFE_API_KEY` and
 * `CANON_CHECK_ENABLED=1`. A book without a story bible has no canon to break.
 * A failure writes nothing, not even the cache, so the next scan asks again.
 */

import { createHash } from "node:crypto";
import {
  buildCanonRequests,
  readCanonAnswers,
  selectContradictions,
  splitSentences,
  buildSentenceRequest,
  pickSentence,
  paragraphHash,
  type CanonJudgement,
  type CanonPassage,
} from "./canon-check";
import { readChapterText, readStoryBible } from "@/lib/editorial/book-evidence";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

/** Shorter than this, a paragraph rarely states a fact worth checking. */
const MIN_PARAGRAPH_CHARS = 30;

export function canonCheckConfigured(env: Record<string, string | undefined>): boolean {
  return env.CANON_CHECK_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

export interface CanonCheckResult {
  judged: number;
  cached: number;
  flagged: number;
  reason?: "disabled" | "no-bible" | "no-chapter-text" | "failed";
}

/** Numbered the way CreateFinding numbers paragraphs: 1-indexed over every non-empty block. */
function chapterParagraphs(chapter: string): CanonPassage[] {
  return chapter
    .split(/\n\n+/)
    .filter((block) => block.trim().length > 0)
    .map((block, i) => ({ paragraphNumber: i + 1, text: block.trim() }))
    .filter((p) => !p.text.startsWith("#") && p.text.length >= MIN_PARAGRAPH_CHARS);
}

function bibleHashOf(bible: string): string {
  return createHash("sha256").update(bible).digest("hex").slice(0, 32);
}

export async function checkChapterCanon(input: {
  bookId: string;
  chapterNumber: number;
  env?: Record<string, string | undefined>;
}): Promise<CanonCheckResult> {
  const env = input.env ?? process.env;
  const empty: CanonCheckResult = { judged: 0, cached: 0, flagged: 0 };
  if (!canonCheckConfigured(env)) return { ...empty, reason: "disabled" };

  const bible = await readStoryBible(input.bookId);
  if (!bible?.trim()) return { ...empty, reason: "no-bible" };
  const chapter = await readChapterText(input.bookId, input.chapterNumber);
  if (!chapter) return { ...empty, reason: "no-chapter-text" };

  const { db } = await import("@/lib/db");
  const bibleHash = bibleHashOf(bible);
  const paragraphs = chapterParagraphs(chapter).map((p) => ({ ...p, hash: paragraphHash(p.text) }));

  const known = await db.canonCheck.findMany({
    where: {
      bookId: input.bookId,
      bibleHash,
      paragraphHash: { in: paragraphs.map((p) => p.hash) },
    },
    select: { paragraphHash: true },
  });
  const seen = new Set(known.map((k) => k.paragraphHash));
  const fresh = paragraphs.filter((p) => !seen.has(p.hash));
  const cached = paragraphs.length - fresh.length;
  if (fresh.length === 0) return { ...empty, cached };

  let judged: Array<CanonJudgement & { hash: string }>;
  let anchors: Map<number, string | null>;
  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const client = new TypeSafeClient();
    // Only state and questions: the API answers 400 to any other top-level field.
    const ask = ({ state, questions }: { state: unknown; questions: unknown }) =>
      client
        .systemOne({ state, questions } as never)
        .then((r) => r.answers as Record<string, unknown>);

    const answered = await Promise.all(
      buildCanonRequests(fresh, bible).map(async (request) =>
        readCanonAnswers(await ask(request), request.passages)
      )
    );
    const byNumber = new Map(fresh.map((p) => [p.paragraphNumber, p.hash]));
    judged = answered.flat().map((j) => ({ ...j, hash: byNumber.get(j.paragraphNumber) as string }));

    // Narrow each flagged paragraph to the sentence that carries the contradiction.
    const flagged = selectContradictions(judged);
    const narrowed = await Promise.all(
      flagged.map(async (j) => {
        const sentences = splitSentences(j.text);
        if (sentences.length <= 1) return [j.paragraphNumber, null] as const;
        return [
          j.paragraphNumber,
          pickSentence(await ask(buildSentenceRequest(sentences, bible)), sentences),
        ] as const;
      })
    );
    anchors = new Map(narrowed);
  } catch (error) {
    console.error(
      "[CanonCheck] pass failed, chapter left as it was:",
      error instanceof Error ? error.message : error
    );
    return { ...empty, cached, reason: "failed" };
  }

  await db.canonCheck.createMany({
    data: judged.map((j) => ({
      bookId: input.bookId,
      paragraphHash: j.hash,
      bibleHash,
      contradiction: j.contradiction,
    })),
    skipDuplicates: true,
  });

  const flagged = selectContradictions(judged);
  if (flagged.length > 0) {
    const book = await db.book.findUnique({
      where: { id: input.bookId },
      select: { language: true },
    });
    const strings = getAgentStrings(book?.language ?? "en");
    await db.editFinding.createMany({
      data: flagged.map((j) => ({
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        agentType: "canon-judge",
        category: "continuity",
        severity: "important",
        description: strings.canonFinding,
        suggestion: strings.canonSuggestion,
        paragraphNumber: j.paragraphNumber,
        anchorQuote: anchors.get(j.paragraphNumber) ?? j.text,
        confidence: j.contradiction,
        contentHash: `canon:${j.hash}:${bibleHash}`,
        status: "pending",
      })),
      skipDuplicates: true,
    });
  }

  return { judged: judged.length, cached, flagged: flagged.length };
}
