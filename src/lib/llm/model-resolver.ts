/**
 * 4-level model resolution chain for agent sessions.
 *
 * Resolution priority (highest to lowest):
 * 1. Book role override (per-book, per-role)
 * 2. Book default (per-book fallback)
 * 3. Global role override (per-user, per-role)
 * 4. Global default (per-user fallback)
 *
 * Each level is skipped if the value is null, empty, or "default",
 * or if the model is not found in the registry.
 */

import type { ModelDefinition, ModelTier } from "./model-registry";
import { getModelDef, getModelTierValue } from "./model-registry";
import type { AgentType } from "@/lib/agents/types";

// ── Agent Roles ─────────────────────────────────────────────────

/** The 6 functional roles that agent types map to for model selection. */
export type AgentRole =
  | "ghostwriter"
  | "editor"
  | "beta-reader"
  | "analyst"
  | "coach"
  | "creative";

/** All agent roles as an array for iteration. */
export const AGENT_ROLES: AgentRole[] = [
  "ghostwriter",
  "editor",
  "beta-reader",
  "analyst",
  "coach",
  "creative",
];

// ── Resolved Model ──────────────────────────────────────────────

/** Which level of the resolution chain produced the final model. */
export type ResolutionSource =
  | "book-role"
  | "book-default"
  | "global-role"
  | "global-default";

/** Result of resolving a model through the 4-level chain. */
export interface ResolvedModel {
  /** Registry ID of the resolved model (e.g. "anthropic/sonnet"). */
  registryId: string;
  /** Full model definition from the registry. */
  modelDef: ModelDefinition;
  /** Which level of the chain produced this result. */
  resolvedFrom: ResolutionSource;
}

// ── Book Settings Shape ─────────────────────────────────────────

/**
 * Subset of BookSettings fields needed for model resolution.
 * Matches the Prisma BookSettings model shape.
 */
export interface BookModelSettings {
  modelGhostwriter: string;
  modelEditor: string;
  modelBetaReader: string;
  modelAnalyst: string;
  modelCoach: string;
  modelCreative: string;
  modelOverride: string | null;
}

// ── Role-to-Field Mapping ───────────────────────────────────────

/** Map an AgentRole to the corresponding BookSettings field name. */
const ROLE_TO_BOOK_FIELD: Record<AgentRole, keyof BookModelSettings> = {
  ghostwriter: "modelGhostwriter",
  editor: "modelEditor",
  "beta-reader": "modelBetaReader",
  analyst: "modelAnalyst",
  coach: "modelCoach",
  creative: "modelCreative",
};

// ── Agent Type to Role Mapping ──────────────────────────────────

/** Map the 14 AgentType values to the 6 functional roles. */
const AGENT_TYPE_TO_ROLE: Record<AgentType, AgentRole> = {
  ghostwriter: "ghostwriter",
  "writing-coach": "coach",
  "dev-editor": "editor",
  "line-editor": "editor",
  "beta-reader": "beta-reader",
  "style-analyst": "analyst",
  "manuscript-analyst": "analyst",
  "continuity-checker": "analyst",
  "manuscript-reader": "analyst",
  "world-researcher": "analyst",
  "market-reader": "analyst",
  "publishing-editor": "analyst",
  "story-architect": "creative",
  "scene-planner": "creative",
};

/**
 * Map an AgentType to the corresponding AgentRole.
 * Used to determine which model override to check.
 */
export function mapAgentTypeToRole(agentType: AgentType): AgentRole {
  return AGENT_TYPE_TO_ROLE[agentType];
}

// ── Helpers ─────────────────────────────────────────────────────

/** Check if a settings value is a real override (not null/empty/"default"). */
function isValidOverride(value: string | null | undefined): value is string {
  return !!value && value !== "default" && value.trim() !== "";
}

/** Try to resolve a registry ID to a model definition. Returns null if not found. */
function tryResolve(registryId: string): ModelDefinition | null {
  return getModelDef(registryId) ?? null;
}

// ── Resolution Chain ────────────────────────────────────────────

/**
 * Resolve which model to use for a given agent role.
 *
 * Walks the 4-level resolution chain:
 * 1. Book role override → BookSettings.model{Role}
 * 2. Book default → BookSettings.modelOverride
 * 3. Global role override → User.model{Role}
 * 4. Global default → User.defaultModel
 *
 * At each level, if the value exists and the model is found in the registry,
 * that model is returned. Otherwise, falls through to the next level.
 *
 * @param role - The functional role to resolve a model for
 * @param bookSettings - Book-level model settings (null if no BookSettings exist)
 * @param globalRoleOverrides - User-level per-role overrides (values may be null)
 * @param globalDefault - The user's global default model registry ID
 * @returns The resolved model with its source level
 */
export function resolveModelForRole(
  role: AgentRole,
  bookSettings: BookModelSettings | null,
  globalRoleOverrides: Record<AgentRole, string | null>,
  globalDefault: string
): ResolvedModel {
  // Level 1: Book role override
  if (bookSettings) {
    const field = ROLE_TO_BOOK_FIELD[role];
    const bookRoleValue = bookSettings[field] as string | null;
    if (isValidOverride(bookRoleValue)) {
      const modelDef = tryResolve(bookRoleValue);
      if (modelDef) {
        return { registryId: bookRoleValue, modelDef, resolvedFrom: "book-role" };
      }
    }
  }

  // Level 2: Book default
  if (bookSettings && isValidOverride(bookSettings.modelOverride)) {
    const modelDef = tryResolve(bookSettings.modelOverride!);
    if (modelDef) {
      return {
        registryId: bookSettings.modelOverride!,
        modelDef,
        resolvedFrom: "book-default",
      };
    }
  }

  // Level 3: Global role override
  const globalRoleValue = globalRoleOverrides[role];
  if (isValidOverride(globalRoleValue)) {
    const modelDef = tryResolve(globalRoleValue);
    if (modelDef) {
      return { registryId: globalRoleValue, modelDef, resolvedFrom: "global-role" };
    }
  }

  // Level 4: Global default (always resolves — guaranteed by user setup)
  const modelDef = tryResolve(globalDefault);
  if (modelDef) {
    return { registryId: globalDefault, modelDef, resolvedFrom: "global-default" };
  }

  // Ultimate fallback: anthropic/sonnet (should never reach here if data is valid)
  const fallback = getModelDef("anthropic/sonnet")!;
  return {
    registryId: "anthropic/sonnet",
    modelDef: fallback,
    resolvedFrom: "global-default",
  };
}

// ── Minimum Tier Enforcement ────────────────────────────────────

/**
 * Check if a model meets the minimum tier required by a workflow.
 *
 * Tier hierarchy: haiku (1) < sonnet (2) < opus (3)
 *
 * @param modelRegistryId - Registry ID of the model to check
 * @param minimumTier - The minimum tier required by the workflow
 * @returns true if the model's tier is >= minimumTier, false otherwise
 */
export function meetsMinimumTier(
  modelRegistryId: string,
  minimumTier: ModelTier
): boolean {
  const modelDef = getModelDef(modelRegistryId);
  if (!modelDef) return false;

  return getModelTierValue(modelDef.tier) >= getModelTierValue(minimumTier);
}
