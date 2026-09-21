"use client";

import { useLanguage } from "@/components/providers/language-provider";
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
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import type { ProviderKey } from "@/lib/llm/providers";
import { getDefaultModelId } from "@/lib/llm/defaults";
import { ROLE_TO_USER_FIELD } from "@/lib/llm";

// ── Role descriptions ─────────────────────────────────────────

interface RoleInfo {
  role: AgentRole;
  /** A lookup, because this table is built before any language is known. */
  label: (t: UIStrings) => string;
  description: (t: UIStrings) => string;
}

/**
 * The role names already ship in `bookSettings`, where the per-book overrides
 * use them; only what each role does is new here.
 */
const ROLE_INFOS: RoleInfo[] = [
  {
    role: "ghostwriter",
    label: (t) => t.bookSettings.ghostwriter,
    description: (t) => t.settings.roleGhostwriterDesc,
  },
  {
    role: "coach",
    label: (t) => t.bookSettings.coach,
    description: (t) => t.settings.roleCoachDesc,
  },
  {
    role: "creative",
    label: (t) => t.bookSettings.creative,
    description: (t) => t.settings.roleCreativeDesc,
  },
  {
    role: "stylist",
    label: (t) => t.bookSettings.stylist,
    description: (t) => t.settings.roleStylistDesc,
  },
  {
    role: "editor",
    label: (t) => t.bookSettings.editor,
    description: (t) => t.settings.roleEditorDesc,
  },
  {
    role: "beta-reader",
    label: (t) => t.bookSettings.betaReader,
    description: (t) => t.settings.roleBetaReaderDesc,
  },
  {
    role: "planner",
    label: (t) => t.bookSettings.planner,
    description: (t) => t.settings.rolePlannerDesc,
  },
  {
    role: "reader",
    label: (t) => t.bookSettings.reader,
    description: (t) => t.settings.roleReaderDesc,
  },
  {
    role: "research",
    label: (t) => t.bookSettings.research,
    description: (t) => t.settings.roleResearchDesc,
  },
  {
    role: "analyst",
    label: (t) => t.bookSettings.analyst,
    description: (t) => t.settings.roleAnalystDesc,
  },
];

// A-28: the role-to-field table lives in the resolver. This was its third
// copy, and a copy is how a new role reaches the server while the UI keeps
// writing to the field it already knew.
const ROLE_FIELD_MAP: Record<AgentRole, string> = ROLE_TO_USER_FIELD;

// ── Component ─────────────────────────────────────────────────

export function ModelSelectionSection() {
  const { t } = useLanguage();
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
  // The "local" slot covers both the self-hosted fleet (keyless, reported by
  // the server) and user-added custom providers. Without the fleet half, the
  // fleet models never appear and a user whose default IS one gets a blank
  // trigger (D-131).
  const hasLocal =
    defaultModelData?.localFleet === true ||
    (customProviders?.length ?? 0) > 0;
  if (hasLocal && !availableProviders.includes("local" as ProviderKey)) {
    availableProviders.push("local" as ProviderKey);
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
        <CardTitle>{t.appUI.modelSelection}</CardTitle>
        <CardDescription>
          {t.settings.modelSelectionHint}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global Default */}
        <ModelPicker
          label={t.appUI.globalDefaultModel}
          description={t.appUI.globalDefaultModelHint}
          value={defaultModelData?.defaultModel ?? getDefaultModelId()}
          onChange={handleDefaultModelChange}
          availableProviders={availableProviders}
          customModels={customModelDefs}
        />

        <Separator />

        {/* Per-Role Overrides */}
        <div className="space-y-1">
          <h2 className="text-sm font-medium">{t.appUI.perRoleOverrides}</h2>
          <p className="text-xs text-muted-foreground">
            {t.settings.perRoleOverridesHint}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {ROLE_INFOS.map((info) => (
            <ModelPicker
              key={info.role}
              label={info.label(t)}
              description={info.description(t)}
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
