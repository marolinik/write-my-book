import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * D-182 (S4, P6 v3) — ASCII "--" where an em dash belongs, on named surfaces:
 * "Manuscript imported -- 1 chapter" (setup wizard, verbatim in the 45b
 * assertions), "BYOK --" and "Limited -- Founder's Price" (billing). The panel
 * asked us to grep for more; the sweep found 29 sites across the marketing page,
 * the FAQ, two toasts and all seven locale dictionaries.
 *
 * This test guards the copy files, not comments: a `--` inside a code comment or
 * a prompt delimiter (`--- CHAPTER 1 ---`) is not writer-facing.
 */

const COPY_FILES = [
  "src/lib/i18n/ui-strings.ts",
  "src/app/(app)/settings/billing/page.tsx",
  "src/app/(app)/books/[bookId]/setup/page.tsx",
  "src/app/page.tsx",
  "src/components/landing/faq-accordion.tsx",
  "src/components/agent/agent-panel.tsx",
  "src/components/editor/manuscript-editor.tsx",
  "src/components/editorial/finding-conversation.tsx",
  "src/lib/editorial/discuss-wait-phase.ts",
  "src/lib/editorial/discuss-turn-notice.ts",
];

/** Drop comment lines — only writer-facing copy is in scope. */
function copyOnly(source: string): Array<{ line: number; text: string }> {
  return source
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => {
      const t = text.trim();
      return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*"));
    });
}

describe("D-182 — em dashes in writer-facing copy", () => {
  for (const file of COPY_FILES) {
    it(`${file} carries no ASCII double dash`, () => {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      const offenders = copyOnly(source).filter(
        ({ text }) => / -- /.test(text) || /--\{" "\}/.test(text) || / --"/.test(text)
      );
      expect(offenders.map((o) => `${file}:${o.line}: ${o.text.trim()}`)).toEqual([]);
    });
  }

  it("the three sites the panel named are fixed", () => {
    const billing = readFileSync(join(process.cwd(), "src/app/(app)/settings/billing/page.tsx"), "utf8");
    const setup = readFileSync(join(process.cwd(), "src/app/(app)/books/[bookId]/setup/page.tsx"), "utf8");
    expect(billing).toContain("Limited — Founder's Price");
    expect(billing).toContain("BYOK — Bring Your Own Key");
    // The wizard banner joins the string with a dash before the chapter count.
    expect(setup).toMatch(/\{s\.manuscriptImported\}\s*—/);
  });
});
