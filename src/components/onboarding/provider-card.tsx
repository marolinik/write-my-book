"use client";

import { useState, useCallback } from "react";
import {
  BotIcon,
  GlobeIcon,
  SparklesIcon,
  GemIcon,
  ZapIcon,
  CheckCircle2Icon,
  Loader2Icon,
  ExternalLinkIcon,
  Trash2Icon,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAddApiKey,
  useDeleteApiKey,
  type ApiKeyEntry,
} from "@/hooks/use-api-keys";
import { useLanguage } from "@/components/providers/language-provider";
import type { ProviderDefinition } from "@/lib/llm/providers";

// ─── Icon map ──────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  Bot: BotIcon,
  Globe: GlobeIcon,
  Sparkles: SparklesIcon,
  Gem: GemIcon,
  Zap: ZapIcon,
};

// ─── Types ─────────────────────────────────────────────────────

type CardState = "disconnected" | "adding" | "validating" | "connected" | "error";

export interface ProviderCardProps {
  /** Provider definition from providers.ts */
  provider: ProviderDefinition;
  /** Existing key for this provider (from useApiKeys), or null */
  existingKey?: Pick<ApiKeyEntry, "id" | "maskedKey" | "validatedAt"> | null;
  /** Called after a key is successfully added */
  onKeyAdded?: () => void;
  /** Called after a key is successfully removed */
  onKeyRemoved?: () => void;
  /** Compact mode with less padding (for settings page) */
  compact?: boolean;
}

// ─── Cost hints per provider ───────────────────────────────────

const COST_HINTS: Record<string, string> = {
  anthropic: "Claude models, from $0.25/1M tokens",
  openrouter: "200+ models, Claude from $0.25/1M tokens",
  openai: "GPT-4o & o3 models, from $0.15/1M tokens",
  gemini: "Gemini 2.5 Pro & Flash, from $0.075/1M tokens",
  grok: "Grok-4 & Grok-3, from $3/1M tokens",
};

// ─── Component ─────────────────────────────────────────────────

export function ProviderCard({
  provider,
  existingKey,
  onKeyAdded,
  onKeyRemoved,
  compact = false,
}: ProviderCardProps) {
  const addKey = useAddApiKey();
  const deleteKey = useDeleteApiKey();
  const { t } = useLanguage();

  const [state, setState] = useState<CardState>(
    existingKey?.validatedAt ? "connected" : "disconnected"
  );
  const [keyInput, setKeyInput] = useState("");
  const [labelInput, setLabelInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  // Sync state if existingKey changes externally
  const isConnected = existingKey?.validatedAt != null;
  const effectiveState = isConnected && state === "disconnected" ? "connected" : state;

  const Icon = ICON_MAP[provider.iconName] ?? BotIcon;

  const handleStartAdding = useCallback(() => {
    setState("adding");
    setKeyInput("");
    setLabelInput("");
    setErrorMessage("");
  }, []);

  const handleCancel = useCallback(() => {
    setState(isConnected ? "connected" : "disconnected");
    setKeyInput("");
    setLabelInput("");
    setErrorMessage("");
  }, [isConnected]);

  const handleValidateAndSave = useCallback(async () => {
    if (!keyInput.trim()) return;

    setState("validating");
    setErrorMessage("");

    try {
      await addKey.mutateAsync({
        provider: provider.key,
        key: keyInput.trim(),
        label: labelInput.trim() || undefined,
      });
      setState("connected");
      setKeyInput("");
      setLabelInput("");
      onKeyAdded?.();
    } catch (err) {
      setState("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Validation failed"
      );
    }
  }, [keyInput, labelInput, provider.key, addKey, onKeyAdded]);

  const handleRemove = useCallback(async () => {
    if (!existingKey?.id) return;

    try {
      await deleteKey.mutateAsync(existingKey.id);
      setState("disconnected");
      setKeyInput("");
      onKeyRemoved?.();
    } catch {
      // Error toast handled by the hook
    }
  }, [existingKey?.id, deleteKey, onKeyRemoved]);

  const borderClass =
    effectiveState === "connected"
      ? "border-green-500 dark:border-green-600 border-solid"
      : "border-dashed border-muted-foreground/30";

  return (
    <div
      className={`rounded-lg border-2 ${borderClass} ${
        compact ? "p-3" : "p-4"
      } transition-colors`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div
          className={`shrink-0 flex items-center justify-center rounded-md ${
            compact ? "size-8" : "size-10"
          } ${
            effectiveState === "connected"
              ? "bg-green-100 dark:bg-green-950/40"
              : "bg-muted"
          }`}
        >
          <Icon
            className={`${compact ? "size-4" : "size-5"} ${
              effectiveState === "connected"
                ? "text-green-600 dark:text-green-400"
                : "text-muted-foreground"
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>
              {provider.displayName}
            </h3>
            {effectiveState === "connected" && (
              <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400 shrink-0" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {t.settings.providerBlurbs[provider.key] ?? provider.description}
          </p>
        </div>
      </div>

      {/* Cost hint */}
      {effectiveState !== "connected" && !compact && (
        <p className="text-xs text-muted-foreground/70 mb-3 ml-13">
          {COST_HINTS[provider.key] ?? ""}
        </p>
      )}

      {/* States */}
      {effectiveState === "disconnected" && (
        <div className="flex items-center gap-2 mt-3">
          <Button variant="outline" size="sm" onClick={handleStartAdding}>
            {t.settings.addKey}
          </Button>
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t.settings.getKey} <ExternalLinkIcon className="size-3" />
          </a>
        </div>
      )}

      {(effectiveState === "adding" || effectiveState === "error") && (
        <div className="space-y-3 mt-3">
          <div className="space-y-1.5">
            <Label htmlFor={`key-${provider.key}`} className="text-xs">
              {t.settings.apiKey}
            </Label>
            <Input
              id={`key-${provider.key}`}
              type="password"
              placeholder={provider.keyPlaceholder}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleValidateAndSave();
              }}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`label-${provider.key}`} className="text-xs">
              {t.settings.labelOptional}
            </Label>
            <Input
              id={`label-${provider.key}`}
              placeholder={t.settings.labelPlaceholder}
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              className="text-sm"
            />
          </div>

          {effectiveState === "error" && errorMessage && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {errorMessage}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handleValidateAndSave}
              disabled={!keyInput.trim()}
            >
              {t.settings.validateAndSave}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
            >
              {t.settings.cancel}
            </Button>
            {effectiveState === "error" && (
              <a
                href={provider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto"
              >
                {t.settings.getKey} <ExternalLinkIcon className="size-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {effectiveState === "validating" && (
        <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
          <Loader2Icon className="size-4 animate-spin" />
          {t.settings.validating}
        </div>
      )}

      {effectiveState === "connected" && (
        <div className="flex items-center justify-between mt-3">
          <span className="text-xs font-mono text-muted-foreground">
            {existingKey?.maskedKey ?? "****"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={handleStartAdding}
            >
              {t.settings.replace}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              onClick={handleRemove}
              disabled={deleteKey.isPending}
            >
              <Trash2Icon className="size-3 mr-1" />
              {t.settings.remove}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
