import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * X-S05 / P2-S10 — Undo put back nothing when the finding had been applied
 * with a chosen alternative or with the writer's own edited revision.
 *
 * Apply inserts `alternatives[i].newText` or `overrideText`; undo checked the
 * recorded spot against `finding.newText` — alternative 0 — found something
 * else there, and "left the text as-is because it was edited further". Nothing
 * had edited it. The finding went back to pending, the chapter kept the applied
 * text, and a re-apply then failed because the original was gone.
 *
 * Apply now records exactly what it replaced and what it inserted, and undo
 * reverses exactly that. These tests run apply then undo against one in-memory
 * chapter, so what they check is the prose the writer ends up with.
 */

interface FindingRow {
  id: string;
  bookId: string;
  chapterNumber: number;
  category: string;
  description: string;
  status: string;
  originalText: string | null;
  newText: string | null;
  alternatives: string | null;
  locationStart: string | null;
  locationEnd: string | null;
  chapterVersion: number | null;
  [key: string]: unknown;
}

const h = vi.hoisted(() => ({
  chapter: { content: "", version: 1 },
  finding: null as unknown as Record<string, unknown>,
  actions: [] as Array<{ actionType: string; findingId: string; details: unknown; timestamp: Date }>,
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({
  db: {
    book: { findFirst: async () => ({ id: "b1", userId: "u1", language: "en" }) },
    editFinding: {
      findFirst: async () => ({ ...h.finding }),
      findUnique: async () => ({ ...h.finding }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(h.finding, data);
        return { ...h.finding };
      },
    },
    editAction: {
      create: async ({ data }: { data: { actionType: string; findingId: string; details: unknown } }) => {
        h.actions.push({ ...data, timestamp: new Date(Date.now() + h.actions.length) });
        return data;
      },
      findFirst: async ({
        where,
      }: {
        where: { findingId: string; actionType: string; bookId?: string };
      }) =>
        [...h.actions]
          .reverse()
          .find((a) => a.findingId === where.findingId && a.actionType === where.actionType) ?? null,
    },
  },
}));
vi.mock("@/lib/documents", () => {
  class VersionConflictError extends Error {}
  return {
    VersionConflictError,
    DocumentService: class {
      async findByType() {
        return { id: "doc1" };
      }
      async read() {
        return { document: { id: "doc1", currentVersion: h.chapter.version }, content: h.chapter.content };
      }
      async readPinned() {
        return this.read();
      }
      async update(_id: string, content: string, _t?: string, _c?: string, _s?: string, expected?: number) {
        if (expected !== undefined && expected !== h.chapter.version) throw new VersionConflictError();
        h.chapter.content = content;
        h.chapter.version += 1;
        return { document: { currentVersion: h.chapter.version }, version: { version: h.chapter.version } };
      }
    },
  };
});
vi.mock("@/lib/agents/writer-memory", () => ({
  inferPreferenceFromDismissals: vi.fn(),
  upsertConversationConstraint: vi.fn(),
}));
vi.mock("@/lib/editorial/finding-conversation", () => ({ selectLatestConstraint: vi.fn() }));
vi.mock("@/lib/editorial/fix-check-service", () => ({ checkAppliedFix: async () => null }));

import { PATCH } from "@/app/api/books/[id]/editorial/findings/[findingId]/route";
import { POST as UNDO } from "@/app/api/books/[id]/editorial/findings/[findingId]/undo/route";

const ctx = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };
const ORIGINAL = "She said greetings and smiled at the door.";

function seed(alternatives: Array<{ label: string; originalText: string; newText: string }>) {
  h.chapter = { content: ORIGINAL, version: 1 };
  h.actions = [];
  const row: FindingRow = {
    id: "f1",
    bookId: "b1",
    chapterNumber: 1,
    category: "dialogue",
    description: "Stiff greeting.",
    suggestion: null,
    status: "pending",
    originalText: alternatives[0].originalText,
    newText: alternatives[0].newText,
    alternatives: JSON.stringify(alternatives),
    locationStart: null,
    locationEnd: null,
    chapterVersion: 1,
  };
  h.finding = row;
}

async function apply(body: Record<string, unknown>) {
  const req = new Request("http://t/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "apply", ...body }),
  });
  return PATCH(req as never, ctx as never);
}

async function undo() {
  const res = await UNDO(new Request("http://t/x", { method: "POST" }) as never, ctx as never);
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  h.requireUser.mockResolvedValue({ id: "u1" });
});

describe("undo reverses what apply actually inserted", () => {
  const ALTS = [
    { label: "A", originalText: "said greetings", newText: "said hello" },
    { label: "B", originalText: "said greetings", newText: "said good day" },
    { label: "C", originalText: "She said greetings", newText: "She whispered hello" },
  ];

  it("control: the default alternative round-trips", async () => {
    seed(ALTS);
    expect((await apply({})).status).toBe(200);
    expect(h.chapter.content).toBe("She said hello and smiled at the door.");

    const res = await undo();
    expect(res.status).toBe(200);
    expect(res.body.note).toBeUndefined();
    expect(h.chapter.content).toBe(ORIGINAL);
  });

  it("puts the original back after an apply with alternativeIndex 1", async () => {
    seed(ALTS);
    expect((await apply({ alternativeIndex: 1 })).status).toBe(200);
    expect(h.chapter.content).toBe("She said good day and smiled at the door.");

    const res = await undo();
    expect(res.status).toBe(200);
    expect(res.body.note).toBeUndefined();
    expect(h.chapter.content).toBe(ORIGINAL);
    expect(h.finding.status).toBe("pending");
  });

  it("puts back the passage an alternative with its own span replaced", async () => {
    seed(ALTS);
    expect((await apply({ alternativeIndex: 2 })).status).toBe(200);
    expect(h.chapter.content).toBe("She whispered hello and smiled at the door.");

    await undo();
    expect(h.chapter.content).toBe(ORIGINAL);
  });

  it("puts the original back after the writer's own edited revision (overrideText)", async () => {
    seed(ALTS);
    expect((await apply({ overrideText: "said, quietly, hi there" })).status).toBe(200);
    expect(h.chapter.content).toBe("She said, quietly, hi there and smiled at the door.");

    const res = await undo();
    expect(res.body.note).toBeUndefined();
    expect(h.chapter.content).toBe(ORIGINAL);
    const last = h.actions.at(-1)!;
    expect(last.actionType).toBe("undo");
    expect((last.details as { textReverted: boolean }).textReverted).toBe(true);
  });

  it("still leaves text alone when the applied passage really was edited afterwards", async () => {
    seed(ALTS);
    await apply({ alternativeIndex: 1 });
    // The writer rewrites the applied words by hand.
    h.chapter.content = "She said good evening and smiled at the door.";
    h.chapter.version += 1;

    const res = await undo();
    expect(res.body.note).toMatch(/edited further/);
    expect(h.chapter.content).toBe("She said good evening and smiled at the door.");
  });
});
