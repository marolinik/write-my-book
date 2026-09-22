/**
 * The edit history is written as structure and read in the writer's language.
 *
 * Found by driving the product as the owner, in Serbian: the History tab
 * translated the action badges — odbacivanje, primena, sesija završena — and
 * then printed the sentence beside each one in English. "Dismissed finding:
 * pov". "Auto-applied finding: prose — replaced …". "dev-edit completed: 9
 * findings created via tool calls".
 *
 * It was not a rendering bug. `edit_actions.description` is an English
 * sentence **assembled at write time and stored**, so no amount of work on the
 * component could have fixed it: the English was in the database. 126 rows of
 * it were in the owner's dev book, and he chose to discard them rather than
 * carry them.
 *
 * So the row now stores what happened — the action, the finding's category,
 * the text that was replaced, the counts — and the sentence is built when
 * somebody reads it, in whatever language they read in. `description` stays as
 * the English machine line for logs; nothing writer-facing renders it.
 *
 * The category is not translated here either: `findingCategoryLabel` already
 * knows every category in every language, and a second table would be a second
 * answer to the same question.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  describeEditAction,
  applyDetail,
  dismissDetail,
  undoDetail,
  sessionCompleteDetail,
} from "@/lib/editorial/edit-action-detail";
import { getUIStrings, UI_SUPPORTED_LANGUAGES } from "@/lib/i18n/ui-strings";

const sr = getUIStrings("sr");

describe("an applied finding", () => {
  it("says what was replaced, in the writer's language", () => {
    const line = describeEditAction(
      { actionType: "apply", details: applyDetail("prose", "Milena je pogledala orden.") },
      sr,
      "sr"
    );
    expect(line).toContain("Milena je pogledala orden.");
    expect(line).not.toContain("replaced");
    expect(line).not.toContain("Auto-applied");
  });

  it("names the category the way the rest of the product names it", () => {
    const line = describeEditAction(
      { actionType: "apply", details: applyDetail("prose", "x") },
      sr,
      "sr"
    );
    // "prose" has a Serbian label; the raw key must not reach the reader.
    expect(line).not.toMatch(/\bprose\b/);
  });

  it("does not quote prose it was never given", () => {
    const line = describeEditAction(
      { actionType: "apply", details: applyDetail("prose", null) },
      sr,
      "sr"
    );
    expect(line).toBeTruthy();
    expect(line).not.toContain('""');
  });
});

describe("a dismissed finding", () => {
  it("carries the writer's own reason when there was one", () => {
    const line = describeEditAction(
      { actionType: "dismiss", details: dismissDetail("pov", "namerno") },
      sr,
      "sr"
    );
    expect(line).toContain("namerno");
    expect(line).not.toContain("Dismissed");
  });
});

describe("an undone action", () => {
  it("says whether the prose actually went back", () => {
    const reverted = describeEditAction(
      { actionType: "undo", details: undoDetail("continuity", true) },
      sr,
      "sr"
    );
    const notReverted = describeEditAction(
      { actionType: "undo", details: undoDetail("continuity", false) },
      sr,
      "sr"
    );
    expect(reverted).not.toBe(notReverted);
    expect(reverted).not.toContain("Undid");
  });
});

describe("a finished session", () => {
  it("counts findings in a language that inflects them", () => {
    const line = describeEditAction(
      { actionType: "session_complete", details: sessionCompleteDetail("dev-edit", 9, 1) },
      sr,
      "sr"
    );
    expect(line).toContain("9");
    expect(line).not.toContain("completed:");
    expect(line).not.toContain("findings created");
  });

  it("stays quiet about rejections when there were none", () => {
    const none = describeEditAction(
      { actionType: "session_complete", details: sessionCompleteDetail("dev-edit", 6, 0) },
      sr,
      "sr"
    );
    const some = describeEditAction(
      { actionType: "session_complete", details: sessionCompleteDetail("dev-edit", 6, 2) },
      sr,
      "sr"
    );
    expect(none).not.toBe(some);
    expect(some).toContain("2");
  });
});

describe("a row from before this change", () => {
  it("says something true rather than falling back to stored English", () => {
    const line = describeEditAction({ actionType: "apply", details: null }, sr, "sr");
    expect(line).toBeTruthy();
    expect(line).not.toContain("Auto-applied");
  });
});

describe("every language", () => {
  it("has copy for every action the code writes", () => {
    const cases = [
      { actionType: "apply", details: applyDetail("prose", "x") },
      { actionType: "dismiss", details: dismissDetail("pov", null) },
      { actionType: "undo", details: undoDetail("continuity", true) },
      { actionType: "session_complete", details: sessionCompleteDetail("dev-edit", 3, 0) },
    ];
    for (const { code } of UI_SUPPORTED_LANGUAGES) {
      const t = getUIStrings(code);
      for (const c of cases) {
        const line = describeEditAction(c, t, code);
        expect(line, `${code}/${c.actionType}`).toBeTruthy();
        expect(line, `${code}/${c.actionType}`).not.toContain("{");
      }
    }
  });
});

describe("the timeline component", () => {
  const timeline = readFileSync(
    join(__dirname, "..", "..", "src", "components", "editorial", "edit-history-timeline.tsx"),
    "utf-8"
  );

  it("never renders the stored English line", () => {
    // `description` is the machine line. Rendering it is the whole defect.
    expect(timeline).not.toMatch(/\{action\.description\}/);
    expect(timeline).toContain("describeEditAction(action, t, language)");
  });
});

describe("every write site", () => {
  const sites = [
    ["src","app","api","books","[id]","editorial","findings","[findingId]","route.ts"],
    ["src","app","api","books","[id]","editorial","findings","[findingId]","undo","route.ts"],
    ["src","lib","agents","post-session.ts"],
  ];

  it("stores structure beside the machine line", () => {
    for (const parts of sites) {
      const text = readFileSync(join(__dirname, "..", "..", ...parts), "utf-8");
      const creates = [...text.matchAll(/editAction\.create\(\{/g)];
      expect(creates.length, parts.join("/")).toBeGreaterThan(0);
      for (const m of creates) {
        const body = text.slice(m.index!, m.index! + 900);
        expect(body, parts.join("/")).toContain("detailForStorage(");
      }
    }
  });
});
