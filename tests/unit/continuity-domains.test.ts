/**
 * The six domain cards on the continuity tab have to be reachable.
 *
 * S3-22: the tab fetched findings with `?category=continuity`, then classified
 * them by that same field — which is now the constant "continuity" for every
 * row. So `categorizeFinding` answered "other" every time, all 27 findings
 * piled into Ostalo, and Likovi, Hronologija, Geografija, Predmeti, Odnosi and
 * Pravila sveta sat empty forever. Six cards that could never fill.
 *
 * The domain signal does exist: ContinuityFlag.type names it outright.
 */

import { describe, it, expect } from "vitest";
import { categorizeContinuity } from "@/components/reports/continuity-domains";

describe("continuity domains", () => {
  it("reads the domain out of a flag type", () => {
    expect(categorizeContinuity("dead_character_reappears")).toBe("characters");
    expect(categorizeContinuity("relationship_contradiction")).toBe("relationships");
    expect(categorizeContinuity("timeline_violation")).toBe("timeline");
    expect(categorizeContinuity("location_conflict")).toBe("geography");
    expect(categorizeContinuity("attribute_conflict")).toBe("objects");
  });

  it("still reads the domain out of a finding category", () => {
    expect(categorizeContinuity("character-consistency")).toBe("characters");
    expect(categorizeContinuity("chronology")).toBe("timeline");
    expect(categorizeContinuity("setting")).toBe("geography");
  });

  it("reads a qualified continuity category", () => {
    // What the checker should write going forward.
    expect(categorizeContinuity("continuity:characters")).toBe("characters");
    expect(categorizeContinuity("continuity:world")).toBe("world");
  });

  it("keeps a bare 'continuity' in Other rather than guessing", () => {
    expect(categorizeContinuity("continuity")).toBe("other");
    expect(categorizeContinuity("")).toBe("other");
  });

  it("never invents a domain for something it does not recognise", () => {
    expect(categorizeContinuity("prose")).toBe("other");
    expect(categorizeContinuity("banana")).toBe("other");
  });
});
