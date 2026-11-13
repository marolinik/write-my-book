// P1-5 / P2-48: switching chapters in the app cleared the only armed autosave
// timer and reset the store, so up to 2 s of typing in the outgoing chapter
// never reached the server; and a first-party rewrite (Replace all, version
// Restore, accepting a finding) on a dirty pane made the next autosave 409.
// The outgoing chapter is now saved from an explicit snapshot, and a rewrite
// first flushes every pending save.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  capturePendingSave,
  flushPendingSave,
  registerPendingFlush,
  flushAllPendingSaves,
  trackInFlightSave,
  type InFlightSaveRef,
} from "@/components/editor/save-flush";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DIRTY = { isDirty: true, saveConflict: null, chapterId: "chA", documentVersion: 7 };

describe("capturePendingSave", () => {
  it("captures the outgoing chapter, its text and its version when the pane is dirty", () => {
    expect(capturePendingSave(DIRTY, "typed text")).toEqual({
      chapterId: "chA",
      markdown: "typed text",
      documentVersion: 7,
    });
  });

  it("captures nothing for a clean pane", () => {
    expect(capturePendingSave({ ...DIRTY, isDirty: false }, "x")).toBeNull();
  });

  it("captures nothing while a save conflict is open (the conflict dialog owns those words)", () => {
    expect(capturePendingSave({ ...DIRTY, saveConflict: { serverVersion: 8 } }, "x")).toBeNull();
  });
});

describe("flushPendingSave", () => {
  it("saves exactly the snapshot it was given, to the outgoing chapter", async () => {
    const save = vi.fn().mockResolvedValue({ version: 8 });
    const snapshot = capturePendingSave(DIRTY, "typed text");
    expect(await flushPendingSave(snapshot, save)).toBe("saved");
    expect(save).toHaveBeenCalledWith({ chapterId: "chA", markdown: "typed text", documentVersion: 7 });
  });

  it("does nothing for a clean pane", async () => {
    const save = vi.fn();
    expect(await flushPendingSave(null, save)).toBe("clean");
    expect(save).not.toHaveBeenCalled();
  });

  it("reports a failed save instead of throwing out of a React cleanup", async () => {
    const save = vi.fn().mockRejectedValue(new Error("offline"));
    expect(await flushPendingSave(capturePendingSave(DIRTY, "x"), save)).toBe("failed");
  });
});

describe("flushAllPendingSaves", () => {
  beforeEach(async () => {
    await flushAllPendingSaves();
  });

  it("awaits every registered pane before a first-party rewrite runs", async () => {
    const order: string[] = [];
    const unregisterA = registerPendingFlush(async () => {
      await new Promise((r) => setTimeout(r, 5));
      order.push("paneA");
    });
    const unregisterB = registerPendingFlush(async () => {
      order.push("paneB");
    });
    await flushAllPendingSaves();
    order.push("rewrite");
    expect(order).toEqual(expect.arrayContaining(["paneA", "paneB"]));
    expect(order.at(-1)).toBe("rewrite");
    unregisterA();
    unregisterB();
  });

  it("forgets a pane once it unregisters", async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const unregister = registerPendingFlush(flush);
    unregister();
    await flushAllPendingSaves();
    expect(flush).not.toHaveBeenCalled();
  });
});

describe("a save in flight (Wave 7: same-stamp self-409)", () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };

  it("the outgoing snapshot waits for the in-flight PUT and carries the version it produced", async () => {
    const put = deferred<{ version: number }>();
    const ref: InFlightSaveRef = { current: null };
    trackInFlightSave(ref, put.promise);
    const save = vi.fn().mockResolvedValue({ version: 9 });
    const snapshot = capturePendingSave(DIRTY, "typed text");
    const flushing = flushPendingSave(snapshot, save, ref.current);
    expect(save).not.toHaveBeenCalled();
    put.resolve({ version: 8 });
    expect(await flushing).toBe("saved");
    expect(save).toHaveBeenCalledWith({ chapterId: "chA", markdown: "typed text", documentVersion: 8 });
  });

  it("keeps the captured version when the in-flight PUT failed", async () => {
    const put = deferred<{ version: number }>();
    const ref: InFlightSaveRef = { current: null };
    trackInFlightSave(ref, put.promise);
    const save = vi.fn().mockResolvedValue({ version: 8 });
    const flushing = flushPendingSave(capturePendingSave(DIRTY, "typed text"), save, ref.current);
    put.reject(new Error("offline"));
    expect(await flushing).toBe("saved");
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ documentVersion: 7 }));
  });

  it("trackInFlightSave holds the request until it settles, then clears", async () => {
    const put = deferred<{ version: number }>();
    const ref: InFlightSaveRef = { current: null };
    trackInFlightSave(ref, put.promise);
    expect(ref.current).not.toBeNull();
    put.resolve({ version: 8 });
    expect(await ref.current).toBe(8);
    await Promise.resolve();
    expect(ref.current).toBeNull();
  });

  it("the editor tracks every PUT and both flush paths wait on it", () => {
    const editor = readFileSync(
      join(__dirname, "..", "..", "src", "components", "editor", "manuscript-editor.tsx"),
      "utf8"
    );
    expect(editor).toMatch(/trackInFlightSave\(inFlightSaveRef,/);
    expect(editor).toMatch(/flushPendingSave\(snapshot, saveSnapshotRef\.current, inFlightSaveRef\.current\)/);
    expect(editor).toMatch(/await inFlightSaveRef\.current;/);
  });
});
