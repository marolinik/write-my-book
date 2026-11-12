import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import type { ProviderKey } from "@/lib/llm/providers";

export type DecryptedKeys = Partial<Record<ProviderKey, string>>;

/**
 * The writer's validated keys, decrypted. A row that fails to decrypt (a
 * rotated secret, a corrupt value) is logged and skipped as if it were not
 * saved, so one bad row cannot 500 ghost text, inline edit, chat, the
 * marketing kit, the wiki, discuss or the series agent (P2-17). Neither the
 * ciphertext nor any key reaches the log.
 */
export async function decryptValidatedKeys(userId: string): Promise<DecryptedKeys> {
  const rows = await db.apiKey.findMany({
    where: { userId, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  const keys: DecryptedKeys = {};
  for (const row of rows) {
    try {
      keys[row.provider as ProviderKey] = decryptApiKey(row.encryptedKey);
    } catch (error) {
      console.error(
        `[keys] skipped an undecryptable ${row.provider} key:`,
        error instanceof Error ? error.message : "unknown error"
      );
    }
  }
  return keys;
}
