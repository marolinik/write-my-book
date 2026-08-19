"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRoundIcon,
  ShieldCheckIcon,
  WalletIcon,
  ArrowRightIcon,
  Loader2Icon,
  CheckCircle2Icon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useApiKeys } from "@/hooks/use-api-keys";
import { PROVIDERS, type ProviderKey } from "@/lib/llm/providers";
import { ProviderCard } from "./provider-card";

// ─── Default model per provider ────────────────────────────────
// The first recommended model for each provider (used when picking default)
const DEFAULT_MODEL_PER_PROVIDER: Record<ProviderKey, string> = {
  anthropic: "anthropic/sonnet",
  openrouter: "openrouter/sonnet",
  openai: "openai/gpt-4o",
  gemini: "gemini/gemini-2.5-pro",
  grok: "grok/grok-3",
};

// ─── Model summaries per provider ──────────────────────────────
const PROVIDER_MODEL_SUMMARY: Record<ProviderKey, string> = {
  anthropic: "Claude Opus 4.6, Sonnet 4.5, Haiku 4.5",
  openrouter: "Claude + 200 other models via unified API",
  openai: "GPT-4o, o3, o4-mini",
  gemini: "Gemini 2.5 Pro, Gemini 2.5 Flash",
  grok: "Grok-4, Grok-3, Grok-3 Mini",
};

// ─── Component ─────────────────────────────────────────────────

export function OnboardingWizard() {
  const router = useRouter();
  const { data: keys, refetch: refetchKeys } = useApiKeys();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // Which providers have validated keys
  const connectedProviders = useMemo(() => {
    if (!keys) return new Set<string>();
    return new Set(
      keys.filter((k) => k.validatedAt != null).map((k) => k.provider)
    );
  }, [keys]);

  const connectedCount = connectedProviders.size;

  // Get existing key entry for a provider
  const getExistingKey = useCallback(
    (providerKey: string) => {
      return keys?.find((k) => k.provider === providerKey && k.validatedAt != null) ?? null;
    },
    [keys]
  );

  // Auto-select first connected provider if none selected
  const effectiveSelectedProvider = useMemo(() => {
    if (selectedProvider && connectedProviders.has(selectedProvider)) {
      return selectedProvider;
    }
    // Auto-select first connected
    for (const p of PROVIDERS) {
      if (connectedProviders.has(p.key)) return p.key;
    }
    return null;
  }, [selectedProvider, connectedProviders]);

  const handleKeyChanged = useCallback(() => {
    refetchKeys();
  }, [refetchKeys]);

  const handleFinishSetup = useCallback(
    async (options?: { skip?: boolean }) => {
      const skip = options?.skip ?? false;
      // Skip mode is the card-free / key-free on-ramp: no provider required.
      if (!skip && !effectiveSelectedProvider) return;

      setIsFinishing(true);
      try {
        // 1. Mark onboarding complete (sets the wmb_onboarded cookie too — the
        //    same POST on both paths, so skip is fully unblocked by middleware).
        const onboardRes = await fetch("/api/settings/onboarding", {
          method: "POST",
        });
        if (!onboardRes.ok) {
          const err = await onboardRes.json();
          throw new Error(err.error || "Failed to complete onboarding");
        }

        // 2. Set the default model only when a provider was chosen. Skip mode
        //    has no validated key yet, so there is nothing to default to.
        if (!skip && effectiveSelectedProvider) {
          const defaultModel =
            DEFAULT_MODEL_PER_PROVIDER[effectiveSelectedProvider];
          await fetch("/api/settings/default-model", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ defaultModel }),
          });
        }

        if (skip) {
          // Land the writer on "name your book", not a dashboard of zeros.
          toast.success("You're all set — let's start your first book.");
          router.push("/books/new?onboarding=1");
        } else {
          toast.success("Setup complete! Welcome to Write My Book OK.");
          router.push("/dashboard");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to complete setup"
        );
        setIsFinishing(false);
      }
    },
    [effectiveSelectedProvider, router]
  );

  return (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all ${
              s === step
                ? "w-8 bg-primary"
                : s < step
                  ? "w-8 bg-primary/40"
                  : "w-8 bg-muted"
            }`}
          />
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div className="text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome to Write My Book OK
            </h1>
            <p className="text-muted-foreground">
              Your AI-powered book authoring platform
            </p>
            <p className="text-sm text-muted-foreground">
              No credit card or API key required to start writing.
            </p>
          </div>

          <div className="grid gap-4 text-left max-w-md mx-auto">
            <div className="flex gap-3">
              <div className="shrink-0 mt-0.5">
                <KeyRoundIcon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Bring Your Own Keys</p>
                <p className="text-xs text-muted-foreground">
                  WMB uses your own AI provider API keys. You connect directly
                  to providers like Anthropic, OpenAI, or OpenRouter.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="shrink-0 mt-0.5">
                <ShieldCheckIcon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Your Writing Stays Yours</p>
                <p className="text-xs text-muted-foreground">
                  Your manuscript is stored encrypted at rest and sent only to
                  the AI provider you connect. We never use your content to
                  train AI models, and your API keys are encrypted &mdash; we
                  never see them in plaintext.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="shrink-0 mt-0.5">
                <WalletIcon className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Full Cost Control</p>
                <p className="text-xs text-muted-foreground">
                  You pay providers directly at their rates. No markup, no
                  surprise bills. Use budget models for drafts, premium for
                  final edits.
                </p>
              </div>
            </div>
          </div>

          <Button size="lg" onClick={() => setStep(2)}>
            Get Started
            <ArrowRightIcon className="size-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 2: Add Keys */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Add Your API Keys
            </h1>
            <p className="text-sm text-muted-foreground">
              Add at least one key. You can always add more later in Settings.
            </p>
          </div>

          <div className="space-y-3">
            {PROVIDERS.map((provider) => (
              <ProviderCard
                key={provider.key}
                provider={provider}
                existingKey={getExistingKey(provider.key)}
                onKeyAdded={handleKeyChanged}
                onKeyRemoved={handleKeyChanged}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                {connectedCount} of {PROVIDERS.length} providers connected
              </span>
              {connectedCount === 0 && (
                <Button
                  variant="ghost"
                  onClick={() => handleFinishSetup({ skip: true })}
                  disabled={isFinishing}
                >
                  {isFinishing ? (
                    <>
                      <Loader2Icon className="size-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    "Skip for now — start writing free"
                  )}
                </Button>
              )}
              <Button
                onClick={() => setStep(3)}
                disabled={connectedCount === 0}
              >
                Continue
                <ArrowRightIcon className="size-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Pick Default Provider */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">
              Choose Your Default Provider
            </h1>
            <p className="text-sm text-muted-foreground">
              This provider will be used by default for all workflows. You can
              always change it.
            </p>
          </div>

          <div className="space-y-2">
            {PROVIDERS.filter((p) => connectedProviders.has(p.key)).map(
              (provider) => {
                const isSelected = effectiveSelectedProvider === provider.key;
                return (
                  <button
                    key={provider.key}
                    type="button"
                    onClick={() => setSelectedProvider(provider.key)}
                    className={`w-full text-left rounded-lg border-2 p-4 transition-colors ${
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`size-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? "border-primary"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && (
                          <div className="size-2.5 rounded-full bg-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">
                          {provider.displayName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {PROVIDER_MODEL_SUMMARY[provider.key]}
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2Icon className="size-5 text-primary shrink-0" />
                      )}
                    </div>
                  </button>
                );
              }
            )}
          </div>

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              onClick={() => handleFinishSetup()}
              disabled={!effectiveSelectedProvider || isFinishing}
            >
              {isFinishing ? (
                <>
                  <Loader2Icon className="size-4 mr-2 animate-spin" />
                  Finishing...
                </>
              ) : (
                "Finish Setup"
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
