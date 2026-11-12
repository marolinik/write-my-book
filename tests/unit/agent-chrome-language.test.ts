// P2-57: the agent panel indexed its own labels, tool labels, the message
// stream and status labels by the BOOK language, while SessionProgressList,
// mounted inside it, used the interface language: a Serbian-interface writer
// with an English book read the panel in two languages at once. The chrome now
// follows the interface language everywhere; the book language stays with the
// prose the model writes.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", ...p), "utf-8");
const panel = read("src", "components", "agent", "agent-panel.tsx");
const progress = read("src", "components", "agent", "session-progress-list.tsx");

describe("agent chrome language", () => {
  it("the panel reads its strings, tool labels, stream and status labels in the interface language", () => {
    expect(panel).toMatch(/getAgentStrings\(uiLanguage\)/);
    expect(panel).toMatch(/getToolLabel\(tool, input, uiLanguage\)/);
    expect(panel).toMatch(/language=\{uiLanguage\}/);
    expect(panel).toMatch(/getStatusLabel\(resultMeta\.newStatus, uiLanguage\)/);
    expect(panel).not.toMatch(/getAgentStrings\(bookLanguage\)|getToolLabel\([^)]*bookLanguage\)|language=\{bookLanguage\}/);
  });

  it("the panel and the progress list take the language from the same source", () => {
    expect(panel).toMatch(/const \{ t: uiT, language: uiLanguage \} = useLanguage\(\);/);
    expect(progress).toMatch(/const \{ language \} = useLanguage\(\);[\s\S]*getAgentStrings\(language\)/);
  });
});
