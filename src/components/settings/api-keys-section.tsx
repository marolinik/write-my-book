"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PROVIDERS, type ProviderKey } from "@/lib/llm/providers";
import { useApiKeys, type ApiKeyEntry } from "@/hooks/use-api-keys";
import { ProviderCard } from "@/components/onboarding/provider-card";
import { useLanguage } from "@/components/providers/language-provider";

// ── Helpers ─────────────────────────────────────────────────────

/** Find the existing key entry for a given provider, if any. */
function findKeyForProvider(
  keys: ApiKeyEntry[] | undefined,
  provider: ProviderKey
): Pick<ApiKeyEntry, "id" | "maskedKey" | "validatedAt"> | null {
  if (!keys) return null;
  const entry = keys.find((k) => k.provider === provider);
  if (!entry) return null;
  return {
    id: entry.id,
    maskedKey: entry.maskedKey,
    validatedAt: entry.validatedAt,
  };
}

// ── Component ───────────────────────────────────────────────────

export function ApiKeysSection() {
  const { data: apiKeys, isLoading } = useApiKeys();
  const { t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.apiKeys}</CardTitle>
        <CardDescription>{t.settings.apiKeysDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                existingKey={findKeyForProvider(apiKeys, provider.key)}
                compact
              />
            ))}
          </div>
        )}

        {apiKeys && apiKeys.length > 0 && (
          <div className="mt-4 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium">{t.settings.usageSummary}</p>
            {apiKeys
              .filter((k) => k.usage && k.usage.sessionCount > 0)
              .map((k) => (
                <div key={k.id} className="flex items-center justify-between">
                  <span className="capitalize">{k.provider}</span>
                  <span>
                    {k.usage.sessionCount} {t.settings.sessionsUnit} &middot; ~$
                    {k.usage.totalCost.toFixed(2)}
                  </span>
                </div>
              ))}
            {apiKeys.every((k) => !k.usage || k.usage.sessionCount === 0) && (
              <p>{t.settings.noUsageYet}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
