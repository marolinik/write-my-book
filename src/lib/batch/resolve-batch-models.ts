/**
 * Batch coach-model resolution (BATCH-SPEC §7.1).
 *
 * A batch enqueues N background children that each run through the UNCHANGED
 * `processAgentJob`. That worker re-fetches the user's API keys and re-resolves
 * provider routing itself (`agent-worker.ts:247-289`) — so a batch child's
 * `AgentJobData` only needs the resolved COACH model choice
 * (`coachRegistryId` + `coachModelId` + `providerKey`), exactly as the single-
 * session route computes it (`agent/route.ts:202-266`).
 *
 * This helper reuses that 4-level resolution chain and the min-tier guardrail
 * so a batch fails fast (no key / model too weak) instead of scheduling N
 * children that will each error at 2am. It deliberately skips the per-key
 * network re-validation the interactive route does — the worker re-checks route
 * availability per child at run time.
 */

import {
  resolveConductorModel,
  resolveModelForRole,
  resolveProviderRoute,
  meetsMinimumTier,
  mapAgentTypeToRole,
  type ProviderKey,
  type AgentRole,
  type BookModelSettings,
} from "@/lib/llm";
import { getWorkflow } from "@/lib/agents/workflows";

/** User-level model preference columns (subset of the `User` row). */
export interface UserModelDefaults {
  defaultModel: string | null;
  modelGhostwriter: string | null;
  modelEditor: string | null;
  modelBetaReader: string | null;
  modelAnalyst: string | null;
  modelCoach: string | null;
  modelCreative: string | null;
}

/** Book-level model preference columns (subset of `BookSettings`). */
export interface BookModelPrefs {
  modelGhostwriter: string | null;
  modelEditor: string | null;
  modelBetaReader: string | null;
  modelAnalyst: string | null;
  modelCoach: string | null;
  modelCreative: string | null;
  modelOverride: string | null;
}

/** Decrypted API keys by provider (only validated keys should be included). */
export interface AvailableKeys {
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  grokApiKey?: string;
}

export interface ResolveBatchModelsParams {
  workflowIds: readonly string[];
  bookSettings: BookModelPrefs | null;
  userDefaults: UserModelDefaults;
  availableKeys: AvailableKeys;
}

/**
 * Discriminated result. On failure, `code` is the HTTP status the route should
 * return (400 = no usable key, 422 = a requested pass needs a stronger model).
 */
export type ResolveBatchModelsResult =
  | {
      ok: true;
      coachRegistryId: string;
      coachModelId: string;
      providerKey: ProviderKey;
    }
  | { ok: false; code: 400 | 422; error: string };

/** Build the `BookModelSettings` shape the resolver expects (or null). */
function toBookModelSettings(
  prefs: BookModelPrefs | null
): BookModelSettings | null {
  if (!prefs) return null;
  return {
    modelGhostwriter: prefs.modelGhostwriter ?? "default",
    modelEditor: prefs.modelEditor ?? "default",
    modelBetaReader: prefs.modelBetaReader ?? "default",
    modelAnalyst: prefs.modelAnalyst ?? "default",
    modelCoach: prefs.modelCoach ?? "default",
    modelCreative: prefs.modelCreative ?? "default",
    modelOverride: prefs.modelOverride ?? null,
  };
}

/**
 * Resolve the coach model + provider route for a batch, and enforce each
 * requested workflow's minimum-tier requirement. Returns the finite, worker-
 * ready coach fields on success.
 */
export function resolveBatchModels(
  params: ResolveBatchModelsParams
): ResolveBatchModelsResult {
  const { workflowIds, bookSettings, userDefaults, availableKeys } = params;

  const bookModelSettings = toBookModelSettings(bookSettings);
  const userDefault = userDefaults.defaultModel ?? "anthropic/sonnet";

  const globalRoleOverrides: Record<AgentRole, string | null> = {
    ghostwriter: userDefaults.modelGhostwriter,
    editor: userDefaults.modelEditor,
    "beta-reader": userDefaults.modelBetaReader,
    analyst: userDefaults.modelAnalyst,
    coach: userDefaults.modelCoach,
    creative: userDefaults.modelCreative,
  };

  // ── Per-workflow minimum-tier guardrail (mirror agent/route.ts:215) ──
  for (const workflowId of workflowIds) {
    const workflow = getWorkflow(workflowId);
    if (!workflow || !workflow.minimumTier) continue;
    const specialistRole = mapAgentTypeToRole(workflow.primaryAgent);
    const specialistResolved = resolveModelForRole(
      specialistRole,
      bookModelSettings,
      globalRoleOverrides,
      userDefault
    );
    if (!meetsMinimumTier(specialistResolved.registryId, workflow.minimumTier)) {
      return {
        ok: false,
        code: 422,
        error: `Workflow "${workflow.id}" requires at least a ${workflow.minimumTier}-class model, but ${specialistResolved.modelDef.displayName} (${specialistResolved.modelDef.tier}-class) is configured. Change it in Settings or Book Settings.`,
      };
    }
  }

  // ── Resolve the coach conductor (same 4-level chain as the live route) ──
  const coachResolved = resolveConductorModel(bookModelSettings, {
    defaultModel: userDefaults.defaultModel,
    modelGhostwriter: userDefaults.modelGhostwriter,
    modelEditor: userDefaults.modelEditor,
    modelBetaReader: userDefaults.modelBetaReader,
    modelAnalyst: userDefaults.modelAnalyst,
    modelCoach: userDefaults.modelCoach,
    modelCreative: userDefaults.modelCreative,
  });

  const coachRoute = resolveProviderRoute(
    coachResolved.modelDef.provider,
    availableKeys,
    coachResolved.modelDef.modelId,
    coachResolved.registryId
  );

  if (coachRoute.route === "none") {
    const providerName =
      coachResolved.modelDef.provider.charAt(0).toUpperCase() +
      coachResolved.modelDef.provider.slice(1);
    return {
      ok: false,
      code: 400,
      error: `No ${providerName} API key configured. Add one in Settings > API Keys.`,
    };
  }

  // Which provider the worker translates errors against (matches route.ts).
  const providerKey: ProviderKey =
    coachRoute.route === "litellm-proxy"
      ? ((coachRoute.headers?.["x-target-provider"] as ProviderKey) ??
        (coachResolved.modelDef.provider as ProviderKey))
      : coachRoute.route === "openrouter"
        ? "openrouter"
        : (coachResolved.modelDef.provider as ProviderKey);

  return {
    ok: true,
    coachRegistryId: coachResolved.registryId,
    coachModelId: coachRoute.effectiveModelId || coachResolved.modelDef.modelId,
    providerKey,
  };
}
