import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import type { LLMClientOptions } from "@/lib/llm";

/** Provider name (api_keys.provider) → the LLMClientOptions key field. */
const EXTRACTION_KEY_FIELD: Record<
  string,
  "anthropicApiKey" | "openrouterApiKey" | "openaiApiKey" | "geminiApiKey" | "grokApiKey"
> = {
  anthropic: "anthropicApiKey",
  openrouter: "openrouterApiKey",
  openai: "openaiApiKey",
  gemini: "geminiApiKey",
  grok: "grokApiKey",
};

/**
 * Fetch + decrypt a user's VALIDATED API keys into the shape entity extraction
 * (createExtractionClient) expects. Only validated keys are used (mirrors the
 * agent worker's key fetch); an undecryptable key is skipped, never thrown.
 *
 * Without this, the graph-maintenance → entity-extractor path was invoked with
 * no keys, so createExtractionClient threw "No API key available" and the
 * continuity graph silently never populated from chapters.
 */
export async function getExtractionKeysForUser(
  userId: string
): Promise<Partial<LLMClientOptions>> {
  const rows = await db.apiKey.findMany({
    where: { userId },
    select: { provider: true, encryptedKey: true, validatedAt: true },
  });
  const keys: Partial<LLMClientOptions> = {};
  for (const row of rows) {
    if (!row.validatedAt) continue;
    const field = EXTRACTION_KEY_FIELD[row.provider];
    if (!field) continue;
    try {
      keys[field] = decryptApiKey(row.encryptedKey);
    } catch {
      // Skip keys that fail to decrypt (same as the worker).
    }
  }
  return keys;
}
