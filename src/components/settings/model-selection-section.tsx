"use client";

import { useCallback, useRef, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ModelPicker } from "./model-picker";
import {
  useDefaultModel,
  useUpdateDefaultModel,
  useUpdateGlobalRoleOverride,
} from "@/hooks/use-default-model";
import { useApiKeys } from "@/hooks/use-api-keys";
import { useCustomProviders } from "@/hooks/use-custom-providers";
import type { AgentRole } from "@/lib/llm";
import type { ProviderKey } from "@/lib/llm/providers";

// ── Role descriptions ─────────────────────────────────────────

interface RoleInfo {
  role: AgentRole;
  label: string;
  description: string;
}

const ROLE_INFOS: RoleInfo[] = [
  {
    role: "ghostwriter",
    label: "Ghostwriter",
    description: "Writes chapters, plans outlines, builds story architecture.",
  },
  {
    role: "editor",
    label: "Editor",
    description:
      "Dev editing, line editing, revision suggestions.",
  },
  {
    role: "beta-reader",
    label: "Beta Reader",
    description: "Simulated reader panel providing reader feedback.",
  },
  {
    role: "analyst",
    label: "Analyst",
    description:
      "Style analysis, manuscript reading, continuity checking, market analysis.",
  },
  {
    role: "coach",
    label: "Coach",
    description:
      "Writing coach orchestrating multi-step workflows.",
  },
  {
    role: "creative",
    label: "Creative",
    description:
      "Story architecture, scene planning, creative brainstorming.",
  },
];

/** Map AgentRole to the field key on DefaultModelData. */
const ROLE_FIELD_MAP: Record<AgentRole, string> = {
  ghostwriter: "modelGhostwriter",
  editor: "modelEditor",
  "beta-reader": "modelBetaReader",
  analyst: "modelAnalyst",
  coach: "modelCoach",
  creative: "modelCreative",
};

// ── Component ─────────────────────────────────────────────────

export function ModelSelectionSection() {
  const { data: defaultModelData } = useDefaultModel();
  const updateDefaultModel = useUpdateDefaultModel();
  const updateRoleOverride = useUpdateGlobalRoleOverride();
  const { data: apiKeys } = useApiKeys();
  const { data: customProviders, defs: customModelDefs } = useCustomProviders();

  // Derive available providers from user's validated keys
  const availableProviders: ProviderKey[] = (apiKeys ?? [])
    .filter((k) => k.validatedAt != null)
    .map((k) => k.provider as ProviderKey)
    // Deduplicate (user can only have 1 key per provider, but be safe)
    .filter((p, i, arr) => arr.indexOf(p) === i);
  // Custom providers trigger the "local" provider slot (LLMProvider-
  // consistent — local LAN boxes/proxies all resolve under "local").
  if (customProviders && customProviders.length > 0) {
    if (!availableProviders.includes("local" as ProviderKey)) {
      availableProviders.push("local" as ProviderKey);
    }
  }

  // Debounce timers for role overrides
  const roleTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of Object.values(roleTimerRef.current)) {
        clearTimeout(timer);
      }
    };
  }, []);

  // Debounced default model update
  const defaultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDefaultModelChange = useCallback(
    (registryId: string | null) => {
      if (!registryId) return; // Global default cannot be null
      if (defaultTimerRef.current) clearTimeout(defaultTimerRef.current);
      defaultTimerRef.current = setTimeout(() => {
        updateDefaultModel.mutate(registryId);
      }, 500);
    },
    [updateDefaultModel]
  );

  // Debounced role override update
  const handleRoleChange = useCallback(
    (role: AgentRole, registryId: string | null) => {
      if (roleTimerRef.current[role]) {
        clearTimeout(roleTimerRef.current[role]);
      }
      roleTimerRef.current[role] = setTimeout(() => {
        updateRoleOverride.mutate({ role, registryId });
      }, 500);
    },
    [updateRoleOverride]
  );

  // Get the current role override value
  const getRoleValue = (role: AgentRole): string | null => {
    if (!defaultModelData) return null;
    const field = ROLE_FIELD_MAP[role] as keyof typeof defaultModelData;
    return (defaultModelData[field] as string | null) ?? null;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Model Selection</CardTitle>
        <CardDescription>
          Choose which AI models to use. Per-book overrides can be set in each
          book&apos;s settings.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global Default */}
        <ModelPicker
          label="Global Default Model"
          description="Used for all agent roles unless overridden below or in book settings."
          value={defaultModelData?.defaultModel ?? "anthropic/sonnet"}
          onChange={handleDefaultModelChange}
          availableProviders={availableProviders}
          customModels={customModelDefs}
        />

        <Separator />

        {/* Per-Role Overrides */}
        <div className="space-y-1">
          <h2 className="text-sm font-medium">Per-Role Overrides</h2>
          <p className="text-xs text-muted-foreground">
            Override the default model for specific agent roles. &quot;Use
            Default&quot; inherits the global default above.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ROLE_INFOS.map((info) => (
            <ModelPicker
              key={info.role}
              label={info.label}
              description={info.description}
              value={getRoleValue(info.role)}
              onChange={(registryId) => handleRoleChange(info.role, registryId)}
              availableProviders={availableProviders}
              customModels={customModelDefs}
              showDefaultOption
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
