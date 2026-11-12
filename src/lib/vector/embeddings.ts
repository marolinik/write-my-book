/**
 * OpenAI embedding wrapper.
 * Uses text-embedding-3-small (1536 dims) for cost-efficient semantic search.
 * Returns token usage counts for cost tracking.
 */

import { estimateTextTokens } from "@/lib/text/cjk";
import OpenAI from "openai";

const globalForOpenAI = globalThis as unknown as {
  __openaiClient: OpenAI | undefined;
};

/**
 * Lazy client construction: the OpenAI constructor throws when no API key
 * is present, so building it at module scope crashes every importing route
 * at build/boot time on key-less deploys (memory is meant to degrade
 * gracefully there; isEmbeddingAvailable() gates all call sites).
 */
function getOpenAIClient(): OpenAI {
  if (globalForOpenAI.__openaiClient) return globalForOpenAI.__openaiClient;

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  if (process.env.NODE_ENV !== "production") {
    globalForOpenAI.__openaiClient = client;
  }

  return client;
}

const EMBEDDING_MODEL = "text-embedding-3-small";
const MAX_BATCH_SIZE = 100; // OpenAI batch limit

export interface EmbedResult {
  vector: number[];
  tokensUsed: number;
}

export interface EmbedBatchResult {
  vectors: number[][];
  tokensUsed: number;
}

/**
 * text-embedding-3-small takes 8,191 tokens. P2-43: inputs were cut at 8,191
 * CHARACTERS, which for Chinese is well over the token limit (a 400 that left
 * the chapter unindexed) and for English a quarter of it. Cut by estimated
 * tokens instead, with room for the estimate's error.
 */
export const EMBEDDING_TOKEN_BUDGET = 6_000;

export function truncateForEmbedding(text: string): string {
  let estimate = estimateTextTokens(text);
  if (estimate <= EMBEDDING_TOKEN_BUDGET) return text;
  let end = text.length;
  while (estimate > EMBEDDING_TOKEN_BUDGET && end > 0) {
    end = Math.floor(end * (EMBEDDING_TOKEN_BUDGET / estimate) * 0.98);
    estimate = estimateTextTokens(text.slice(0, end));
  }
  return text.slice(0, end);
}

/**
 * Embed a single text string. Returns a 1536-dimensional vector and token count.
 */
export async function embedText(text: string): Promise<EmbedResult> {
  const response = await getOpenAIClient().embeddings.create({
    model: EMBEDDING_MODEL,
    input: truncateForEmbedding(text),
  });
  return {
    vector: response.data[0].embedding,
    tokensUsed: response.usage?.prompt_tokens ?? 0,
  };
}

/**
 * Embed multiple texts in a single API call (batched).
 * Returns vectors in the same order as input texts and total token count.
 */
export async function embedBatch(texts: string[]): Promise<EmbedBatchResult> {
  if (texts.length === 0) return { vectors: [], tokensUsed: 0 };

  const vectors: number[][] = [];
  let totalTokens = 0;

  // Process in batches of MAX_BATCH_SIZE
  for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
    const batch = texts.slice(i, i + MAX_BATCH_SIZE).map(
      (t) => truncateForEmbedding(t)
    );

    const response = await getOpenAIClient().embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
    });

    // Sort by index to ensure order matches input
    const sorted = response.data.sort((a, b) => a.index - b.index);
    vectors.push(...sorted.map((d) => d.embedding));
    totalTokens += response.usage?.prompt_tokens ?? 0;
  }

  return { vectors, tokensUsed: totalTokens };
}

/**
 * Check if OpenAI API key is configured.
 */
export function isEmbeddingAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
