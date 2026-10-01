import { describe, it, expect } from "vitest";
import {
  POLISH_INTENSITIES,
  POLISH_MAX_SELECTION_CHARS,
  buildPolishSystemPrompt,
  buildPolishUserContent,
  polishMaxTokens,
  settlePolishedText,
} from "@/lib/polish/polish-scene";

/**
 * Polish Scene rewrites a whole scene the writer selected. The prose it
 * returns replaces the selection with one click, so the module that builds
 * the prompt and judges the reply is where the writer's text is protected:
 * the voice and the canon go in, and a cut-off, gutted or annotated rewrite
 * never comes out.
 */

const SCENE =
  "Mara stood at the window.\n" +
  "The harbour lights went out one by one, and she counted them the way her father had taught her.\n" +
  "Behind her the kettle began to sing.";

describe("polish-scene prompt", () => {
  it("offers exactly a light and a bold version", () => {
    expect(POLISH_INTENSITIES).toEqual(["light", "bold"]);
  });

  it("anchors the rewrite in the writer's fingerprint and the book's canon", () => {
    const system = buildPolishSystemPrompt({
      intensity: "light",
      language: "en",
      fingerprint: "FINGERPRINT-MARKER short declaratives",
      storyBible: "BIBLE-MARKER Mara's father drowned",
    });
    expect(system).toContain("FINGERPRINT-MARKER");
    expect(system).toContain("BIBLE-MARKER");
    expect(system).toMatch(/do not change what happens/i);
    expect(system).toMatch(/names/i);
  });

  it("still builds a prompt when the book has no fingerprint or bible yet", () => {
    const system = buildPolishSystemPrompt({
      intensity: "bold",
      language: "en",
      fingerprint: null,
      storyBible: null,
    });
    expect(system).toMatch(/match the voice of the selected text/i);
    expect(system).not.toContain("null");
  });

  it("asks the two intensities for different degrees of change", () => {
    const light = buildPolishSystemPrompt({ intensity: "light", language: "en", fingerprint: null, storyBible: null });
    const bold = buildPolishSystemPrompt({ intensity: "bold", language: "en", fingerprint: null, storyBible: null });
    expect(light).not.toEqual(bold);
    expect(light).toMatch(/light/i);
    expect(bold).toMatch(/bold/i);
  });

  it("carries the book's language and script rule", () => {
    const system = buildPolishSystemPrompt({ intensity: "light", language: "sr", fingerprint: null, storyBible: null });
    expect(system).toMatch(/Serbian/);
  });

  it("caps the voice and canon documents so a long bible cannot crowd out the scene", () => {
    const system = buildPolishSystemPrompt({
      intensity: "light",
      language: "en",
      fingerprint: "f".repeat(50_000),
      storyBible: "b".repeat(50_000),
    });
    expect(system.length).toBeLessThan(30_000);
  });

  it("forbids notes to the writer inside the prose", () => {
    const system = buildPolishSystemPrompt({ intensity: "bold", language: "en", fingerprint: null, storyBible: null });
    expect(system).toMatch(/square brackets/i);
  });

  it("puts the scene, its surroundings and the writer's focus in the user turn", () => {
    const user = buildPolishUserContent({
      selectedText: SCENE,
      contextBefore: "BEFORE-MARKER",
      contextAfter: "AFTER-MARKER",
      focus: "clearer dialogue",
    });
    expect(user).toContain(SCENE);
    expect(user).toContain("BEFORE-MARKER");
    expect(user).toContain("AFTER-MARKER");
    expect(user).toContain("clearer dialogue");
  });

  it("omits the focus line when the writer gave none", () => {
    const user = buildPolishUserContent({ selectedText: SCENE });
    expect(user).not.toMatch(/focus/i);
  });

  it("gives the model room for a rewrite longer than the scene, within a ceiling", () => {
    const small = polishMaxTokens("a".repeat(400));
    const large = polishMaxTokens("a".repeat(POLISH_MAX_SELECTION_CHARS));
    expect(small).toBeGreaterThanOrEqual(1024);
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(16_000);
  });
});

describe("settlePolishedText", () => {
  const rewrite =
    "Mara stood at the window while the harbour lights went out, one by one.\n\n" +
    "She counted them as her father had taught her. Behind her, the kettle began to sing.";

  it("accepts a complete rewrite and normalises paragraph breaks", () => {
    const settled = settlePolishedText(rewrite, "end_turn", SCENE);
    expect(settled).toEqual({ ok: true, text: rewrite });
  });

  it("strips a markdown fence the model wrapped around the prose", () => {
    const settled = settlePolishedText("```\n" + rewrite + "\n```", "end_turn", SCENE);
    expect(settled).toEqual({ ok: true, text: rewrite });
  });

  it("refuses a rewrite cut off by the token limit: it would delete the scene's end", () => {
    expect(settlePolishedText(rewrite, "max_tokens", SCENE)).toEqual({ ok: false, reason: "truncated" });
  });

  it("refuses an empty reply", () => {
    expect(settlePolishedText("   ", "end_turn", SCENE)).toEqual({ ok: false, reason: "empty" });
  });

  it("refuses a reply that shrank the scene to a summary", () => {
    const long = Array.from({ length: 20 }, () => SCENE).join("\n");
    expect(settlePolishedText("Mara watched the lights.", "end_turn", long)).toEqual({
      ok: false,
      reason: "too-short",
    });
  });

  it("refuses a rewrite that adds a bracketed note to the writer", () => {
    const annotated = rewrite + " [Note: update the story bible]";
    expect(settlePolishedText(annotated, "end_turn", SCENE)).toEqual({
      ok: false,
      reason: "editorial-note",
    });
  });

  it("keeps brackets the writer's own scene already had", () => {
    const own = SCENE + " [sic]";
    const settled = settlePolishedText(rewrite + " [sic]", "end_turn", own);
    expect(settled.ok).toBe(true);
  });
});
