/**
 * H-3 / H-8 / Lo-2 — the two surfaces that still spoke English.
 *
 * The Ctrl+K palette printed "Pages", "Current Book", "Workflows", "Actions"
 * and every nav label as English literals, and built its workflow rows from
 * the registry's English `label`/`writerDescription` — while
 * `commandPalette.pages`, `.workflows` and `.actions` sat in all seven
 * dictionaries with no reader at all.
 *
 * The agent stream's `status` messages are rendered verbatim by the client,
 * so "Budget reached ($1.80/$2.00) — wrapping up." arrived in English in the
 * middle of a Serbian conversation.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentStrings } from "@/lib/i18n/agent-strings";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

describe("the command palette", () => {
  const palette = read("components", "layout", "command-palette.tsx");

  it("takes its group headings from the dictionary that always had them", () => {
    expect(palette).toContain("heading={t.commandPalette.pages}");
    expect(palette).toContain("heading={t.commandPalette.currentBook}");
    expect(palette).toContain("heading={t.commandPalette.workflows}");
    expect(palette).toContain("heading={t.commandPalette.actions}");
    expect(palette).not.toContain('heading="Pages"');
    expect(palette).not.toContain('heading="Workflows"');
  });

  it("takes its workflow rows from the localized workflow tables", () => {
    expect(palette).toContain("workflowLabel(strings, wf.id)");
    expect(palette).toContain("workflowDescription(strings, wf.id)");
  });

  it("has no English nav literals left", () => {
    for (const literal of [
      '{ label: "Dashboard"',
      '{ label: "Books"',
      '{ label: "Book Overview"',
      '{ label: "New Book"',
      '{ label: "Keyboard Shortcuts"',
    ]) {
      expect(palette).not.toContain(literal);
    }
  });

  it("has a heading for the current book in every language", () => {
    for (const language of LANGUAGES) {
      const heading = getUIStrings(language).commandPalette.currentBook;
      expect(heading.length, language).toBeGreaterThan(0);
      if (language !== "en") expect(heading).not.toBe("Current book");
    }
  });
});

describe("the agent stream's status lines", () => {
  const orchestrator = read("lib", "agents", "orchestrator.ts");

  it("are built from the writer's language, not English literals", () => {
    expect(orchestrator).toContain("strings.statusRetrying");
    expect(orchestrator).toContain("wrapUpStrings.statusBudgetReached");
    expect(orchestrator).toContain("wrapUpStrings.statusTimeLimit");
    expect(orchestrator).not.toContain('"Time limit reached — wrapping up."');
    expect(orchestrator).not.toContain("Budget reached ($");
  });

  it("exist in every language, with their placeholders intact", () => {
    for (const language of LANGUAGES) {
      const strings = getAgentStrings(language);
      expect(strings.statusRetrying, language).toContain("{seconds}");
      expect(strings.statusRetrying, language).toContain("{attempt}");
      expect(strings.statusRetrying, language).toContain("{max}");
      expect(strings.statusBudgetReached, language).toContain("{spent}");
      expect(strings.statusBudgetReached, language).toContain("{cap}");
      expect(strings.statusTimeLimit.length, language).toBeGreaterThan(0);
    }
    expect(getAgentStrings("sr").statusTimeLimit).toContain("vremensko");
  });
});

describe("the app header's breadcrumbs", () => {
  it("name the billing page and the fallbacks in the writer's language", () => {
    const header = read("components", "layout", "app-header.tsx");
    expect(header).toContain("billing: t.nav.billing");
    expect(header).not.toContain('"Billing"');
    expect(header).not.toContain('?? "Book"');
    expect(header).not.toContain(': "Chapter"');
    expect(getUIStrings("sr").nav.billing).toBe("Naplata");
  });
});
