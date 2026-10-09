/**
 * The ghostwriter's model for a book, ready to call: the role resolves through
 * book role → book default → global role → global default, the writer's own
 * keys are decrypted, and a missing provider key falls back to the local fleet
 * where the deployment allows it.
 *
 * Shared by every route that writes prose in the writer's name outside an
 * agent session (Polish Scene, the dev editor's trim/expand drafts), so the
 * two can never resolve different models for the same book.
 */

import { db } from "@/lib/db";
import { decryptApiKey } from "@/lib/encryption";
import { createLLMClient, resolveModelForRole, resolveRouteWithLocalFallback } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm";
import {
  USER_MODEL_SELECT,
  bookModelSettingsOf,
  globalOverridesOf,
  userModelSettingsOf,
} from "@/lib/llm/model-resolver";
import { getDefaultModelId } from "@/lib/llm/defaults";

type Resolved = ReturnType<typeof resolveModelForRole>;
type Client = ReturnType<typeof createLLMClient>;
type Route = ReturnType<typeof resolveRouteWithLocalFallback>["route"];

export type GhostwriterClient =
  | {
      ok: true;
      client: Client["client"];
      model: Client["model"];
      resolved: Resolved;
      route: Route;
    }
  | { ok: false };

export async function resolveGhostwriterClient(
  userId: string,
  book: { settings: unknown }
): Promise<GhostwriterClient> {
  const dbUser = await db.user.findUnique({
    where: { id: userId },
    select: USER_MODEL_SELECT,
  });
  const resolved = resolveModelForRole(
    "ghostwriter",
    bookModelSettingsOf(book.settings as Parameters<typeof bookModelSettingsOf>[0]),
    globalOverridesOf(userModelSettingsOf(dbUser)),
    dbUser?.defaultModel ?? getDefaultModelId()
  );

  const userKeys = await db.apiKey.findMany({
    where: { userId, validatedAt: { not: null } },
    select: { provider: true, encryptedKey: true },
  });
  const decryptedKeys: Partial<Record<ProviderKey, string>> = {};
  for (const k of userKeys) {
    decryptedKeys[k.provider as ProviderKey] = decryptApiKey(k.encryptedKey);
  }
  const keys = {
    anthropicApiKey: decryptedKeys.anthropic,
    openrouterApiKey: decryptedKeys.openrouter,
    openaiApiKey: decryptedKeys.openai,
    geminiApiKey: decryptedKeys.gemini,
    grokApiKey: decryptedKeys.grok,
  };

  const { route } = resolveRouteWithLocalFallback(resolved.modelDef, keys);
  if (route.route === "none") return { ok: false };
  const { client, model } = createLLMClient({ modelId: resolved.registryId, ...keys });
  return { ok: true, client, model, resolved, route };
}
