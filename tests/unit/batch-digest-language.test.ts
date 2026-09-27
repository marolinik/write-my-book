import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Job } from "bullmq";
import type { BatchDigestJobData } from "@/lib/queue/batch-flow";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P6-S16 (UAT 2026-09-25): the morning notification of an overnight batch on a
 * Serbian book read "Overnight batch complete" — in English, in a dashboard
 * alert list that is otherwise Serbian ("302 nalaza čeka pregled"). The digest
 * processor is the only writer of BookNotification, and its title, message and
 * action label were English literals; it never looked at the book's language.
 *
 * The notification is persisted text, so it is written in the book's language
 * when it is created — the way the session brief is.
 */

const h = vi.hoisted(() => {
  const redis = {
    get: vi.fn(() => Promise.reject(new Error("redis down"))),
    disconnect: vi.fn(),
  };
  return {
    redis,
    db: {
      batchRun: { findUnique: vi.fn(), update: vi.fn() },
      agentSession: { findMany: vi.fn() },
      editFinding: { findMany: vi.fn() },
      chapter: { findMany: vi.fn() },
      bookNotification: { create: vi.fn() },
    },
  };
});

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/connection", () => ({
  createRedisConnection: () => h.redis,
  getAppConnection: () => h.redis,
}));

import { processBatchDigestJob } from "@/lib/queue/batch-digest";

const LANGUAGES = ["en", "sr", "de", "es", "fr", "ru", "zh"];

function batchRow(language: string | null, overrides: Record<string, unknown> = {}) {
  return {
    id: "batch-lang",
    bookId: "book-1",
    userId: "user-1",
    workflowIds: ["dev-edit"],
    chapterStart: 1,
    chapterEnd: 3,
    budgetCapUsd: 25,
    status: "running",
    halted: false,
    spentUsd: 0,
    book: language === null ? null : { language },
    ...overrides,
  };
}

async function digest(language: string | null, overrides: Record<string, unknown> = {}) {
  h.db.batchRun.findUnique.mockResolvedValue(batchRow(language, overrides));
  await processBatchDigestJob({ data: { batchId: "batch-lang" } } as unknown as Job<BatchDigestJobData>);
  expect(h.db.bookNotification.create).toHaveBeenCalledTimes(1);
  return h.db.bookNotification.create.mock.calls[0][0].data as {
    title: string;
    message: string;
    actionLabel: string;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.agentSession.findMany.mockResolvedValue([
    { id: "s1", status: "completed", chapterNumber: 1, workflowId: "dev-edit", actualCostUsd: 1 },
    { id: "s2", status: "completed", chapterNumber: 2, workflowId: "dev-edit", actualCostUsd: 1 },
    { id: "s3", status: "skipped", chapterNumber: 3, workflowId: "dev-edit", actualCostUsd: null },
  ]);
  h.db.editFinding.findMany.mockResolvedValue([
    { severity: "major", category: "pacing", chapterNumber: 1, status: "pending" },
    { severity: "minor", category: "pacing", chapterNumber: 2, status: "pending" },
    { severity: "minor", category: "pacing", chapterNumber: 2, status: "rejected" },
  ]);
  h.db.chapter.findMany.mockResolvedValue([
    { chapterNumber: 1, status: "drafted", betaGate: null },
    { chapterNumber: 2, status: "drafted", betaGate: null },
    { chapterNumber: 3, status: "drafted", betaGate: null },
  ]);
});

describe("the overnight batch notification (P6-S16)", () => {
  it("reads the book's language, in the one query that loads the batch", async () => {
    await digest("sr");
    const query = h.db.batchRun.findUnique.mock.calls[0][0];
    expect(query.include?.book?.select?.language).toBe(true);
  });

  it("is written in Serbian for a Serbian book", async () => {
    const s = getUIStrings("sr").batchEditorial;
    const note = await digest("sr");

    expect(note.title).toBe(s.digestTitleDone);
    expect(note.actionLabel).toBe(s.digestAction);
    expect(note.message).toContain("2/3 prolaza");
    expect(note.message).toContain("2 nalaza");
    for (const english of ["Overnight", "passes", "findings", "skipped", "discarded", "cap", "View digest"]) {
      expect(note.message + note.title + note.actionLabel, english).not.toContain(english);
    }
  });

  it("names a halt in the book's language too", async () => {
    const s = getUIStrings("sr").batchEditorial;
    // Halted with the spend at the cap: a budget-cap halt.
    const note = await digest("sr", { halted: true, spentUsd: 25 });
    expect(note.title).toBe(s.digestTitleHaltedBudget);
    expect(note.message).toContain(s.digestClauseBudget);
  });

  it("stays English for an English book, as before", async () => {
    const note = await digest("en");
    expect(note.title).toBe("Overnight batch complete");
    expect(note.actionLabel).toBe("View digest");
    expect(note.message).toBe(
      "2/3 passes · 1 skipped · 2 findings (1 discarded as invalid) · $2.00 / $25.00 cap"
    );
  });

  it("falls back to English when the book row carries no language", async () => {
    const note = await digest(null);
    expect(note.title).toBe("Overnight batch complete");
  });

  it("has every sentence in every interface language", () => {
    const english = getUIStrings("en").batchEditorial;
    const keys = Object.keys(english).filter((k) => k.startsWith("digest"));
    expect(keys.length).toBeGreaterThanOrEqual(10);
    for (const language of LANGUAGES) {
      const s = getUIStrings(language).batchEditorial as unknown as Record<string, string>;
      for (const key of keys) {
        expect(s[key], `${language}.${key}`).toBeTruthy();
        if (language !== "en" && key.startsWith("digestTitle")) {
          expect(s[key], `${language}.${key} is still English`).not.toBe(
            (english as unknown as Record<string, string>)[key]
          );
        }
      }
    }
  });
});
