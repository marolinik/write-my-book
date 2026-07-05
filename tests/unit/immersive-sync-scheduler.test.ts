import { describe, it, expect, vi } from "vitest";

import {
  createImmersiveSyncScheduler,
  type SchedulerTimers,
} from "@/components/editor/immersive-sync-scheduler";

/**
 * Deterministic fake-timer harness (injected like immersive-safety's target
 * doubles — no real time, no vi.useFakeTimers global state). Fires due timers
 * in chronological order and tolerates re-scheduling from inside a handler, so
 * the max-wait re-arm path is exercised faithfully.
 */
function makeFakeTimers() {
  let now = 0;
  let seq = 0;
  const scheduled = new Map<number, { at: number; handler: () => void }>();

  const api: SchedulerTimers = {
    setTimeout(handler, timeoutMs) {
      const id = ++seq;
      scheduled.set(id, { at: now + timeoutMs, handler });
      return id;
    },
    clearTimeout(handle) {
      scheduled.delete(handle);
    },
  };

  const advance = (ms: number): void => {
    const target = now + ms;
    let guard = 0;
    for (;;) {
      let next: { id: number; at: number; handler: () => void } | null = null;
      for (const [id, entry] of scheduled) {
        if (entry.at <= target && (!next || entry.at < next.at)) {
          next = { id, at: entry.at, handler: entry.handler };
        }
      }
      if (!next) break;
      now = next.at;
      scheduled.delete(next.id);
      next.handler();
      if (++guard > 10_000) throw new Error("runaway timer loop");
    }
    now = target;
  };

  return { api, advance, pending: () => scheduled.size };
}

const DELAY = 1000;
const MAX_WAIT = 2500;

describe("createImmersiveSyncScheduler — S10 active-editing flush cadence", () => {
  it("flushes once on the trailing edge after keystrokes stop", () => {
    const { api, advance } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    s.schedule();
    advance(DELAY - 1);
    expect(onFlush).not.toHaveBeenCalled();
    advance(1);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("coalesces a rapid burst into a single trailing flush", () => {
    const { api, advance } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    // Three keystrokes 200ms apart — each resets the trailing timer.
    s.schedule();
    advance(200);
    s.schedule();
    advance(200);
    s.schedule();
    expect(onFlush).not.toHaveBeenCalled();
    // Trailing fires DELAY after the last keystroke, exactly once.
    advance(DELAY);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("still flushes within maxWait during unbroken typing (no trailing gap)", () => {
    const { api, advance } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    // A keystroke every 800ms (< DELAY) keeps resetting the trailing timer, so
    // only the max-wait can fire. It must fire by MAX_WAIT.
    for (let t = 0; t < MAX_WAIT; t += 800) {
      s.schedule();
      advance(800);
    }
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("re-arms the max-wait after a flush (continuous typing flushes repeatedly)", () => {
    const { api, advance } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    // ~7s of unbroken 800ms-apart keystrokes should trigger multiple max-wait
    // flushes, not just one.
    for (let t = 0; t < 7000; t += 800) {
      s.schedule();
      advance(800);
    }
    expect(onFlush.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("flushNow fires immediately and cancels any pending trailing flush", () => {
    const { api, advance, pending } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    s.schedule();
    s.flushNow();
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(pending()).toBe(0);

    // No second (trailing) flush lands afterward.
    advance(MAX_WAIT + DELAY);
    expect(onFlush).toHaveBeenCalledTimes(1);
  });

  it("cancel tears down pending timers without flushing", () => {
    const { api, advance, pending } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    s.schedule();
    s.cancel();
    expect(pending()).toBe(0);
    advance(MAX_WAIT + DELAY);
    expect(onFlush).not.toHaveBeenCalled();
  });

  it("schedule after a flush starts a fresh trailing cycle", () => {
    const { api, advance } = makeFakeTimers();
    const onFlush = vi.fn();
    const s = createImmersiveSyncScheduler({
      onFlush,
      delayMs: DELAY,
      maxWaitMs: MAX_WAIT,
      timers: api,
    });

    s.schedule();
    advance(DELAY);
    expect(onFlush).toHaveBeenCalledTimes(1);

    // A later keystroke must schedule again (timers were cleared on fire).
    s.schedule();
    advance(DELAY);
    expect(onFlush).toHaveBeenCalledTimes(2);
  });
});
