/**
 * IndexedDB-backed crash-safety mirror for chapter drafts (Tier 2.2 offline
 * resilience). This is NOT a save path — all server persistence goes through
 * the existing stamped PUT. The buffer only protects words across tab
 * close/crash during a network outage.
 *
 * Contract: every exported operation is no-throw. Failures (private mode,
 * quota, blocked upgrade) degrade to `false`/`null`/`0` returns plus a
 * one-time console.warn, so the editor falls back to exactly today's
 * behavior (in-editor retention + autosave backoff).
 *
 * SSR-safe: every entry point guards `typeof indexedDB === "undefined"`.
 */

import { openDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";

// ── Schema ────────────────────────────────────────────────────

export interface ChapterDraft {
  chapterId: string; // key
  bookId: string;
  markdown: string;
  baseVersion: number | null; // pane documentVersion at serialization time — the CAS stamp for sync
  updatedAt: number; // epoch ms — for pruning + recovery recency
  clientId: string; // per-tab random id (sessionStorage) — guards multi-tab delete
}

/** putDraft stamps `updatedAt` and `clientId` itself. */
export type ChapterDraftInput = Omit<ChapterDraft, "updatedAt" | "clientId">;

interface EditorDB extends DBSchema {
  "chapter-drafts": {
    key: string;
    value: ChapterDraft;
    indexes: { updatedAt: number };
  };
}

// ── Constants ─────────────────────────────────────────────────

const DB_NAME = "wmb-editor";
const DB_VERSION = 1;
const STORE_NAME = "chapter-drafts";
const UPDATED_AT_INDEX = "updatedAt";

/** Drafts older than this are pruned on first DB open (buffer hygiene). */
export const DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// ── Availability / failure reporting ──────────────────────────

/**
 * True when IndexedDB exists in this environment. Note some browsers expose
 * `indexedDB` but reject `open()` (e.g. Firefox private mode) — per-op
 * try/catch covers that; this is only the cheap synchronous gate.
 */
export function isDraftStoreAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

let warnedOnce = false;

function warnOnce(operation: string, error: unknown): void {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(
    `[draft-store] IndexedDB operation failed (${operation}) — offline draft ` +
      "buffering is degraded for this session. Editor content and autosave " +
      "retry are unaffected.",
    error
  );
}

// ── Client id (per-tab) ───────────────────────────────────────

let cachedClientId: string | null = null;

function generateClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without randomUUID (non-secure contexts, old
  // WebViews) — uniqueness only needs to hold across concurrent tabs.
  return `wmb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Per-page-instance random id used by `deleteDraft(..., { onlyIfMine: true })`
 * so one tab's save success cannot destroy another tab's offline draft.
 *
 * Deliberately NOT sessionStorage-backed: "Duplicate tab" copies
 * sessionStorage, so two live tabs would share one id and the guard would
 * pass exactly when it must fail. A fresh id per page load loses nothing —
 * a draft that survives a reload is re-offered by recovery (which reads
 * regardless of clientId) and immediately re-stamped under the new id by the
 * post-recovery bufferNow.
 */
export function getClientId(): string {
  if (!cachedClientId) {
    cachedClientId = generateClientId();
  }
  return cachedClientId;
}

// ── Lazy cached connection ────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<EditorDB>> | null = null;
let pruneTriggered = false;

/**
 * Lazily opens (and caches) the DB connection. Prune runs once after the
 * first successful open — deliberately NOT at import time (SSR safety, and
 * no IDB work unless the editor actually buffers).
 *
 * A failed open stays cached (buffering disabled for the session) — retrying
 * a private-mode/quota failure every 2s buffer tick would be pointless churn.
 */
function getDb(): Promise<IDBPDatabase<EditorDB>> | null {
  if (!isDraftStoreAvailable()) return null;
  if (!dbPromise) {
    dbPromise = openDB<EditorDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "chapterId" });
        store.createIndex(UPDATED_AT_INDEX, "updatedAt");
      },
    });
    void dbPromise
      .then(() => {
        if (!pruneTriggered) {
          pruneTriggered = true;
          void pruneStaleDrafts();
        }
      })
      .catch((error: unknown) => warnOnce("open", error));
  }
  return dbPromise;
}

// ── Operations (all no-throw) ─────────────────────────────────

/**
 * Upserts the draft for `draft.chapterId`, stamping `updatedAt` (now) and
 * `clientId` (this tab). Returns true on durable write — the caller uses
 * this for the "saved on this device" vs "changes not saved" indicator.
 */
export async function putDraft(draft: ChapterDraftInput): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const stamped: ChapterDraft = {
      ...draft,
      updatedAt: Date.now(),
      clientId: getClientId(),
    };
    await (await db).put(STORE_NAME, stamped);
    return true;
  } catch (error) {
    warnOnce("putDraft", error);
    return false;
  }
}

/** Returns the stored draft for the chapter, or null (missing or any failure). */
export async function getDraft(chapterId: string): Promise<ChapterDraft | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const draft = await (await db).get(STORE_NAME, chapterId);
    return draft ?? null;
  } catch (error) {
    warnOnce("getDraft", error);
    return null;
  }
}

/**
 * Deletes the chapter's draft. The check-then-delete runs inside ONE
 * readwrite transaction so a concurrent tab cannot interleave.
 *
 * - `onlyIfMine`: a draft stamped by a different clientId is left intact
 *   (returns false) — one tab's save success must not destroy another tab's
 *   offline draft.
 * - `ifUpdatedAtEquals`: delete only the exact row revision the caller read
 *   (TOCTOU guard for hygiene deletes decided outside this transaction —
 *   a concurrent tab's just-written newer draft survives).
 *
 * Returns true when the draft no longer exists (deleted, or never existed).
 */
export async function deleteDraft(
  chapterId: string,
  opts?: { onlyIfMine?: boolean; ifUpdatedAtEquals?: number }
): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  try {
    const tx = (await db).transaction(STORE_NAME, "readwrite");
    if (opts?.onlyIfMine || opts?.ifUpdatedAtEquals !== undefined) {
      const existing = await tx.store.get(chapterId);
      if (existing) {
        if (opts.onlyIfMine && existing.clientId !== getClientId()) {
          await tx.done;
          return false; // foreign tab's draft — leave it for recovery
        }
        if (
          opts.ifUpdatedAtEquals !== undefined &&
          existing.updatedAt !== opts.ifUpdatedAtEquals
        ) {
          await tx.done;
          return false; // row was rewritten since the caller read it
        }
      }
    }
    await tx.store.delete(chapterId);
    await tx.done;
    return true;
  } catch (error) {
    warnOnce("deleteDraft", error);
    return false;
  }
}

/**
 * Deletes drafts not updated within `maxAgeMs` (default 14 days). Returns the
 * number pruned (0 on failure). Invoked automatically once per session after
 * the first successful DB open.
 */
export async function pruneStaleDrafts(
  maxAgeMs: number = DRAFT_MAX_AGE_MS
): Promise<number> {
  const db = getDb();
  if (!db) return 0;
  try {
    const cutoff = Date.now() - maxAgeMs;
    const tx = (await db).transaction(STORE_NAME, "readwrite");
    const index = tx.store.index(UPDATED_AT_INDEX);
    let pruned = 0;
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));
    while (cursor) {
      await cursor.delete();
      pruned += 1;
      cursor = await cursor.continue();
    }
    await tx.done;
    return pruned;
  } catch (error) {
    warnOnce("pruneStaleDrafts", error);
    return 0;
  }
}
