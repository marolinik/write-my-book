import { describe, it, expect } from "vitest";
import {
  buildRewriteSystemPrompt,
  buildRewriteUserContent,
  rewriteFitsBudget,
  rewriteMaxTokens,
  settleRewrite,
} from "@/lib/structure/rewrite-prompt";

/**
 * Dev editor v2, phase B — the ghostwriter's brief for a trim or an expansion,
 * and the judge of what comes back. The writer will apply the draft over a
 * whole chapter, so a reply that is cut off, gutted, padded or annotated must
 * never reach the Apply button.
 */

const words = (n: number) => Array.from({ length: n }, (_, i) => `reč${i}`).join(" ");
const original = `${words(1000)}`;

describe("buildRewriteSystemPrompt", () => {
  const trim = buildRewriteSystemPrompt({
    kind: "trim",
    language: "sr",
    fingerprint: "Kratke rečenice. Bez prideva.",
    storyBible: "Jelena Branković, 1913.",
  });

  it("carries the writer's voice and the canon", () => {
    expect(trim).toContain("Kratke rečenice");
    expect(trim).toContain("Jelena Branković");
  });

  it("forbids notes to the writer and keeps scene breaks", () => {
    expect(trim).toMatch(/never add notes/i);
    expect(trim).toMatch(/scene break/i);
  });

  it("adds no formatting the chapter does not have (live: a trim italicised a plain letter)", () => {
    expect(trim).toMatch(/never add italics or bold/i);
  });

  it("briefs a trim and an expansion differently", () => {
    const expand = buildRewriteSystemPrompt({ kind: "expand", language: "sr", fingerprint: null, storyBible: null });
    expect(trim).toMatch(/TRIM/);
    expect(expand).toMatch(/EXPAND/);
    expect(expand).not.toMatch(/TRIM/);
  });
});

describe("buildRewriteUserContent", () => {
  it("names the chapter, both lengths and the editor's instructions", () => {
    const user = buildRewriteUserContent({
      chapterText: original,
      chapterNumber: 15,
      title: "Pustinja",
      currentWords: 2762,
      targetWords: 2000,
      instructions: "Izbaci drugo čitanje pisma.",
    });
    expect(user).toContain("2762");
    expect(user).toContain("2000");
    expect(user).toContain("Izbaci drugo čitanje pisma.");
    expect(user).toContain("<chapter>");
    expect(user).toContain("Pustinja");
  });
});

describe("budget", () => {
  it("asks for more room to expand than to trim", () => {
    expect(rewriteMaxTokens(original, { kind: "expand", targetWords: 1800 })).toBeGreaterThan(
      rewriteMaxTokens(original, { kind: "trim", targetWords: 700 })
    );
  });

  it("gives a reasoning model room to think", () => {
    expect(rewriteMaxTokens(original, { kind: "trim", targetWords: 700, reasoning: true })).toBeGreaterThan(
      rewriteMaxTokens(original, { kind: "trim", targetWords: 700 })
    );
  });

  it("refuses a chapter one reply cannot rewrite whole", () => {
    expect(rewriteFitsBudget(original, { kind: "trim", targetWords: 700 })).toBe(true);
    expect(rewriteFitsBudget(words(20000), { kind: "trim", targetWords: 15000 })).toBe(false);
  });
});

describe("settleRewrite", () => {
  const trimCtx = { kind: "trim" as const, original, originalWords: 1000, targetWords: 700 };
  const expandCtx = { kind: "expand" as const, original, originalWords: 1000, targetWords: 1400 };

  it("accepts a trim that lands near its target", () => {
    const r = settleRewrite(words(720), "end_turn", trimCtx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.words).toBe(720);
  });

  it("refuses a reply cut off by the token limit", () => {
    expect(settleRewrite(words(720), "max_tokens", trimCtx)).toEqual({ ok: false, reason: "truncated" });
  });

  it("refuses a 'trim' that did not get shorter", () => {
    expect(settleRewrite(words(1000), "end_turn", trimCtx)).toEqual({ ok: false, reason: "off-target" });
  });

  it("refuses a trim that gutted the chapter", () => {
    expect(settleRewrite(words(300), "end_turn", trimCtx)).toEqual({ ok: false, reason: "off-target" });
  });

  it("refuses an expansion that did not grow, and one that ballooned", () => {
    expect(settleRewrite(words(1000), "end_turn", expandCtx)).toEqual({ ok: false, reason: "off-target" });
    expect(settleRewrite(words(2600), "end_turn", expandCtx)).toEqual({ ok: false, reason: "off-target" });
  });

  it("refuses a reply that talks to the writer", () => {
    const annotated = `${words(700)}\n\n[Napomena: skratio sam drugi deo.]`;
    expect(settleRewrite(annotated, "end_turn", trimCtx)).toEqual({ ok: false, reason: "editorial-note" });
  });

  it("refuses an empty reply and strips a code fence", () => {
    expect(settleRewrite("  ", "end_turn", trimCtx)).toEqual({ ok: false, reason: "empty" });
    const fenced = settleRewrite("```markdown\n" + words(720) + "\n```", "end_turn", trimCtx);
    expect(fenced.ok).toBe(true);
    if (fenced.ok) expect(fenced.text.startsWith("```")).toBe(false);
  });
});
