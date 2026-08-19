// tests/unit/ambient-context.test.ts
import { describe, it, expect } from "vitest";
import {
  buildAmbientContext,
  type AmbientContextInput,
  type PriorCharacter,
} from "@/lib/series/ambient-context";

function base(overrides: Partial<AmbientContextInput> = {}): AmbientContextInput {
  return {
    currentBookNumber: 2,
    onStageNames: [],
    priorBookCharacters: [],
    openThreads: [],
    currentStyleMetrics: null,
    seriesBaselineMetrics: null,
    baselineBookNumber: null,
    ...overrides,
  };
}

const milanB1: PriorCharacter = {
  bookNumber: 1, name: "Milan", aliases: ["the Captain"], role: "supporting",
  status: "alive", lastMentioned: 18, description: "distrusted by the council",
};

describe("buildAmbientContext — matching", () => {
  it("returns an empty, valid view for empty input", () => {
    const v = buildAmbientContext(base());
    expect(v.characters).toEqual([]);
    expect(v.threads).toEqual([]);
    expect(v.toneDrift).toBeNull();
    expect(v.notReady).toBe(true); // no on-stage cast
  });

  it("matches an on-stage name to a prior character by exact name", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Milan"], priorBookCharacters: [milanB1] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].name).toBe("Milan");
    expect(v.characters[0].lastBook).toBe(1);
    expect(v.characters[0].lastChapter).toBe(18);
    expect(v.characters[0].matchedFrom).toBeNull();
    expect(v.notReady).toBe(false);
  });

  it("matches on an alias and records matchedFrom", () => {
    const v = buildAmbientContext(base({ onStageNames: ["the Captain"], priorBookCharacters: [milanB1] }));
    expect(v.characters[0].name).toBe("Milan");
    expect(v.characters[0].matchedFrom).toBe("the Captain");
  });

  it("matches case- and diacritic-insensitively", () => {
    const milos: PriorCharacter = { ...milanB1, name: "Miloš", aliases: [] };
    const v = buildAmbientContext(base({ onStageNames: ["milos"], priorBookCharacters: [milos] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].name).toBe("Miloš");
  });

  it("keeps the latest book when a character appears in several prior books", () => {
    const milanB2Prior: PriorCharacter = { ...milanB1, bookNumber: 1, lastMentioned: 18 };
    const milanLater: PriorCharacter = { bookNumber: 2, name: "Milan", aliases: [], role: "supporting", status: "dead", lastMentioned: 4, description: "fell at the bridge" };
    // currentBookNumber 3 so both 1 and 2 are "prior"
    const v = buildAmbientContext(base({ currentBookNumber: 3, onStageNames: ["Milan"], priorBookCharacters: [milanB2Prior, milanLater] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].lastBook).toBe(2);
    expect(v.characters[0].status).toBe("dead");
  });

  it("drops on-stage names that match no prior character", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Ana"], priorBookCharacters: [milanB1] }));
    expect(v.characters).toEqual([]);
    expect(v.notReady).toBe(false); // cast existed, just no prior matches
  });

  it("emits exactly one card when two on-stage tokens resolve to the same character (dedup)", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Milan", "the Captain"], priorBookCharacters: [milanB1] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].name).toBe("Milan");
  });

  it("does not throw on malformed prior records", () => {
    const bad = { bookNumber: 1, name: "X", aliases: null as unknown as string[], role: null, status: null, lastMentioned: null, description: null } as PriorCharacter;
    expect(() => buildAmbientContext(base({ onStageNames: ["X"], priorBookCharacters: [bad] }))).not.toThrow();
  });
});

describe("buildAmbientContext — threads", () => {
  const thread = { bookNumber: 1, name: "What Milan knows", status: "developing", relatedNames: ["Milan"] };

  it("keeps threads whose related names intersect the on-stage cast", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Milan"], priorBookCharacters: [milanB1], openThreads: [thread] }));
    expect(v.threads).toHaveLength(1);
    expect(v.threads[0].name).toBe("What Milan knows");
  });

  it("drops threads not touching the on-stage cast", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Ana"], openThreads: [thread] }));
    expect(v.threads).toEqual([]);
  });

  it("matches a thread via an on-stage character's alias", () => {
    const v = buildAmbientContext(base({ onStageNames: ["the Captain"], priorBookCharacters: [milanB1], openThreads: [thread] }));
    expect(v.threads).toHaveLength(1);
  });

  it("drops resolved/abandoned threads even when they touch the cast", () => {
    const resolved = { bookNumber: 1, name: "Done", status: "resolved", relatedNames: ["Milan"] };
    const v = buildAmbientContext(base({ onStageNames: ["Milan"], priorBookCharacters: [milanB1], openThreads: [resolved] }));
    expect(v.threads).toEqual([]);
  });
});

describe("buildAmbientContext — tone drift", () => {
  const cur = { avgWordsPerSentence: 24, dialogueRatio: 0.12, avgSentencesPerParagraph: 5 };
  const baseline = { avgWordsPerSentence: 18, dialogueRatio: 0.12, avgSentencesPerParagraph: 5 };

  it("is null when either side is missing", () => {
    expect(buildAmbientContext(base({ currentStyleMetrics: cur })).toneDrift).toBeNull();
    expect(buildAmbientContext(base({ seriesBaselineMetrics: baseline, baselineBookNumber: 1 })).toneDrift).toBeNull();
  });

  it("flags a material metric and EXCLUDES dialogueRatio from the comparison (review fix)", () => {
    const v = buildAmbientContext(base({ currentStyleMetrics: cur, seriesBaselineMetrics: baseline, baselineBookNumber: 1 }));
    expect(v.toneDrift).not.toBeNull();
    const sent = v.toneDrift!.metrics.find((m) => m.key === "avgWordsPerSentence");
    expect(sent!.deltaPct).toBe(33); // 24 vs 18
    expect(sent!.material).toBe(true); // 33% >= 25%
    // dialogueRatio is intentionally not compared (incomparable to the volume-based baseline)
    expect(v.toneDrift!.metrics.find((m) => m.key === "dialogueRatio")).toBeUndefined();
  });

  it("treats exactly the materiality threshold as material (boundary)", () => {
    // 25 vs 20 = 25% == MATERIALITY_PCT (>= boundary)
    const v = buildAmbientContext(base({
      currentStyleMetrics: { ...cur, avgWordsPerSentence: 25 },
      seriesBaselineMetrics: { ...baseline, avgWordsPerSentence: 20 },
      baselineBookNumber: 1,
    }));
    expect(v.toneDrift!.metrics.find((m) => m.key === "avgWordsPerSentence")!.material).toBe(true);
  });

  it("marks a metric below threshold as immaterial", () => {
    // 21 vs 20 = 5%
    const v = buildAmbientContext(base({
      currentStyleMetrics: { ...cur, avgWordsPerSentence: 21 },
      seriesBaselineMetrics: { ...baseline, avgWordsPerSentence: 20 },
      baselineBookNumber: 1,
    }));
    expect(v.toneDrift!.metrics.find((m) => m.key === "avgWordsPerSentence")!.material).toBe(false);
  });

  it("skips a metric whose baseline is zero (no divide-by-zero)", () => {
    const v = buildAmbientContext(base({
      currentStyleMetrics: { ...cur, avgSentencesPerParagraph: 3 },
      seriesBaselineMetrics: { ...baseline, avgSentencesPerParagraph: 0 },
      baselineBookNumber: 1,
    }));
    expect(v.toneDrift!.metrics.find((m) => m.key === "avgSentencesPerParagraph")).toBeUndefined();
  });
});

describe("buildAmbientContext — current book as recency candidate (D-25/F4)", () => {
  it("surfaces the CURRENT book's state over a frozen prior-book state (latest-book-wins)", () => {
    const milanPrior: PriorCharacter = {
      bookNumber: 1, name: "Milan", aliases: [], role: "supporting",
      status: "alive", lastMentioned: 5, description: "captain of the guard",
    };
    // The book-2 record IS the current book (currentBookNumber 2). It must NOT be
    // filtered out as "not prior" — it is the freshest series state and must win.
    const milanCurrent: PriorCharacter = {
      bookNumber: 2, name: "Milan", aliases: [], role: "supporting",
      status: "dead", lastMentioned: 3, description: "captain of the guard",
    };
    const v = buildAmbientContext(base({
      currentBookNumber: 2,
      onStageNames: ["Milan"],
      priorBookCharacters: [milanPrior, milanCurrent],
    }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].lastBook).toBe(2);
    expect(v.characters[0].lastChapter).toBe(3);
    expect(v.characters[0].status).toBe("dead");
  });

  it("still surfaces a carried-over character that has no current-book record yet", () => {
    const milanPrior: PriorCharacter = {
      bookNumber: 1, name: "Milan", aliases: [], role: "supporting",
      status: "alive", lastMentioned: 5, description: "captain of the guard",
    };
    const v = buildAmbientContext(base({
      currentBookNumber: 2, onStageNames: ["Milan"], priorBookCharacters: [milanPrior],
    }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].lastBook).toBe(1);
  });

  it("never treats a FUTURE book as a candidate (guards the <= boundary)", () => {
    const future: PriorCharacter = {
      bookNumber: 3, name: "Milan", aliases: [], role: "supporting",
      status: "alive", lastMentioned: 9, description: "d",
    };
    const v = buildAmbientContext(base({
      currentBookNumber: 2, onStageNames: ["Milan"], priorBookCharacters: [future],
    }));
    expect(v.characters).toEqual([]);
  });
});

describe("buildAmbientContext — cross-book deictic descriptions (F13)", () => {
  it("neutralizes viewing-relative deixis baked into a PRIOR-book description", () => {
    const corvin: PriorCharacter = {
      bookNumber: 1, name: "Corvin", aliases: [], role: "supporting",
      status: "dead", lastMentioned: 5, description: "died one month prior to this chapter",
    };
    const v = buildAmbientContext(base({
      currentBookNumber: 2, onStageNames: ["Corvin"], priorBookCharacters: [corvin],
    }));
    const d = (v.characters[0].description ?? "").toLowerCase();
    expect(d).not.toContain("this chapter");
    expect(d).not.toContain("prior to");
    expect(v.characters[0].description).toContain("died"); // the substantive fact survives
  });

  it("strips several relative-time anchors and leaves clean prose", () => {
    const vane: PriorCharacter = {
      bookNumber: 1, name: "Vane", aliases: [], role: "supporting",
      status: "alive", lastMentioned: 4, description: "As of this chapter, currently imprisoned in the Cinder Ward",
    };
    const v = buildAmbientContext(base({ currentBookNumber: 2, onStageNames: ["Vane"], priorBookCharacters: [vane] }));
    const d = (v.characters[0].description ?? "").toLowerCase();
    expect(d).not.toContain("this chapter");
    expect(d).not.toContain("currently");
    expect(d).toContain("imprisoned in the cinder ward");
  });

  it("leaves a CURRENT-book description untouched (deixis in-frame, not cross-book)", () => {
    const milan: PriorCharacter = {
      bookNumber: 2, name: "Milan", aliases: [], role: "supporting",
      status: "alive", lastMentioned: 3, description: "wounded earlier this chapter",
    };
    const v = buildAmbientContext(base({ currentBookNumber: 2, onStageNames: ["Milan"], priorBookCharacters: [milan] }));
    expect(v.characters[0].description).toBe("wounded earlier this chapter");
  });

  it("returns null when neutralizing leaves nothing substantive", () => {
    const ghost: PriorCharacter = {
      bookNumber: 1, name: "Ghost", aliases: [], role: "minor",
      status: "alive", lastMentioned: 2, description: "as of this chapter",
    };
    const v = buildAmbientContext(base({ currentBookNumber: 2, onStageNames: ["Ghost"], priorBookCharacters: [ghost] }));
    expect(v.characters[0].description).toBeNull();
  });
});
