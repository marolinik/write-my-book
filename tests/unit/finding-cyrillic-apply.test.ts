import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P6-S12, the findings already stored. CreateFinding used to transliterate a
 * quote of Cyrillic prose to Latin, so those findings carry a Latin
 * `originalText` for a passage that is Cyrillic in the chapter. Apply only
 * normalised whitespace and quotes, found nothing, and answered 409 "may have
 * been edited since the finding was created" — every time, although nothing
 * had been edited.
 *
 * On a Serbian book, Apply now also looks for the passage with both sides in
 * Latin and replaces the span in the chapter's own characters; Undo puts that
 * Cyrillic span back.
 */

const h = vi.hoisted(() => ({
  language: "sr",
  chapter: { content: "", version: 1 },
  finding: {} as Record<string, unknown>,
  actions: [] as Array<{ actionType: string; findingId: string; details: unknown }>,
}));

vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/db", () => ({
  db: {
    book: { findFirst: async () => ({ id: "b1", userId: "u1", language: h.language }) },
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
        h.actions.push(data);
        return data;
      },
      findFirst: async ({ where }: { where: { findingId: string; actionType: string } }) =>
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
        return { id: "doc3" };
      }
      async read() {
        return { document: { id: "doc3", currentVersion: h.chapter.version }, content: h.chapter.content };
      }
      async readPinned() {
        return this.read();
      }
      async update(_id: string, content: string) {
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

const LATIN_OPENING = "Jutro je bilo hladno.";
const CYRILLIC = "Стари бунар у дворишту био је пун лишћа. Нико га није чистио од очеве смрти.";
const AS_STORED = "Stari bunar u dvorištu bio je pun lišća. Niko ga nije čistio od očeve smrti.";

function seed(content: string, originalText: string, newText: string, language = "sr") {
  h.language = language;
  h.chapter = { content, version: 5 };
  h.actions = [];
  h.finding = {
    id: "f1",
    bookId: "b1",
    chapterNumber: 3,
    category: "consistency",
    description: "Završni pasus je ćirilicom.",
    suggestion: null,
    status: "pending",
    originalText,
    newText,
    alternatives: JSON.stringify([
      { label: "Latinica", originalText, newText },
      { label: "Doslovno", originalText, newText },
    ]),
    locationStart: null,
    locationEnd: null,
    chapterVersion: 4,
  };
}

async function apply() {
  const req = new Request("http://t/x", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "apply" }),
  });
  return PATCH(req as never, ctx as never);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("applying a finding whose stored quote is Latin and the prose Cyrillic (P6-S12)", () => {
  it("finds the Cyrillic passage and replaces it", async () => {
    seed(`${LATIN_OPENING}\n\n${CYRILLIC}`, AS_STORED, AS_STORED);

    const res = await apply();

    expect(res.status).toBe(200);
    expect(h.chapter.content).toBe(`${LATIN_OPENING}\n\n${AS_STORED}`);
    expect(h.finding.status).toBe("applied");
  });

  it("matches across the digraph letters (љ, њ, џ)", async () => {
    seed("Прва реченица. Љубав и њена џамија су ту. Крај.", "Ljubav i njena džamija su tu.", "Ljubav je tu.");

    const res = await apply();

    expect(res.status).toBe(200);
    expect(h.chapter.content).toBe("Прва реченица. Ljubav je tu. Крај.");
  });

  it("undo puts the Cyrillic passage back, in Cyrillic", async () => {
    seed(`${LATIN_OPENING}\n\n${CYRILLIC}`, AS_STORED, "Stari bunar bio je pun lišća.");
    expect((await apply()).status).toBe(200);

    const res = await UNDO(new Request("http://t/x", { method: "POST" }) as never, ctx as never);

    expect(res.status).toBe(200);
    expect(h.chapter.content).toBe(`${LATIN_OPENING}\n\n${CYRILLIC}`);
  });

  it("does not transliterate on a book that is not Serbian", async () => {
    // Russian is Cyrillic by right: a Latin quote does not match it.
    seed("Старый колодец был полон листьев.", "Staryj kolodec", "Old well", "ru");

    const res = await apply();

    expect(res.status).toBe(409);
    expect(h.chapter.content).toBe("Старый колодец был полон листьев.");
  });
});
