/**
 * Synchronous localStorage "last-chance" draft mirror (D-24).
 *
 * The IndexedDB draft buffer (draft-store.ts) is asynchronous: its interval
 * tick first fires 2s after the pane goes dirty, and an IDB put initiated in
 * an unload handler may never commit before a hard kill — on a true crash no
 * unload event fires at all. That left a total-loss window for a keystroke
 * burst shorter than one tick. This module closes it: a SYNCHRONOUS
 * localStorage write per editor update means the newest words are durable in
 * the same task that produced them, with zero settle time required.
 *
 * Semantics mirror draft-store deliberately (same row shape, same
 * clientId/onlyIfMine multi-tab guard, same 14-day hygiene window), so
 * recovery can treat the two stores as one buffer and simply take the newer
 * row. Like draft-store, every exported operation is no-throw and SSR-safe —
 * failure degrades to the IDB buffer + autosave behavior.
 */

import {
  getClientId,
  DRAFT_MAX_AGE_MS,
  type ChapterDraft,
  type ChapterDraftInput,
} from "./draft-store";

// ── Constants ─────────────────────────────────────────────────

const KEY_PREFIX = "wmb:last-chance-draft:";

/**
 * Ceiling on mirrored markdown length (~2MB of UTF-16). Above this a
 * per-keystroke synchronous write risks jank and localStorage quota — the
 * IDB buffer still covers such documents on its 2s cadence.
 */
export const LAST_CHANCE_MAX_MARKDOWN_LENGTH = 1_000_000;

/** Storage key for a chapter's mirror row (exported for tests). */
export function lastChanceKeyFor(chapterId: string): string {
  return `${KEY_PREFIX}${chapterId}`;
}

// ── Availability / failure reporting ──────────────────────────

function isStorageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    // Some privacy modes throw on the localStorage getter itself.
    return false;
  }
}

let warnedOnce = false;

function warnOnce(operation: string, error: unknown): void {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(
    `[last-chance-mirror] localStorage operation failed (${operation}) — ` +
      "synchronous draft mirroring is degraded for this session. The " +
      "IndexedDB draft buffer and autosave are unaffected.",
    error
  );
}

// ── Operations (all no-throw) ─────────────────────────────────

let pruneTriggered = false;

function maybePruneOnce(): void {
  if (pruneTriggered) return;
  pruneTriggered = true;
  pruneStaleLastChanceDrafts();
}

/**
 * Synchronously upserts the mirror row for `input.chapterId`, stamping
 * `updatedAt` (now) and `clientId` (this tab). Returns true on a durable
 * write. On a quota failure it prunes stale mirror rows and retries once.
 */
export function writeLastChanceDraft(input: ChapterDraftInput): boolean {
  if (!isStorageAvailable()) return false;
  if (input.markdown.length > LAST_CHANCE_MAX_MARKDOWN_LENGTH) {
    warnOnce("writeLastChanceDraft:oversize", null);
    return false;
  }
  maybePruneOnce();

  const stamped: ChapterDraft = {
    ...input,
    updatedAt: Date.now(),
    clientId: getClientId(),
  };
  const key = lastChanceKeyFor(input.chapterId);
  const payload = JSON.stringify(stamped);

  try {
    localStorage.setItem(key, payload);
    return true;
  } catch {
    // Likely quota — free stale rows and retry exactly once.
    pruneStaleLastChanceDrafts();
    try {
      localStorage.setItem(key, payload);
      return true;
    } catch (retryError) {
      warnOnce("writeLastChanceDraft", retryError);
      return false;
    }
  }
}

/**
 * Returns the mirror row for the chapter, or null (missing, unavailable, or
 * corrupt — corrupt rows are removed). Reads regardless of clientId: a
 * crashed tab's clientId is gone, and recovery must still see its words.
 */
export function readLastChanceDraft(chapterId: string): ChapterDraft | null {
  if (!isStorageAvailable()) return null;
  const key = lastChanceKeyFor(chapterId);
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isChapterDraft(parsed)) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch (error) {
    // JSON garbage or storage failure — drop the row if we can.
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing further to do — reads degrade to null.
    }
    warnOnce("readLastChanceDraft", error);
    return null;
  }
}

/**
 * Removes the chapter's mirror row. With `onlyIfMine`, a row stamped by a
 * different tab survives (returns false) — one tab's save success must not
 * destroy another tab's crash protection. Returns true when the row no
 * longer exists.
 */
export function clearLastChanceDraft(
  chapterId: string,
  opts?: { onlyIfMine?: boolean }
): boolean {
  if (!isStorageAvailable()) return false;
  try {
    if (opts?.onlyIfMine) {
      const existing = readLastChanceDraft(chapterId);
      if (existing && existing.clientId !== getClientId()) {
        return false; // foreign tab's row — leave it for recovery
      }
    }
    localStorage.removeItem(lastChanceKeyFor(chapterId));
    return true;
  } catch (error) {
    warnOnce("clearLastChanceDraft", error);
    return false;
  }
}

/**
 * Removes mirror rows not updated within `maxAgeMs` (default 14 days, same
 * hygiene window as the IDB buffer) plus any unparseable rows. Returns the
 * number removed (0 on failure).
 */
export function pruneStaleLastChanceDrafts(
  maxAgeMs: number = DRAFT_MAX_AGE_MS
): number {
  if (!isStorageAvailable()) return 0;
  try {
    const cutoff = Date.now() - maxAgeMs;
    const staleKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (raw === null) continue;
      const updatedAt = parseUpdatedAt(raw);
      if (updatedAt === null || updatedAt < cutoff) {
        staleKeys.push(key);
      }
    }
    for (const key of staleKeys) {
      localStorage.removeItem(key);
    }
    return staleKeys.length;
  } catch (error) {
    warnOnce("pruneStaleLastChanceDrafts", error);
    return 0;
  }
}

// ── Validation ────────────────────────────────────────────────

function isChapterDraft(value: unknown): value is ChapterDraft {
  if (typeof value !== "object" || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.chapterId === "string" &&
    typeof row.bookId === "string" &&
    typeof row.markdown === "string" &&
    (row.baseVersion === null || typeof row.baseVersion === "number") &&
    typeof row.updatedAt === "number" &&
    typeof row.clientId === "string"
  );
}

/** Cheap updatedAt extraction for pruning; null marks the row unparseable. */
function parseUpdatedAt(raw: string): number | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const updatedAt = (parsed as Record<string, unknown>).updatedAt;
    return typeof updatedAt === "number" ? updatedAt : null;
  } catch {
    return null;
  }
}
