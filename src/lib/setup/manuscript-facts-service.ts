/**
 * Read what the manuscript settles before the setup conversation starts.
 *
 * One request over the opening chapters. OFF unless the owner sets both
 * `TYPESAFE_API_KEY` and `SETUP_FACTS_ENABLED=1`; a book with too little
 * prose, a slow answer or a failure all return null, and the conversation
 * simply asks, as it always did.
 */

import { buildFactsRequest, readFacts, MIN_OPENING_CHARS, type ManuscriptFacts } from "./manuscript-facts";
import { readChapterText } from "@/lib/editorial/book-evidence";

const TIMEOUT_MS = 8000;
const OPENING_TARGET = 8000;
const MAX_CHAPTERS_READ = 3;

export function setupFactsConfigured(env: Record<string, string | undefined>): boolean {
  return env.SETUP_FACTS_ENABLED === "1" && !!env.TYPESAFE_API_KEY?.trim();
}

export async function readManuscriptFacts(
  bookId: string,
  env: Record<string, string | undefined> = process.env
): Promise<ManuscriptFacts | null> {
  if (!setupFactsConfigured(env)) return null;

  let opening = "";
  for (let ch = 1; ch <= MAX_CHAPTERS_READ && opening.length < OPENING_TARGET; ch++) {
    const text = await readChapterText(bookId, ch).catch(() => null);
    if (text) opening += `${text}\n\n`;
  }
  if (opening.trim().length < MIN_OPENING_CHARS) return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const { TypeSafeClient } = await import("@typesafe-ai/sdk");
    const { state, questions } = buildFactsRequest(opening);
    const call = new TypeSafeClient().systemOne({ state, questions } as never);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${TIMEOUT_MS} ms`)), TIMEOUT_MS);
    });
    const response = await Promise.race([call, timeout]);
    return readFacts(response.answers as Record<string, unknown>);
  } catch (error) {
    console.error(
      "[SetupFacts] not read, setup will ask:",
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
