// P2-31: every provider and session failure reached the writer in English,
// whatever the interface language: the error translator wrote English
// sentences, the orchestrator, worker and agent routes streamed them as-is,
// and the client detected a revoked key by matching that English. A failure
// now travels as a stable code (plus the provider) and the client renders it
// in the interface language; the English text stays in the frame for logs.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { translateProviderError } from "@/lib/llm/error-translator";
import {
  AGENT_ERROR_CODES,
  renderAgentError,
  localizeAgentStreamMessage,
} from "@/lib/agents/agent-errors";
import { agentErrorFrame } from "@/lib/agents/agent-error-frame";

const sr = getUIStrings("sr");
const en = getUIStrings("en");
const UI_LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"] as const;
const ROOT = join(__dirname, "..", "..");

describe("translateProviderError", () => {
  it.each([
    [401, "PROVIDER_KEY_INVALID", "check-key"],
    [402, "PROVIDER_NO_CREDIT", "check-key"],
    [403, "PROVIDER_FORBIDDEN", "check-key"],
    [429, "PROVIDER_RATE_LIMITED", "retry"],
    [503, "PROVIDER_UNAVAILABLE", "retry"],
    [504, "PROVIDER_TIMEOUT", "retry"],
    [418, "PROVIDER_UNAVAILABLE", "retry"],
  ] as const)("%i is %s", (status, code, action) => {
    const out = translateProviderError(status, "openrouter");
    expect(out.code).toBe(code);
    expect(out.action).toBe(action);
  });
});

describe("renderAgentError", () => {
  it("names the provider in the writer's language", () => {
    expect(renderAgentError(sr, "PROVIDER_KEY_INVALID", { provider: "openrouter" })).toBe(
      sr.agentErrors.PROVIDER_KEY_INVALID.replace("{provider}", "OpenRouter")
    );
    expect(renderAgentError(sr, "PROVIDER_UNAVAILABLE", { provider: "local" })).toContain(sr.agentErrors.localFleet);
  });

  it("the frame's English is the en dictionary, with the code and provider alongside", () => {
    const frame = agentErrorFrame("PROVIDER_RATE_LIMITED", { provider: "anthropic" }, { action: "retry" });
    expect(frame).toEqual({
      type: "error",
      content: en.agentErrors.PROVIDER_RATE_LIMITED.replace("{provider}", "Anthropic"),
      metadata: { code: "PROVIDER_RATE_LIMITED", provider: "anthropic", action: "retry" },
    });
  });
});

describe("localizeAgentStreamMessage", () => {
  it("renders a coded error in the interface language", () => {
    const frame = agentErrorFrame("SESSION_FAILED");
    expect(localizeAgentStreamMessage(frame, sr, "sr").content).toBe(sr.agentErrors.SESSION_FAILED);
  });

  it("renders a retry status with the retry line in the interface language", () => {
    const status = {
      type: "status" as const,
      content: "English for logs",
      metadata: { code: "PROVIDER_RETRYING", provider: "openrouter", retryInSeconds: 10, attempt: 1, max: 3 },
    };
    const retry = getAgentStrings("sr").statusRetrying.replace("{seconds}", "10").replace("{attempt}", "1").replace("{max}", "3");
    expect(localizeAgentStreamMessage(status, sr, "sr").content).toBe(
      `${sr.agentErrors.PROVIDER_RETRYING.replace("{provider}", "OpenRouter")} ${retry}`
    );
  });

  it("leaves messages without a code untouched", () => {
    const text = { type: "text" as const, content: "Draft ready." };
    expect(localizeAgentStreamMessage(text, sr, "sr")).toBe(text);
  });
});

describe("the dictionaries", () => {
  it.each(UI_LANGUAGES)("%s has every agent error, keeping {provider} where English has it", (lang) => {
    const t = getUIStrings(lang);
    for (const code of AGENT_ERROR_CODES) {
      expect(t.agentErrors[code], `${lang}.${code}`).toBeTruthy();
      if (en.agentErrors[code].includes("{provider}")) expect(t.agentErrors[code], `${lang}.${code}`).toContain("{provider}");
    }
    expect(t.agentErrors.localFleet).toBeTruthy();
  });

  it("the translations are not English copies", () => {
    for (const lang of UI_LANGUAGES.filter((l) => l !== "en")) {
      const t = getUIStrings(lang);
      expect(AGENT_ERROR_CODES.filter((c) => t.agentErrors[c] === en.agentErrors[c]), lang).toEqual([]);
    }
  });
});

describe("every agent error frame carries a code", () => {
  const files = [
    "src/lib/agents/orchestrator.ts",
    "src/lib/queue/agent-worker.ts",
    "src/lib/queue/session-terminal.ts",
    "src/app/api/books/[id]/agent/route.ts",
    "src/app/api/books/[id]/agent/[sessionId]/message/route.ts",
    "src/app/api/books/[id]/agent/[sessionId]/cancel/route.ts",
    "src/app/api/books/[id]/agent/[sessionId]/stream/route.ts",
    "src/app/api/series/[id]/agent/route.ts",
  ];

  it.each(files)("%s builds error frames only through agentErrorFrame", (file) => {
    const src = readFileSync(join(ROOT, file), "utf-8");
    expect(src).not.toMatch(/type:\s*"error"/);
  });

  it("the client no longer detects a bad key by matching English", () => {
    const hook = readFileSync(join(ROOT, "src/hooks/use-agent-stream.ts"), "utf-8");
    expect(hook).not.toMatch(/API key\.\*/);
    expect(hook).toMatch(/localizeAgentStreamMessage/);
  });
});

describe("quick assist and inline edit failures", () => {
  it("carry codes the client describes in the writer's language", async () => {
    const { quickAssistErrorNotice } = await import("@/components/editor/quick-assist-client-errors");
    expect(quickAssistErrorNotice({ type: "error", status: 502, error: "x", code: "AI_GENERATION_FAILED" }, sr).message).toBe(
      sr.apiErrors.AI_GENERATION_FAILED
    );
    const noQuick = quickAssistErrorNotice({ error: "x", code: "MODEL_NO_QUICK_SUGGEST" }, sr, 422);
    expect(noQuick.message).toBe(sr.apiErrors.MODEL_NO_QUICK_SUGGEST);
    expect(noQuick.openSettings).toBe(true);
    const wall = quickAssistErrorNotice({ error: "Free cap", upgradeToTier: "PRO" }, sr, 429);
    expect(wall.message).toBe(sr.apiErrors.PLAN_LIMIT);
    expect(wall.upgrade).toBe(true);

    const stream = readFileSync(join(ROOT, "src/lib/llm/quick-assist-stream.ts"), "utf-8");
    expect(stream.match(/code: "AI_GENERATION_FAILED"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    const inline = readFileSync(join(ROOT, "src/app/api/books/[id]/inline-edit/route.ts"), "utf-8");
    expect(inline).toMatch(/"AI_RESPONSE_TRUNCATED"/);
    expect(inline).toMatch(/"AI_RESPONSE_INVALID"/);
  });

  it("the agent start answers a revoked key with a code", () => {
    const route = readFileSync(join(ROOT, "src/app/api/books/[id]/agent/route.ts"), "utf-8");
    expect(route).toMatch(/code: "PROVIDER_KEY_INVALID"/);
    expect(describeCodes()).toEqual(expect.arrayContaining(["PROVIDER_KEY_INVALID", "MODEL_NO_QUICK_SUGGEST", "AI_RESPONSE_TRUNCATED"]));
  });
});

function describeCodes(): string[] {
  return Object.keys(en.apiErrors);
}
