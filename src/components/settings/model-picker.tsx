"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  getProvider,
  type ProviderKey,
  type CostTier,
} from "@/lib/llm";
import { buildModelGroups } from "./model-picker-groups";

// ── Cost tier badge colors ─────────────────────────────────────

const COST_TIER_COLORS: Record<CostTier, string> = {
  $: "text-green-600 dark:text-green-400",
  $$: "text-yellow-600 dark:text-yellow-400",
  $$$: "text-red-600 dark:text-red-400",
};

function CostTierBadge({ tier }: { tier: CostTier }) {
  return (
    <span
      className={`ml-auto shrink-0 text-[10px] font-semibold ${COST_TIER_COLORS[tier]}`}
    >
      {tier}
    </span>
  );
}

// ── Types ─────────────────────────────────────────────────────

export interface ModelPickerProps {
  /** Current selected model registryId. null = use default. */
  value: string | null;
  /** Called when the selection changes. null means "Use Default". */
  onChange: (registryId: string | null) => void;
  /** Providers where the user has valid keys. Only shows models from these. */
  availableProviders: ProviderKey[];
  /** If true, shows "Use Default" option at the top (sets value to null). */
  showDefaultOption?: boolean;
  /** Optional label above the dropdown. */
  label?: string;
  /** Optional description below the label. */
  description?: string;
}

// ── Sentinel for "use default" ────────────────────────────────

const USE_DEFAULT_VALUE = "__use_default__";

// ── Component ─────────────────────────────────────────────────

export function ModelPicker({
  value,
  onChange,
  availableProviders,
  showDefaultOption = false,
  label,
  description,
}: ModelPickerProps) {
  // Group models by provider, sorted by tier (opus first). The dedupe keeps
  // the stored `value`'s entry within a same-displayName family — otherwise
  // the trigger renders blank for a stored non-kept tier id (D-131).
  const groupedModels = useMemo(
    () => buildModelGroups(availableProviders, value),
    [availableProviders, value]
  );

  // The actual value for the Select component
  const selectValue = value ?? (showDefaultOption ? USE_DEFAULT_VALUE : "");

  const handleValueChange = (val: string) => {
    if (val === USE_DEFAULT_VALUE) {
      onChange(null);
    } else {
      onChange(val);
    }
  };

  return (
    <div className="space-y-1.5">
      {label && <Label className="text-sm">{label}</Label>}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <Select value={selectValue} onValueChange={handleValueChange}>
        {/* Combobox triggers get no accessible name from their value text —
            reuse the visible label as the aria-label (D-10, axe button-name). */}
        <SelectTrigger className="w-full" aria-label={label ?? "Model"}>
          <SelectValue placeholder="Select a model..." />
        </SelectTrigger>
        <SelectContent>
          {showDefaultOption && (
            <SelectItem value={USE_DEFAULT_VALUE}>
              <span className="text-muted-foreground">Use Default</span>
            </SelectItem>
          )}

          {Array.from(groupedModels.entries()).map(
            ([providerKey, models]) => {
              if (models.length === 0) return null;
              let providerName: string;
              try {
                providerName = getProvider(providerKey).displayName;
              } catch {
                providerName = providerKey;
              }

              return (
                <SelectGroup key={providerKey}>
                  <SelectLabel>{providerName}</SelectLabel>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      <span className="flex items-center gap-2 w-full">
                        <span className="truncate">{model.displayName}</span>
                        <CostTierBadge tier={model.costTier} />
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            }
          )}

          {groupedModels.size === 0 && (
            <div className="px-2 py-3 text-center text-sm text-muted-foreground">
              No providers connected. Add an API key first.
            </div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
