/**
 * Pre-session cost estimation using per-workflow token heuristics.
 *
 * Each workflow has estimated input/output token ranges based on
 * historical usage patterns. Combined with actual model pricing
 * from the registry, this produces min-max cost range estimates.
 */

import { getModelDef } from "./model-registry";

/** Embedding cost per token — duplicated here to avoid importing server-only cost-tracker (which pulls in db). */
const EMBEDDING_COST_PER_TOKEN = 0.00000002; // $0.02 / 1,000,000 tokens

// ── Token Heuristics ────────────────────────────────────────────

export interface TokenEstimate {
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
}

/**
 * Per-workflow token estimates based on historical usage patterns.
 * Values represent typical token ranges for each workflow type.
 */
/**
 * Token estimates are CUMULATIVE across all turns in the session.
 * Multi-turn workflows accumulate context: each turn re-sends the full
 * conversation history, so total input tokens grow with turn count.
 *
 * For a 60K-word novel (~80K tokens of manuscript content):
 * - Reading all chapters adds ~80K tokens to context
 * - System prompt + context docs: ~10-20K tokens
 * - Each subsequent turn re-sends everything accumulated so far
 * - A 5-turn session with manuscript: ~300-600K total input tokens
 *
 * Estimates assume the ReadAllChapters tool (1 call vs 18 individual calls).
 */
export const WORKFLOW_TOKEN_ESTIMATES: Record<string, TokenEstimate> = {
  // Setup workflows — these read the full manuscript and write large docs
  "new-novel":           { inputMin: 20000,  inputMax: 50000,   outputMin: 5000,   outputMax: 15000 },
  "capture-style":       { inputMin: 100000, inputMax: 400000,  outputMin: 10000,  outputMax: 30000 },
  "create-story-bible":  { inputMin: 150000, inputMax: 600000,  outputMin: 15000,  outputMax: 50000 },
  "build-architecture":  { inputMin: 150000, inputMax: 500000,  outputMin: 15000,  outputMax: 40000 },
  "coach":               { inputMin: 10000,  inputMax: 30000,   outputMin: 3000,   outputMax: 10000 },
  "onboard-new-book":    { inputMin: 30000,  inputMax: 80000,   outputMin: 10000,  outputMax: 25000 },
  "onboard-imported-book": { inputMin: 150000, inputMax: 500000, outputMin: 15000, outputMax: 40000 },
  "free-drive":          { inputMin: 10000,  inputMax: 50000,   outputMin: 3000,   outputMax: 15000 },

  // Writing workflows — chapter-scoped, moderate context
  "discuss-chapter":     { inputMin: 20000,  inputMax: 60000,   outputMin: 5000,   outputMax: 15000 },
  "plan-chapter":        { inputMin: 40000,  inputMax: 120000,  outputMin: 8000,   outputMax: 25000 },
  "write-chapter":       { inputMin: 60000,  inputMax: 200000,  outputMin: 15000,  outputMax: 50000 },
  "freewrite":           { inputMin: 15000,  inputMax: 40000,   outputMin: 5000,   outputMax: 15000 },

  // Editing workflows — read chapter + context, produce findings/rewrites
  "dev-edit":            { inputMin: 50000,  inputMax: 150000,  outputMin: 10000,  outputMax: 30000 },
  "line-edit":           { inputMin: 40000,  inputMax: 120000,  outputMin: 8000,   outputMax: 25000 },
  "beta-read":           { inputMin: 40000,  inputMax: 150000,  outputMin: 8000,   outputMax: 25000 },
  "revise":              { inputMin: 50000,  inputMax: 180000,  outputMin: 15000,  outputMax: 40000 },
  "discuss-edits":       { inputMin: 20000,  inputMax: 60000,   outputMin: 5000,   outputMax: 15000 },
  "publishing-check":    { inputMin: 40000,  inputMax: 120000,  outputMin: 8000,   outputMax: 20000 },

  // Analysis workflows — read full manuscript
  "read-manuscript":     { inputMin: 100000, inputMax: 400000,  outputMin: 10000,  outputMax: 30000 },
  "analyze":             { inputMin: 50000,  inputMax: 150000,  outputMin: 8000,   outputMax: 25000 },
  "market-analysis":     { inputMin: 50000,  inputMax: 150000,  outputMin: 8000,   outputMax: 25000 },

  // Style workflows — read manuscript + existing fingerprint
  "refresh-style":       { inputMin: 100000, inputMax: 350000,  outputMin: 10000,  outputMax: 25000 },
  "evolve-style":        { inputMin: 80000,  inputMax: 250000,  outputMin: 8000,   outputMax: 20000 },

  // Series workflows — cross-book context
  "init-series":         { inputMin: 20000,  inputMax: 50000,   outputMin: 5000,   outputMax: 15000 },
  "create-series-bible": { inputMin: 80000,  inputMax: 250000,  outputMin: 15000,  outputMax: 40000 },
  "create-series-architecture": { inputMin: 80000, inputMax: 250000, outputMin: 15000, outputMax: 40000 },
  "check-series-continuity":    { inputMin: 100000, inputMax: 400000, outputMin: 10000, outputMax: 30000 },
  "continuity-check":    { inputMin: 100000, inputMax: 400000,  outputMin: 10000,  outputMax: 30000 },
};

/** Default token estimate for unknown workflows. */
const DEFAULT_TOKEN_ESTIMATE: TokenEstimate = {
  inputMin: 10000,
  inputMax: 20000,
  outputMin: 4000,
  outputMax: 10000,
};

// ── Cost Estimation ─────────────────────────────────────────────

export interface CostEstimate {
  /** Minimum estimated cost in USD. */
  min: number;
  /** Maximum estimated cost in USD. */
  max: number;
  /** Human-readable formatted cost range (e.g. "$0.05 - $0.15"). */
  formatted: string;
}

/**
 * Estimate the cost of running a workflow with a specific model.
 *
 * Uses per-workflow token heuristics and actual model pricing from the registry.
 * Returns a min-max range reflecting the uncertainty in token usage.
 *
 * @param workflowId - Workflow to estimate cost for
 * @param registryId - Model registry ID to use for pricing
 * @returns Cost estimate with min, max, and formatted range
 */
export function estimateWorkflowCost(
  workflowId: string,
  registryId: string
): CostEstimate {
  const est = WORKFLOW_TOKEN_ESTIMATES[workflowId] ?? DEFAULT_TOKEN_ESTIMATE;
  const model = getModelDef(registryId);

  if (!model) {
    return { min: 0, max: 0, formatted: "Unknown model" };
  }

  const min =
    (est.inputMin * model.inputCostPer1M) / 1_000_000 +
    (est.outputMin * model.outputCostPer1M) / 1_000_000;

  const max =
    (est.inputMax * model.inputCostPer1M) / 1_000_000 +
    (est.outputMax * model.outputCostPer1M) / 1_000_000;

  return {
    min,
    max,
    formatted: formatCostRange(min, max),
  };
}

/**
 * Format a cost range as a human-readable string.
 *
 * Handles edge cases:
 * - Both < $0.01: returns "< $0.01"
 * - Min < $0.01: returns "< $0.01 - $X.XX"
 * - Otherwise: "$X.XX - $Y.YY"
 */
export function formatCostRange(min: number, max: number): string {
  if (min < 0.01 && max < 0.01) {
    return "< $0.01";
  }
  if (min < 0.01) {
    return `< $0.01 - $${max.toFixed(2)}`;
  }
  return `$${min.toFixed(2)} - $${max.toFixed(2)}`;
}

// ── Embedding Cost Estimation ─────────────────────────────────

/**
 * Workflows that produce documents which get embedded into the vector store.
 * Approximately 80% of output tokens become embedded text.
 */
const EMBEDDING_WORKFLOWS = new Set([
  "build-architecture",
  "create-story-bible",
  "capture-style",
  "write-chapter",
  "revise",
  "plan-chapter",
  "create-series-bible",
  "create-series-architecture",
  "refresh-style",
  "evolve-style",
  "read-manuscript",
  "new-novel",
  "onboard-new-book",
  "onboard-imported-book",
]);

/**
 * Estimate the embedding cost for a workflow that triggers vector indexing.
 *
 * Returns min/max cost range in USD, or null if the workflow does not
 * produce documents that get embedded.
 *
 * @param workflowId - Workflow to estimate embedding cost for
 * @returns Embedding cost estimate or null for non-indexing workflows
 */
export function estimateEmbeddingCost(
  workflowId: string
): { min: number; max: number } | null {
  if (!EMBEDDING_WORKFLOWS.has(workflowId)) return null;

  const est = WORKFLOW_TOKEN_ESTIMATES[workflowId] ?? DEFAULT_TOKEN_ESTIMATE;

  // ~80% of output tokens become embedded text
  const embeddingTokensMin = Math.round(est.outputMin * 0.8);
  const embeddingTokensMax = Math.round(est.outputMax * 0.8);

  return {
    min: embeddingTokensMin * EMBEDDING_COST_PER_TOKEN,
    max: embeddingTokensMax * EMBEDDING_COST_PER_TOKEN,
  };
}
