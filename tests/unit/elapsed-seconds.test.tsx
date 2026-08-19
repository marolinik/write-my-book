// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useElapsedSeconds } from "@/hooks/use-elapsed-seconds";

/**
 * D-176 — the ticking half of the wait line. The counter is what makes a 19-36 s
 * wall legible: it is measured client-side (honest, needs no new server frame,
 * and touches nothing about the first-text gate).
 */

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-27T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

describe("useElapsedSeconds", () => {
  it("is 0 while no turn is in flight", () => {
    const { result } = renderHook(() => useElapsedSeconds(null));
    expect(result.current).toBe(0);
  });

  it("ticks once a second while a turn is in flight", () => {
    const startedAt = Date.now();
    const { result } = renderHook(() => useElapsedSeconds(startedAt));

    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(1_000));
    expect(result.current).toBe(1);
    act(() => void vi.advanceTimersByTime(11_000));
    expect(result.current).toBe(12);
    act(() => void vi.advanceTimersByTime(24_000));
    expect(result.current).toBe(36);
  });

  it("reports the true elapsed time even if a tick is dropped (backgrounded tab)", () => {
    const startedAt = Date.now() - 30_000; // turn started 30s ago
    const { result } = renderHook(() => useElapsedSeconds(startedAt));
    expect(result.current).toBe(30);
  });

  it("resets to 0 for the next turn and stops ticking when the turn settles", () => {
    const startedAt = Date.now();
    const { result, rerender } = renderHook(
      ({ at }: { at: number | null }) => useElapsedSeconds(at),
      { initialProps: { at: startedAt as number | null } }
    );
    act(() => void vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(5);

    rerender({ at: null });
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(0);
  });

  it("clears its interval on unmount (no timer leak per opened thread)", () => {
    const { unmount } = renderHook(() => useElapsedSeconds(Date.now()));
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
