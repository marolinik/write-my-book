import { describe, it, expect } from "vitest";
import {
  resolveConductorModel,
  type BookModelSettings,
  type ConductorUserModelSettings,
} from "@/lib/llm/model-resolver";

/** A user with no overrides and a given default. */
function user(
  defaultModel: string | null,
  overrides: Partial<ConductorUserModelSettings> = {}
): ConductorUserModelSettings {
  return {
    defaultModel,
    modelGhostwriter: null,
    modelEditor: null,
    modelBetaReader: null,
    modelAnalyst: null,
    modelCoach: null,
    modelCreative: null,
    ...overrides,
  };
}

/** Book settings with a given coach override, everything else "default". */
function bookSettings(coach: string, override: string | null = null): BookModelSettings {
  return {
    modelGhostwriter: "default",
    modelEditor: "default",
    modelBetaReader: "default",
    modelAnalyst: "default",
    modelCoach: coach,
    modelCreative: "default",
    modelOverride: override,
  };
}

describe("resolveConductorModel", () => {
  it("honors the coach role override (book-role wins over everything)", () => {
    const resolved = resolveConductorModel(
      bookSettings("anthropic/opus"),
      user("anthropic/haiku", { modelCoach: "anthropic/sonnet" })
    );
    expect(resolved.registryId).toBe("anthropic/opus");
    expect(resolved.resolvedFrom).toBe("book-role");
  });

  it("honors a global coach role override when no book override is set", () => {
    const resolved = resolveConductorModel(
      null,
      user("anthropic/haiku", { modelCoach: "openai/o3" })
    );
    expect(resolved.registryId).toBe("openai/o3");
    expect(resolved.resolvedFrom).toBe("global-role");
  });

  it("falls back to the user's global default when no coach override exists", () => {
    const resolved = resolveConductorModel(null, user("gemini/2.5-pro"));
    expect(resolved.registryId).toBe("gemini/2.5-pro");
    expect(resolved.resolvedFrom).toBe("global-default");
  });

  it("terminal fallback is anthropic/sonnet when the default is missing/invalid", () => {
    // null default and no overrides anywhere → provider/sonnet terminal fallback
    const nullDefault = resolveConductorModel(null, user(null));
    expect(nullDefault.registryId).toBe("anthropic/sonnet");

    // an unknown registry id as default also collapses to the terminal fallback
    const badDefault = resolveConductorModel(null, user("not-a-real/model"));
    expect(badDefault.registryId).toBe("anthropic/sonnet");
  });

  it("returns a fully-populated modelDef for the resolved id", () => {
    const resolved = resolveConductorModel(null, user("anthropic/opus"));
    expect(resolved.modelDef.id).toBe("anthropic/opus");
    expect(resolved.modelDef.provider).toBe("anthropic");
  });
});
