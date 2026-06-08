/**
 * Validates MODEL_REGISTRY pricing against OpenRouter's public API.
 * Fetches https://openrouter.ai/api/v1/models (no auth required),
 * compares per-token pricing, and logs discrepancies.
 *
 * Only validates OpenRouter-routed models (provider === "openrouter")
 * since Anthropic/OpenAI/Gemini/Grok don't expose public pricing endpoints.
 */

import { MODEL_REGISTRY, type ModelDefinition } from "./model-registry";

interface OpenRouterModel {
  id: string;
  pricing?: {
    prompt?: string; // cost per token as string
    completion?: string;
  };
}

interface PriceDiscrepancy {
  registryId: string;
  modelId: string;
  field: "input" | "output";
  registryPer1M: number;
  openrouterPer1M: number;
  driftPercent: number;
}

interface ValidationResult {
  validated: boolean;
  checkedAt: Date;
  modelsChecked: number;
  discrepancies: PriceDiscrepancy[];
}

// In-memory cache: 24-hour TTL
let cachedResult: ValidationResult | null = null;
let cachedAt: number = 0;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Validate OpenRouter model pricing against the public API.
 * Returns cached result if less than 24h old.
 * Fails gracefully (returns empty discrepancies) if fetch fails.
 */
export async function validatePrices(): Promise<ValidationResult> {
  // Return cache if fresh
  if (cachedResult && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cachedResult;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (!res.ok) {
      console.warn(`[PriceValidator] OpenRouter API returned ${res.status}`);
      return fallbackResult();
    }

    const data = await res.json();
    const orModels: OpenRouterModel[] = data.data ?? [];

    // Build lookup by OpenRouter model ID
    const orPricing = new Map<
      string,
      { inputPer1M: number; outputPer1M: number }
    >();
    for (const m of orModels) {
      if (m.pricing?.prompt && m.pricing?.completion) {
        orPricing.set(m.id, {
          inputPer1M: parseFloat(m.pricing.prompt) * 1_000_000,
          outputPer1M: parseFloat(m.pricing.completion) * 1_000_000,
        });
      }
    }

    // Compare OpenRouter-provider models in our registry
    const openrouterModels = MODEL_REGISTRY.filter(
      (m) => m.provider === "openrouter"
    );

    const discrepancies: PriceDiscrepancy[] = [];
    let checked = 0;

    for (const regModel of openrouterModels) {
      const orPrice = orPricing.get(regModel.modelId);
      if (!orPrice) continue;
      checked++;

      // Check input price drift
      if (regModel.inputCostPer1M > 0) {
        const inputDrift =
          Math.abs(
            (regModel.inputCostPer1M - orPrice.inputPer1M) /
              regModel.inputCostPer1M
          ) * 100;
        if (inputDrift > 5) {
          discrepancies.push({
            registryId: regModel.id,
            modelId: regModel.modelId,
            field: "input",
            registryPer1M: regModel.inputCostPer1M,
            openrouterPer1M: orPrice.inputPer1M,
            driftPercent: Math.round(inputDrift),
          });
        }
      }

      // Check output price drift
      if (regModel.outputCostPer1M > 0) {
        const outputDrift =
          Math.abs(
            (regModel.outputCostPer1M - orPrice.outputPer1M) /
              regModel.outputCostPer1M
          ) * 100;
        if (outputDrift > 5) {
          discrepancies.push({
            registryId: regModel.id,
            modelId: regModel.modelId,
            field: "output",
            registryPer1M: regModel.outputCostPer1M,
            openrouterPer1M: orPrice.outputPer1M,
            driftPercent: Math.round(outputDrift),
          });
        }
      }
    }

    if (discrepancies.length > 0) {
      console.warn(
        `[PriceValidator] ${discrepancies.length} pricing discrepancies found:`,
        discrepancies.map(
          (d) =>
            `${d.registryId} ${d.field}: registry=$${d.registryPer1M}/1M, OR=$${d.openrouterPer1M}/1M (${d.driftPercent}% drift)`
        )
      );
    }

    const result: ValidationResult = {
      validated: true,
      checkedAt: new Date(),
      modelsChecked: checked,
      discrepancies,
    };

    cachedResult = result;
    cachedAt = Date.now();
    return result;
  } catch (err) {
    console.warn("[PriceValidator] Failed to validate prices:", err);
    return fallbackResult();
  }
}

function fallbackResult(): ValidationResult {
  return {
    validated: false,
    checkedAt: new Date(),
    modelsChecked: 0,
    discrepancies: [],
  };
}

/** Force cache refresh on next call. */
export function invalidatePriceCache(): void {
  cachedResult = null;
  cachedAt = 0;
}
