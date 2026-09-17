import { describe, it, expect } from "vitest";
import {
  formatMissingPrerequisites,
  type MissingPrerequisite,
} from "@/lib/agents/prerequisite-message";

/**
 * O4 — a workflow whose prerequisites are not met answered 422 with
 * {"missing":[...]} and the panel showed nothing at all: the writer pressed
 * start, nothing happened, and no reason was given anywhere. The failure has to
 * name what is missing AND what produces it, in the writer's language.
 */

const strings = {
  title: "Ovo još ne može da počne",
  needs: "Potrebno je: {artifact}",
  action: "Pokreni: {workflow}",
  docTypes: { STORY_BIBLE: "Biblija priče", FINGERPRINT: "Stilski otisak" } as Record<string, string>,
  workflows: { "create-story-bible": "Biblija priče", "capture-style": "Hvatanje stila" } as Record<string, string>,
};

describe("formatMissingPrerequisites", () => {
  it("names the missing artifact in the writer's language", () => {
    const missing: MissingPrerequisite[] = [
      { description: "Story Bible needed before designing architecture", type: "document", value: "STORY_BIBLE", satisfiedBy: "create-story-bible" },
    ];
    const out = formatMissingPrerequisites(missing, strings);
    expect(out.title).toBe("Ovo još ne može da počne");
    expect(out.lines).toEqual(["Potrebno je: Biblija priče"]);
  });

  it("offers the workflow that produces the FIRST missing artifact", () => {
    const missing: MissingPrerequisite[] = [
      { description: "Style fingerprint needed for editing", type: "document", value: "FINGERPRINT", satisfiedBy: "capture-style" },
      { description: "Story Bible needed", type: "document", value: "STORY_BIBLE", satisfiedBy: "create-story-bible" },
    ];
    const out = formatMissingPrerequisites(missing, strings);
    expect(out.lines).toHaveLength(2);
    expect(out.action).toEqual({
      workflowId: "capture-style",
      label: "Pokreni: Hvatanje stila",
    });
  });

  it("falls back to the server's own description when the type has no label", () => {
    const missing: MissingPrerequisite[] = [
      { description: "Chapter must have content to edit", type: "chapter_content", value: "any", satisfiedBy: "write-chapter" },
    ];
    const out = formatMissingPrerequisites(missing, strings);
    expect(out.lines).toEqual(["Chapter must have content to edit"]);
  });

  it("has no action when nothing known produces the missing piece", () => {
    const out = formatMissingPrerequisites(
      [{ description: "Something", type: "document", value: "STORY_BIBLE" }],
      strings
    );
    expect(out.action).toBeUndefined();
  });

  it("returns nothing to show for an empty list", () => {
    const out = formatMissingPrerequisites([], strings);
    expect(out.lines).toEqual([]);
    expect(out.action).toBeUndefined();
  });

  it("de-duplicates repeated requirements", () => {
    const item: MissingPrerequisite = {
      description: "Story Bible needed",
      type: "document",
      value: "STORY_BIBLE",
      satisfiedBy: "create-story-bible",
    };
    const out = formatMissingPrerequisites([item, { ...item }], strings);
    expect(out.lines).toEqual(["Potrebno je: Biblija priče"]);
  });

  it("produces one flat sentence for a toast", () => {
    const out = formatMissingPrerequisites(
      [{ description: "x", type: "document", value: "STORY_BIBLE", satisfiedBy: "create-story-bible" }],
      strings
    );
    expect(out.text).toBe("Ovo još ne može da počne: Potrebno je: Biblija priče");
  });
});
