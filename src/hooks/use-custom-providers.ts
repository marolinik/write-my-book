import { useQuery } from "@tanstack/react-query";
import type { ModelDefinition } from "@/lib/llm/model-registry";

interface CustomProviderRow {
  id: string;
  displayName: string;
  baseURL: string;
  api: string;
  hasKey: boolean;
  maskedKey: string | null;
  models: Array<{ id: string; name?: string; contextWindow?: number; maxTokens?: number }>;
}

/** Fetch the caller's saved custom providers, converted into picker-ready defs. */
export function useCustomProviders(): { data: CustomProviderRow[] | undefined; defs: ModelDefinition[] | undefined } {
  const { data } = useQuery<CustomProviderRow[]>({
    queryKey: ["custom-providers"],
    queryFn: () => fetch("/api/settings/custom-providers").then((r) => (r.ok ? r.json() : [])),
    refetchOnWindowFocus: true,
  });

  const defs: ModelDefinition[] | undefined = data?.flatMap((p) =>
    (p.models ?? []).map((m) => ({
      id: m.id,
      provider: "local" as const,
      modelId: m.id,
      displayName: `${p.displayName}: ${m.name ?? m.id}`,
      tier: "sonnet" as const,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      costTier: "$" as const,
      supportsTools: true,
      supportsStreaming: true,
    }))
  );

  return { data, defs };
}
