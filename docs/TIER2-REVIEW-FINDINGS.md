## [high] Unbounded full-history DocumentVersion scan on three per-request hot paths
**File:** D:/Projects/wmb-pub/src/lib/writing-stats.ts:54-71

The window-boundary fix removed the old `createdAt: { gte: since }` filter entirely, so getDailyWordCounts now fetches EVERY CHAPTER_CONTENT version ever created, on every render of: dashboard (userId scope, 7d window, src/app/(app)/dashboard/page.tsx:115), book overview (365d, src/app/(app)/books/[bookId]/page.tsx:107), writing-stats API, and writing-wrapped (userId, 365d). All four are force-dynamic/per-request with no caching. Row-count quantification: the editor autosave (manuscript-editor.tsx:320-351, 2s debounce; editor-store setLastSaved resets isDirty) creates one DocumentVersion row + one S3 object per save cycle, i.e. one row per ~2-4s of continuous typing — realistically several hundred to ~1,500 rows per hour of active writing, plus agent_write/import versions. An 80-100k-word novel drafted and edited over ~100+ hours plausibly accumulates 10^4-10^5 rows; the userId-scoped dashboard/wrapped queries multiply that across all of a user's books, just to compute 7 (dashboard) day buckets. At 10^5 rows this is a multi-second query and tens-to-hundreds of MB of Prisma objects per page view, growing without bound. Schema offers no mitigation: document_versions has only the @@unique([documentId, version]) index (no createdAt index) and documents has no index on (bookId, type) at all (prisma/schema.prisma:230-263). Fix: fetch only in-window versions PLUS one pre-window baseline per document (e.g. raw SQL DISTINCT ON (document_id) ... WHERE created_at < windowStart ORDER BY document_id, version DESC), or aggregate day buckets DB-side, or maintain a daily rollup table; add supporting indexes.

**FIX:** Minimal fix in src/lib/writing-stats.ts (preserves exact window-boundary semantics): (1) Restore `createdAt: { gte: windowStart }` to the findMany at line 56 (windowStart = today minus `days`). (2) Add one cheap baseline query for the latest pre-window version per document, and seed the delta loop with it instead of 0: e.g. raw SQL `SELECT DISTINCT ON (dv.document_id) dv.document_id, dv.word_count FROM document_versions dv JOIN documents d ON d.id = dv.document_id WHERE d.type = 'CHAPTER_CONTENT' AND (d.book_id = $1 / book in user's books) AND dv.created_at < $2 ORDER BY dv.document_id, dv.version DESC` (or Prisma `groupBy({ by: ['documentId'], _max: { version: true }, where: { createdAt: { lt: windowStart }, document: {...} } })` followed by one targeted findMany on the (documentId, version) pairs — both ride the existing @@unique([documentId, version]) index). In the loop at line 93, change `prevWordCount = i > 0 ? docVersions[i-1].wordCount : 0` to fall back to `baseline.get(documentId) ?? 0`. Behavior is identical to the current full-scan version: first in-window version diffs against its true predecessor; a document's first-ever version still attributes its full count. (3) prisma/schema.prisma: add `@@index([documentId, createdAt])` (or at minimum `@@index([createdAt])`) to DocumentVersion and `@@index([bookId, type])` to Document, plus a migration. Optional later hardening: a daily rollup table or DB-side day bucketing, but the above bounds every request to in-window rows + one row per document and is sufficient.

---

## [medium] Writing Wrapped mixes trailing-365-day word stats with calendar-year stats; wordsPerMonth folds two different years into one chart
**File:** D:/Projects/wmb-pub/src/app/api/writing-wrapped/route.ts:69-78

The route is labeled and consumed as 'Your {year} in Writing' (returns year = current year; sessions and findings ARE calendar-year filtered via yearStart/yearEnd at lines 14-16/33/49), but the new daily-delta stats use a trailing 365-day window: getDailyWordCounts({ userId, days: 365 }). Consequences as of today (2026-06-10): (1) wordsPerMonth buckets by month index only (day.date.slice(5,7)), so words written Jul-Dec 2025 render as the Jul-Dec bars of the '2026' wrapped, and peakMonth can name a 2025 month as 'Your peak month' for 2026; (2) longestStreak/totalDaysWriting cover mid-2025-to-now, not the labeled year. Note the spec (docs/TIER2-IMPLEMENTATION-SPEC.md A5) did prescribe days: 365, so this is spec-compliant, but the resulting payload is internally inconsistent (year-scoped sessions/findings vs trailing-window word stats under one year label). Cheap fix: filter dailyCounts to date >= `${year}-01-01` before bucketing/streaks, or compute days = days-since-Jan-1 (clamped to >=1).

**FIX:** Minimal fix in src/app/api/writing-wrapped/route.ts: scope the daily counts to the labeled calendar year before deriving anything from them. Either (preferred, one conceptual change) filter after fetch — replace lines 69-70 with: const dailyCounts = (await getDailyWordCounts({ userId: user.id, days: 365 })).filter((d) => d.date >= `${year}-01-01`); const { bestStreak, activeDays } = computeStreaks(dailyCounts); — the existing wordsPerMonth bucketing and peakMonth code below then become correct unchanged, since only YYYY=year dates remain. Or equivalently compute the window size: const days = Math.max(1, Math.floor((Date.now() - yearStart.getTime()) / 86400000) + 1) and pass that to getDailyWordCounts. Tradeoff to accept (or note in copy): bestStreak becomes 'longest streak this year' (a streak spanning New Year's Eve is truncated at Jan 1), which actually matches the deck's framing. Optional polish in src/components/book/year-in-writing-wrapped.tsx: change the hardcoded 'out of 365 days' streak-card copy to a dynamic denominator (days elapsed in the year) or 'this year', since totalDaysWriting will now max out at days-since-Jan-1, not 365.

---

## [high] Ghost text: global Tab-capture handler can insert hidden/stale suggestions into the manuscript
**File:** src/components/editor/ai-ghost-text.tsx:152-174

The Tab/Escape keydown handler is attached at document level with capture and is gated only on `suggestion && editor` — not on `enabled`, editor focus, or overlay visibility. The render guard (`if (!suggestion || !position || !enabled) return null`, line 174) hides the overlay when the user toggles ghost text OFF, but `suggestion` state is never cleared and the handler stays attached, so pressing Tab inserts AI text the user cannot see and preventDefaults Tab globally. Same mechanism misfires in split view: with a suggestion active in pane A and keyboard focus in pane B (each pane mounts its own AIGhostText with its own document-level handler), Tab inserts into pane A at pane A's cursor. It also misfires within one pane: clicking elsewhere in the doc (selection change without doc change) neither dismisses nor re-anchors the suggestion, so Tab inserts at the new cursor position while the ghost renders at the old one. Fix: clear `suggestion` when `enabled` goes false, gate the handler on `enabled && editor.isFocused`, and dismiss on `selectionUpdate`. (Component existed at HEAD but was dead code — this change wires it into manuscript-editor, making these paths live.)

**FIX:** Three minimal changes in src/components/editor/ai-ghost-text.tsx:

1. Gate the keydown effect on `enabled` and require editor focus to accept (lines 153-172):
```tsx
useEffect(() => {
  if (!suggestion || !editor || !enabled) return;
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      if (!editor.isFocused) return; // ignore Tab from other panes/inputs
      e.preventDefault();
      editor.commands.insertContent(suggestion);
      setSuggestion(null);
    } else if (e.key === "Escape" || e.key.length === 1) {
      setSuggestion(null);
    }
  };
  document.addEventListener("keydown", handler, { capture: true });
  return () => document.removeEventListener("keydown", handler, { capture: true });
}, [suggestion, editor, enabled]);
```

2. Clear all pending state when the feature is disabled (also fixes the pending-timer leak the claim missed):
```tsx
useEffect(() => {
  if (enabled) return;
  setSuggestion(null);
  if (pauseTimer.current) clearTimeout(pauseTimer.current);
  abortRef.current?.abort();
}, [enabled]);
```
(Equivalently, add the clearTimeout/abort/setSuggestion(null) to the cleanup of the monitor effect at lines 122-124.)

3. Dismiss on selection-only changes:
```tsx
useEffect(() => {
  if (!editor || !suggestion) return;
  const dismiss = () => setSuggestion(null);
  editor.on("selectionUpdate", dismiss);
  return () => { editor.off("selectionUpdate", dismiss); };
}, [editor, suggestion]);
```
Note: `insertContent` itself triggers a `selectionUpdate`, which redundantly calls `setSuggestion(null)` after accept — harmless.

---

## [medium] Ghost text: pending timer and in-flight fetch survive edits/disable — stale suggestion reappears and paid LLM calls fire after toggle-off
**File:** src/components/editor/ai-ghost-text.tsx:85-125

The update-listener effect cleanup only does `editor.off("update", handleUpdate)` — it does not clear `pauseTimer` or abort `abortRef`. Two consequences: (1) toggling ghost text off while the 1.5s timer is pending still fires `fetchSuggestion` → a billable haiku call for a feature the user just disabled (and the resolved suggestion re-arms the hidden Tab handler, compounding the previous finding); (2) `handleUpdate` clears the suggestion on edit but never aborts the in-flight fetch — the abort only happens when a NEW fetch starts — so a request issued for the pre-edit text can resolve mid-typing and display a stale suggestion anchored to the previous pause's position. Fix: abort + clear timer in `handleUpdate` and in the effect cleanup.

**FIX:** Two minimal edits in src/components/editor/ai-ghost-text.tsx, exactly as the reviewer proposes:

1. Abort the in-flight fetch in handleUpdate (line ~93, alongside the existing timer clear):
   const handleUpdate = () => {
     setSuggestion(null);
     if (abortRef.current) abortRef.current.abort();   // ADD: kill in-flight request for pre-edit text
     if (pauseTimer.current) clearTimeout(pauseTimer.current);
     ...
   };

2. Clear timer + abort in the update-listener effect cleanup (lines 122-124):
   return () => {
     editor.off("update", handleUpdate);
     if (pauseTimer.current) clearTimeout(pauseTimer.current);  // ADD: cancel pending 1.5s trigger on disable/chapter switch
     if (abortRef.current) abortRef.current.abort();            // ADD: cancel in-flight request
   };

The abort in cleanup also disarms the hidden-Tab-handler consequence: both setSuggestion paths in fetchSuggestion are guarded by !controller.signal.aborted (line 74) or land in the catch (line 77), so an aborted request can never set suggestion state after toggle-off. Optional belt-and-braces (addresses the related earlier finding directly): add `enabled` to the keydown effect's gate — `if (!suggestion || !editor || !enabled) return;` at line 154. No regressions: aborting on edit is the desired behavior (the suggestion would have been dismissed anyway), and the cleanup also runs on chapter/editor change where cancelling cross-chapter requests is equally correct.

---

## [high] Immersive mode: entire session's edits silently lost if the component unmounts without exit
**File:** src/components/editor/manuscript-editor.tsx:526-541, 872-881

While immersive, edits live only in `immersiveHtmlRef` and the contentEditable DOM — the tiptap editor, pane store (isDirty stays false), and autosave are untouched until `exitImmersive` runs. If ManuscriptEditor unmounts without exit — browser Back/Forward (Next.js client nav still works under the z-[100] overlay), tab close, or crash — everything written in the session is discarded with no warning (the repo has no beforeunload guard anywhere, and isDirty is false so even a future guard wouldn't trigger). Since immersive mode is designed for long uninterrupted sessions, a 1-hour zen session can vanish. The deliberate exit-only sync is fine for undo-history reasons, but it needs a safety net: sync the ref into the editor + markDirty on unmount (cleanup effect), and/or periodic (e.g. 30-60s) background sync and a visibilitychange/beforeunload flush. Minor related note: exiting browser fullscreen via the browser's own UI (not Escape) leaves the overlay up, which is fine, but those users then exit via the hover-only top bar — the only discoverable exit.

**FIX:** Add a periodic safety-net sync in ManuscriptEditor (src/components/editor/manuscript-editor.tsx), next to the existing immersive callbacks: while `immersive` is true, every 30s sync the ref into tiptap and mark dirty so the existing 2s-debounced autosave persists it. This bounds worst-case loss to ~32s for ALL death modes (back/forward nav, tab close, crash, power loss) and reuses the existing save pipeline. It does not disturb the overlay: the contentEditable renders from `immersiveContent` state (set once on enter), so writing to the hidden editor causes no re-render/cursor loss; undo history gains one coarse step per interval, preserving the deliberate exit-only design's intent.

```tsx
// Safety net: while immersive, periodically sync edits into tiptap so autosave runs.
const lastSyncedRef = useRef("");
useEffect(() => {
  if (!immersive || !editor) return;
  lastSyncedRef.current = immersiveHtmlRef.current;
  const id = setInterval(() => {
    if (immersiveHtmlRef.current !== lastSyncedRef.current) {
      lastSyncedRef.current = immersiveHtmlRef.current;
      editor.commands.setContent(immersiveHtmlRef.current); // emitUpdate defaults false in tiptap v3
      paneStore.getState().markDirty();
    }
  }, 30_000);
  return () => clearInterval(id);
}, [immersive, editor, paneStore]);
```

(Compare against a lastSyncedRef, not editor.getHTML(), since tiptap normalizes HTML and would cause spurious syncs.) Optionally, for near-zero loss on tab close, also add a `pagehide` listener while immersive that does the same setContent then PUTs `getMarkdownFromEditor(editor)` to `/api/books/${bookId}/chapters/${chapterId}/content` via fetch with `keepalive: true` — but the interval alone is the minimal acceptable fix. Do NOT rely on an unmount cleanup with markDirty: it cannot trigger the debounced autosave on an unmounting component and the editor may already be destroyed.

---

## [medium] Toolbar overflow dropdown: soundscape/read-aloud unmount on menu close — audio stops, popover interaction closes the menu
**File:** src/components/editor/editor-toolbar.tsx:395-401

In overflow mode (<650px container — which is the normal state for split-view panes), AmbientSoundscape and ReadAloud are rendered inside Radix DropdownMenuContent, which unmounts its children when the menu closes. AmbientSoundscape stops sound and closes its AudioContext on unmount (ambient-soundscape.tsx 213-222) and ReadAloud cancels speech on unmount (read-aloud.tsx 71-73), so playback only lasts while the 'More tools' menu is held open. Worse, opening the soundscape's own Popover from inside the menu portals its content outside the dropdown, so interacting with it triggers the dropdown's interact-outside dismissal → menu closes → soundscape unmounts → audio dies immediately. The feature is effectively unusable in narrow layouts. Also, resizing across the 650px threshold while playing swaps inline ↔ dropdown rendering and kills audio. Consider lifting playback state to a module-level/global store or a singleton audio controller so mount position doesn't own the AudioContext.

**FIX:** Minimal fix (no architecture change): never render the audio components inside the dropdown, and give them a single stable mount position that does not change with overflow state. In src/components/editor/editor-toolbar.tsx: (a) delete the {ctx.paneId !== "secondary" && (...AmbientSoundscape/ReadAloud...)} blocks from BOTH the 'tools' group's render() (lines ~318-324) and renderDropdownItems() (lines ~395-401); (b) in the EditorToolbar JSX root, render them once outside the showOverflow conditional — e.g. immediately after the primary/secondary section and before the ml-auto save badge: {paneId !== "secondary" && (<><Separator orientation="vertical" className="mx-1 h-6" /><AmbientSoundscape /><ReadAloud text={editor.getText()} /></>)}. This fixes all three failure modes at once: audio no longer unmounts on menu close, the Popover-inside-modal-DropdownMenu focus/dismissal jank disappears, and crossing the 650px threshold no longer remounts the components (stable React position in both states). Cost is ~2-3 compact size-7 icon buttons of toolbar width in narrow panes, which fits. If toolbar space in very narrow panes ever becomes unacceptable, the fuller fix is the reviewer's suggestion: move playback ownership out of the components into a module-level singleton/zustand store (mirroring the existing getOrCreatePaneStore pattern in src/stores/editor-store.ts) so the AudioContext/speech queue survives any mount-position change — but that is not needed for correctness today.

---

## [medium] Focus level 1 ('Focused — sidebar & header dimmed') is a complete no-op
**File:** src/app/globals.css:639-641

The `.wmb-focus-1` ruleset in globals.css is empty (just a comment), and `getFocusLevelClasses(1)` applies the class to the editor column wrapper (manuscript-editor.tsx 598-602), which is a descendant of the layout — it cannot reach the sidebar/header even with the sibling-selector CSS sketched in graduated-focus.tsx 117-120 (`.wmb-focus-1 ~ aside`), which was never added. Selecting 'Focused' in either the GraduatedFocus popover or the overflow menu changes the active highlight and nothing else. Either implement it (e.g., set a class/data-attribute on a layout ancestor, or target the sidebar via :has()) or hide level 1 the same way level 3 was hidden this phase. For contrast, level 2 works: Focus extension `mode: "shallowest"` + `className: "has-focus"` (editor-utils.ts 108-111) correctly matches `.wmb-focus-2 .ProseMirror > .has-focus` (and incidentally revives the previously-dead `.tiptap.focus-mode` CSS at globals.css 369-377).

**FIX:** Two minimal options; pick one. Option A (implement, CSS-only, ~10 lines, no TSX changes) — use :has() from a layout ancestor, since the shadcn sidebar renders data-slot attributes (src/components/ui/sidebar.tsx: sidebar-container at line 230, sidebar-inset at 310) and AppHeader renders a plain <header> as SidebarInset's first child (app-header.tsx:100). Add to globals.css replacing the empty .wmb-focus-1 ruleset at 639-641:

body:has(.wmb-focus-1) [data-slot="sidebar-container"],
body:has(.wmb-focus-1) [data-slot="sidebar-inset"] > header {
  opacity: 0.3;
  transition: opacity 0.5s ease;
}
body:has(.wmb-focus-1) [data-slot="sidebar-container"]:hover,
body:has(.wmb-focus-1) [data-slot="sidebar-inset"] > header:hover {
  opacity: 1;
}

(:has() is supported in all evergreen browsers since late 2023; this also behaves correctly in split view since either pane's wrapper triggers it.) Option B (hide, consistent with how level 3 was handled this phase): remove the level-1 entry from FOCUS_LEVELS (graduated-focus.tsx:35) and FOCUS_LEVEL_MENU_ITEMS (editor-toolbar.tsx:114), and change getFocusLevelClasses case 1 to return "" so any stale store value is inert. Option A is recommended — it delivers the advertised feature for the cost of one CSS block.

---

## [medium] Ghost-text route: '${provider}/haiku' registry miss for openai/gemini/grok defaults → silent sonnet fallback, and guaranteed 500 loop for single-key users
**File:** src/app/api/books/[id]/ghost-text/route.ts:44-79

The route builds `haikuRegistryId = `${provider}/haiku`` from the user's defaultModel prefix, but the registry only defines /haiku variants for anthropic and openrouter-* providers — there is no openai/haiku, gemini/haiku, or grok/haiku. `createLLMClient` then misses `getModelDef`, and `resolveFromTier` (model-registry.ts 483-489) silently falls back to **anthropic/sonnet**. Two consequences: (a) for an openai/gemini/grok-default user who also has an anthropic or openrouter key, ghost text quietly runs on sonnet instead of haiku — breaking the cheap-model assumption for a feature that auto-fires on every 1.5s typing pause; (b) for a user with ONLY that provider's key, the early `resolveProviderRoute(provider, ...)` guard passes (their key routes fine) but `createLLMClient` then resolves the anthropic-provider fallback model, finds no anthropic/openrouter key, and throws → 500 ('Failed to generate suggestion') on every typing pause for as long as the toggle is on. This flaw is inherited verbatim from the inline-edit route (same lines there), but ghost-text amplifies it from one-click-per-use to continuous background failures. Map the haiku variant per provider (e.g. openai/gpt-4o-mini, gemini/2.5-flash, grok/grok-3-mini) or guard the registry lookup before calling the LLM. Otherwise the route correctly mirrors the inline-edit pattern: same use_agent_session quota key, same BYOK key loading, same { error } envelopes and status codes.

**FIX:** Resolve the cheap model through the registry instead of string-building the ID. Add a helper to src/lib/llm/model-registry.ts: `export function resolveCheapModelFor(defaultModelId: string): ModelDefinition { const prefix = defaultModelId.split("/")[0]; const byPrefix = getModelDef(`${prefix}/haiku`); if (byPrefix) return byPrefix; // anthropic, openrouter, openrouter-* variants
const def = getModelDef(defaultModelId); const provider = def?.provider ?? "anthropic"; return MODEL_REGISTRY.find((m) => m.provider === provider && m.tier === "haiku") ?? getModelDef("anthropic/haiku")!; }`. This maps openai→openai/gpt-4o-mini, gemini→gemini/2.0-flash, grok→grok/grok-3-mini, and keeps openrouter-minimax/haiku etc. working. In ghost-text/route.ts (lines 44-79): `const cheap = resolveCheapModelFor(userDefault);` then pass `cheap.provider` (a real LLMProvider, not the string prefix) to the early resolveProviderRoute guard and `cheap.id` as modelId to createLLMClient — this fixes both the sonnet fallback and the 500 loop, and also fixes the 400 loop for openrouter-variant defaults. Minimal scope is the new ghost-text route, but the identical pattern should be fixed in the three pre-existing committed routes (inline-edit/route.ts:45-47, character-chat/route.ts:96-98, wiki/populate/route.ts:140-142) since the helper makes that a 3-line change each. Also worth using `model.modelId` consistency check or a unit test asserting every provider prefix used by these routes resolves to a tier:"haiku" registry entry.

---

## [medium] Lockfile drift: @tiptap/core, @tiptap/extensions, @tiptap/pm floated to 3.26.0 while @tiptap/react, starter-kit, and all extension packages remain 3.19.0
**File:** D:\Projects\wmb-pub\package-lock.json:node_modules/@tiptap/core, node_modules/@tiptap/extensions, node_modules/@tiptap/pm entries

Installing @tiptap/extension-focus re-resolved shared deps: lockfile now has core/extensions/pm at 3.26.0 but @tiptap/react, @tiptap/starter-kit, and every extension-* package (including the new extension-focus) at 3.19.0. Peer ranges (^3.19.0) are satisfied so npm ci and tsc both pass, but tiptap publishes all packages in lockstep and a 3.19-react-bindings + 3.26-core combination is untested upstream — mixed minors across the tiptap monorepo are a known source of subtle editor breakage (schema/plugin mismatches). package.json itself is consistent (all ^3.19.0). Fix: align to a single version — either update all @tiptap/* deps to ^3.26.0 and reinstall, or add npm overrides holding core/extensions/pm at 3.19.0.

**FIX:** Minimal fix (hold the lockstep set at 3.19.0, matching what main shipped — lowest behavioral risk):

1. In D:\Projects\wmb-pub\package.json, pin the direct dep exactly: "@tiptap/pm": "3.19.0" (npm requires a direct dep's spec to match its override), and add:
   "overrides": {
     "@tiptap/core": "3.19.0",
     "@tiptap/extensions": "3.19.0"
   }
2. Run `npm install` to regenerate the lockfile, then verify with `npm ls @tiptap/core @tiptap/pm @tiptap/extensions` — all should report 3.19.0 with no invalid markers.

Alternative (equally valid, slightly larger change): bump all seven direct @tiptap/* deps in package.json to ^3.26.0 and `npm install` — since 3.26 packages exact-pin their peers, npm will then enforce lockstep automatically on every future install, preventing recurrence. Choose this if you'd rather move forward than hold back; do not ship the current mix.

Optional hygiene while there: declare "@tiptap/core" as a direct dependency, since src/components/editor/annotation-extension.ts imports it directly (currently a phantom dependency riding on hoisting).

---

## [medium] getDailyWordCounts fetches the entire DocumentVersion history with no date bound — dashboard previously filtered to 7 days
**File:** D:\Projects\wmb-pub\src\lib\writing-stats.ts:54-71

The window-boundary fix removed the createdAt filter entirely: every call now loads ALL CHAPTER_CONTENT DocumentVersion rows for the scope. The dashboard (7-day window, userId scope) previously queried only versions from the last 7 days; it now pulls a user's full multi-book version history on every render, as do the book page and wrapped route (365-day windows). For long-lived books (hundreds of versions per chapter) this is thousands of rows per page load. The fix only needs each document's single latest pre-window version as the diff baseline, not the full sequence — e.g. fetch versions with createdAt >= windowStart plus one extra version per document below the boundary (or compute deltas in SQL with a window function). Correctness is fine; this is a performance regression relative to the old dashboard query.

**FIX:** Minimal fix, confined to getDailyWordCounts in D:\Projects\wmb-pub\src\lib\writing-stats.ts (no call-site or response-shape changes):

1. Build dailyMap FIRST (move the existing zero-fill loop up), then derive the window start from the same keys to avoid boundary drift: `const oldestKey = [...dailyMap.keys()].sort()[0]; const windowStart = new Date(oldestKey + "T00:00:00.000Z");`

2. Add the bound back to the main query: `where: { createdAt: { gte: windowStart }, document: { ... } }` (rest of the query unchanged).

3. Fetch one baseline per document that has in-window versions:
```ts
const docIds = [...new Set(versions.map((v) => v.documentId))];
const baselineAgg = docIds.length
  ? await db.documentVersion.groupBy({
      by: ["documentId"],
      where: { documentId: { in: docIds }, createdAt: { lt: windowStart } },
      _max: { version: true },
    })
  : [];
const baselineRows = baselineAgg.length
  ? await db.documentVersion.findMany({
      where: { OR: baselineAgg.map((b) => ({ documentId: b.documentId, version: b._max.version! })) },
      select: { documentId: true, wordCount: true },
    })
  : [];
const baselineByDoc = new Map(baselineRows.map((r) => [r.documentId, r.wordCount]));
```

4. In the delta loop, change the iteration to `for (const [docId, docVersions] of byDoc)` and seed the first delta from the baseline instead of 0: `const prevWordCount = i > 0 ? docVersions[i - 1].wordCount : (baselineByDoc.get(docId) ?? 0);`. Documents with no pre-window version get baseline 0, preserving the existing "first version attributes its entire word count" behavior. Also update the misleading comment at lines 54-55 and the doc comment at lines 37-41.

This preserves exact output (the window-boundary fix included) while reducing the fetch to in-window rows + at most one row per document, via two cheap extra queries (groupBy uses the existing @@unique([documentId, version]) index). A single raw SQL query with LAG() would be faster still but is a larger change than needed. Optional follow-up outside this function: a version-retention/pruning policy, since DocumentVersion rows currently grow unboundedly on every 2s-debounced autosave.

---
