/**
 * M-6 / M-3 / Lo-3 — three places where the language was picked wrong.
 *
 *  - The public share page rendered `getUIStrings("en")` and
 *    `toLocaleString("en")` for everyone. A Serbian writer's snapshot went out
 *    with English chrome and US number formatting, to readers of a Serbian
 *    book.
 *  - The style profile's name and description are interface copy the writer
 *    reads on the style page, and they were indexed by the BOOK's language, so
 *    a Polish book gave a Serbian writer a Polish style-profile name.
 *  - The session brief is injected into the NEXT session's prompt. Its
 *    fallback summary was English, and it sliced a `JSON.stringify`d column
 *    raw, so a summary could open with a quote character and carry escaped
 *    newlines into the model's context.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentStrings } from "@/lib/i18n/agent-strings";

const read = (...p: string[]) =>
  readFileSync(join(__dirname, "..", "..", "src", ...p), "utf-8");

const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

describe("the public share page", () => {
  const page = read("app", "share", "[token]", "page.tsx");

  it("renders in the language of the book it is about", () => {
    expect(page).toContain("getUIStrings(data.bookLanguage)");
    expect(page).toContain("localeFor(data.bookLanguage)");
    expect(page).not.toContain('getUIStrings("en")');
    expect(page).not.toContain('toLocaleString("en")');
  });

  it("is given that language by the loader", () => {
    const loader = read("lib", "share", "snapshot-data.ts");
    expect(loader).toContain("bookLanguage: string;");
    expect(loader).toContain("bookLanguage: book.language,");
  });
});

describe("a style profile's name", () => {
  it("follows the writer's language, not the book's", () => {
    const tools = read("lib", "agents", "tools.ts");
    expect(tools).toContain("owner?.preferredLanguage ?? ctx.language");
    expect(tools).not.toContain('const uiStrings = getUIStrings(ctx.language ?? "en");');
  });
});

describe("the session brief", () => {
  const brief = read("lib", "agents", "session-brief.ts");

  it("decodes the stored turn before it summarises it", () => {
    expect(brief).toContain("function decodeTurnContent");
    expect(brief).toContain("decodeTurnContent(lastAssistant.content)");
    expect(brief).not.toContain("lastAssistant.content.slice(0, 500)");
  });

  it("writes its fallback summary in the book's language", () => {
    expect(brief).toContain("strings.briefFallbackChapter");
    expect(brief).toContain("strings.briefFallback.replace");
    expect(brief).not.toContain("completed ${workflowId.replace");
  });

  it("has those sentences in every language, placeholders intact", () => {
    for (const language of LANGUAGES) {
      const strings = getAgentStrings(language);
      expect(strings.briefFallback, language).toContain("{workflow}");
      expect(strings.briefFallbackChapter, language).toContain("{chapter}");
      expect(strings.briefBudgetEnd, language).toContain("{budget}");
      expect(strings.briefTimeEnd.length, language).toBeGreaterThan(0);
    }
    expect(getAgentStrings("sr").briefTimeEnd).toContain("Sesija");
  });

  it("is what the worker writes when a run stops at a limit", () => {
    const worker = read("lib", "queue", "agent-worker.ts");
    expect(worker).toContain("briefStrings.briefBudgetEnd");
    expect(worker).toContain("briefStrings.briefTimeEnd");
    expect(worker).not.toContain("Work may be incomplete.");
  });
});
