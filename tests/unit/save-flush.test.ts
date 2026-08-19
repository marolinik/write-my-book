import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  shouldFlushServerSave,
  bodyFitsKeepalive,
  KEEPALIVE_MAX_BODY_BYTES,
  registerServerFlushGuards,
  reserveKeepaliveBudget,
  releaseKeepaliveBudget,
  __resetKeepaliveBudget,
} from "@/components/editor/save-flush";

/**
 * D-133 — accept-then-close server-flush.
 *
 * An accepted ghost sentence was lost when the phone backgrounded ~10s after
 * accept, inside the autosave debounce: the words reached the LOCAL draft
 * buffer but never the SERVER. These pin the pure flush-decision table, the
 * keepalive 64KB body-cap guard, and the pagehide/visibilitychange wiring that
 * closes the window.
 */

// ── (1) flush decision table ──────────────────────────────────

describe("shouldFlushServerSave — flush decision table (D-133)", () => {
  const READY = {
    isDirty: true,
    isSaving: false,
    saveConflict: false,
    isOnline: true,
  } as const;

  it("flushes when dirty, online, not saving, no conflict", () => {
    expect(shouldFlushServerSave(READY)).toBe(true);
  });

  it("does not flush when there is nothing dirty to persist", () => {
    expect(shouldFlushServerSave({ ...READY, isDirty: false })).toBe(false);
  });

  it("does not flush while a save is already in flight (same-stamp 409 guard)", () => {
    // The in-flight PUT's dispatched words are already durable; a second
    // dispatch would carry the same expectedVersion and 409 against itself.
    expect(shouldFlushServerSave({ ...READY, isSaving: true })).toBe(false);
  });

  it("does not flush while a conflict is suspended (conflict-draft covers it)", () => {
    expect(shouldFlushServerSave({ ...READY, saveConflict: true })).toBe(false);
  });

  it("does not flush while offline (would just fail into backoff as the page dies)", () => {
    expect(shouldFlushServerSave({ ...READY, isOnline: false })).toBe(false);
  });

  it("rapid visibility flip-flap cannot storm the server: once saving, every re-hide is a no-op", () => {
    // The isDirty && !isSaving gate naturally bounds a flip-flap — the first
    // flush sets isSaving (then clears isDirty on success), so subsequent
    // hidden events short-circuit until real new typing re-dirties the pane.
    const afterFirstFlush = { ...READY, isSaving: true };
    expect(shouldFlushServerSave(afterFirstFlush)).toBe(false);
    const afterSuccess = { ...READY, isDirty: false, isSaving: false };
    expect(shouldFlushServerSave(afterSuccess)).toBe(false);
  });
});

// ── (2) keepalive body cap ────────────────────────────────────

describe("bodyFitsKeepalive — 64KB keepalive body cap (D-133)", () => {
  it("accepts a small serialized body", () => {
    expect(bodyFitsKeepalive(JSON.stringify({ markdown: "hello" }))).toBe(true);
  });

  it("rejects a body over the ~60KB cap (falls back to a normal fetch)", () => {
    const big = "x".repeat(KEEPALIVE_MAX_BODY_BYTES + 1);
    expect(bodyFitsKeepalive(big)).toBe(false);
  });

  it("measures UTF-8 bytes, not char count (multibyte prose must not undercount)", () => {
    // "—" (em dash) is 3 UTF-8 bytes. Just over the cap in bytes but well
    // under in char count — the guard must count bytes.
    const chars = Math.floor(KEEPALIVE_MAX_BODY_BYTES / 3) + 1;
    const multibyte = "—".repeat(chars);
    expect(multibyte.length).toBeLessThanOrEqual(KEEPALIVE_MAX_BODY_BYTES);
    expect(bodyFitsKeepalive(multibyte)).toBe(false);
  });
});

// ── (2b) global in-flight keepalive budget (F2) ───────────────

describe("reserveKeepaliveBudget / releaseKeepaliveBudget — shared in-flight cap (F2)", () => {
  beforeEach(() => {
    __resetKeepaliveBudget();
  });

  it("two concurrent reservations that jointly breach the cap: the second is refused", () => {
    // split-editor.tsx mounts TWO panes; on close both flush at once. Two
    // ~40KB bodies each individually fit (<=60KB) but sum to 80KB > cap. The
    // browser caps the SUM of inflight keepalive bodies, so the second must be
    // refused (its caller falls back to a plain fetch instead of throwing).
    const half = Math.floor(KEEPALIVE_MAX_BODY_BYTES * 0.7); // 42KB each
    expect(reserveKeepaliveBudget(half)).toBe(true);
    expect(reserveKeepaliveBudget(half)).toBe(false);
  });

  it("release restores budget so a later same-size reservation succeeds", () => {
    const half = Math.floor(KEEPALIVE_MAX_BODY_BYTES * 0.7);
    expect(reserveKeepaliveBudget(half)).toBe(true);
    expect(reserveKeepaliveBudget(half)).toBe(false);
    releaseKeepaliveBudget(half);
    // The first flush settled on a surviving page; its budget is freed and the
    // second pane's next flush can use keepalive again.
    expect(reserveKeepaliveBudget(half)).toBe(true);
  });

  it("a single reservation up to the full cap succeeds (single-pane path unchanged)", () => {
    expect(reserveKeepaliveBudget(KEEPALIVE_MAX_BODY_BYTES)).toBe(true);
    // Nothing more fits once the cap is fully reserved.
    expect(reserveKeepaliveBudget(1)).toBe(false);
  });

  it("release never drives the outstanding sum negative (over-release is clamped)", () => {
    releaseKeepaliveBudget(KEEPALIVE_MAX_BODY_BYTES);
    // Budget must still hold a full cap's worth after a spurious release.
    expect(reserveKeepaliveBudget(KEEPALIVE_MAX_BODY_BYTES)).toBe(true);
  });
});

// ── (3) unload wiring ─────────────────────────────────────────

type Vis = "visible" | "hidden";

interface FakeTarget {
  added: string[];
  removed: string[];
  visibilityState: Vis;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
  fire(type: string): void;
}

function makeTarget(visibilityState: Vis = "visible"): FakeTarget {
  const handlers = new Map<string, () => void>();
  return {
    added: [],
    removed: [],
    visibilityState,
    addEventListener(type, listener) {
      handlers.set(type, listener);
      this.added.push(type);
    },
    removeEventListener(type, listener) {
      if (handlers.get(type) === listener) handlers.delete(type);
      this.removed.push(type);
    },
    fire(type) {
      handlers.get(type)?.();
    },
  };
}

describe("registerServerFlushGuards — pagehide + visibilitychange wiring (D-133)", () => {
  it("registers pagehide + visibilitychange and cleans both up", () => {
    const win = makeTarget();
    const doc = makeTarget();
    const cleanup = registerServerFlushGuards(vi.fn(), { win, doc });

    expect(win.added).toContain("pagehide");
    expect(doc.added).toContain("visibilitychange");

    cleanup();
    expect(win.removed).toContain("pagehide");
    expect(doc.removed).toContain("visibilitychange");
  });

  it("flushes on pagehide", () => {
    const flush = vi.fn();
    const win = makeTarget();
    const doc = makeTarget();
    registerServerFlushGuards(flush, { win, doc });

    win.fire("pagehide");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("flushes on visibilitychange only when the document is hidden", () => {
    const flush = vi.fn();
    const win = makeTarget();
    const doc = makeTarget("visible");
    registerServerFlushGuards(flush, { win, doc });

    doc.fire("visibilitychange");
    expect(flush).not.toHaveBeenCalled();

    doc.visibilityState = "hidden";
    doc.fire("visibilitychange");
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("does not flush after cleanup removes listeners", () => {
    const flush = vi.fn();
    const win = makeTarget();
    const doc = makeTarget("hidden");
    const cleanup = registerServerFlushGuards(flush, { win, doc });

    cleanup();
    win.fire("pagehide");
    doc.fire("visibilitychange");
    expect(flush).not.toHaveBeenCalled();
  });
});
