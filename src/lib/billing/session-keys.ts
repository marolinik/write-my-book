import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import type { ProviderKey } from "@/lib/llm/providers";
import { managedKeyFor, managedTierConfig } from "@/lib/billing/managed-tier";
import { isFreeTierUser } from "@/lib/billing/free-tier-meters";

export interface AvailableKeys {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  grokApiKey?: string;
}

export interface SessionKeys {
  availableKeys: AvailableKeys;
  /** "platform" when the session runs on the product's key; stamp it on every usage row. */
  keySource: "user" | "platform";
  /** The managed-tier decision, or null when the writer has a key of their own. */
  managed: Awaited<ReturnType<typeof managedKeyFor>> | null;
}

/**
 * The managed key, but only for the provider it actually belongs to. A
 * platform Anthropic key must never be handed to the OpenRouter slot.
 */
function keyIfProvider(
  config: { provider: string; apiKey: string } | null,
  provider: string
): string | undefined {
  return config && config.provider === provider ? config.apiKey : undefined;
}

/**
 * The keys a session runs on, decided the same way for the start route,
 * /message and the background worker (P1-11).
 *
 * D4: a Free writer with no key of their own may run on the product's key
 * when the owner has turned the managed tier on, under a daily and a monthly
 * cap that managedKeyFor re-checks on every call. A writer who has any key
 * of their own never gets the platform one.
 *
 * `isFree` comes from the caller's quota check when it has one; the worker
 * has none, so it is worked out here the way checkQuota does.
 */
export async function resolveSessionKeys(userId: string, isFree?: boolean): Promise<SessionKeys> {
  const rows = await db.apiKey.findMany({
    where: { userId },
    select: { provider: true, encryptedKey: true, validatedAt: true },
  });
  const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
  for (const row of rows) {
    if (!row.validatedAt) continue;
    try {
      decryptedKeys[row.provider as ProviderKey] = decryptApiKey(row.encryptedKey);
    } catch {
      // A key that fails to decrypt is skipped, as if it were not saved.
    }
  }

  // The managed tier is only consulted for a writer with no key of their own,
  // and only when the owner has turned it on (no subscription read otherwise).
  const hasOwnKey = Object.keys(decryptedKeys).length > 0;
  let managed: SessionKeys["managed"] = null;
  if (!hasOwnKey && managedTierConfig()) {
    const free =
      isFree ?? isFreeTierUser(await db.subscription.findUnique({ where: { userId } }));
    managed = await managedKeyFor(userId, free);
  }
  const managedConfig = managed?.config ?? null;

  return {
    availableKeys: {
      anthropicApiKey: decryptedKeys.anthropic ?? keyIfProvider(managedConfig, "anthropic"),
      openrouterApiKey: decryptedKeys.openrouter ?? keyIfProvider(managedConfig, "openrouter"),
      openaiApiKey: decryptedKeys.openai ?? keyIfProvider(managedConfig, "openai"),
      geminiApiKey: decryptedKeys.gemini ?? keyIfProvider(managedConfig, "gemini"),
      grokApiKey: decryptedKeys.grok ?? keyIfProvider(managedConfig, "grok"),
    },
    keySource: managedConfig ? "platform" : "user",
    managed,
  };
}
