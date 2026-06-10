# Phase 2 Consolidated Implementation Plan — wmb-pub (`feat/tier1-agent-wiring`)

## 1. VERIFIED FACTS

All load-bearing claims from the three reader specs were re-verified against the working tree. **No corrections required** — every anchor checked out:

**Streaks/word-count source of truth**
- `src/app/(app)/books/[bookId]/page.tsx` hardcodes `currentStreak={0}` / `todayWords={0}` (lines 525–526) and `currentStreak={0}` (line 550); `LifetimeStats` (553–557) omits `longestStreak`/`totalDaysWriting`.
- `src/app/api/books/[id]/writing-stats/route.ts` already implements `getDailyWordCounts` (lines 14–72) and `computeStreak` (78–119); GET response = `{ dailyCounts, todayWords, streak, weeklyAvg, totalWords, goals }`. **Confirmed bug**: the version query filters `createdAt: { gte: since }` (line 25) while delta computation uses `i > 0 ? prev.wordCount : 0` (line 58) — a document's first in-window version is diffed against 0, inflating that day by the chapter's entire prior word count.
- `src/app/(app)/dashboard/page.tsx` **confirmed bug**: lines 87–94 fetch raw `DocumentVersion.wordCount` (all document types, user-scoped) and lines 122–133 SUM raw snapshots per day — two saves of a 50k-word chapter count 100k "words written".
- `src/app/api/writing-wrapped/route.ts` **confirmed placeholders**: `wordsPerMonth = Array(12).fill(0)`, `peakMonth = 0` (68–69), `longestStreak: 0`, `totalDaysWriting: 0` (95–96); `favoriteWritingHour` derived from agent sessions only.
- All existing day bucketing is UTC via `toISOString().split("T")[0]`.

**Editor features**
- `package.json` has tiptap v3.19 packages but **no `@tiptap/extension-focus`** — the `.has-focus` CSS hooks in `globals.css` (`.wmb-focus-1/2/3`, lines 639–662) have no producer.
- `editor-toolbar.tsx`: `<GraduatedFocus />` mounted bare at line 289 inside the "tools" group; component accepts `currentLevel`/`onChange`/`onEnterImmersive` (graduated-focus.tsx:26–28) which are never passed; `getFocusLevelClasses` (line 101) is dead code. Overflow: groups collapse below `OVERFLOW_THRESHOLD = 650` (line 98); only `renderDropdownItems` content (line 321 for tools group) survives.
- `manuscript-editor.tsx` anchors confirmed: editor column wrapper `<div className="flex flex-col flex-1 min-w-0 h-full">` line 569; `ChapterContextHeader` 648; `EditorToolbar` 659; `FloatingAgentInput` 724–731; `TypewriterMode` 790.
- `src/stores/editor-store.ts`: `EditorPaneState` (line 7) has `focusMode`/`showFindings`/`showAnnotations`/`showFloatingInput`; no `focusLevel`/`ghostTextEnabled`.
- **No ghost-text route exists** (glob `src/app/api/books/[id]/ghost-text/**` → empty). `inline-edit/route.ts` is the canonical AI route (requireUser → ownership → checkQuota → BYOK `${provider}/haiku` → usageRecord).
- `branches/route.ts` confirmed stub: GET returns `[]`, POST returns 501; switch/merge/delete route files don't exist. VersionBranching UI is live in `chapter-context-header.tsx`.

**Radar/plans**
- `story-radar.tsx` **confirmed shape mismatch**: `useQuery<{ issues: RadarIssue[] }>` reads `data?.issues` (lines 46–53) but `radar/route.ts` returns `{ alerts, lastAnalyzed, bookHealth }` (88–92) with fields `{type, severity, title, detail, chapterNumber}`. Widget permanently renders "All clear"; no error state (badge gated only on `!isLoading`, line 72).
- `proactive-notifications.tsx` line 99: stale-chapter href uses `ch.chapterNumber` but the chapter page resolves by cuid → guaranteed 404. Streak branch (66–75) is dead due to hardcoded 0 props.
- Daily-plan API/component wiring is correct and honest (ship with cosmetic polish only).
- `SessionProgressPipeline` and `CelebrationBanner`: zero importers (dead code).

---

## 2. CHANGE PLAN (ordered)

### Part A — Real `todayWords` + `currentStreak` (do first; unblocks A4/A5 and C3)

**A1. NEW `src/lib/writing-stats.ts`** (server lib, convention of `src/lib/validation.ts`):
- `export async function getDailyWordCounts(opts: { bookId?: string; userId?: string; days: number }): Promise<Array<{ date: string; words: number }>>`
  Port route.ts:14–72 with two changes:
  1. Where clause: `{ document: { type: "CHAPTER_CONTENT", ...(opts.bookId ? { bookId: opts.bookId } : {}), ...(opts.userId ? { book: { userId: opts.userId } } : {}) } }`. Throw if neither/both provided.
  2. **Window-boundary fix**: remove the `createdAt: { gte: since }` filter; fetch all versions (same `select`/`orderBy`), compute deltas across the full per-document sequence, attribute only deltas whose `createdAt` lands inside the window to `dailyMap` (keep zero-filled init and `Math.max(0, delta)`; first-ever version still attributes full wordCount to its creation day).
- `export function computeStreaks(dailyCounts): { currentStreak: number; bestStreak: number; activeDays: number }` — `currentStreak` = port `computeStreak` (route.ts:78–119) verbatim; `bestStreak` = longest consecutive-date run with `words > 0` (forward scan of date-sorted array); `activeDays` = count of `words > 0`.
- `export function getTodayWords(dailyCounts): number` — UTC today-key lookup (route.ts:162–164).
- All date keys stay UTC `toISOString().split("T")[0]` (see Risks §4).

**A2. Refactor `src/app/api/books/[id]/writing-stats/route.ts`**: delete lines 8–119; import from `@/lib/writing-stats`; call `getDailyWordCounts({ bookId: id, days: query.days })` and `computeStreaks(...).currentStreak`. **Response shape unchanged** (`useWritingStats` hook + WritingDashboard/GoalProgressCard/DailyWordChart depend on it). Optionally add `bestStreak` additively. POST handler untouched.

**A3. Book page `src/app/(app)/books/[bookId]/page.tsx`**: after the existing `Promise.all` (~lines 65–96):
```ts
const dailyCounts = await getDailyWordCounts({ bookId, days: 365 });
const { currentStreak, bestStreak, activeDays } = computeStreaks(dailyCounts);
const todayWords = getTodayWords(dailyCounts);
```
(365 days so streaks aren't truncated; `writingStatsQuerySchema` already allows 365.) Replace line 525 → `currentStreak={currentStreak}`, 526 → `todayWords={todayWords}`, 550 → `currentStreak={currentStreak}`. Extend `LifetimeStats` (553–557) with `longestStreak={bestStreak}` `totalDaysWriting={activeDays}`.

**A4. Dashboard chart fix `src/app/(app)/dashboard/page.tsx`**: remove the `recentActivity` `documentVersion.findMany` entry from the `Promise.all` (lines 87–94); after the `Promise.all`, `const dailyCounts = await getDailyWordCounts({ userId: user.id, days: 7 })`. Delete the raw-sum bucketing (122–133); build `activityDays` directly from the helper output (already zero-filled, date-sorted), keeping the weekday `label` mapping (line 137) and `weeklyTotal`/`maxWords` (139–140).

**A5. Writing Wrapped `src/app/api/writing-wrapped/route.ts`**: add `const dailyCounts = await getDailyWordCounts({ userId: user.id, days: 365 })`. Replace placeholders: `longestStreak = computeStreaks(dailyCounts).bestStreak`; `totalDaysWriting = activeDays`; `wordsPerMonth` = bucket `dailyCounts` by `date.slice(5,7)` into 12 slots; `peakMonth = wordsPerMonth.indexOf(Math.max(...wordsPerMonth))`. When `sessions.length === 0`, return `favoriteWritingHour: null` instead of fabricated 14.
**A6. `src/components/book/year-in-writing-wrapped.tsx`**: build `cards` conditionally — skip Card 3 when `longestStreak === 0 && totalDaysWriting === 0`; skip Card 5 when `wordsPerMonth.every(w => w === 0)`; skip Card 4 when `favoriteWritingHour == null` (widen the type to `number | null`).

### Part B — Editor features (each independent; order = effort)

**B1. AmbientSoundscape + ReadAloud (mount, client-only).** In `editor-toolbar.tsx` "tools" group `render()` (after `<GraduatedFocus />`, line 289): add `<AmbientSoundscape />` and `<ReadAloud text={ctx.editor.getText()} />`. **Split-pane guard**: thread the existing `paneId` from ManuscriptEditor into `EditorToolbarProps` → `ToolbarGroupContext` and render both audio components only when `ctx.paneId !== "secondary"` (prevents two AudioContexts in split mode). Add matching entries (or at minimum the same gating) in the tools group's `renderDropdownItems` (line 321) so they survive <650px overflow.

**B2. GraduatedFocus wiring (fix mounted-but-broken).**
- `editor-store.ts`: add `focusLevel: 0 | 1 | 2 | 3` (default 0) + `setFocusLevel(level)` to `EditorPaneState`, following the `focusMode`/`toggleFocusMode` pattern (lines 19/33/54/80).
- `manuscript-editor.tsx`: read `focusLevel`/`setFocusLevel` from the pane store; pass through `EditorToolbar` props → `ToolbarGroupContext` → `<GraduatedFocus currentLevel={ctx.focusLevel} onChange={ctx.setFocusLevel} />` (line 289). Apply `getFocusLevelClasses(focusLevel)` to the wrapper div at line 569 (`cn("flex flex-col flex-1 min-w-0 h-full", getFocusLevelClasses(focusLevel))`).
- `npm i @tiptap/extension-focus` (pin `^3.19.0` to match siblings); in `src/components/editor/editor-utils.ts` `createEditorExtensions` add `Focus.configure({ className: "has-focus", mode: "shallowest" })`.
- Level 3 (`.is-current-sentence`) has no producer: ship level 3 as paragraph-equivalent (same CSS effect as level 2) — do NOT build a sentence-decoration plugin this phase; optionally hide the level-3 menu item.

**B3. ImmersiveFocusMode (mount via GraduatedFocus trigger).** In `manuscript-editor.tsx`: add local `const [immersive, setImmersive] = useState(false)`; pass `onEnterImmersive={() => setImmersive(true)}` through the toolbar context into GraduatedFocus (this reveals its hidden "Immersive" entry, graduated-focus.tsx:77–84). Render `<ImmersiveFocusMode>` at component top level when `immersive`. **Content contract**: pass `content={editor.getHTML()}`; sync back ONLY on exit — `editor.commands.setContent(finalHtml); markDirty();` — never per keystroke (preserves undo history, triggers autosave). Accept fidelity limited to contentEditable HTML.

**B4. PacingHeatmap + ProseSyntaxHighlight (mount as strip).** In `manuscript-editor.tsx`, between `<EditorToolbar />` (659) and the editor content area (~690): render a horizontal strip `<div className="flex gap-2 px-2">` containing `<PacingHeatmap text={getMarkdownFromEditor(editor)} />` and `<ProseSyntaxHighlight text={getMarkdownFromEditor(editor)} />`. Collapsed they render small ghost buttons; expanded they push content down (acceptable). Memoize the text input (`useMemo` keyed on a debounced doc version) if typing perf degrades.

**B5. AIGhostText (new backend + opt-in mount).**
- New route (see §3) cloned from `inline-edit/route.ts`: same auth/ownership/quota/BYOK/usage-record chain; `${provider}/haiku`; `max_tokens: 60`; system prompt "Continue this fiction prose in the author's voice; at most one sentence."; respond `{ suggestion }`; `usageRecord` with `agentType: "ghost-text"`. Add `ghostTextRequestSchema` (`context: z.string().min(1).max(2000)`, `chapterNumber: z.number().int()`) to `src/lib/validation.ts`.
- `editor-store.ts`: add `ghostTextEnabled: boolean` (**default `false`** — paid call per 1.5s pause; explicit opt-in) + `toggleGhostText`.
- `manuscript-editor.tsx`: mount `<AIGhostText editor={editor} bookId={bookId} chapterNumber={chapterNumber} enabled={ghostTextEnabled} />` next to `FloatingAgentInput` (~728).
- Toolbar: add a Wand2 toggle button to the "tools" group (both `render()` and `renderDropdownItems`), copying the focusMode prop pattern (`ghostTextEnabled`/`onToggleGhostText` through `EditorToolbarProps` + `ToolbarGroupContext`).
- Fix while wiring: the suggestion overlay uses `position: fixed` coords captured once — reposition (or dismiss) on scroll/resize.

**B6. VersionBranching — HIDE.** Backend not in scope this phase. Remove the `VersionBranching` import and its render from `src/components/editor/chapter-context-header.tsx` (import line 6, usage ~line 63). Leave the stub route and component files in place with the existing TODO. A visible "Create Branch" button that always 501s is worse than absence.

**B7. SKIP (no action):** `AIRewriteComparison` (redundant with working InlineEditPopup + DiffView; weaker diff) and `EntityMentionPopup`/`EntityHoverPreview` (fetches nonexistent `/wiki/search`, wrong param + envelope, and needs an uninstalled Mention extension + caret infra). Leave files unmounted.

### Part C — Radar / Daily Plan / Notifications / dead components

**C1. StoryRadar shape fix (highest-priority honesty fix)** — fix **component-side**, do not rename API fields. In `src/components/book/story-radar.tsx`:
- Replace `RadarIssue` with `RadarAlert = { id: string; type: string; severity: "info" | "warning" | "critical"; title: string; detail: string; chapterNumber?: number }`; `useQuery<{ alerts: RadarAlert[] }>`; `const issues = data?.alerts ?? []`.
- Render mapping (lines 99–119): Badge label = `alert.type`; main text = `alert.title`; italic line = `alert.detail`; location = `alert.chapterNumber != null ? \`Ch.${alert.chapterNumber}\` : undefined`.
- Add error state: destructure `isError`; render a "Couldn't scan manuscript" row with the existing refetch Button instead of the all-clear empty state. Gate the "All clear" badge (line 72) and empty state (line 91) on `data && issues.length === 0`, not `!isLoading`.

**C2. ProactiveNotifications link 404 fix.** Book page (518–523): add `id: ch.id` to the mapped chapters. Component: add `id: string` to its `Chapter` interface; change line 99 href to `` `/books/${bookId}/chapters/${ch.id}` ``. The streak branch (66–75) becomes LIVE once A3 lands — keep it.

**C3. Daily Writing Plan polish (optional).** `daily-writing-plan.tsx`: loading copy "Generating your plan..." → "Building your plan..." (no LLM involved). `daily-plan/route.ts`: skip the "continue" task when `lastTouched.status === "beta_passed"`.

**C4. Delete dead components.** Re-grep for importers first (guard against parallel branches), then delete `src/components/agent/session-progress-pipeline.tsx` and `src/components/book/celebration-banner.tsx`. Deleting is the honest default for a public release; wiring CelebrationBanner is a separate future task.

**C5. (Optional, cheap once A1 exists)** Mount the orphaned `WritingHeatmap` on the book page: `data={dailyCounts}` (365d), `currentStreak`, `bestStreak`, `totalWords={dailyCounts.reduce((s,d)=>s+d.words,0)}` (period total, NOT `book.wordCount`). Defer `CompletionForecast`/`ShareableProgressCard` unless time allows.

---

## 3. NEW FILES

| File | Contents |
|---|---|
| `src/lib/writing-stats.ts` | `getDailyWordCounts({bookId?\|userId?, days})`, `computeStreaks(dailyCounts)`, `getTodayWords(dailyCounts)` (A1) |
| `src/app/api/books/[id]/ghost-text/route.ts` | POST clone of inline-edit route: requireUser → ownership → `checkQuota(user.id, "use_agent_session")` → zod `ghostTextRequestSchema` → BYOK `createLLMClient` with `${provider}/haiku`, `max_tokens: 60` → `{ suggestion }` → `db.usageRecord.create({ agentType: "ghost-text", ... })` (B5) |

Modified-only everywhere else. One new dependency: `@tiptap/extension-focus@^3.19.0`. No Prisma schema changes (`DocumentChangeEvent` carries no word counts; a precomputed `daily_writing_stats` table is explicitly deferred — version-delta computation is cheap at current scale and avoids dual-write drift).

---

## 4. RISKS & GUARDS

**Perf — unbounded version scan (A1).** Dropping the `createdAt` filter fetches ALL versions for matching documents; user-scoped calls (dashboard, wrapped) scan every version across all books, and `document_versions` has **no createdAt index** (only `@@unique([documentId, version])`). Guards: `select` only 4 scalar columns; book page is already `force-dynamic` so latency adds directly — if p95 degrades, add `@@index([documentId, createdAt])` via migration and/or fetch only the single pre-window baseline version per document. Do not block this phase on it.

**Timezone — pragmatic decision: stay UTC everywhere.** All existing bucketing (`writing-stats` route, dashboard) is UTC `toISOString()`. A user writing at 9pm EST gets words bucketed to "tomorrow", which can mute or mis-fire the "streak at risk" notification; users with non-English `book.language` are likely non-UTC. **Decision: keep UTC for this phase** — consistency beats partial correctness, and `computeStreak` already tolerates "today empty → count from yesterday", which absorbs most boundary pain. Document `// NOTE: all day-bucketing is UTC by design` in `writing-stats.ts`. Future fix (out of scope): per-user IANA timezone column + bucketing at query time; must change all call sites atomically — never mix local-time bucketing into individual call sites.

**Numbers will visibly change (A2/A4).** The boundary fix lowers daily counts shown in WritingDashboard (correction, but noticeable); the dashboard chart drops from raw-snapshot sums to deltas and narrows to CHAPTER_CONTENT — "words this week" becomes accurate but much smaller. Communicate in changelog.

**Streak semantics.** Deltas count agent-written words (`changeType: agent_write`) and restores as "words written"; `Math.max(0, delta)` ignores deletions; a paste of a finished chapter spikes one day and unlocks MilestoneRewards. Accepted for this phase (matches the existing API's behavior). If product later wants human-typing-only, filter `changeType === "manual_edit"` inside the helper — single choke point.

**Streak scope.** Book page uses book-scoped streak (consistent with the per-book writing-stats API); ProactiveNotifications copy reads user-level. Accepted ambiguity; switching to `userId` scope later is a one-line change at the call site.

**API contract freeze.** `writing-stats` response shape is consumed by `useWritingStats`/WritingDashboard/GoalProgressCard/DailyWordChart — additive changes only. Radar fix must be component-side; `bookHealth` stays (currently only story-radar consumes the route).

**Cost/abuse (B5).** Ghost text defaults OFF, quota-checked, `max_tokens` 60, usage-recorded. Without all four guards a single session generates hundreds of billed calls.

**Content corruption (B3).** Immersive mode syncs HTML on exit only; per-keystroke `setContent` would destroy undo history and markdown fidelity.

**Split-pane double-mount (B1).** Toolbar children render once per pane; audio components are gated to the primary pane.

**Toolbar overflow (B1/B5).** Anything added only to `render()` vanishes below 650px; every new control gets a `renderDropdownItems` entry.

**Wrapped copy honesty (A5).** After the fix, streak/days come from real word deltas (better than the session-based fallback SPEC 3 proposed — supersedes it). `favoriteWritingHour` still derives from agent sessions; keep the card copy soft ("around Xpm") or hide when null.

**Browser APIs.** ReadAloud (SpeechSynthesis) and AmbientSoundscape (AudioContext needs a user gesture) degrade gracefully; exclude from E2E assertions.

---

## 5. TEST PLAN

**Static gates (run after each part):**
- `npx tsc --noEmit` — must pass (catches prop-shape changes in A3/A6/C1/C2 and toolbar context threading in B).
- `npx next lint` (or repo's lint script) — no new errors.
- `npm run build` — full production build green (server components A3/A4 compile against the new lib).
- Grep gates: `issues` no longer referenced in story-radar; no remaining `currentStreak={0}` in `page.tsx`; no importers of the two deleted components; `[FEATURE_COUNT]`-style placeholder strings absent.

**Unit (Vitest/Jest, colocate `src/lib/__tests__/writing-stats.test.ts`):**
- `getDailyWordCounts`: pre-window baseline (doc with versions at day −40 (10k words) and day −5 (10.5k) over 30-day window → day −5 = 500, not 10,500); first-ever version attributes full count; negative deltas clamp to 0; zero-fill for empty days; bookId vs userId scoping (mock `db`); throws on neither/both.
- `computeStreaks`: current streak ending today; ending yesterday (today empty); broken streak → 0; bestStreak > currentStreak case; activeDays.
- `getTodayWords`: UTC today present/absent.

**Manual verification (dev server, seeded book):**
1. Save a chapter twice today → book overview shows non-zero `todayWords` equal to net delta (not doubled); streak ≥ 1; WritingDashboard (`/books/[id]/dashboard`) shows same numbers; `/dashboard` 7-day chart matches deltas.
2. MilestoneRewards unlocks at streak thresholds; LifetimeStats shows longest streak/days writing; ProactiveNotifications streak alert fires when `streak>=3 && todayWords===0` (simulate by clock or fixture).
3. StoryRadar: book with a stale (>30d) or outlier chapter shows real alerts with type/title/detail; kill the API (or 500 it) → error row with Retry, NOT "All clear"; healthy book → "All clear" only after data loads.
4. Click a stale-chapter notification → opens the chapter editor (no 404).
5. Writing Wrapped: account with history shows real streak/months cards; fresh account shows reduced deck with no "0 days / 0 words" cards.
6. Editor: focus levels 1–3 visibly dim/highlight (resize below 650px → control still reachable via overflow dropdown); Immersive entry appears and round-trips content on exit with autosave firing; soundscape/read-aloud play after click (single instance in split view); pacing/syntax strip expands/collapses; ghost text OFF by default, when enabled produces a suggestion after pause, Tab accepts, usage row recorded, overlay doesn't detach on scroll; "Create Branch" button gone.
7. E2E (Playwright, if harness exists): smoke the book overview + chapter editor render paths; assert no console errors; do not assert audio/speech behavior.

**Files touched (for reviewer):** `src/lib/writing-stats.ts` (new), `src/app/api/books/[id]/ghost-text/route.ts` (new), `src/app/api/books/[id]/writing-stats/route.ts`, `src/app/api/writing-wrapped/route.ts`, `src/app/(app)/books/[bookId]/page.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/lib/validation.ts`, `src/stores/editor-store.ts`, `src/components/editor/{manuscript-editor,editor-toolbar,editor-utils,chapter-context-header,ai-ghost-text}.tsx`, `src/components/book/{story-radar,proactive-notifications,daily-writing-plan,year-in-writing-wrapped}.tsx`, deletions: `src/components/agent/session-progress-pipeline.tsx`, `src/components/book/celebration-banner.tsx`, `package.json` (+`@tiptap/extension-focus`).