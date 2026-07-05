/**
 * Immersive autosave sync scheduler (S10).
 *
 * While immersive focus mode is open, keystrokes land in a buffer that must be
 * routed into the main editor's tiptap doc so the SAME debounced, version-
 * stamped (CAS) autosave persists them. The old fixed 30s periodic sync left an
 * active-editing loss window: a crash between ticks dropped up to ~30s of
 * words. This scheduler instead coalesces keystrokes into a short trailing
 * flush AND guarantees a flush at least every `maxWaitMs` during unbroken
 * typing, so the buffer reaches the editor on roughly the main editor's ~2s
 * save cadence.
 *
 * `onFlush` is expected to be idempotent (the caller change-guards the actual
 * setContent), so the scheduler holds no buffer state — it is pure timing.
 * Timer functions are injectable so the state machine can be unit-tested
 * deterministically without real time.
 */

export interface ImmersiveSyncScheduler {
  /** Call on every keystroke: (re)arm the trailing flush, keep the max-wait. */
  schedule(): void;
  /** Flush immediately (exit / tab close), cancelling any pending timers. */
  flushNow(): void;
  /** Tear down without flushing (unmount). */
  cancel(): void;
}

/** Minimal timer surface; defaults to the host globals, injectable for tests. */
export interface SchedulerTimers {
  setTimeout(handler: () => void, timeoutMs: number): number;
  clearTimeout(handle: number): void;
}

export interface ImmersiveSyncSchedulerOptions {
  /** Reconcile the latest buffer into the editor. Must be idempotent. */
  onFlush: () => void;
  /** Trailing debounce: flush this long after the last keystroke. */
  delayMs: number;
  /** Upper bound: during unbroken typing, flush at least this often. */
  maxWaitMs: number;
  /** Injectable timers (defaults to the ambient globals). */
  timers?: SchedulerTimers;
}

const defaultTimers: SchedulerTimers = {
  setTimeout: (handler, timeoutMs) =>
    setTimeout(handler, timeoutMs) as unknown as number,
  clearTimeout: (handle) => clearTimeout(handle),
};

export function createImmersiveSyncScheduler(
  options: ImmersiveSyncSchedulerOptions
): ImmersiveSyncScheduler {
  const { onFlush, delayMs, maxWaitMs } = options;
  const timers = options.timers ?? defaultTimers;

  let trailingHandle: number | null = null;
  let maxWaitHandle: number | null = null;

  const clearTrailing = (): void => {
    if (trailingHandle !== null) {
      timers.clearTimeout(trailingHandle);
      trailingHandle = null;
    }
  };
  const clearMaxWait = (): void => {
    if (maxWaitHandle !== null) {
      timers.clearTimeout(maxWaitHandle);
      maxWaitHandle = null;
    }
  };

  // Fired by whichever timer elapses first; tears both down and reconciles.
  const fire = (): void => {
    clearTrailing();
    clearMaxWait();
    onFlush();
  };

  return {
    schedule(): void {
      clearTrailing();
      trailingHandle = timers.setTimeout(fire, delayMs);
      // The max-wait is armed once per burst and NOT reset per keystroke, so an
      // unbroken stream of edits still flushes within maxWaitMs.
      if (maxWaitHandle === null) {
        maxWaitHandle = timers.setTimeout(fire, maxWaitMs);
      }
    },
    flushNow(): void {
      clearTrailing();
      clearMaxWait();
      // Always reconcile on explicit request (exit / unload); onFlush is
      // change-guarded, so a no-op flush is harmless.
      onFlush();
    },
    cancel(): void {
      clearTrailing();
      clearMaxWait();
    },
  };
}
