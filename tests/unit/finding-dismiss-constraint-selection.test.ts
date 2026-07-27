import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-170 (S3, 2026-07-27): the chip promised a memory that dismiss would not
 * persist.
 *
 * The thread's chip is driven by `computeConversationView`, which scans ALL
 * assistant turns and keeps the constraint from whichever turn last carried one.
 * The dismiss route re-parsed only the NEWEST assistant reply
 * (`findingReply.findFirst … orderBy desc`). On any thread where the writer
 * asked for a rewrite AFTER the editor offered to remember something (real case:
 * finding 036a088d — turns 1-2 carry REMEMBER, turn 3 carries REVISION only) the
 * UI read *On "Keep as-is", I'll remember: …* while "Keep as-is" persisted
 * NOTHING: same silent-drop class as D-157, one layer up.
 *
 * Fix: ONE shared selector (`selectLatestConstraint`) feeds both the chip and
 * the dismiss route, so the promise and the persistence can no longer diverge.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), update: vi.fn() },
    editAction: { create: vi.fn() },
    findingReply: { findMany: vi.fn() },
    suggestionFeedback: { upsert: vi.fn() },
  },
  upsertConstraint: vi.fn(),
  inferPreference: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    constructor(..._a: unknown[]) {}
    findByType = vi.fn();
    read = vi.fn();
    update = vi.fn();
  },
}));
vi.mock("@/lib/agents/writer-memory", () => ({
  inferPreferenceFromDismissals: h.inferPreference,
  upsertConversationConstraint: h.upsertConstraint,
}));

import { PATCH } from "@/app/api/books/[id]/editorial/findings/[findingId]/route";
import {
  computeConversationView,
  selectLatestConstraint,
} from "@/lib/editorial/finding-conversation";

const REMEMBER_TURN = [
  "Understood.",
  '<<<REMEMBER category="preference">>>',
  "Do not flag Imogen's interior abstraction at emotional peaks.",
  "<<<END>>>",
].join("\n");

const REVISION_ONLY_TURN = [
  "Here is a tighter beat.",
  "<<<REVISION>>>",
  "suggestion: She bolted for the door.",
  "why: punchier",
  "<<<END>>>",
].join("\n");

const CONSTRAINT = {
  category: "preference",
  content: "Do not flag Imogen's interior abstraction at emotional peaks.",
};

const ctx = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };
const dismissReq = () =>
  new Request("http://t/finding", {
    method: "PATCH",
    body: JSON.stringify({ action: "dismiss", reason: "intentional voice" }),
  });

/** Assistant rows as the route reads them (oldest → newest). */
function assistantRows(...contents: string[]) {
  return contents.map((content, i) => ({
    role: "assistant",
    content,
    createdAt: new Date(2026, 6, 27, 1, i),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.editFinding.findFirst.mockResolvedValue({
    id: "f1",
    bookId: "b1",
    chapterNumber: 1,
    category: "show-tell",
    description: "Interior abstraction at an emotional peak.",
    originalText: null,
    newText: null,
    alternatives: null,
  });
  h.db.editFinding.update.mockResolvedValue({ id: "f1", status: "dismissed" });
  h.db.editAction.create.mockResolvedValue({});
  h.db.suggestionFeedback.upsert.mockResolvedValue({});
  h.db.findingReply.findMany.mockResolvedValue([]);
});

describe("D-170 — dismiss persists the SAME constraint the chip promised", () => {
  it("persists a constraint from an EARLIER turn when the newest turn carries only a revision", async () => {
    h.db.findingReply.findMany.mockResolvedValue(
      assistantRows(REMEMBER_TURN, REVISION_ONLY_TURN)
    );

    const res = await PATCH(dismissReq() as never, ctx as never);
    expect(res.status).toBe(200);

    expect(h.upsertConstraint).toHaveBeenCalledTimes(1);
    expect(h.upsertConstraint.mock.calls[0][0]).toEqual({
      userId: "u1",
      bookId: "b1",
      findingId: "f1",
      category: CONSTRAINT.category,
      content: CONSTRAINT.content,
    });
  });

  it("persists exactly what the chip promised (shared selector — UI and route agree)", async () => {
    const replies = [
      { role: "user" as const, content: "keep her taxonomy" },
      { role: "assistant" as const, content: REMEMBER_TURN },
      { role: "user" as const, content: "actually, tighten the beat" },
      { role: "assistant" as const, content: REVISION_ONLY_TURN },
    ];

    // What the writer was shown in the chip.
    const chip = computeConversationView({ replies, findingStatus: "pending" })
      .latestConstraint;
    expect(chip).toEqual(CONSTRAINT);

    // What the shared selector hands the dismiss route.
    expect(selectLatestConstraint(replies)).toEqual(chip);

    h.db.findingReply.findMany.mockResolvedValue(
      assistantRows(REMEMBER_TURN, REVISION_ONLY_TURN)
    );
    await PATCH(dismissReq() as never, ctx as never);

    const persisted = h.upsertConstraint.mock.calls[0][0];
    expect({ category: persisted.category, content: persisted.content }).toEqual(chip);
  });

  it("still lets the NEWEST constraint win when several turns carry one", async () => {
    const later = [
      "Fine.",
      '<<<REMEMBER category="style">>>',
      "Keep her clauses long.",
      "<<<END>>>",
    ].join("\n");
    h.db.findingReply.findMany.mockResolvedValue(assistantRows(REMEMBER_TURN, later));

    await PATCH(dismissReq() as never, ctx as never);

    expect(h.upsertConstraint.mock.calls[0][0]).toMatchObject({
      category: "style",
      content: "Keep her clauses long.",
    });
  });

  it("persists nothing (and does not fabricate feedback) when no turn carried a constraint", async () => {
    h.db.findingReply.findMany.mockResolvedValue(assistantRows(REVISION_ONLY_TURN));

    const res = await PATCH(dismissReq() as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.upsertConstraint).not.toHaveBeenCalled();
    expect(h.db.suggestionFeedback.upsert).not.toHaveBeenCalled();
  });

  it("reads only assistant turns, oldest-first, scoped to this finding", async () => {
    h.db.findingReply.findMany.mockResolvedValue(assistantRows(REMEMBER_TURN));

    await PATCH(dismissReq() as never, ctx as never);

    expect(h.db.findingReply.findMany).toHaveBeenCalledTimes(1);
    const args = h.db.findingReply.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ findingId: "f1", role: "assistant" });
    expect(args.orderBy).toEqual({ createdAt: "asc" });
  });
});

describe("selectLatestConstraint (pure)", () => {
  it("ignores user turns and survives a corrupted assistant row", () => {
    const replies = [
      { role: "user" as const, content: '<<<REMEMBER category="preference">>>\nfake\n<<<END>>>' },
      { role: "assistant" as const, content: "prose\n<<<REMEMBER category=" }, // unclosed
      { role: "assistant" as const, content: REMEMBER_TURN },
    ];
    expect(() => selectLatestConstraint(replies)).not.toThrow();
    expect(selectLatestConstraint(replies)).toEqual(CONSTRAINT);
  });

  it("returns undefined for an empty thread", () => {
    expect(selectLatestConstraint([])).toBeUndefined();
  });
});
