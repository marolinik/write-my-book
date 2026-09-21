/**
 * A halted run says why in the writer's language, not in the database's.
 *
 * Found by driving the product as the owner, in Serbian, against his own
 * Legat book: the batch history read **"Zaustavljeno: cancelled"**. The status
 * badge, the chapter range, the pass name, the progress and the money were all
 * translated; the reason the run stopped was the raw column value.
 *
 * `halt_reason` is a machine enum with three writers in the codebase —
 * `cancelled`, `budget_cap`, `ledger_write_failed` — and rendering it verbatim
 * is the same defect class this repo spent four sessions removing, just
 * arriving through the database instead of through JSX.
 *
 * An unknown value must still say something true rather than nothing, because
 * a run that stopped for a reason the product cannot name is exactly the run a
 * writer most needs to ask about.
 */

import { describe, it, expect } from "vitest";
import { haltReasonLabel } from "@/lib/agents/halt-reason";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

const KNOWN = ["cancelled", "budget_cap", "ledger_write_failed"] as const;

describe("a halted batch", () => {
  it("names every reason the code can write, in every language", () => {
    const raw: string[] = [];
    for (const { code } of UI_SUPPORTED_LANGUAGES) {
      const t = getUIStrings(code);
      for (const reason of KNOWN) {
        const label = haltReasonLabel(reason, t);
        expect(label, `${code}/${reason}`).toBeTruthy();
        // The giveaway: the label still contains the enum.
        if (label.includes(reason)) raw.push(`${code}/${reason}`);
      }
    }
    expect(raw).toEqual([]);
  });

  it("does not translate the same way twice", () => {
    // Three distinct reasons must read as three distinct things, or the label
    // is decoration rather than information.
    const t = getUIStrings("sr");
    const labels = KNOWN.map((r) => haltReasonLabel(r, t));
    expect(new Set(labels).size).toBe(KNOWN.length);
  });

  it("still says something true about a reason it has never seen", () => {
    const t = getUIStrings("sr");
    const label = haltReasonLabel("some_future_reason", t);
    expect(label).toBeTruthy();
    expect(label).not.toContain("some_future_reason");
  });

  it("treats a missing reason as no reason at all", () => {
    const t = getUIStrings("sr");
    expect(haltReasonLabel(null, t)).toBeNull();
    expect(haltReasonLabel("", t)).toBeNull();
  });
});
