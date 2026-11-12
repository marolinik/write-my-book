// P2-27: WMB_LLM_FORCE_LOCAL=1 is the zero-cost overlay. The book agent start
// route, the worker and the specialist factories build their clients from
// resolveRouteWithLocalFallback, which ignored the switch, so a stored key
// sent agent sessions (the most expensive calls) to the paid provider.
import { describe, it, expect, afterEach } from "vitest";
import { resolveRouteWithLocalFallback } from "@/lib/llm/client-factory";
import { getModelDef } from "@/lib/llm/model-registry";
import { FALLBACK_DEFAULT_MODEL_ID as DEFAULT_MODEL_ID } from "@/lib/llm/defaults";

const saved = process.env.WMB_LLM_FORCE_LOCAL;
afterEach(() => {
  if (saved === undefined) delete process.env.WMB_LLM_FORCE_LOCAL;
  else process.env.WMB_LLM_FORCE_LOCAL = saved;
});

const paid = () => {
  const model = getModelDef(DEFAULT_MODEL_ID);
  if (!model || model.provider === "local") throw new Error("fixture needs a paid default model");
  return model;
};
const keys = { anthropicApiKey: "sk-ant-real", openrouterApiKey: "sk-or-real" };

describe("resolveRouteWithLocalFallback under WMB_LLM_FORCE_LOCAL", () => {
  it("routes to the local fleet even when the writer has a key for the paid provider", () => {
    process.env.WMB_LLM_FORCE_LOCAL = "1";
    const { route, model } = resolveRouteWithLocalFallback(paid(), keys);
    expect(model.provider).toBe("local");
    expect(route.route).toBe("direct");
    expect(route.route === "direct" && route.apiKey).not.toBe("sk-ant-real");
    expect(route.route === "direct" && route.apiKey).not.toBe("sk-or-real");
  });

  it("without the switch, a writer's key routes to their provider (control)", () => {
    delete process.env.WMB_LLM_FORCE_LOCAL;
    const { model } = resolveRouteWithLocalFallback(paid(), keys);
    expect(model.provider).not.toBe("local");
  });
});
