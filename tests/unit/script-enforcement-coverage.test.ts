/**
 * C-1 … C-7 — every path that writes model text now goes through the script
 * boundary.
 *
 * `enforceBookScript` guarded five call sites: the streamed chat text,
 * WriteDocument, WriteChapter and two ProposeStructureMove fields. Everything
 * else a model wrote reached the writer, the manuscript or the model's own
 * history unenforced — and on the owner's Latin-script Serbian book 9 of 255
 * findings carry mid-word Cyrillic homoglyphs. The worst of them was the
 * persisted assistant turn: it is replayed as the model's own precedent on the
 * next message, so the enforcement at the stream boundary was arguing with a
 * history that contradicted it.
 *
 * This test is the inventory. It fails when a path loses its guard.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLanguageDirective } from "@/lib/agents/language-directive";

const src = (...p: string[]) => readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

describe("the write paths that reach the manuscript or the model's history", () => {
  it("the persisted assistant turn is enforced, not just the stream", () => {
    const orchestrator = src("lib", "agents", "orchestrator.ts");
    const turn = orchestrator.slice(
      orchestrator.indexOf("// Capture this turn's assistant text"),
      orchestrator.indexOf("if (turnText) lastAssistantText")
    );
    expect(turn).toMatch(/enforceBookScript\(/);
  });

  it("the approval request the writer reads is enforced", () => {
    const orchestrator = src("lib", "agents", "orchestrator.ts");
    expect(orchestrator).toMatch(/approvalTitle: enforceBookScript\(/);
  });

  it("findings are enforced — anchor, alternatives and all writer-facing prose", () => {
    const tools = src("lib", "agents", "tools.ts");
    const executor = tools.slice(
      tools.indexOf("async function executeCreateFinding"),
      tools.indexOf("async function executeReadSeriesDocument")
    );
    expect(executor).toMatch(/const enforcedAnchor = enforceBookScript\(/);
    expect(executor).toMatch(/const enforcedAlternatives = input\.alternatives\.map/);
    expect(executor).toMatch(/newText: enforceBookScript\(alt\.newText, lang\)/);
    // Grounding is scored against the enforced anchor, or a contaminated quote
    // scores as ungrounded against the Latin prose it came from.
    expect(executor).toMatch(/computeGroundingScore\(\s*enforcedAnchor/);
  });

  it("WriteSeriesDocument is enforced — that is the trilogy's shared spine", () => {
    const tools = src("lib", "agents", "tools.ts");
    const executor = tools.slice(
      tools.indexOf("async function executeWriteSeriesDocument"),
      tools.indexOf("async function executeWriteSeriesDocument") + 2000
    );
    expect(executor).toMatch(/enforceBookScript\(input\.content, ctx\.language\)/);
  });

  it("transcript recovery — the one path that bypasses WriteDocument — is enforced", () => {
    const contract = src("lib", "agents", "artifact-contract.ts");
    expect(contract).toMatch(/enforceBookScript\(input\.assistantText/);
  });

  it("the quick-assist routes enforce what they put in the chapter", () => {
    expect(src("app", "api", "books", "[id]", "inline-edit", "route.ts")).toMatch(
      /text: enforceBookScript\(s\.text, lang\)/
    );
    expect(src("lib", "llm", "quick-assist-stream.ts")).toMatch(
      /enforceBookScript\(gated\.firstText, meta\.language\)/
    );
    expect(
      src("app", "api", "books", "[id]", "editorial", "findings", "[findingId]", "discuss", "route.ts")
    ).toMatch(/enforceBookScript\(/);
  });
});

describe("the language directive the quick-assist routes send", () => {
  it("says nothing for English", () => {
    expect(buildLanguageDirective("en")).toBe("");
    expect(buildLanguageDirective(undefined)).toBe("");
  });

  it("names the language instead of echoing the code", () => {
    const sv = buildLanguageDirective("sv");
    expect(sv).toContain("Swedish");
    expect(sv).not.toMatch(/\(sv\)/);
  });

  it("carries the script and dialect rules for Serbian, and only for Serbian", () => {
    const sr = buildLanguageDirective("sr");
    expect(sr).toContain("latinica");
    expect(sr).toContain("EKAVIAN");
    expect(sr).toContain("tačno");
    expect(buildLanguageDirective("de")).not.toContain("EKAVIAN");
  });
});
