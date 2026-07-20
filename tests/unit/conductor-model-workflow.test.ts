import { describe, it, expect } from "vitest";
import {
  resolveConductorModelForWorkflow,
  resolveConductorModel,
  type BookModelSettings,
  type ConductorUserModelSettings,
} from "@/lib/llm/model-resolver";
import type { AgentType } from "@/lib/agents/types";

/** A user with the given default and optional per-role overrides. */
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

/** Minimal workflow shape the resolver reads. */
function workflow(
  primaryAgent: AgentType,
  conversational: boolean
): { primaryAgent: AgentType; conversational: boolean } {
  return { primaryAgent, conversational };
}

/** A book with an editor override, everything else "default". */
function bookWithEditor(editor: string): BookModelSettings {
  return {
    modelGhostwriter: "default",
    modelEditor: editor,
    modelBetaReader: "default",
    modelAnalyst: "default",
    modelCoach: "default",
    modelCreative: "default",
    modelOverride: null,
  };
}

const lineEdit = workflow("line-editor", false); // non-conversational editor job
const writeChapter = workflow("ghostwriter", false); // non-conversational ghostwriter job
const coachChat = workflow("writing-coach", true); // conversational coach chat

describe("resolveConductorModelForWorkflow", () => {
  // (a) no override → current default unchanged
  it("with no per-role override, a line-edit resolves to the global default (unchanged)", () => {
    const u = user("openrouter-qwen36/sonnet");
    const resolved = resolveConductorModelForWorkflow(lineEdit, null, u);
    expect(resolved.registryId).toBe("openrouter-qwen36/sonnet");
    expect(resolved.resolvedFrom).toBe("global-default");
    // Parity with the coach conductor for a no-override user: nothing changes.
    expect(resolved.registryId).toBe(resolveConductorModel(null, u).registryId);
  });

  // (b) modelEditor set → line-edit resolution returns it
  it("routes a line-edit through the editor role so modelEditor governs it", () => {
    const resolved = resolveConductorModelForWorkflow(
      lineEdit,
      null,
      user("openrouter-qwen36/sonnet", { modelEditor: "anthropic/opus" })
    );
    expect(resolved.registryId).toBe("anthropic/opus");
    expect(resolved.resolvedFrom).toBe("global-role");
  });

  it("honors a book-level modelEditor override for a line-edit (book-role wins)", () => {
    const resolved = resolveConductorModelForWorkflow(
      lineEdit,
      bookWithEditor("anthropic/opus"),
      user("openrouter-qwen36/sonnet")
    );
    expect(resolved.registryId).toBe("anthropic/opus");
    expect(resolved.resolvedFrom).toBe("book-role");
  });

  // (c) other workflows unaffected
  it("does NOT leak the editor override into a conversational coach chat", () => {
    const resolved = resolveConductorModelForWorkflow(
      coachChat,
      null,
      user("openrouter-qwen36/sonnet", { modelEditor: "anthropic/opus" })
    );
    expect(resolved.registryId).toBe("openrouter-qwen36/sonnet");
    expect(resolved.registryId).not.toBe("anthropic/opus");
  });

  it("does NOT leak the editor override into a non-editor (ghostwriter) job", () => {
    const resolved = resolveConductorModelForWorkflow(
      writeChapter,
      null,
      user("openrouter-qwen36/sonnet", { modelEditor: "anthropic/opus" })
    );
    expect(resolved.registryId).toBe("openrouter-qwen36/sonnet");
    expect(resolved.registryId).not.toBe("anthropic/opus");
  });

  it("a non-editor job still honors its own role override (ghostwriter)", () => {
    const resolved = resolveConductorModelForWorkflow(
      writeChapter,
      null,
      user("openrouter-qwen36/sonnet", { modelGhostwriter: "anthropic/opus" })
    );
    expect(resolved.registryId).toBe("anthropic/opus");
    expect(resolved.resolvedFrom).toBe("global-role");
  });
});
