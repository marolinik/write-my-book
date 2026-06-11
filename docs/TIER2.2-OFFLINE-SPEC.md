# IMPLEMENTATION MAP — Tier 2.2 Offline Resilience (IndexedDB draft buffer + sync-on-reconnect)

Scope: **chapter editor only** (`manuscript-editor.tsx` + `PUT /api/books/:id/chapters/:chapterId/content`). The documents page (`src/app/(app)/books/[bookId]/documents/[documentId]/page.tsx`) has no CAS and silently swallows save errors — explicitly out of scope (see RISKS R10). **Zero server/API changes required** — the existing stamped PUT and 409 contract is sufficient.

---

## 1. ARCHITECTURE

### Key insight from research
TipTap is the sole source of truth (`src/stores/editor-store.ts:5`); save failures never destroy editor content, and the debounce effect (`manuscript-editor.tsx:490-532`) already retries indefinitely with exponential backoff (L522). So **the live tab already "syncs on reconnect"** — the gaps are: (a) durability if the tab closes/crashes during an outage, (b) up-to-60s reconnect latency from backoff, (c) zero offline visibility ("Unsaved" + one toast at failure streak 3, L483-485). The buffer is therefore a **crash-safety mirror**, not a replacement save path. All actual persistence to the server goes through the existing stamped PUT — never a new write path.

### Hook points (exact)
1. **Buffer write (write-behind, fixed 2s debounce):** a NEW effect (extracted into `use-draft-buffer.ts`, wired in `manuscript-editor.tsx` near the existing debounce effect at L490). While `isDirty`, every 2s (fixed — deliberately NOT subject to the `saveFailuresRef` backoff at L522, so offline typing is captured every ~2s even while network saves back off at 60s), serialize via `getMarkdownFromEditor(editorRef.current)` and `putDraft(...)`. Skip the IDB write if markdown hash equals last-buffered (ref-held) to avoid redundant serializations. This also covers the conflict-suspended state (the effect at L498-513 currently refreshes the localStorage conflict draft — IDB buffer now runs in parallel) and immersive mode (30s sync at L742-764 marks dirty → buffer picks it up; worst-case immersive offline loss ≈ 32s, unchanged).
2. **Buffer clear:** in `saveContent` success path, after `paneStore.getState().setLastSaved(new Date())` (`manuscript-editor.tsx:423`) → fire-and-forget `deleteDraft(dispatchedChapterId, { onlyIfMine: true })`. Also in the **no-op-conflict adopt** branch (L442-447). Also in `SaveConflictDialog.clearConflictDraft` (`save-conflict-dialog.tsx:65-71`) so both "Keep mine" and "Load theirs" resolutions clear it.
3. **Error classification:** in `saveContent` catch, non-409 branch (`manuscript-editor.tsx:480-486`): `fetchJson` (`src/lib/api-client.ts:23-41`) throws `ApiError` for HTTP failures and a raw `TypeError` for network-level failures — classify `!(error instanceof ApiError)` (and not the 401 `Error("Unauthorized")`) as `"network"`, store in new pane field `lastSaveErrorKind`. Suppress the streak-3 "Autosave is failing" toast (L483-485) when offline — replaced by a one-time offline toast (see UX).
4. **Reconnect short-circuit:** new effect in manuscript-editor: when `useOnlineStatus()` flips false→true and `isDirty && !saveConflict && !isSaving` → `saveFailuresRef.current = 0`, clear `saveTimerRef`, call `saveContent()` immediately. **This IS the reconnect sync for a live tab** — it goes through the existing stamped PUT with `expectedVersion` from the pane store (L403), and any 409 lands in the existing handler (L429-478) → conflict toast/chip/dialog. Constraint satisfied by construction.
5. **Recovery on load (tab was closed during outage):** in the content-load effect (`manuscript-editor.tsx:313-361`), inside the `isInitialLoad` branch only (L352), after `markClean()`/`setDocumentVersion()` (L340-343): async `getDraft(chapterId)`, guarded by the same stale-chapter pattern as `saveContent` (L409-410) and a `recoveryCheckedRef`. Decision table:
   - No draft, or `sanitizeUnicode(draft.markdown) === sanitizeUnicode(chapterData.markdown)` → `deleteDraft` (hygiene), done.
   - `draft.baseVersion === chapterData.version` (server hasn't moved; draft is strictly newer typing on the same base) → `editor.commands.setContent(draft.markdown, { emitUpdate: false })`, `markDirty()`, `toast.info("Recovered unsaved changes from your last session", { action: { label: "Discard", onClick: restore server markdown + deleteDraft + markClean } })`. Normal autosave then PUTs with `expectedVersion = chapterData.version`. (`markDirty` also blocks the clean-resync branch at L318-326 from clobbering the restored draft on the post-save refetch — guard at L322.)
   - `draft.baseVersion !== chapterData.version` **or `baseVersion === null`** (server moved while draft was offline, or base unprovable) → load draft into editor, `markDirty()`, `paneStore.getState().setSaveConflict({ serverContent: chapterData.markdown, serverVersion: chapterData.version })`, `showConflictToast()` (L365-374). This drops straight into the existing conflict machinery: dialog diff, "Keep mine" = stamped PUT with `expectedVersion: serverVersion`, "Load theirs" = backup-then-adopt. **Never an unstamped PUT, never a blind overwrite.** (`baseVersion === null` with no server doc at all — GET returned `{ markdown: "", wordCount: 0 }`, no version — is the only restore-and-save-unstamped case, which creates the doc at v1, matching the route's new-document path.)
6. **Unload flush:** `visibilitychange→hidden` + `pagehide` listeners → fire-and-forget `bufferNow()` (IDB writes initiated before unload usually complete; best-effort). `beforeunload` prompt condition extended from `saveConflict && isDirty` (L537-545) to also fire when `isDirty && !navigator.onLine`.

### Buffer schema
DB `wmb-editor` v1, object store `chapter-drafts`, **keyPath `chapterId`** (one draft per chapter per device):
```ts
interface ChapterDraft {
  chapterId: string;          // key
  bookId: string;
  markdown: string;
  baseVersion: number | null; // pane documentVersion at serialization time — the CAS stamp for sync
  updatedAt: number;          // epoch ms — for pruning + recovery recency
  clientId: string;           // per-tab random id (sessionStorage) — guards multi-tab delete
}
```
Index on `updatedAt` for pruning (delete drafts >14 days on module init).

### Write-through vs write-behind: **write-behind** (2s fixed debounce off `isDirty`)
Rationale: write-through per keystroke forces markdown serialization per keystroke (chapters up to 2MB — validation.ts:196); 2s matches the existing autosave debounce so the durability window is identical to today's best case, and the buffer keeps writing at 2s cadence even when network backoff stretches to 60s. Library: add **`idb`** (~1.5kB, battle-tested; repo currently has zero IDB libs — report confirms none in package-lock). Raw IDB acceptable fallback if the dependency is vetoed, +~60 lines.

---

## 2. FILES

### CREATE
| File | Purpose | API surface | Est. lines |
|---|---|---|---|
| `src/lib/offline/draft-store.ts` | IDB wrapper, all-no-throw, SSR/private-mode safe | `isDraftStoreAvailable(): boolean`; `getClientId(): string`; `putDraft(d: Omit<ChapterDraft,"updatedAt"\|"clientId">): Promise<boolean>` (stamps updatedAt/clientId, returns success for indicator); `getDraft(chapterId): Promise<ChapterDraft\|null>`; `deleteDraft(chapterId, opts?: {onlyIfMine?: boolean})` (read-check-delete in one IDB tx); `pruneStaleDrafts(maxAgeMs = 14d)`. Lazy cached `openDB` promise; every op `try/catch → false/null` + one-time `console.warn` | ~170 |
| `src/hooks/use-online-status.ts` | `useOnlineStatus(): boolean` via `useSyncExternalStore` on `online`/`offline` events; server snapshot `true` | single export | ~45 |
| `src/hooks/use-draft-buffer.ts` | Composes buffer write effect, unload flush, recovery check; keeps manuscript-editor delta small (file is already 1172 lines — over the 800 cap) | `useDraftBuffer({ paneStore, editorRef, paneChapterId, bookId }): { bufferNow(): Promise<void>; clearDraft(chapterId): void; checkRecovery(chapterId, serverMarkdown, serverVersion): Promise<RecoveryDecision> }` where `RecoveryDecision = {kind:"none"} \| {kind:"restore", markdown} \| {kind:"conflict", markdown, serverContent, serverVersion}` — decision pure/testable, side effects applied by the editor | ~160 |
| `tests/e2e/offline-autosave.spec.ts` | E2E coverage (section 5) | — | ~220 |

### MODIFY
| File | Change | Anchor |
|---|---|---|
| `src/components/editor/manuscript-editor.tsx` | (1) wire `useDraftBuffer` + `useOnlineStatus`; (2) success path: `clearDraft(dispatchedChapterId)` after `setLastSaved` and in no-op-adopt branch; (3) catch: classify network vs HTTP → `setLastSaveErrorKind`, gate streak-3 toast on `isOnline`; (4) reconnect effect (reset `saveFailuresRef`, immediate `saveContent()`); (5) recovery call inside `isInitialLoad` branch, stale-guarded; (6) extend beforeunload condition; (7) pass `isOnline`/`draftSavedAt`/`lastSaveErrorKind` to `EditorStatusBar` | L421-423, L442-447, L480-486, L313-361 (esp. L352), L490-532, L537-545, L1075-1083 |
| `src/stores/editor-store.ts` | Add per-pane `lastSaveErrorKind: "network"\|"http"\|null`, `draftSavedAt: number\|null` + setters; reset both in `setChapter` (L85-93) and `initialPaneState` (L61-79); extend `EditorPaneState` interface (L12-55) | +~20 lines |
| `src/components/editor/editor-status-bar.tsx` | New props `isOnline?: boolean`, `draftSavedAt?: number\|null`, `syncPending?: boolean`; extend the save-status ternary (L204-227) per section 3; import `CloudOff`/`RefreshCw` from lucide | L14-24 (props), L204-227 |
| `src/components/editor/save-conflict-dialog.tsx` | `clearConflictDraft` (L65-71) additionally calls `void deleteDraft(chapterId)` — both resolutions purge the IDB draft so an offline-recovered conflict isn't re-offered | L65-71 |
| `src/lib/api-client.ts` | Export `isNetworkError(e: unknown): boolean` (`!(e instanceof ApiError)` && not the 401 `"Unauthorized"` Error) | append after L41 |
| `package.json` | Add dependency `idb` | deps |

No changes to `src/hooks/use-documents.ts` (PUT already carries `expectedVersion`, L30-46) or any API route.

---

## 3. UX — status indicator states

Extend the strict ternary at `editor-status-bar.tsx:204-227` (conflict chip at L193-202 stays separate/adjacent, unchanged):

| State | Condition | Render |
|---|---|---|
| saving | `isSaving` | spinner + "Saving..." (unchanged) |
| **offline-buffered** | `!isOnline && isDirty && draftSavedAt != null` | amber `CloudOff` + "Offline — saved on this device" |
| **offline-unprotected** | `!isOnline && isDirty && draftSavedAt == null` (IDB unavailable/failed) | red `CloudOff` + "Offline — changes not saved" |
| **sync-pending** | `isOnline && isDirty && lastSaveErrorKind === "network"` (reconnected/server unreachable, retry scheduled) | `RefreshCw` + "Sync pending" |
| unsaved | `isDirty` | AlertCircle + "Unsaved" (unchanged) |
| saved | `lastSaved` | green check + "Saved HH:MM" (unchanged) |
| conflict | `hasSaveConflict` | existing amber chip "Conflict — click to review" (unchanged) |

Toasts (sonner, app-wide per `layout.tsx:104`): one-time `toast.info("You're offline. Your words are kept on this device and will sync when you reconnect.")` on offline transition while dirty (replaces streak-3 error toast when offline; streak-3 toast retained for online HTTP failures). Recovery toast per section 1.5. Note `ToastRouteGuard` dismisses toasts on navigation (`toast-route-guard.tsx:12-24`) — the status chip is the durable affordance, consistent with the existing conflict pattern.

---

## 4. EDGE CASES

1. **Tab close with unsynced draft:** `bufferNow()` on `visibilitychange:hidden`/`pagehide`; `beforeunload` prompt extended to `isDirty && (saveConflict || !navigator.onLine)`; recovery-on-load handles the crash path. Plain-dirty-online close stays non-prompting (autosave lands within 2s, as today).
2. **Multiple tabs, same chapter:** single key per `chapterId` is intentional; the hazard is tab B's save-success deleting tab A's offline draft → `deleteDraft(..., { onlyIfMine: true })` does a transactional clientId check, so a foreign tab's draft survives. Cross-tab content races already self-resolve through CAS: identical content → no-op-conflict adopt (L442-447); divergent → 409 → dialog. Recovery reads drafts regardless of clientId (crashed tab's clientId is gone); worst case a live-other-tab's draft is restored and the next stamped PUT 409s into the dialog — CAS is the backstop.
3. **Draft older than server (409 on sync):** live tab — reconnect save carries stale `expectedVersion` → existing 409 handler. Closed-tab recovery — `baseVersion !== chapterData.version` → draft into editor + `setSaveConflict` + toast → existing dialog. Both paths stamped; no blind overwrite possible.
4. **`baseVersion === null` draft:** if server has a version → treat as conflict (base unprovable); if server has no document → restore + normal save (creates v1 via route's new-doc path, route.ts L152-163).
5. **IndexedDB unavailable (private mode/quota):** `isDraftStoreAvailable()` + per-op try/catch; `putDraft` returns false → `draftSavedAt` stays null → red "Offline — changes not saved"; everything else degrades to exactly today's behavior (in-editor retention + backoff retry).
6. **Buffer hygiene:** delete on save success, no-op adopt, both conflict resolutions, recovery-discard, recovery-equal; prune >14 days at module init.
7. **SSR:** all new modules `"use client"` or `typeof indexedDB === "undefined"` guarded; `useOnlineStatus` server snapshot `true`; `draft-store` never touched during render.
8. **Recovery vs clean-resync race:** recovery only on `isInitialLoad`, and `markDirty()` immediately blocks clean-resync (guard `!paneState.isDirty` at L322) from clobbering the restored draft when react-query refetches (`use-documents.ts:47-51` invalidation).
9. **Chapter switch during async recovery:** apply only if `paneStore.getState().chapterId` still matches (mirror of `isStale` at L409-410); `setChapter` (editor-store.ts:85-93) resets version/conflict so a stale recovery must be dropped.
10. **401 redirect (api-client.ts:26-31):** today a 401 mid-edit hard-redirects and loses words; with the buffer they survive the round-trip through `/login` and are recovered on return — note in PR description as a bonus fix.

---

## 5. TEST PLAN — `tests/e2e/offline-autosave.spec.ts`

Conventions: header `x-e2e-test-secret` via config `extraHTTPHeaders`; helpers from `tests/e2e/fixtures.ts` (`createBookViaApi`, `createChapterViaApi`); unique names `` `${Date.now()}-w${testInfo.workerIndex}` ``; seed content via `request.put(.../content, { data: { markdown } })`; `test.describe.configure({ mode: "serial" })` where state is shared. Key facts: Playwright's `request` fixture is a separate APIRequestContext — it stays online while `context.setOffline(true)` cuts the page, which is exactly what tests 4-5 need; IDB persists per context, so crash-recovery tests reuse one context with `page.close()` → `context.newPage()`. Typing target: `page.locator(".ProseMirror")` (first spec to type into the editor; recommend adding `data-testid="editor-save-status"` to the status `<div>` at editor-status-bar.tsx:204 — first testid in the suite, justified for text-state assertions).

1. **Offline indicator:** open editor, type, `context.setOffline(true)`, type more → expect "Offline — saved on this device".
2. **Sync-on-reconnect:** offline, type marker text, `setOffline(false)` → expect "Saved" within autosave window → `request.get` content contains marker; `version` incremented.
3. **Crash recovery (clean base):** offline, type marker, `page.close()` (beforeunload auto-dismissed), `context.newPage()` → goto editor → expect recovery toast + marker in `.ProseMirror` → wait "Saved" → API content matches.
4. **Recovery conflict (draft older than server):** page offline + type marker A; via `request.put` write external content B (unguarded — bumps version); `page.close()`; reopen → expect "Conflict — click to review" chip; open dialog, assert DiffView, click "Keep mine" → API content = A, no silent overwrite beforehand (assert content was still B before resolution).
5. **Live-tab reconnect 409:** offline + type A; `request.put` B; `setOffline(false)` → expect conflict chip/toast (not "Saved"); assert server still B until user resolves.
6. **Server-down-while-online (route abort):** `page.route("**/chapters/*/content", r => r.request().method() === "PUT" ? r.abort() : r.continue())` → type → expect "Sync pending"; `unroute` → eventually "Saved".
7. **IDB-unavailable degradation:** `page.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined }))` → offline + type → expect "Offline — changes not saved"; reconnect → save still lands (backoff path).
8. **Hygiene:** after test 2's successful sync, evaluate `indexedDB` in page to assert the draft row was deleted.

Run: `npx playwright test offline-autosave --project=chromium` (config `playwright.config.ts`, dev server auto-started, `PLAYWRIGHT_BASE_URL` override for port ≠3000). No unit framework exists in the repo — keep `RecoveryDecision` logic pure inside `use-draft-buffer.ts` anyway for future vitest adoption.

---

## 6. RISKS

- **R1 — manuscript-editor.tsx is 1172 lines, already over the 800-line style cap.** Inline implementation makes it worse; the `use-draft-buffer.ts` extraction is mandatory, and even then ~50-70 wiring lines land in the editor. Do not attempt a broader refactor in this change.
- **R2 — `navigator.onLine` lies** (true behind a dead router). Mitigated by also classifying thrown `TypeError` from `fetchJson` as network (`lastSaveErrorKind`); the "Sync pending" state covers online-but-unreachable.
- **R3 — clean-resync interplay (L318-326)** is the subtlest part: recovery must run strictly once per initial load (`recoveryCheckedRef`) and `markDirty()` before any await-gap completes, or a refetch can overwrite the restored draft. Sequence carefully; test 3 covers it.
- **R4 — pre-existing gap discovered:** the localStorage `wmb-conflict-draft-*` snapshot is **write-only** — grep confirms writes at manuscript-editor.tsx:464,505 and removal at save-conflict-dialog.tsx:67, but no code ever reads it back. The IDB buffer's recovery path supersedes it functionally (the buffer also writes during conflict suspension). Keep the localStorage writes (cheap, zero risk) or remove in a follow-up — do not expand them.
- **R5 — debounce-effect deps:** the effect at L490-532 keys on `[isDirty, isSaving, saveConflict, paneChapterId, saveContent]`; adding `isOnline` to `saveContent`'s closure changes its identity on connectivity flips and re-fires the effect — harmless (timer is cleared/reset) but reviewers should expect it; prefer reading online state from a ref inside `saveContent` to avoid the churn.
- **R6 — buffer write during in-flight save:** a draft serialized between PUT dispatch and `setLastSaved` is deleted by the success-path clear even though it may contain newer keystrokes than what was saved; the next 2s buffer tick recreates it. Window identical to today's autosave dirty-window — accept, but document in code.
- **R7 — Playwright `page.close()` + beforeunload:** default `runBeforeUnload: false` silently bypasses the prompt — fine for crash simulation; do not assert prompt behavior in e2e (untestable reliably), keep the prompt logic trivially simple instead.
- **R8 — split-view, same chapter in two panes** shares one buffer key and two TipTap instances; they already race via CAS today, and the buffer adds last-writer-wins on the mirror only — acceptable, note in code comment.
- **R9 — new dependency `idb`** in a repo with pinned tiptap overrides — no conflict expected, but lockfile churn; pin exact version.
- **R10 — expectation leak to the documents editor:** it has no CAS, no failure feedback, fixed 2s debounce with swallowed errors (`documents/[documentId]/page.tsx:288-307`). Shipping offline UX in the chapter editor makes that page's silent loss more surprising by contrast — file a follow-up ticket (minimum: failure toast + backoff there; full parity requires adding `expectedVersion` to the PATCH route first).