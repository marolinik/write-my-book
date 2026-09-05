import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Finding A / Finding B regression tests for the finding apply + undo routes.
 *
 *   Finding A — undo must reverse the EXACT spot apply touched (recording location
 *   + document version), never an unrelated earlier occurrence of the same newText.
 *   Finding B — apply/undo must optimistically lock (expectedVersion) and surface
 *   a 409 version_conflict instead of silently last-write-wins.
 */
const h = vi.hoisted(() => {
  class VersionConflictError extends Error {
    documentId: string;
    constructor(documentId: string) {
      super("version_conflict");
      this.documentId = documentId;
      this.name = "VersionConflictError";
    }
  }
  return {
    user: { id: "u1" },
    requireUser: vi.fn(),
    db: {
      book: { findFirst: vi.fn() },
      editFinding: { findFirst: vi.fn(), update: vi.fn() },
      editAction: { create: vi.fn() },
    },
    findByType: vi.fn(),
    read: vi.fn(),
    readPinned: vi.fn(),
    update: vi.fn(),
    inferPreferenceFromDismissals: vi.fn(),
    upsertConversationConstraint: vi.fn(),
    selectLatestConstraint: vi.fn(),
    VersionConflictError,
  };
});

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents", () => ({
  DocumentService: class {
    findByType = h.findByType;
    read = h.read;
    readPinned = h.readPinned;
    update = h.update;
  },
  VersionConflictError: h.VersionConflictError,
}));
vi.mock("@/lib/agents/writer-memory", () => ({
  inferPreferenceFromDismissals: () => h.inferPreferenceFromDismissals(),
  upsertConversationConstraint: () => h.upsertConversationConstraint(),
}));
vi.mock("@/lib/editorial/finding-conversation", () => ({
  selectLatestConstraint: () => h.selectLatestConstraint(),
}));

import { PATCH } from "@/app/api/books/[id]/editorial/findings/[findingId]/route";
import { POST as UNDO } from "@/app/api/books/[id]/editorial/findings/[findingId]/undo/route";

function makeCtx(p: { id: string; findingId: string }) {
  return { params: Promise.resolve(p) };
}

function req(body: unknown, isUndo: boolean) {
  const url = `http://t/api/books/b1/editorial/findings/f1${isUndo ? "/undo" : ""}`;
  return new Request(url, {
    method: isUndo ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

/** The applied finding row both routes start from. */
function appliedFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    bookId: "b1",
    chapterNumber: 1,
    category: "dialogue",
    status: "applied",
    originalText: "greetings",
    newText: "hello",
    locationStart: "21",
    locationEnd: "26",
    chapterVersion: 9,
    contentHash: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  // Both routes load the finding by (id, bookId). Default applied-location row;
  // tests override via mockResolvedValueOnce where a specific shape is needed.
  h.db.editFinding.findFirst.mockResolvedValue(appliedFinding());
  h.db.editFinding.update.mockResolvedValue({ id: "f1", status: "applied" });
  h.db.editAction.create.mockResolvedValue({});
  // svc.update returns { version: { version } } exactly like the real service.
  h.update.mockResolvedValue({ document: { currentVersion: 10 }, version: { version: 10 } });
});

// ─── APPLY (findingId/route.ts) ────────────────────────────────────────────

describe("apply finding (PATCH) — Finding A/B version safety", () => {
  it("passes the read's currentVersion as expectedVersion and records location+new chapterVersion in the same update", async () => {
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.read.mockResolvedValue({
      document: { currentVersion: 8 },
      content: "She said greetings and smiled.",
    });

    const res = await PATCH(
      req({ action: "apply", overrideText: "hello" }, false),
      makeCtx({ id: "b1", findingId: "f1" })
    );
    expect(res.status).toBe(200);

    // The chapter write is optimistically locked against the version just read
    // (6th arg expectedVersion === the doc's currentVersion at read time).
    expect(h.update).toHaveBeenCalledTimes(1);
    const applyCall = h.update.mock.calls[0];
    expect(applyCall[0]).toBe("doc1");
    expect(applyCall[1]).toBe("She said hello and smiled.");
    expect(applyCall[5]).toBe(8);

    // The finding update records the EXACT applied location (String indexes) +
    // the doc version this apply created, in the SAME row that flips status.
    const updateArgs = h.db.editFinding.update.mock.calls[0][0].data;
    expect(updateArgs.status).toBe("applied");
    expect(updateArgs.locationStart).toBe("9"); // index of "greetings"
    expect(updateArgs.locationEnd).toBe(String(9 + "greetings".length));
    expect(updateArgs.chapterVersion).toBe(10); // version returned by update
    // contentHash is deliberately NOT set on apply — it participates in the
    // @@unique([bookId, chapterNumber, contentHash]) dedup index, so setting
    // it on two findings applied to identical before-content would collide
    // (P2002→500). location + version are what undo needs.
    expect(updateArgs.contentHash).toBeUndefined();
  });

  it("returns 409 version_conflict (no-clobber on a stale apply) — finding NOT mutated, nothing logged", async () => {
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.read.mockResolvedValue({
      document: { currentVersion: 8 },
      content: "She said greetings and smiled.",
    });
    // CAS rejects: the author edited the chapter between this apply's read and write.
    h.update.mockRejectedValueOnce(new h.VersionConflictError("doc1"));
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 11 },
      content: "She said greetings but the author rewrote this line.",
    });

    const res = await PATCH(
      req({ action: "apply", overrideText: "hello" }, false),
      makeCtx({ id: "b1", findingId: "f1" })
    );
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(json.currentVersion).toBe(11);
    expect(json.serverContent).toBe(
      "She said greetings but the author rewrote this line."
    );
    // The apply never committed → no status flip, no edit-action row.
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
    expect(h.db.editAction.create).not.toHaveBeenCalled();
  });
});

// ─── UNDO (undo/route.ts) ──────────────────────────────────────────────────

describe("undo finding (POST) — Finding A exact-location reversal", () => {
  it("(a) reverses the RECORDED location and does NOT touch an earlier identical newText", async () => {
    h.findByType.mockResolvedValue({ id: "doc1" });
    // newText "hello" appears at index 0 AND index 21; apply recorded locationStart 21.
    h.read.mockResolvedValue({
      document: { currentVersion: 9 },
      content: "hello there. He said hello again.",
    });

    const res = await UNDO(req({}, true), makeCtx({ id: "b1", findingId: "f1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    // Only the index-21 occurrence is reverted, back to originalText "greetings".
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][1]).toBe(
      "hello there. He said greetings again."
    );
    // Reversal is optimistically locked against the version just read (6th arg).
    expect(h.update.mock.calls[0][5]).toBe(9);
    // Status reset to pending intact.
    expect(h.db.editFinding.update.mock.calls[0][0].data.status).toBe("pending");
    expect(json.note).toBeUndefined(); // a clean reversal surfaces no note
  });

  it("(b) returns 409 version_conflict on a stale undo and does NOT reset status", async () => {
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.read.mockResolvedValue({
      document: { currentVersion: 9 },
      content: "hello there. He said hello again.",
    });
    h.update.mockRejectedValueOnce(new h.VersionConflictError("doc1"));
    h.readPinned.mockResolvedValue({
      document: { currentVersion: 14 },
      content: "somebody else's newer chapter body",
    });

    const res = await UNDO(req({}, true), makeCtx({ id: "b1", findingId: "f1" }));
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toBe("version_conflict");
    expect(json.currentVersion).toBe(14);
    expect(json.serverContent).toBe("somebody else's newer chapter body");
    // Reversal never committed → nothing reset, nothing logged as reverted... but the reversal WAS attempted with the lock.
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
    expect(h.db.editAction.create).not.toHaveBeenCalled();
  });

  it("(c) pre-fix finding (no locationStart) with DUPLICATED newText → reset status only, warn, never guess", async () => {
    h.db.editFinding.findFirst.mockResolvedValueOnce(
      appliedFinding({ locationStart: null, locationEnd: null })
    );
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.read.mockResolvedValue({
      document: { currentVersion: 9 },
      content: "hello there. He said hello again.", // newText occurs TWICE
    });

    const res = await UNDO(req({}, true), makeCtx({ id: "b1", findingId: "f1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    // textReverted stays false → NO chapter write at all (no reversal update).
    expect(h.update).not.toHaveBeenCalled();
    // Status reset to pending intact.
    expect(h.db.editFinding.update.mock.calls[0][0].data.status).toBe("pending");
    // Caller told the reversal was skipped as ambiguous.
    expect(json.note).toMatch(/more than once/);
  });

  it("pre-fix finding with a SINGLE newText occurrence still reverses via the unambiguous indexOf fallback", async () => {
    h.db.editFinding.findFirst.mockResolvedValueOnce(
      appliedFinding({ locationStart: null, locationEnd: null })
    );
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.read.mockResolvedValue({
      document: { currentVersion: 5 },
      content: "He said hello and walked on.", // newText once
    });

    const res = await UNDO(req({}, true), makeCtx({ id: "b1", findingId: "f1" }));
    expect(res.status).toBe(200);
    // Unambiguous fallback reverses the single occurrence, lock included.
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][1]).toBe("He said greetings and walked on.");
    expect(h.update.mock.calls[0][5]).toBe(5);
  });

  it("(b) pre-fix finding whose newText is ABSENT (0 occurrences) → reset only + warn, no reversal", async () => {
    h.db.editFinding.findFirst.mockResolvedValueOnce(
      appliedFinding({ locationStart: null, locationEnd: null })
    );
    h.findByType.mockResolvedValue({ id: "doc1" });
    h.read.mockResolvedValue({
      document: { currentVersion: 9 },
      content: "Nothing related here at all.",
    });

    const res = await UNDO(req({}, true), makeCtx({ id: "b1", findingId: "f1" }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.db.editFinding.update.mock.calls[0][0].data.status).toBe("pending");
    expect(json.note).toMatch(/no longer present/);
  });

  it("leaves text as-is (reset only + note) when the RECORDED location no longer holds newText", async () => {
    h.findByType.mockResolvedValue({ id: "doc1" });
    // At the recorded index 21 the substring is now "wow a" — not the inserted
    // newText "hello" (further edits moved on from there).
    h.read.mockResolvedValue({
      document: { currentVersion: 12 },
      content: "hello there. he said wow again.",
    });
    const res = await UNDO(
      req({}, true),
      makeCtx({ id: "b1", findingId: "f1" })
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    // No reversal write — the exact spot apply touched no longer holds our newText.
    expect(h.update).not.toHaveBeenCalled();
    expect(h.db.editFinding.update.mock.calls[0][0].data.status).toBe("pending");
    expect(json.note).toMatch(/left as-is/);
  });
});