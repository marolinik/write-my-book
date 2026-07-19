import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * D-41a: applying a finding whose replacement (`newText`) is blank would delete
 * the passage it points to. The apply route must refuse this server-side with an
 * honest 422 — never silently delete prose, never mark it "applied" as a no-op.
 * A whitespace-only newText is the dangerous case: it is truthy, so the old
 * `originalText && finalNewText` gate let it through into a destructive replace.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn(), update: vi.fn() },
    editAction: { create: vi.fn() },
    findingReply: { findFirst: vi.fn() },
  },
  doc: { findByType: vi.fn(), read: vi.fn(), update: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    constructor(..._a: unknown[]) {}
    findByType = h.doc.findByType;
    read = h.doc.read;
    update = h.doc.update;
  },
}));
vi.mock("@/lib/agents/writer-memory", () => ({
  inferPreferenceFromDismissals: vi.fn(),
  upsertConversationConstraint: vi.fn(),
}));

import { PATCH } from "@/app/api/books/[id]/editorial/findings/[findingId]/route";

const ctx = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };
function req(body: unknown) {
  return new Request("http://t/finding", { method: "PATCH", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue({ id: "b1", userId: "u1" });
  h.db.editAction.create.mockResolvedValue({});
  h.db.editFinding.update.mockResolvedValue({ id: "f1", status: "applied" });
  h.db.findingReply.findFirst.mockResolvedValue(null);
});

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1", bookId: "b1", chapterNumber: 1, category: "dialogue",
    originalText: "the old line", newText: "the old line rewritten",
    alternatives: null, status: "pending",
    ...overrides,
  };
}

describe("PATCH finding — destructive-apply guard (D-41a)", () => {
  it("refuses apply with a whitespace-only replacement (would delete prose)", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(finding({ newText: "   " }));
    const res = await PATCH(req({ action: "apply" }) as never, ctx as never);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/delete the passage/i);
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
    expect(h.doc.read).not.toHaveBeenCalled();
  });

  it("refuses apply with an empty-string replacement", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(finding({ newText: "" }));
    const res = await PATCH(req({ action: "apply" }) as never, ctx as never);
    expect(res.status).toBe(422);
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
  });

  it("refuses apply when overrideText blanks out a real replacement", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(finding()); // real stored newText
    const res = await PATCH(req({ action: "apply", overrideText: "   " }) as never, ctx as never);
    expect(res.status).toBe(422);
    expect(h.db.editFinding.update).not.toHaveBeenCalled();
  });

  it("still applies when overrideText supplies a real replacement for a blank finding", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(finding({ newText: "" }));
    h.doc.findByType.mockResolvedValue({ id: "doc-1" });
    h.doc.read.mockResolvedValue({ content: "before the old line after" });
    h.doc.update.mockResolvedValue({});
    const res = await PATCH(
      req({ action: "apply", overrideText: "a concrete revision" }) as never,
      ctx as never
    );
    expect(res.status).toBe(200);
    expect(h.doc.update).toHaveBeenCalledTimes(1);
    expect(h.db.editFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "applied" }) })
    );
  });

  it("does not guard advice-only findings (no target passage) — applies as advisory", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(
      finding({ originalText: null, newText: null })
    );
    const res = await PATCH(req({ action: "apply" }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.doc.read).not.toHaveBeenCalled(); // advice path, no chapter edit
    expect(h.db.editFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "applied" }) })
    );
  });

  it("does not guard a dismiss action even when newText is blank", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(finding({ newText: "   " }));
    const res = await PATCH(req({ action: "dismiss" }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.db.editFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "dismissed" }) })
    );
  });
});
