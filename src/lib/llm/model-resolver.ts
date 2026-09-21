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
import { getDefaultModelId } from "./defaults";
import type { AgentType } from "@/lib/agents/types";

// ── Agent Roles ─────────────────────────────────────────────────

/**
 * The functional roles that agent types map to for model selection.
 *
 * A-28: a role is a knob, and a knob may only mean one thing. Seven agents
 * used to land on `analyst` — the style analyst, whose captured voice the
 * ghostwriter imitates for the whole book and whose own default is opus,
 * beside the manuscript analyst, which counts words and defaults to haiku.
 * Raising the knob to buy a better voice capture bought opus word-counting;
 * lowering it to stop paying for word counting cheapened the voice. `creative`
 * had the same fault more quietly, holding story-architect (opus) and
 * scene-planner (sonnet).
 *
 * The rule the split obeys, and that `agent-role-split.test.ts` enforces: no
 * role may contain two agents whose own default models differ.
 */
export type AgentRole =
  | "ghostwriter"
  | "coach"
  | "creative"
  | "stylist"
  | "editor"
  | "beta-reader"
  | "planner"
  | "reader"
  | "research"
  | "analyst";

/** All agent roles as an array for iteration. */
export const AGENT_ROLES: AgentRole[] = [
  "ghostwriter",
  "coach",
  "creative",
  "stylist",
  "editor",
  "beta-reader",
  "planner",
  "reader",
  "research",
  "analyst",
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
  modelCoach: string;
  modelCreative: string;
  modelStylist: string;
  modelEditor: string;
  modelBetaReader: string;
  modelPlanner: string;
  modelReader: string;
  modelResearch: string;
  modelAnalyst: string;
  modelOverride: string | null;
}

// ── Role-to-Field Mapping ───────────────────────────────────────

/** Map an AgentRole to the corresponding BookSettings field name. */
export const ROLE_TO_BOOK_FIELD: Record<AgentRole, keyof BookModelSettings> = {
  ghostwriter: "modelGhostwriter",
  coach: "modelCoach",
  creative: "modelCreative",
  stylist: "modelStylist",
  editor: "modelEditor",
  "beta-reader": "modelBetaReader",
  planner: "modelPlanner",
  reader: "modelReader",
  research: "modelResearch",
  analyst: "modelAnalyst",
};

/**
 * Map an AgentRole to the corresponding User field name — the writer's global
 * override, one level below the book's.
 */
export const ROLE_TO_USER_FIELD: Record<AgentRole, keyof ConductorUserModelSettings> = {
  ghostwriter: "modelGhostwriter",
  coach: "modelCoach",
  creative: "modelCreative",
  stylist: "modelStylist",
  editor: "modelEditor",
  "beta-reader": "modelBetaReader",
  planner: "modelPlanner",
  reader: "modelReader",
  research: "modelResearch",
  analyst: "modelAnalyst",
};

// ── Agent Type to Role Mapping ──────────────────────────────────

/**
 * Map the 14 AgentType values to their roles.
 *
 * Grouped by the job, and never grouping two agents whose definitions disagree
 * about how much thinking the job needs:
 *  - `reader` reads the whole book and cross-references it (sonnet);
 *  - `research` leaves the manuscript for the web (sonnet);
 *  - `analyst` measures what is already there (haiku);
 *  - `stylist` captures the voice the ghostwriter will imitate (opus).
 */
const AGENT_TYPE_TO_ROLE: Record<AgentType, AgentRole> = {
  ghostwriter: "ghostwriter",
  "writing-coach": "coach",
  "story-architect": "creative",
  "style-analyst": "stylist",
  "dev-editor": "editor",
  "line-editor": "editor",
  "beta-reader": "beta-reader",
  "scene-planner": "planner",
  "manuscript-reader": "reader",
  "continuity-checker": "reader",
  "world-researcher": "research",
  "market-reader": "research",
  "manuscript-analyst": "analyst",
  "publishing-editor": "analyst",
};

/**
 * Map an AgentType to the corresponding AgentRole.
 * Used to determine which model override to check.
 */
export function mapAgentTypeToRole(agentType: AgentType): AgentRole {
  return AGENT_TYPE_TO_ROLE[agentType];
}

/** Alias kept for readers of the contract test; same mapping. */
export const agentTypeToRole = mapAgentTypeToRole;

// ── Helpers ─────────────────────────────────────────────────────


/**
 * The writer's global overrides, keyed by role. Written once: this used to be
 * two hand-kept object literals, which is how a new role reaches the book
 * level and never reaches the writer level.
 */
export function globalOverridesOf(
  user: ConductorUserModelSettings
): Record<AgentRole, string | null> {
  return Object.fromEntries(
    AGENT_ROLES.map((role) => [role, user[ROLE_TO_USER_FIELD[role]] as string | null])
  ) as Record<AgentRole, string | null>;
}

/**
 * The Prisma `select` for a book's model settings, and for a writer's.
 *
 * Thirteen call sites used to spell these field lists out by hand — routes,
 * the worker, batch resolution, the settings page. That is the parallel-table
 * shape this codebase has paid for repeatedly: adding a role meant editing
 * thirteen places and the one that was missed failed silently, falling through
 * to the global default as if the writer had never set anything. Derived from
 * the role mapping, an eleventh role reaches every query for free.
 */
export const BOOK_MODEL_SELECT = Object.fromEntries([
  ...AGENT_ROLES.map((role) => [ROLE_TO_BOOK_FIELD[role], true]),
  ["modelOverride", true],
]) as Record<keyof BookModelSettings, true>;

export const USER_MODEL_SELECT = Object.fromEntries([
  ...AGENT_ROLES.map((role) => [ROLE_TO_USER_FIELD[role], true]),
  ["defaultModel", true],
]) as Record<keyof ConductorUserModelSettings, true>;

/** A row selected with `BOOK_MODEL_SELECT`, before it is given its defaults. */
export type RawBookModelSettings = Partial<Record<keyof BookModelSettings, string | null>>;

/** A row selected with `USER_MODEL_SELECT`. */
export type RawUserModelSettings = Partial<
  Record<keyof ConductorUserModelSettings, string | null>
>;

/** Fill a book settings row out into the shape the resolver takes. */
export function bookModelSettingsOf(
  settings: RawBookModelSettings | null | undefined
): BookModelSettings | null {
  if (!settings) return null;
  const roles = Object.fromEntries(
    AGENT_ROLES.map((role) => [
      ROLE_TO_BOOK_FIELD[role],
      settings[ROLE_TO_BOOK_FIELD[role]] ?? "default",
    ])
  );
  return { ...roles, modelOverride: settings.modelOverride ?? null } as BookModelSettings;
}

/** Fill a user row out into the shape the resolver takes. */
export function userModelSettingsOf(
  user: RawUserModelSettings | null | undefined
): ConductorUserModelSettings {
  const roles = Object.fromEntries(
    AGENT_ROLES.map((role) => [ROLE_TO_USER_FIELD[role], user?.[ROLE_TO_USER_FIELD[role]] ?? null])
  );
  return { ...roles, defaultModel: user?.defaultModel ?? null } as ConductorUserModelSettings;
}

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

  // Ultimate fallback: the deployment default (should never reach here if data
  // is valid). getDefaultModelId only ever returns a registry-known id, so the
  // non-null assertion cannot fire on a configuration mistake.
  const fallbackId = getDefaultModelId();
  return {
    registryId: fallbackId,
    modelDef: getModelDef(fallbackId)!,
    resolvedFrom: "global-default",
  };
}

// ── Conductor (Coach) Resolution ────────────────────────────────

/**
 * Subset of User model fields needed to resolve the conductor (Coach) model.
 * Mirrors the global default + per-role override columns on the User model.
 */
export interface ConductorUserModelSettings {
  defaultModel: string | null;
  modelGhostwriter: string | null;
  modelCoach: string | null;
  modelCreative: string | null;
  modelStylist: string | null;
  modelEditor: string | null;
  modelBetaReader: string | null;
  modelPlanner: string | null;
  modelReader: string | null;
  modelResearch: string | null;
  modelAnalyst: string | null;
}

/**
 * Resolve which model the Coach conductor should run on.
 *
 * The conductor is a real role ("coach") and MUST honor the user's choice —
 * it walks the exact same 4-level chain the specialists use (book-role →
 * book-default → global-role → global-default). The terminal fallback is
 * the deployment default, produced by {@link resolveModelForRole} when the global
 * default is missing or unresolvable, and is the deployment default
 * ({@link getDefaultModelId}), not a hardcoded provider model.
 *
 * @param bookSettings - Book-level model settings (null if none exist)
 * @param user - The user's global default + per-role overrides
 * @returns The resolved conductor model with its source level
 */
export function resolveConductorModel(
  bookSettings: BookModelSettings | null,
  user: ConductorUserModelSettings
): ResolvedModel {
  const globalDefault = isValidOverride(user.defaultModel)
    ? user.defaultModel
    : getDefaultModelId();

  const globalRoleOverrides = globalOverridesOf(user);

  return resolveModelForRole("coach", bookSettings, globalRoleOverrides, globalDefault);
}

// ── Workflow-Aware Conductor Resolution ─────────────────────────

/** Minimal workflow shape needed to pick the conductor's role. */
export interface ConductorWorkflow {
  conversational: boolean;
  primaryAgent: AgentType;
}

/**
 * Resolve the conductor model for a specific workflow.
 *
 * A CONVERSATIONAL workflow is a live chat with the Writing Coach, so its
 * conductor resolves on the "coach" role (unchanged — {@link resolveConductorModel}).
 *
 * A NON-conversational workflow (line-edit, dev-edit, beta-read, write-chapter, …)
 * is a background "job" whose deliverable is produced by the workflow's PRIMARY
 * agent — the coach is a thin conductor over that one specialist, and the run is
 * billed on the conductor model. Resolving the conductor on the primary agent's
 * role makes the per-role override the UI advertises (e.g. modelEditor for a
 * line-edit) actually govern the model the job runs and bills on, instead of
 * silently running on the coach/default model regardless.
 *
 * Behavior is unchanged for a user with no per-role override: the primary
 * agent's role and the coach role both fall through the shared book-default →
 * global-default levels to the same model.
 *
 * @param workflow - The workflow being started (conversational flag + primary agent)
 * @param bookSettings - Book-level model settings (null if none exist)
 * @param user - The user's global default + per-role overrides
 * @returns The resolved conductor model with its source level
 */
export function resolveConductorModelForWorkflow(
  workflow: ConductorWorkflow,
  bookSettings: BookModelSettings | null,
  user: ConductorUserModelSettings
): ResolvedModel {
  const role = mapAgentTypeToRole(workflow.primaryAgent);

  // Conversational chats, and any workflow whose primary agent is the coach
  // itself, run on the coach chain exactly as before.
  if (workflow.conversational || role === "coach") {
    return resolveConductorModel(bookSettings, user);
  }

  const globalDefault = isValidOverride(user.defaultModel)
    ? user.defaultModel
    : getDefaultModelId();

  const globalRoleOverrides = globalOverridesOf(user);

  return resolveModelForRole(role, bookSettings, globalRoleOverrides, globalDefault);
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
