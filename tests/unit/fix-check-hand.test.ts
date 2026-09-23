/**
 * A note the writer applied by hand is checked on the chapter's next
 * editorial pass.
 *
 * At the moment of the click the text has often not changed yet, so the check
 * waits for the next pass, finds what became of the quoted passage, and asks
 * the same question as an auto-apply. A passage still there verbatim is
 * answered without a judge. One that did not hold last time is asked again,
 * because the writer may have revised since; one that held is left alone.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

const ENV = { FIX_CHECK_ENABLED: "1", TYPESAFE_API_KEY: "k" };
const CHAPTER = [
  "Spustio je zamotuljak pred Đorđa. Izvukao je stolicu do pola i ostao tako, ni za stolom ni van njega.",
  "Vetar ih je dočekao čim su izašli iz kafane.",
].join("\n\n");

function mockWorld(findings: Array<Record<string, unknown>>, noul = 0.61) {
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const sent: Array<{ before: string; after: string }> = [];
  let where: unknown;
  vi.doMock("@/lib/db", () => ({
    db: {
      editFinding: {
        findMany: vi.fn(async (args: { where: unknown }) => {
          where = args.where;
          return findings;
        }),
        update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: args.where.id, data: args.data });
          return {};
        }),
      },
    },
  }));
  vi.doMock("@/lib/editorial/book-evidence", () => ({
    readChapterText: vi.fn(async () => CHAPTER),
    readVoiceFingerprint: vi.fn(async () => null),
  }));
  vi.doMock("@typesafe-ai/sdk", () => ({
    TypeSafeClient: class {
      async systemOne(req: { state: { before: string; after: string } }) {
        sent.push({ before: req.state.before, after: req.state.after });
        return { answers: { remains: { type: "noul", noul } } };
      }
    },
  }));
  return { updates, sent, where: () => where };
}

const hand = (id: string, anchorQuote: string) => ({
  id,
  category: "clarity",
  description: "Ambiguous pronoun.",
  suggestion: null,
  anchorQuote,
});

describe("checkChapterHandFixes", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("does nothing when it is switched off", async () => {
    const world = mockWorld([hand("a", "x")]);
    const { checkChapterHandFixes } = await import("@/lib/editorial/fix-check-service");
    expect(await checkChapterHandFixes({ bookId: "b", chapterNumber: 2, env: {} })).toEqual({ checked: 0 });
    expect(world.updates).toHaveLength(0);
  });

  it("asks only about hand-applied notes never checked or not held last time", async () => {
    const world = mockWorld([]);
    const { checkChapterHandFixes } = await import("@/lib/editorial/fix-check-service");
    await checkChapterHandFixes({ bookId: "b", chapterNumber: 2, env: ENV });
    expect(world.where()).toMatchObject({
      bookId: "b",
      chapterNumber: 2,
      status: "applied",
      locationStart: null,
      anchorQuote: { not: null },
      OR: [{ fixCheckedAt: null }, { fixRemains: { gte: 0.5 } }],
    });
  });

  it("judges the rewrite against the quote, and answers a verbatim quote without a judge", async () => {
    const world = mockWorld([
      hand("rewritten", "Spustio je zamotuljak pred Đorđa, izvukao stolicu do pola i ostao tako, ni za stolom ni van njega."),
      hand("untouched", "Vetar ih je dočekao čim su izašli iz kafane."),
      hand("gone", "Negde iznad Sredozemlja leteo je avion pun putnika."),
    ]);
    const { checkChapterHandFixes } = await import("@/lib/editorial/fix-check-service");
    const result = await checkChapterHandFixes({ bookId: "b", chapterNumber: 2, env: ENV });

    expect(result).toEqual({ checked: 2 });
    expect(world.sent).toHaveLength(1);
    expect(world.sent[0].after.startsWith("Spustio je zamotuljak pred Đorđa. Izvukao")).toBe(true);
    const byId = Object.fromEntries(world.updates.map((u) => [u.id, u.data.fixRemains]));
    expect(byId).toEqual({ rewritten: 0.61, untouched: 1 });
  });
});
