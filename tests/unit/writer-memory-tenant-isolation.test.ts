import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * P7-S02 (UAT 2026-09-25): writer memory crossed tenants three ways.
 *  - POST /api/memory accepted ANY bookId and wrote a rule into a book the
 *    caller does not own (201) — no ownership check on the book.
 *  - triage read a book's rules by bookId alone, so that foreign row reached
 *    the owner's triage prompt (cross-tenant prompt injection).
 *  - PATCH/DELETE /api/memory/:id on someone else's id answered
 *    200 {success:true} although nothing changed, and an invalid PATCH body
 *    surfaced as a 500 carrying raw Zod JSON.
 * Each test asserts the corrected observable: 404 for what the caller does
 * not own, 400 for a bad body, and rules scoped to the book's owner.
 */

const h = vi.hoisted(() => ({
  user: { id: "u-owner" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn(), findUnique: vi.fn() },
    writerMemory: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    editFinding: { findMany: vi.fn(), update: vi.fn() },
  },
  readChapterText: vi.fn(),
  readVoiceFingerprint: vi.fn(),
  systemOne: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/editorial/book-evidence", () => ({
  readChapterText: (...a: unknown[]) => h.readChapterText(...a),
  readVoiceFingerprint: (...a: unknown[]) => h.readVoiceFingerprint(...a),
}));
vi.mock("@typesafe-ai/sdk", () => ({
  TypeSafeClient: class {
    systemOne(...a: unknown[]) {
      return h.systemOne(...a);
    }
  },
}));

import { POST as memoryPOST } from "@/app/api/memory/route";
import {
  PATCH as memoryPATCH,
  DELETE as memoryDELETE,
} from "@/app/api/memory/[id]/route";
import { triageChapter } from "@/lib/editorial/triage-service";

const FOREIGN_BOOK = "2f365ea1-0ca7-4285-b2a1-ad72795db21f";
const OWN_BOOK = "0b0b0b0b-0ca7-4285-b2a1-ad72795db21f";

function post(body: unknown) {
  return new NextRequest("http://t/api/memory", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function patch(body: unknown) {
  return new NextRequest("http://t/api/memory/m1", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const ctx = { params: Promise.resolve({ id: "m1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.requireUser.mockResolvedValue(h.user);
  h.db.writerMemory.create.mockImplementation(async ({ data }) => ({ id: "new", ...data }));
});

describe("POST /api/memory — the book must be the caller's", () => {
  it("404s a bookId the caller does not own and writes nothing", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await memoryPOST(
      post({ category: "constraint", content: "planted", bookId: FOREIGN_BOOK })
    );
    expect(res.status).toBe(404);
    expect(h.db.writerMemory.create).not.toHaveBeenCalled();
    expect(h.db.book.findFirst.mock.calls[0][0].where).toEqual({
      id: FOREIGN_BOOK,
      userId: "u-owner",
    });
  });

  it("creates the rule on a book the caller owns", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: OWN_BOOK });
    const res = await memoryPOST(
      post({ category: "constraint", content: "mine", bookId: OWN_BOOK })
    );
    expect(res.status).toBe(201);
    expect(h.db.writerMemory.create.mock.calls[0][0].data).toMatchObject({
      userId: "u-owner",
      bookId: OWN_BOOK,
    });
  });

  it("still creates a global rule (no bookId) without a book lookup", async () => {
    const res = await memoryPOST(post({ category: "style", content: "global" }));
    expect(res.status).toBe(201);
    expect(h.db.book.findFirst).not.toHaveBeenCalled();
    expect(h.db.writerMemory.create.mock.calls[0][0].data.bookId).toBeNull();
  });
});

describe("PATCH/DELETE /api/memory/:id — only the caller's own rule", () => {
  it("PATCH 404s when the id is not the caller's (nothing matched)", async () => {
    h.db.writerMemory.updateMany.mockResolvedValue({ count: 0 });
    const res = await memoryPATCH(patch({ content: "hijack" }), ctx);
    expect(res.status).toBe(404);
    expect(h.db.writerMemory.updateMany.mock.calls[0][0].where).toEqual({
      id: "m1",
      userId: "u-owner",
    });
  });

  it("PATCH 200s on the caller's own rule", async () => {
    h.db.writerMemory.updateMany.mockResolvedValue({ count: 1 });
    const res = await memoryPATCH(patch({ content: "edited" }), ctx);
    expect(res.status).toBe(200);
  });

  it("PATCH with an invalid body is a 400, not a 500 with raw Zod JSON", async () => {
    const res = await memoryPATCH(patch({ content: "" }), ctx);
    expect(res.status).toBe(400);
    expect(h.db.writerMemory.updateMany).not.toHaveBeenCalled();
  });

  it("DELETE 404s when the id is not the caller's (nothing matched)", async () => {
    h.db.writerMemory.updateMany.mockResolvedValue({ count: 0 });
    const res = await memoryDELETE(
      new NextRequest("http://t/api/memory/m1", { method: "DELETE" }),
      ctx
    );
    expect(res.status).toBe(404);
  });

  it("DELETE 200s on the caller's own rule", async () => {
    h.db.writerMemory.updateMany.mockResolvedValue({ count: 1 });
    const res = await memoryDELETE(
      new NextRequest("http://t/api/memory/m1", { method: "DELETE" }),
      ctx
    );
    expect(res.status).toBe(200);
  });
});

describe("triage reads only the book owner's rules", () => {
  const env = { FINDING_TRIAGE_ENABLED: "1", TYPESAFE_API_KEY: "k" };

  beforeEach(() => {
    h.db.editFinding.findMany.mockResolvedValue([
      { id: "f1", category: "prose", severity: "suggestion", description: "x" },
    ]);
    h.readChapterText.mockResolvedValue("Chapter prose.");
    h.readVoiceFingerprint.mockResolvedValue(null);
    h.db.writerMemory.findMany.mockResolvedValue([]);
    // The judge itself is irrelevant here; what matters is what was read.
    h.systemOne.mockRejectedValue(new Error("offline"));
  });

  it("scopes the rule query to the owner's userId, not the bookId alone", async () => {
    h.db.book.findUnique.mockResolvedValue({ userId: "u-owner" });
    await triageChapter({ bookId: OWN_BOOK, chapterNumber: 1, env });
    expect(h.db.writerMemory.findMany).toHaveBeenCalledTimes(1);
    expect(h.db.writerMemory.findMany.mock.calls[0][0].where).toEqual({
      bookId: OWN_BOOK,
      userId: "u-owner",
      active: true,
    });
  });

  it("reads no rules at all when the book has no owner row", async () => {
    h.db.book.findUnique.mockResolvedValue(null);
    await triageChapter({ bookId: OWN_BOOK, chapterNumber: 1, env });
    expect(h.db.writerMemory.findMany).not.toHaveBeenCalled();
  });
});
