# IMPLEMENTATION SPEC — Tier 2.4 Mobile Editor + Tier 2.5 Accessibility (combined phase)

Repo: `D:\Projects\wmb-pub`. All paths relative to repo root. Line anchors verified against current `main` (733f6e0).

> **As-built deviations (post-review):** (1) Desktop is "byte-identical except
> ARIA" with two intentional visual exceptions: editor gutters gained
> `sm:px-6` (+8px ≥640px) and immersive paddings moved from vh to dvh.
> (2) Toolbar thresholds recalibrated to 900/560 (the spec's 650/480 sat
> below measured content widths, producing clipping bands). (3) The editor
> aria-label format is `Editing chapter N[: title]`. (4) The toolbar save
> badge is NOT a live region — the status bar is the single announcement
> source. (5) F8 tooltip anchors on `scrollend` with a 700ms fallback, not a
> fixed 350ms. (6) `editorial-store.navigableFindingIds` was removed (dead
> state); ids are computed at keypress in use-finding-navigation.ts.

**Prime directives:** (1) Desktop (≥1024px) layout JSX is byte-identical except added ARIA attributes. (2) The autosave/CAS pipeline (save effects, conflict handling, offline queue in manuscript-editor.tsx) is untouched — no edits between L300–950 except the four surgical points listed in §3. (3) All exact status strings in `editor-status-bar.tsx` L228–257 and "Conflict — click to review" (L218) and "Keep mine"/"Chapter changed outside this editor" (save-conflict-dialog.tsx) are FROZEN — tests assert them verbatim.

---

## 1. MOBILE ARCHITECTURE

### 1.1 Breakpoint contract (no new breakpoints, no new hooks)

| Tier | Range | Detection | Editor layout |
|---|---|---|---|
| Phone | <768 | `useIsMobile()` (src/hooks/use-mobile.ts) | Single column. Findings = bottom Sheet. History = right Sheet (existing). Split disabled (existing). Toolbar compact stage-2. |
| Tablet | 768–1023 | `!isMobile && !isLg` | Single column. Findings = right Sheet (`w-80`). History = right Sheet (existing). Split allowed. Toolbar stage-1 as width dictates. |
| Desktop | ≥1024 | `useIsLg()` (editor-utils.ts L37–49) | UNCHANGED: ResizablePanelGroup 60/40 + inline `w-64` history column. |

Tailwind v4 defaults align (`md:`=768, `lg:`=1024); no `--breakpoint-*` overrides needed. Do NOT add a third matchMedia hook — phone/tablet is derivable from the two existing hooks already imported in manuscript-editor.tsx (L125, L163).

### 1.2 Panel collapse strategy

- **Findings <1024:** Replace the hand-rolled fixed overlay (`manuscript-editor.tsx:1261`, exact string `fixed inset-y-0 right-0 w-80 z-40 border-l bg-background shadow-xl flex flex-col`) with a new `FindingsSheet` built on the existing Radix Sheet (`src/components/ui/sheet.tsx`): `side="bottom" className="h-[70dvh] p-0"` on phone, `side="right" className="w-80 sm:max-w-none p-0"` on tablet. This kills three bugs at once: bottom-nav overlap (old overlay was `inset-y-0` over the `h-14 z-30` nav), zero focus management, and no Escape path. Same swap at `src/app/(app)/books/[bookId]/documents/[documentId]/page.tsx:617`.
- **Findings auto-open (manuscript-editor.tsx L186–192):** gate on `isLg`. A modal Sheet must never self-summon on a phone mid-typing. Below lg the destructive count badge on the toolbar Findings toggle (editor-toolbar.tsx L447–453) is the affordance. This is an intentional behavior change — note it in the commit message.
- **Version history:** already correct (inline `w-64` on lg+, `VersionHistorySheet w-72` below). No change.
- **Split mode:** toolbar toggle already hidden via `onToggleSplit={isMobile ? undefined : ...}` (L1078–1080). Add a defensive passthrough in `split-editor.tsx`: at L53, `if (!splitMode || isMobile) return children` (import `useIsMobile`) — protects against splitMode persisting in the zustand store across a viewport shrink.
- **Agent panel / sidebar / bottom nav:** out of scope, already mobile-correct (layout.tsx branches, Sheet sidebar, `h-[60vh]` agent bottom sheet).

### 1.3 Toolbar: two-stage priority collapse (NOT horizontal scroll)

Decision: extend the existing ResizeObserver priority+overflow mechanism (editor-toolbar.tsx L108, L503–516). Justification: (a) it is the established idiom in this exact file; (b) it is container-width based, so it also handles split-mode and docked-agent narrowing, which horizontal scroll handles badly; (c) the Radix DropdownMenu overflow is keyboard-complete for free, directly serving Tier 2.5, whereas a scrolling toolbar hides controls from keyboard/AT users and fights iOS rubber-banding.

- Constants (replace L108): `const TOOLBAR_OVERFLOW_THRESHOLD = 650;` `const TOOLBAR_COMPACT_THRESHOLD = 480;` ResizeObserver sets a `density: "full" | "overflow" | "compact"` state instead of boolean.
- **Stage 1 (<650, existing):** secondary groups → "More tools" dropdown. Unchanged.
- **Stage 2 (<480, new):** additionally (a) `headings` group moves into the overflow dropdown (as menu items with active checkmarks); (b) Annotations + History toggles move into overflow, keeping inline only Findings (it has the count badge); (c) `AmbientSoundscape` and `ReadAloud` (L611–617) render `hidden` inline and appear as overflow items (or simply hide on compact — they are primary-pane-only ambient features; hiding is acceptable, moving is better); (d) save Badge (L620–643) goes icon-only (Cloud/CloudOff/Loader2) with an `sr-only` text span carrying the same words. The status-bar testid strings are unaffected.
- Inline at compact: Bold/Italic/Underline + overflow trigger + Findings toggle + save icon ≈ 6×32px + gaps ≈ 230px → fits 320px viewports.
- Dropdown items must include shortcut hints in their labels (e.g., "Undo (Ctrl+Z)") — they currently lack them (report §2).

### 1.4 Responsive typography — single source of truth for the editor measure

`max-w-[680px]` currently lives in 5 places (verified): manuscript-editor.tsx:275, :293; documents/[documentId]/page.tsx:231, :250; immersive-focus-mode.tsx:170.

- Add to `src/components/editor/editor-utils.ts`:
  ```ts
  export const EDITOR_MEASURE_CLASS = "max-w-[680px]";
  export function getEditorContentAttributes(focusMode: boolean, label: string): Record<string, string> {
    return {
      class: `tiptap ${EDITOR_MEASURE_CLASS} w-full mx-auto px-4 sm:px-6 ${focusMode ? "focus-mode" : ""}`,
      role: "textbox",
      "aria-multiline": "true",
      "aria-label": label,
    };
  }
  ```
  Use at all four TipTap sites (`editorProps: { attributes: getEditorContentAttributes(focusMode, label) }`). Note `w-full` added so the column fills phones; `max-w-[680px]` is harmless below 680px and preserves the desktop measure exactly. `px-4 sm:px-6` replaces bare `px-4` (16px gutters on phone, 24px ≥640 — desktop visual change is +8px gutter; if pixel-perfect desktop is required use `px-4` only, but `sm:px-6` matches the project's spacing-ramp idiom).
- `src/app/globals.css` `.tiptap` block (L262–268): change `font-size: 1.125rem;` → `font-size: clamp(1.0625rem, 1rem + 0.35vw, 1.125rem);` (17px phone floor — at or above the 16px iOS no-zoom threshold — ramping to the current 18px) and `padding: 2rem 0;` → `padding: 1.25rem 0 2rem;` for phones via `@media (max-width: 767px)` override or clamp. Heading scale: `.tiptap h1` `font-size: clamp(1.625rem, 1.3rem + 1.4vw, 2rem);` `.tiptap h2` `clamp(1.3125rem, 1.15rem + 0.75vw, 1.5rem);` `.tiptap h3` `clamp(1.125rem, 1.05rem + 0.4vw, 1.25rem);`. Desktop computed values are identical to today at ≥1024px content widths.
- `immersive-focus-mode.tsx:170`: replace literal with `EDITOR_MEASURE_CLASS` import; change `px-8` → `px-5 sm:px-8` and `pt-[40vh]` → `pt-[35dvh]`, `pb-[60vh]` → `pb-[55dvh]` (dvh so the iOS URL bar/keyboard doesn't push the caret line off-center).

### 1.5 Virtual keyboard + viewport chrome

- `src/app/layout.tsx`: add (currently absent — confirmed no `viewport` export anywhere):
  ```ts
  import type { Viewport } from "next";
  export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };
  ```
  `resizes-content` makes Chrome/Android shrink the layout viewport when the keyboard opens, so the sticky toolbar (editor-toolbar.tsx L564 `sticky top-0`) and the status bar stay visible. iOS Safari ignores it; mitigation below.
- TipTap caret visibility: in both `useEditor` configs add `editorProps: { ..., scrollThreshold: 80, scrollMargin: 80 }` so ProseMirror keeps the caret 80px clear of the container bottom (covers iOS where the keyboard occludes the lower half).
- Chapter page height (`src/app/(app)/books/[bookId]/chapters/[chapterId]/page.tsx:45`): change `h-[calc(100vh-3rem)]` → `h-[calc(100dvh-6.5rem)] md:h-[calc(100vh-3rem)]`. 6.5rem = 3rem AppHeader + 3.5rem MobileBottomNav; `dvh` tracks the collapsing URL bar. This fixes the current 56px dead-scroll where the bottom nav overlaps the status bar. Same treatment for the documents page wrapper if it uses the same calc.
- Do NOT add a `visualViewport` JS hook in this phase — `dvh` + `interactive-widget` + `scrollMargin` cover the cases; a hook is a follow-up if iOS field reports demand it.

---

## 2. A11Y PLAN (WCAG 2.1 AA)

**Radix already covers (do not touch):** SaveConflictDialog, VersionHistorySheet, app sidebar Sheet, all DropdownMenus/Popovers/Tooltips/Selects, ResizableHandle (role=separator + arrow-key resize), Dialog/Sheet sr-only Close buttons, Sonner toast live region. The new FindingsSheet inherits all of this — that is the point of using it.

Per-file fixes (exact attribute values; add, never rename visible text):

**manuscript-editor.tsx**
- L273–277 + L290–296: use `getEditorContentAttributes(focusMode, chapter?.title ? \`Editing chapter: ${chapter.title}\` : "Manuscript editor")` → contenteditable gets `role="textbox" aria-multiline="true" aria-label`.
- L958–966 back button: `aria-label="Back to book"`. L993–1009 / L1013–1029: `aria-label="Previous chapter"` / `aria-label="Next chapter"` (keep dynamic `title`). Pager counter span: `aria-label={\`Chapter ${currentIdx + 1} of ${total}\`}`.
- F8 handler (L893–919): after selecting/scrolling a finding, also set `tooltipState` exactly as the gutter-marker click path does (L1109–1123) so Accept/Reject opens, and call `announce(\`Finding ${i + 1} of ${n}: ${category}, ${severity}\`)`. This is THE keyboard path to act on annotations.
- F2 (L674–691) and F8 (L893–919) guards: bail when `(e.target as HTMLElement).closest('input, textarea, [role="dialog"]')` matches (contenteditable must remain allowed — that is the primary F2 context). Duplicate F2 guard at documents/[documentId]/page.tsx:309–313.
- L429 `window.confirm`: leave (accessible; replacing is out of scope).
- Loading div (L938–944): add `role="status"`.

**editor-toolbar.tsx**
- L562: `role="toolbar" aria-label="Editor toolbar"` + wire `useToolbarRoving(containerRef)` (new hook, §3): ArrowLeft/Right move focus among enabled buttons, Home/End jump, single Tab stop (roving tabindex). Ship role and roving together or neither.
- ToolbarButton (L87–105): add optional `pressed?: boolean` prop → `aria-pressed={pressed}`. Set from the existing `editor.isActive(...)` / state already used for `variant` on: Bold, Italic, Underline, H1–H3, blockquote/lists, Focus Mode, Ghost Text, Annotations, Findings, History, Split.
- L444: `aria-label={pendingCount > 0 ? \`Toggle findings, ${pendingCount} pending\` : "Toggle Findings"}` (no test selects toolbar aria-labels — confirmed safe). Badge span (L447–453): `aria-hidden="true"`.
- Save badge cluster (L620–643): `role="status" aria-live="polite"` on the wrapper.

**editor-status-bar.tsx**
- Save-status wrapper (L222, keeps `data-testid="editor-save-status"`): add `role="status" aria-live="polite"`. TEXT UNCHANGED.
- Annotation counts (L168–204): wrap in `role="group" aria-label="Annotation summary"`; each span gets `aria-label` like `"3 high severity findings"`, `"2 insertions"`; add `hidden sm:flex` on the count cluster (phone real estate) — word count, reading time, timer, and the save cluster stay visible at all widths.

**editor-findings-panel.tsx**
- L128–135 close: `aria-label="Close findings panel"`.
- L139–177 chips: wrapper `role="group" aria-label="Filter findings"`; each chip `aria-pressed={isActive}`.
- Count badge (L123–127): `aria-hidden="true"` (count announced via toolbar label + announcer).

**FindingsSheet (new):** include `<SheetTitle className="sr-only">Findings</SheetTitle>` (Radix requires a title for aria-labelledby).

**annotation-tooltip.tsx** — L127 container: `role="dialog" aria-label="Review suggestion"`; on open, focus the Accept button (`ref` + `useEffect`); on close (Escape/accept/reject/outside-click), restore `editor.commands.focus()`. Diff `+`/`-` glyph spans: keep (non-color marker, required).

**inline-edit-popup.tsx** — L216 container: `role="dialog" aria-label="AI rewrite"`; L280–285 loading: `role="status"`; L295–297 counter: wrap in `aria-live="polite"`; L305–322: `aria-label="Previous suggestion"` / `"Next suggestion"`; emoji in action pills (L234–244): `<span aria-hidden="true">`; on close restore `editor.commands.focus()` (Accept already does at L178).

**overlapping-findings-popover.tsx** — L76 container: `role="dialog" aria-label="Overlapping findings"`; focus first row button on mount; restore editor focus on close. Severity dot (L92–97): add `sr-only` severity text. (Keyboard path to OPEN it: acceptable gap this phase — F8 visits each finding individually; document as known limitation.)

**floating-agent-input.tsx** — textarea (L105–118): `aria-label="Ask the agent about the selected text"`. Fix focus-steal: add prop `autoFocus: boolean`; selection-triggered open (manuscript-editor.tsx L921–930) passes `false`; toolbar "Agent Quick Chat" passes `true`. Show hint text "Enter to send · Shift+Enter for new line" (also fixes undocumented shortcut). Container: `role="dialog" aria-label="Agent quick chat"`. Escape restores editor focus.

**immersive-focus-mode.tsx** — L122 root: `role="dialog" aria-modal="true" aria-label="Immersive focus mode"`; L124 top bar: `opacity-0 hover:opacity-100 focus-within:opacity-100`; theme dots (L139–150): `aria-label={\`${t} theme\`}` + `aria-pressed={theme === t}`; contenteditable (L166–182): `role="textbox" aria-multiline="true" aria-label="Distraction-free editor"`; on exit, `editor.commands.focus()` after the existing `setContent` sync in `exitImmersive` (L856–867 — append only, do not reorder the sync). Minimal focus trap: keydown handler cycling Tab within the root (it is `z-[100]` fullscreen; full inert treatment is overkill given `requestFullscreen`).

**gutter-markers.tsx** — L136–146: button becomes `h-6 w-6 flex items-center justify-center` (24px target, WCAG 2.5.8) containing the existing 12px visual dot as an inner `<span aria-hidden>`; adjust the absolute `left` offset by -6px to keep the dot's visual position. Keep existing `aria-label` (L145, already good).

**Small controls sweep (title→aria-label, names match existing titles):**
- session-timer.tsx: L94 `aria-label="Close timer"`, L133 `"Resume session timer"`, L137 `"Pause session timer"`, L142 `"Stop session timer"`; SVG ring (L117–127) `aria-hidden="true"`.
- read-aloud.tsx: L164 `"Pause"`, L168 `"Read aloud"`, L180 `"Stop"`, L183 `"Next sentence"`, L195 `aria-label="Read aloud settings"`; speed range: `aria-label="Reading speed"`.
- ambient-soundscape.tsx: L231–235 `aria-label="Ambient sounds"` + `aria-pressed={isPlaying}`; volume range: `aria-label="Soundscape volume"`.
- graduated-focus.tsx: L50 `aria-label="Focus mode options"`; level buttons `aria-pressed={selected}`; emojis (L34–36, 85) wrapped `aria-hidden="true"`.
- pacing-heatmap.tsx: L108 `aria-label="Close pacing heatmap"`; bars (L121) `aria-label={\`Section ${i + 1}: ${pace} pacing\`}`.
- prose-syntax-highlight.tsx: L139 `aria-label="Close prose highlights"`.

**Keyboard shortcuts help** — `src/lib/keyboard-shortcuts.ts` (L9–31), add to the editor context:
```ts
{ keys: "F8", description: "Next finding (opens review)", context: "editor" },
{ keys: "Shift+F8", description: "Previous finding", context: "editor" },
{ keys: "Escape", description: "Exit immersive mode", context: "editor" },
```
Dialog opener (Ctrl+/) already exists — no new affordance needed.

**Live announcer (new `src/components/editor/live-announcer.tsx`):** sr-only `<div aria-live="polite" role="status">` + module-level `announce(message: string)` (tiny zustand store, debounce 150ms, clear after 3s). Mounted once at the end of `editorColumn` (1 line in manuscript-editor.tsx). Consumers: F8 navigation, immersive enter/exit ("Entered immersive mode, press Escape to exit"). Save status does NOT use it (status bar's own aria-live covers that; double-announcing is a defect).

---

## 3. FILES

### CREATE
| File | Purpose / API | Est. lines |
|---|---|---|
| `src/components/editor/findings-sheet.tsx` | Radix Sheet wrapper for findings <1024. `interface FindingsSheetProps { open: boolean; onOpenChange: (o: boolean) => void; side: "bottom" \| "right"; children: ReactNode }`. Mirrors version-history-sheet.tsx; sr-only SheetTitle "Findings". | ~55 |
| `src/components/editor/use-toolbar-roving.ts` | `useToolbarRoving(containerRef)`: roving tabindex + Arrow/Home/End for `role="toolbar"`. Queries `button:not([disabled])`, sets tabIndex 0/-1, container keydown handler. | ~70 |
| `src/components/editor/live-announcer.tsx` | `LiveAnnouncer` component + `announce(message: string)` export (zustand store). | ~45 |
| `tests/e2e/mobile-editor.spec.ts` | Phone-viewport editor flows (§4). | ~150 |
| `tests/e2e/a11y.spec.ts` | axe scans + keyboard-path tests (§4). | ~130 |

### MODIFY
| File | Change (anchor) |
|---|---|
| `src/components/editor/editor-utils.ts` | Add `EDITOR_MEASURE_CLASS`, `getEditorContentAttributes()` (after L49). |
| `src/components/editor/manuscript-editor.tsx` | SURGICAL ONLY: (1) L273–277 & L290–296 → helper call; (2) L186–192 auto-open gated `isLg`; (3) L674–691 F2 guard; (4) L893–919 F8 opens tooltip + announce; (5) L921–930 pass `autoFocus={false}`; (6) L958–1029 aria-labels; (7) L1260–1264 overlay → `<FindingsSheet side={isMobile ? "bottom" : "right"} ...>`; (8) `<LiveAnnouncer />` in editorColumn. Net delta ≈ +25/-15 lines. Save pipeline untouched. |
| `src/components/editor/editor-toolbar.tsx` | L108 two constants + density state; L503–516 ResizeObserver; stage-2 group reshuffle; L562 role+roving; L87–105 `pressed` prop; L444–453 dynamic label; L620–643 aria-live + compact icon mode. File lands ~720 lines (under 800 cap; if it crests, extract `toolbar-groups.tsx`). |
| `src/components/editor/editor-status-bar.tsx` | L222 role/aria-live; L168–204 group + labels + `hidden sm:flex`. Strings frozen. |
| `src/components/editor/editor-findings-panel.tsx` | L128 close label; L139–177 chips aria-pressed + group. |
| `src/components/editor/immersive-focus-mode.tsx` | L122 dialog attrs; L124 focus-within; L139–150 dot labels; L166–182 textbox attrs + measure constant + dvh paddings; exit focus restore. |
| `src/components/editor/annotation-tooltip.tsx` | L127 role/label; focus-in on open; focus restore on close. |
| `src/components/editor/inline-edit-popup.tsx` | L216 role; L280–285 status; L295–297 live; L305–322 labels; close restores editor focus. |
| `src/components/editor/overlapping-findings-popover.tsx` | L76 role/label/focus-in/restore; L92–97 sr-only severity. |
| `src/components/editor/floating-agent-input.tsx` | `autoFocus` prop; L105 textarea label; hint text; L100 role. |
| `src/components/editor/gutter-markers.tsx` | L136–146 24px targets. |
| `src/components/editor/split-editor.tsx` | L53 `isMobile` passthrough guard. |
| `src/components/editor/session-timer.tsx`, `read-aloud.tsx`, `ambient-soundscape.tsx`, `graduated-focus.tsx`, `pacing-heatmap.tsx`, `prose-syntax-highlight.tsx` | Labels per §2 sweep. |
| `src/lib/keyboard-shortcuts.ts` | 3 new entries after L26. |
| `src/app/layout.tsx` | `export const viewport` (after metadata export, ~L92). |
| `src/app/globals.css` | L262–299 clamp() type ramp. |
| `src/app/(app)/books/[bookId]/chapters/[chapterId]/page.tsx` | L45 height calc. |
| `src/app/(app)/books/[bookId]/documents/[documentId]/page.tsx` | L231/L250 helper; L309–313 F2 guard; L617 overlay → FindingsSheet. |
| `playwright.config.ts` | Add project (§4). |
| `package.json` | `npm i -D @axe-core/playwright`. |

---

## 4. TEST PLAN

### Config
`playwright.config.ts` projects array (L23–41) — append:
```ts
{ name: "mobile-chromium", use: { ...devices["Pixel 7"] }, testMatch: /mobile-.*\.spec\.ts/ },
```
Critical: `testMatch` scopes the mobile viewport to new specs only — the existing 105 tests keep running on Desktop Chrome unchanged. Also add `testIgnore: /mobile-.*\.spec\.ts/` to the chromium/firefox/webkit projects so mobile specs don't run at desktop viewport.

### `tests/e2e/mobile-editor.spec.ts` (mobile-chromium, Pixel 7 = 412×915)
Conventions: `fixtures.ts` seeding (`createBookViaApi`/`createChapterViaApi`), unique names `` `${Date.now()}-w${testInfo.workerIndex}` ``, `waitForLoadState("networkidle")`, `getByTestId("editor-save-status")`.
1. Editor opens; `[contenteditable="true"]` visible; no horizontal overflow: `expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)`.
2. Toolbar compact: toolbar container `scrollWidth <= clientWidth`; "More tools" (`getByRole("button", { name: "More tools" })`) visible; H1 reachable inside the overflow menu.
3. Type → status reaches `Saved` via `getByTestId("editor-save-status")` (status bar must remain visible above the bottom nav — asserts the height-calc fix).
4. Findings toggle → `getByRole("dialog")` bottom sheet visible; finding card "Apply"/"Dismiss" visible; Escape closes; focus returns.
5. History toggle → right Sheet opens/closes.
6. Split toggle absent on phone.

### `tests/e2e/a11y.spec.ts` (desktop chromium project)
```ts
import AxeBuilder from "@axe-core/playwright";
const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
expect(results.violations).toEqual([]);
```
Scans: (1) chapter editor idle; (2) findings panel open (lg inline); (3) version history open. Keyboard paths: (4) Tab reaches a gutter marker → Enter → `getByRole("dialog", { name: "Review suggestion" })` contains focused Accept; (5) F8 cycles findings and the live region (`role="status"`) updates; (6) Ctrl+/ dialog lists "F8"; (7) contenteditable has `role="textbox"` + aria-label.

### Existing-selector lockstep matrix (code adapts unless stated)
| Selector | Risk | Resolution |
|---|---|---|
| offline-autosave.spec.ts:74+ exact status strings ("Offline — saved on this device", "Sync pending", "Saved", …) | aria-live wrapper | Strings frozen; attributes only. NO test change. |
| offline-autosave.spec.ts:237,298 `/Conflict/` button name | none | Conflict chip text untouched. |
| ui-flows.spec.ts:259, 343–345, 511–517 header `.last()` positional | breaks if ANY icon button added to AppHeader | HARD RULE for implementers: this phase adds zero buttons to `app-header.tsx`. NO change either side. |
| ui-flows.spec.ts:265–280 sidebar collapse @640px | breakpoint move | No breakpoints moved. Safe. |
| ui-flows.spec.ts:108–110 + offline-autosave `[contenteditable]`/`.ProseMirror` | editor unmount at small widths | Editor always mounted at every width (Sheets overlay, never replace). Safe. |
| ui-flows.spec.ts:427/437/447 "Apply"/"undo"/"Dismiss" exact | aria-label additions on FindingCard | Do NOT add aria-labels to finding-card buttons (visible text is the name; sufficient). |
| ui-flows.spec.ts:193 `/toggle theme/i` | rename | theme-toggle.tsx untouched. |
| ui-flows.spec.ts:486 `/reset all/i`, :125/465/472 `button[role="combobox"]` | filter chips aria-pressed | aria-pressed does not change accessible names/roles. Safe. |
| Toolbar aria-labels (Findings dynamic label) | none | test-infra confirms zero tests select toolbar labels today. |
| inline-edit.spec.ts / editorial.spec.ts | API-only | Immune. |

Run gates: full `npm run test:e2e` (105 green) after each chunk; new specs added in chunk 3.

---

## 5. RISKS & SEQUENCING

### Top risks, in order of blast radius
1. **editorProps refactor (4 sites)** — the L288–298 `setOptions` effect re-fires on focusMode; the helper must be referentially stable (plain function, not memo'd object) and produce a class string containing `tiptap` and `focus-mode` exactly as before, or focus-mode styling and `.tiptap` CSS detach. Verify: offline-autosave suite + visual check at 1280px (column still 680px centered).
2. **Toolbar stage-2 reshuffle** — moving panel toggles into the dropdown changes which handlers exist where; the Findings toggle must stay inline at ALL densities (only keyboard/badge affordance below lg). Verify: ui-flows editorial journey + toolbar at 412/768/1280 widths.
3. **FindingsSheet modality** — Radix Sheet sets `pointer-events: none` on body; any code that expects typing while findings are open below lg breaks (none known). Auto-open gating is a deliberate UX change — flag in PR body.
4. **F2/F8 guards** — over-eager `closest()` matching could kill F2 inside the editor (contenteditable must NOT be in the guard selector). Manual verify F2 with selection.
5. **Roving tabindex** — buttons inside Radix Tooltip triggers; ensure the hook targets the rendered `<button>` and skips the overflow dropdown's内部 (dropdown manages its own keys). If flaky, ship `role="toolbar"` + roving in its own commit for easy revert.
6. **Height calc change (dvh)** — only affects <768 (`md:` preserves desktop calc). Verify status bar sits flush above bottom nav with no dead scroll.

### Sequencing (3 chunks, exclusive file ownership for parallel agents)

**Chunk 1 — Foundation (serial, small, lands first):** editor-utils.ts helper, layout.tsx viewport, globals.css clamps, chapters page height, keyboard-shortcuts.ts entries, package.json + playwright.config.ts. Gate: build + full e2e green + desktop visual check.

**Chunk 2 — Parallel agents (disjoint file sets):**
- **Agent A (core editor — owns the hot file):** manuscript-editor.tsx (ALL eight surgical edits incl. its aria labels and FindingsSheet swap), findings-sheet.tsx (new), split-editor.tsx, documents/[documentId]/page.tsx. Contract with C: imports `announce` from `@/components/editor/live-announcer` and `FindingsSheet` props as specified in §3 — interfaces frozen by this spec.
- **Agent B (toolbar + bars + panel):** editor-toolbar.tsx, use-toolbar-roving.ts (new), editor-status-bar.tsx, editor-findings-panel.tsx, session-timer.tsx, read-aloud.tsx, ambient-soundscape.tsx, graduated-focus.tsx, pacing-heatmap.tsx, prose-syntax-highlight.tsx.
- **Agent C (popups + immersive + announcer):** live-announcer.tsx (new — land the export early so A compiles), annotation-tooltip.tsx, inline-edit-popup.tsx, overlapping-findings-popover.tsx, floating-agent-input.tsx, immersive-focus-mode.tsx, gutter-markers.tsx.
- Gate after merge: full 105-test e2e + manual matrix (375/412/768/1024/1280 × editor, findings, history, immersive, F2, F8).

**Chunk 3 — Tests (serial, after 2):** mobile-editor.spec.ts + a11y.spec.ts; fix any axe findings surfaced (expect color-contrast hits on `text-muted-foreground` `text-[10px]` chips — remediate in the owning agent's files). Gate: full suite incl. new projects green.

Known accepted gaps (document in PR): no keyboard path to OPEN overlapping-findings popover (F8 covers findings individually); `window.confirm` nav guard retained; no visualViewport hook (dvh-based approach first); DiffView color-only markers in SaveConflictDialog out of scope.