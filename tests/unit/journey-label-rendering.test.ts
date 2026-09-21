/**
 * A journey is named from the dictionary, never from its definition.
 *
 * Found by driving the product as the owner, in Serbian: the sidebar read
 * "Postojeći rukopis" and the agent panel, two inches away on the same screen,
 * read **"Existing Manuscript"**. Both describe the same active journey.
 *
 * `journeys.ts` carries an English `label` because that is where the journey is
 * defined. Every writer-facing surface must render
 * `agentStrings.journeyLabels[journey.id]` instead, and `proactive-guide.tsx`
 * rendered `activeJourney.label` directly.
 *
 * The 0921 S4 session added a contract proving every journey HAS a translation
 * in every language, and that contract passes — the dictionary was complete the
 * whole time. What nothing checked was whether the components ask it. This is
 * that check: a component may not read `.label` off a journey or a workflow at
 * all.
 *
 * `?? journey.label` as a fallback beside a dictionary lookup stays allowed:
 * it is unreachable given the S4 contract, and removing it would turn a future
 * missing row from "shows English" into "shows undefined".
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const COMPONENTS = join(__dirname, "..", "..", "src", "components");
const APP = join(__dirname, "..", "..", "src", "app");

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) tsxFiles(full, acc);
    else if (entry.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

describe("every surface that names a journey or a workflow", () => {
  it("reads the dictionary, not the English definition", () => {
    const offenders: string[] = [];
    const root = join(__dirname, "..", "..");

    for (const file of [...tsxFiles(COMPONENTS), ...tsxFiles(APP)]) {
      const text = readFileSync(file, "utf-8");
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        // `x.label` where x names a journey or workflow, rendered on its own.
        const match = line.match(/\b(\w*[Jj]ourney\w*|\w*[Ww]orkflow\w*)\.label\b/);
        if (!match) return;
        // A dictionary lookup with this as its fallback is the sanctioned form.
        if (/journeyLabels\[|workflowLabel\(|workflows\[/.test(line)) return;
        offenders.push(
          `${file.slice(root.length + 1).replace(/\\/g, "/")}:${i + 1}: ${line.trim().slice(0, 70)}`
        );
      });
    }

    expect(offenders).toEqual([]);
  });
});
