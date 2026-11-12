"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PROVIDERS, isRelayOnlyProvider, type ProviderKey } from "@/lib/llm/providers";
import { useApiKeys, type ApiKeyEntry } from "@/hooks/use-api-keys";
import { ProviderCard } from "@/components/onboarding/provider-card";
import { useLanguage } from "@/components/providers/language-provider";
import { CustomProvidersSection } from "./custom-providers-section";

// ── Helpers ─────────────────────────────────────────────────────

/** Find the existing key entry for a given provider, if any. */
function findKeyForProvider(
  keys: ApiKeyEntry[] | undefined,
  provider: ProviderKey
): Pick<ApiKeyEntry, "id" | "maskedKey" | "validatedAt" | "needsReentry"> | null {
  if (!keys) return null;
  const entry = keys.find((k) => k.provider === provider);
  if (!entry) return null;
  return {
    id: entry.id,
    maskedKey: entry.maskedKey,
    validatedAt: entry.validatedAt,
    needsReentry: entry.needsReentry,
  };
}

// ── Component ───────────────────────────────────────────────────

export function ApiKeysSection() {
  const { data: apiKeys, isLoading, isError } = useApiKeys();
  const { t } = useLanguage();

  return (
    // id="api-keys" lets /settings#api-keys land the writer directly here (UDG-16).
    <Card id="api-keys">
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
            {/* P2-21: a failed list load is said, not shown as "no keys saved". */}
            {isError && (
              <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
                {t.settings.apiKeysLoadFailed}
              </p>
            )}
            {PROVIDERS.map((provider) => {
              const existingKey = findKeyForProvider(apiKeys, provider.key);
              // D3: no relay is deployed, so OpenAI, Gemini and Grok are only
              // shown to a writer who already saved one, to let them delete it.
              const relayOnly = isRelayOnlyProvider(provider.key);
              if (relayOnly && !existingKey) return null;
              return (
                <div key={provider.key}>
                  <ProviderCard provider={provider} existingKey={existingKey} compact />
                  {existingKey?.needsReentry && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {t.settings.keyNeedsReentry}
                    </p>
                  )}
                  {relayOnly && (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {t.settings.relayKeyUnsupported}
                    </p>
                  )}
                </div>
              );
            })}
            <CustomProvidersSection />
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
