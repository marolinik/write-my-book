# UI Surface Inventory (verified 2026-07-17)

Every line verified against code at main@478359c. `(?)` = ambiguous/dead/unwired. Paths relative to `D:\Projects\wmb-pub\src\`.

## 1. Routes & pages (`src/app/**`)

31 page.tsx files (4 pure redirects), 5 layouts, plus global-error.tsx, opengraph-image.tsx, twitter-image.tsx, robots.ts, sitemap.ts.

### Public / auth / onboarding
- LandingPage (/) — `app/page.tsx`; marketing: hero, 5 feature sections, 3-step how-it-works, BYOK cost explainer with 4 real-cost examples, PricingSection (4 plans), FaqAccordion, JSON-LD, footer Privacy/Terms; redirects to /dashboard when authed, DEV_AUTH_BYPASS, or Clerk unconfigured.
- Login (/login/[[...sign-in]]) — Clerk `<SignIn/>` centered; redirects to /dashboard if devBypass/no Clerk key.
- Signup (/signup/[[...sign-up]]) — Clerk `<SignUp/>` centered; redirect if Clerk unconfigured.
- Onboarding (/onboarding) — server redirect to /dashboard if `user.onboardingComplete`; else OnboardingWizard (see §12); chrome-less centered layout (`(onboarding)/layout.tsx`).
- Privacy (/privacy), Terms (/terms) — static legal text (8 and 10 h2 sections) under `(public)/layout.tsx` (own header/footer, no app chrome).

### App shell (all under `(app)/layout.tsx`, auth-protected via middleware)
- Dashboard (/dashboard) — welcome header; 4 quick actions (Create Book / Create Series / Start Writing / Import Manuscript); 4 stat cards (books/words/chapters/series); "Continue where you left off" card deep-linking last chapter; 7-day writing-activity bar chart; Pending Alerts card (pending findings, failed-beta chapters, unread BookNotifications, destructive badge); Recent Agent Sessions (token counts); Recent Books grid + zero-state; WritingWrappedCard; Series grid + zero-state.
- BookShelfPage (/books) — 4 state shelves (Currently Writing / Waiting for Feedback / Completed / Archived-collapsible) via `groupBooks`; per-book chapter-status rollups + last-chapter Continue deep-link (both degrade gracefully on query failure); New Book button; zero-state card.
- NewBookPage (/books/new) — form: name*, genre, language (SUPPORTED_LANGUAGES), optional series + book number; two exits: "Start writing" (→ first chapter editor) or "Guided setup instead" (→ /setup?step=1); toasts on success/error.
- BookOverview (/books/[bookId]) — header (title, status badge, genre, series link, synopsis, Settings btn); Recommended-Next-Step banner (rule-based: capture-style → story-bible → architecture → per-chapter dev-edit/line-edit/beta-read/write/plan/discuss → discuss-edits → publishing-check) with StartWorkflowButton; Book Progress meter (drafted/edited/beta-passed %) + word-target card; stats row (words/chapters/documents/avg beta score) + MemoryStatsCard; Recent Agent Sessions + Pending Findings cards; setup-incomplete banner (x/5 steps); BookViewSwitcher (chapter views §7); StoryRadar + DailyWritingPlan; ProactiveNotifications; WritingHeatmap; ChapterWordGoals; MilestoneRewards + LifetimeStats; DraftCertificate at 100% drafted; documents list.
- BookLayout (`books/[bookId]/layout.tsx`) — mounts JourneySelectorDialog only (persistent JourneyBanner deliberately removed per comment).
- ChaptersIndex (/books/[bookId]/chapters) — chapter list rows (number, title/Untitled, localized status badge, word count) linking into editor; loading skeletons, error card, empty state; New chapter button.
- NewChapter (/books/[bookId]/chapters/new) — form: auto-incremented chapter number*, act number*, optional title; toast + redirect to editor.
- ChapterEditor (/books/[bookId]/chapters/[chapterId]) — SplitEditor wrapping ManuscriptEditor (§3) + OnboardingWatcher; dvh-based heights for mobile keyboard/URL-bar handling.
- WritingDashboard (/books/[bookId]/dashboard) — thin wrapper for WritingDashboard component (§7).
- Library (/books/[bookId]/library?tab=) — 3 tabs: Documents (DocumentsLibrary), World Bible (WikiPage), Chat with Characters (CharacterChat fed from wiki character entities).
- DocumentEditor (/books/[bookId]/documents/[documentId]) — Tiptap document editor on per-pane store; 2s-debounced autosave with version CAS + SaveConflictDialog (conflict surfaced via non-blocking toast "Document changed outside this editor"); version history, metadata panel, inline AI edit, floating agent input, annotations/findings for chapter-scoped doc types (auto-opens findings panel on lg+ only), prev/next same-type chapter-doc navigation.
- Editorial (/books/[bookId]/editorial) — server-loads chapters → EditorialPage component (§5).
- Reports (/books/[bookId]/reports) — 5 tabs Analytics/Continuity/Market/Edits/Documents (§9); "Generate Reports" button opens agent panel with `analyze` workflow.
- Setup (/books/[bookId]/setup?step=) — 6-step guided wizard: Basics (name/genre/language form) → Import (ImportWizard, skippable via settings PATCH) → Style (capture-style workflow, paste style sample, re-run confirm if fingerprint exists) → Story Bible (create-story-bible, re-run confirm) → Architecture (build-architecture, re-run confirm) → Done (`setupComplete` PATCH); auto-resumes first incomplete step; "onboard-new-book" conversational alternative; blocks steps while an agent session is running.
- Style (/books/[bookId]/style) — StyleProfileViewer; empty state with "Capture Style" CTA (opens capture-style workflow); Refresh Style / Evolve Style buttons; "captured <date>" timestamp; back-to-setup breadcrumb when `?from=setup`.
- Transfer (/books/[bookId]/transfer?tab=) — Import/Export tabs (ImportWizard | ExportPage, §11); back-to-setup link when `?from=setup`.
- BookSettings (/books/[bookId]/settings) — Model Overrides card (book default + 6 per-role ModelPickers w/ resolution-source labels book-role/book-default/global-role/global-default); Style card (strictness strict/balanced/relaxed, auto-commit switch); Beta Reader card (panel size 3-10, consensus %, convergence %); all debounce-saved; Danger Zone → Delete Book dialog requiring typed book-name confirmation, toasts.
- Redirect stubs — /books/[bookId]/export → /transfer?tab=export; /import → /transfer; /wiki → /library?tab=wiki; /documents → /library.
- SeriesList (/series) — series cards (type badge, x/planned books, doc count, description); New Series; zero-state.
- NewSeries (/series/new) — form: title*, genre, series type (Duology…Saga/Open-ended), planned books, description.
- SeriesDetail (/series/[seriesId]) — header w/ Cross-Book Continuity Check button (opens check-series-continuity workflow); 5 tabs: Overview (stats, SeriesBookManager, 3 expected series-doc cards SERIES_BIBLE/ARCHITECTURE/FINGERPRINT w/ "generated when 2+ books" hint, continuity status card), Documents, Inheritance, Synthesis, Analytics (§10).
- Settings (/settings) — Language preference select; ApiKeysSection (BYOK); ModelSelectionSection; MemorySettings; BYOK info card.
- Billing (/settings/billing) — Stripe-unconfigured warning; 14-day-trial banner; Monthly/Annual toggle ("Save ~17%"); 4 plan cards (current-plan ring, Founder ring + sold-out disable via 30s-polled founder count); checkout + manage-billing (Stripe portal); Token Usage (30 days) section: Usage by Agent / by Model / by Book cards.

## 2. Global chrome & navigation (`components/layout/`, root layout)

- RootLayout (`app/layout.tsx`) — 4 Google fonts (Libre Franklin sans, Cormorant Garamond display, JetBrains Mono, Lora serif); next-themes ThemeProvider (light/dark/system, class attr); sonner `<Toaster richColors position="bottom-right"/>`; ToastRouteGuard (dismisses all toasts on route change); TooltipProvider; QueryProvider (react-query); ClerkThemeProvider only when Clerk configured; viewport `interactiveWidget: resizes-content` for Android keyboard.
- AppSidebar (`app-sidebar.tsx`) — offcanvas; global: Dashboard/Books/Series (Series shows lock icon when `!hasProAccess`); contextual book group: Setup, Transfer, Style, Chapters (collapsible, first 10 + "show all"), Library, Writing Dashboard, Editorial (pending-findings destructive badge), Reports (lock if !pro), Export; per-item green/amber status bars, "NEXT" badge from recommended workflow; JourneyChecklist + JourneySelectorDialog; footer Settings; mounts UpgradeModal.
- AppHeader (`app-header.tsx`) — sidebar toggle; breadcrumbs (i18n segment map, book/chapter names, chapter status badge); ThemeToggle; agent toggle (BotIcon); Clerk UserButton (hidden when Clerk unconfigured).
- CommandPalette (`command-palette.tsx`) — Ctrl/Cmd+K; groups: Pages, Current Book (Overview/Setup/Documents/Editorial/Reports/Style/Dashboard/Wiki/Import/Export), Workflows (all workflows, opens agent panel), Actions (New Book, Keyboard Shortcuts). (?) palette book links use legacy /documents /import /export /wiki paths — they land on redirect stubs.
- KeyboardShortcutsDialog (`keyboard-shortcuts-dialog.tsx`) — Ctrl/Cmd+/; lists Global (Ctrl+K, Ctrl+/, Ctrl+B sidebar), Editor (Ctrl+B/I/U, Ctrl+Z, Ctrl+Shift+Z, F2 AI rewrite, F8/Shift+F8 findings, Esc×2), Agent (Enter send, Shift+Enter newline) from `lib/keyboard-shortcuts.ts`.
- ThemeToggle — Light/Dark/System dropdown, sr-only label.
- MobileBottomNav (`mobile-bottom-nav.tsx`) — `md:hidden` fixed bar: Home, Books, Agent (toggles panel overlay↔bubble), Settings.
- PageShell / EmptyState — presentational wrappers (title/description/actions; icon empty state).
- ToastRouteGuard (`providers/toast-route-guard.tsx`) — auto-dismisses sonner toasts on pathname change.
- LanguageProvider (`providers/language-provider.tsx`) — i18n context (`t` UIStrings + BCP-47 locale) from user preference, default en; sr strings exist (journey copy en/sr).

## 3. Manuscript editor (Tiptap) (`components/editor/`)

- ManuscriptEditor (`manuscript-editor.tsx`) — extensions: StarterKit (H1-3), Underline, Placeholder, TextAlign, Focus, tiptap-markdown (markdown in/out, html:false), AnnotationExtension (ProseMirror decorations).
- Autosave — 2s debounce; exponential backoff on failures (2s→4s→…→60s cap); failure-streak toast at 3; PUT carries `expectedVersion` (CAS); 409 no-op conflicts silently adopt version; real conflicts suspend autosave, set `saveConflict`, toast with "Review" action (dialog never auto-opens); stale-response guards (`loadEpoch` for A→B→A chapter switches); `settleDirtiness` re-dirty check.
- Draft buffer / recovery (`use-draft-buffer.ts`, `draft-recovery.ts`) — IndexedDB write-behind every 2s while dirty (independent of backoff); djb2-hash dedupe; flush on pagehide/visibility-hidden/unmount; on load, pure `decideRecovery` (restore vs conflict by baseVersion===serverVersion) → "Recovered unsaved changes" toast with Discard action, or conflict path; multi-tab-safe `clearDraft({onlyIfMine})`.
- Offline (`use-online-status.ts`) — navigator.onLine via useSyncExternalStore; one-time offline toast when dirty; reconnect resets backoff and saves; `beforeunload` prompt when dirty + (conflict|offline|network error); crash-safety conflict draft in `localStorage["wmb-conflict-draft-{chapterId}"]`.
- EditorToolbar (`editor-toolbar.tsx`) — role="toolbar" + roving tabindex; 3 responsive densities (≥900 full / overflow / ≤560 compact); buttons: Bold/Italic/Underline (aria-pressed), H1/H2/H3, bullet/ordered list, blockquote, scene break (HR), undo/redo, Focus Mode toggle, GraduatedFocus popover, Find&Replace (Ctrl+Shift+F), AI Rewrite (F2), AI Ghost Text toggle, Agent Quick Chat toggle, Split View toggle (desktop), Immersive Mode (in overflow dropdown), Annotations toggle, Findings toggle (pending badge, 99+ cap), Series Context toggle (series books only), Version History toggle, AmbientSoundscape + ReadAloud (kept mounted at compact so audio survives), save badge (Saving/Unsaved/Saved).
- Focus modes — GraduatedFocus (levels 0 Normal / 1 Focused / 2 Paragraph; level 3 hidden alias); TypewriterMode (caret-line centering at 40%, active with focus mode); ImmersiveFocusMode (full-screen dialog, dark/sepia/paper themes, session words+timer+wpm, requestFullscreen, Esc exits, focus trap, aria announce, HTML sanitized via `immersive-safety.ts`, 1.2s/2.5s-max-wait sync scheduler back to Tiptap); AmbientSoundscape (Web Audio brown-noise, 6 scapes rain/coffee/library/fire/forest/ocean, volume slider, no audio files).
- Findings-in-editor — AnnotationExtension inline decorations (insert/delete/comment/ai/finding/severity/continuity types, overlapping-click detection); AnnotationTooltip (Accept/Reject, Go-to-chapter/Intentional for continuity flags, "Let's talk about this" → discussion, diff for auto-apply); GutterMarkers (right-edge severity dots, 24px touch targets, hover previews); EditorFindingsPanel (inline 40% resizable panel on lg+, filter chips, FindingConversation inline, highlight+pulse); FindingsSheet (modal sheet <lg, bottom on phone/right on tablet, restores focus to the toggle); OverlappingFindingsPopover; F8/Shift+F8 navigation with "Finding N of M" announcements (`use-finding-navigation.ts`); ContinuityIndicator badge ("checking…" / "N here · M elsewhere", silent when clean); AmbientSeriesPanel (characters/open threads/tone drift vs baseline; handles graph-offline/not-ready/standalone-book).
- AI-in-editor — AIGhostText (1.5s pause trigger, ≥50-char context, ≤150-char suggestion, POST /ghost-text, Tab accepts, Esc dismisses, abortable); InlineEditPopup (F2/toolbar/context menu; 8 preset pills + free text; 3 alternatives via POST /inline-edit; arrow-browse, Enter accept); EditorContextMenu (right-click selection: Expand/Tighten/Change POV/Sensory details/Increase tension/Show-don't-tell/Describe your change/Ask Writing Coach); FloatingAgentInput (selection-anchored quick chat → agent panel with quoted selection).
- Version history — VersionHistoryPanel (inline w-64 lg+ / sheet below; change-type badges AI/Manual/Restore/Import, word delta, View/Compare (LCS DiffView)/Restore with confirm dialog); SaveConflictDialog (local-vs-server diff; "Keep mine" re-stamped save / "Load theirs" with backup save first; clears conflict draft).
- Find & replace (`find-replace-dialog.tsx`) — chapter or book scope, case-sensitive switch, 300ms-debounced live preview, replace-all (plain text only, no regex).
- Split view — SplitEditor (2 resizable panes, min 30%, secondary pane store destroyed on close, auto-disabled on mobile); SplitChapterPicker; single-ownership keyboard shortcuts across panes.
- Status bar (`editor-status-bar.tsx`) — word count + reading time (250wpm); SessionTimer (15-90min presets, SVG ring, overtime); annotation-count cluster + AnnotationLegend popover (first-use pulse, sessionStorage `wmb:legend-seen`); conflict chip; aria-live save cluster with distinct states Saving / Offline-saved-on-device / Offline-not-saved / Sync-pending / Unsaved / Saved HH:MM (`data-testid="editor-save-status"`).
- ChapterContextHeader — chapter title + status badge (8 statuses) + WordTargetPopover (set/edit/clear target) + progress bar.
- Analysis toys — PacingHeatmap (sentence-length bars, short/medium/long/very-long, avg + % stats); ProseSyntaxHighlight (iA-Writer-style word-class coloring, adverb/adjective %, read-only preview); ReadAloud (Web Speech, play/pause/skip, voice select en/sr/de/es/fr, 0.5-2x rate, per-sentence highlight).
- A11y — LiveAnnouncer (single polite live region, 150ms debounce, 3s self-clear); `use-toolbar-roving` (WAI-ARIA toolbar pattern).
- AuthorshipTracker — human/AI/AI-edited % readout with honesty gate; effectively always hidden because status bar feeds a 100%-human placeholder (provenance not wired) (?).

## 4. AI co-author (CAS) / agent surfaces (`components/agent/`, `stores/agent-*`)

- Panel modes (`agent-ui-store.ts`) — 5: hidden | bubble | mini | overlay | panel (docked 400px, 440px ≥1600px); default bubble; full-width routes (`/chapters/`, `/editorial`) force overlay; auto-downgrade panel→overlay <1400px; mobile overlay = 60vh bottom sheet + backdrop; persisted in localStorage `wmb-agent-panel`, `wmb-agent-panel:default`, `wmb-agent-panel:fullwidth`, `wmb-agent-expanded-mode`.
- AICompanionBubble — floating bubble w/ unread badge (increments on completion while collapsed) + retrievable onboarding-offer pills; AIMiniPanel — compact floating mode; FloatingAgentOverlay — desktop floating window.
- AgentPanel (`agent-panel.tsx`) — idle → ProactiveGuide; "browse all" → WorkflowSelector (Journeys / All Workflows tabs, per-workflow CostBadge green/yellow/red + "Requires sonnet+/opus+" block, Add-to-queue); no API key → settings prompt; session history (last 10); running: header status badge + current step, Background badge, Stop, dock/undock, close; stats bar Turn N/50, tokens, live $cost/$budget %, ETA range; `+15 min` extension (max 2); background queueing; auto-chains queue 2s after completion.
- MessageStream (`message-stream.tsx`) — react-markdown+GFM; tool-call status lines (spinner/check, DelegateToSpecialist hidden); thinking blocks; budget/status banners; delegation cards; ApprovalCard gates: Approve / Modify (textarea) / Reject + countdown to `approvalDeadline` ("Timed Out"); completion card (tokens, ~$cost); ended-early card w/ "Continue where it left off"; Session Complete summary (findings, status advanced, beta gate passed/near-miss/failed) + suggested-next one-click buttons; "Show in text" → editor scroll; 200ms render throttle, scroll-away jump button.
- ConversationInput — auto-resize textarea + Send; Enter/Shift+Enter only (no slash commands, attachments, or model picker).
- Streaming (`use-agent-stream.ts`) — SSE `EventSource` per running session → `/api/books/{bookId}/agent/{sessionId}/stream`; handles complete (invalidates ~12 query keys) / cost_update / budget_warning / error (key-error invalidates api-keys); native ES retry only; onerror → "Connection lost"; 45s no-first-message backstop "no worker available"; cancel = POST /agent/{sessionId}/cancel.
- WorkflowQueue — Queue(N) list, reorder up/down, remove, Clear all, Start All; in-memory only.
- SessionProgressList — multi-session rows (status, BG badge, live step, elapsed vs estimate, live $cost, activate/dismiss).
- ProactiveGuide — context-aware idle screen: greenfield conversational onboarding (freeform → coach; journey cards), book-state summary, journey progress, setup x/3, primary CTA w/ pre-flight cost estimate + beta score, "Run all setup" batch, timeout re-run banner.
- CharacterChat (`character-chat.tsx`, mounted in Library tab) — pick wiki character, role-played chat (last-10 history to /character-chat), serif-italic bubbles, reset.
- SuggestionFeedback — thumbs up/down (+optional text ≤500) → POST /feedback, fire-and-forget; embedded in FindingCard post-resolution.
- Session persistence (`agent-session-store.ts`) — sessionStorage `wmb-active-sessions` (running sessions only: ids, workflow, timing, background flag); messages/cost NOT persisted; SSE re-attaches to recovered sessions; hydrated once from `(app)/layout.tsx`.

## 5. Editorial & findings (`components/editorial/`)

- EditorialPage (`editorial-page.tsx`) — ChapterSelector (all/one); Run Dev-Edit / Line-Edit / Beta-Read workflow buttons; Batch dialog trigger; per-stage chapter counts; FindingsFilters; tabs Findings / History / Summary; zero-chapter empty state → Setup.
- FindingsPanel — filtered list + count; "Show in text" navigates to chapter editor with scroll target; filter-aware empty state w/ reset.
- FindingCard — severity/category/status badges, auto-apply and stale ("text changed") badges, collapsible original→replacement diff; actions pending: Jump to text / Apply / Dismiss / Discuss; applied/dismissed: **Undo**; inline 409 "original text not found" error; SuggestionFeedback after resolution.
- FindingConversation — threaded discussion per finding: role-styled bubbles (user right / assistant left), AI-proposed revision rendered in AIRewriteComparison (accept→apply, reject→dismiss), "Use it" / "Keep as-is" bar (Keep-as-is persists a remembered constraint: "I'll remember: …"), free-text input capped at 3 exchanges. This doubles as the "intentional" path for editorial findings; editor-side continuity flags additionally get an explicit Intentional button in AnnotationTooltip (§3).
- FindingsFilters — severity / category (20 incl. continuity, ai-tell, crutch-phrase) / status / agent-type + Reset all.
- EditHistoryTimeline — apply/dismiss/undo/session_complete timeline, chapter-scoped, skeleton + empty states.
- EditorialSummary — total/pending/applied/dismissed stat cards + severity bars + chapters-with-pending.

## 6. Batch / overnight (`editorial/batch-editorial-dialog.tsx`)

- BatchEditorialDialog — configure: multi-select passes (dev-edit, line-edit, beta-read, analyze — non-prose-mutating only), chapter range, budget cap USD (default $10, max $25), schedule now | tonight (next local 2am); POST `/api/books/{id}/batch`.
- Status view — 3s poll of `/batch/{batchId}` until done|failed|cancelled; status badge, $spent/$cap, progress bar, done/total passes, skipped/failed/halted (+haltReason) counts; Cancel (POST /cancel, "remaining passes skipped"); New batch reset. Digest field is fetched in the response type but not rendered in this dialog (?).

## 7. Book views, stats & gamification (`components/book/`)

- BookViewSwitcher — 4-way chapter view toggle List/Canvas/Pipeline/Corkboard (persisted to localStorage) + Add Chapter; List = table w/ inline-editable title, act, status badge, words, target progress, beta-score badge; empty state.
- BookCanvas + CanvasChapterCard — dnd-kit drag-reorder grid → atomic renumber PATCH, rollback toast on failure.
- CorkboardView — Scrivener-style index cards, HTML5 drag reorder via /chapters/reorder, rollback toast.
- ChapterPipeline + PipelineColumn/PipelineCard — kanban across 8 statuses; drag between columns → PATCH status; drop-here empty columns.
- InlineEditableTitle — click-to-edit, Enter save / Esc cancel / blur save.
- StartWorkflowButton — opens agent panel pre-loaded with a workflow.
- WritingDashboard (/books/[id]/dashboard) — 4 stat cards (today/streak/weekly avg/total), DailyWordChart (Recharts 30-day bars), 3 GoalProgressCards (daily/weekly/total, inline set-goal), StoryHealthDashboard, WritingSprints, MarketingKit; skeletons.
- StoryHealthDashboard — 5 metrics (drafting/editorial/beta/findings/foundation) progress bars + overall % badge.
- StoryRadar — pacing & staleness alerts from /radar (critical/warning/info), refresh, loading/error-retry/all-clear states.
- ProactiveNotifications — "Heads Up": streak-at-risk, pending findings, stale chapters (14d+), top-5 priority-sorted deep links.
- DailyWritingPlan — AI "Today's Plan" checkable tasks (type emoji, est. minutes); checkbox state is client-only (?).
- WritingHeatmap — GitHub-style 365-day grid, per-day tooltips, streak badges, legend.
- CompletionForecast — projected finish date from velocity (used inside dashboard components).
- ChapterWordGoals — book rollup bar + per-chapter mini bars with tooltips.
- WritingSprints — 5-30min timed sprints, start/pause/resume/end, live words + wpm, localStorage personal best, celebration toast.
- WritingAchievements — 13 badges (words/streak/chapters/beta/sprint/findings), earned count + tooltips.
- MilestoneRewards — unlockable themes/sounds/fonts/badges, unlock toast + pulse (localStorage-tracked).
- LifetimeStats — all-time stat boxes + "N novels' worth" line.
- DraftCertificate — printable completion certificate + Web Share/clipboard share (rendered at 100% drafted).
- ShareableProgressCard — screenshot-ready milestone card + Share.
- YearInWritingWrapped / WritingWrappedCard — Spotify-Wrapped swipeable deck (words, streak, time-of-day persona, monthly peaks, personality) behind a lazy-expanding teaser card on /dashboard.
- MarketingKit — AI-generated logline/blurb/store/social/email/comps in tabs w/ per-field copy buttons; generate + loading states. Invoked with empty bookTitle from WritingDashboard (?).

## 8. Wiki / story bible / documents library (`components/book/`)

- DocumentsLibrary — docs grouped by workflow stage (Setup/Chapters/Editorial/Reports/Other) with per-chapter sub-groups; search + type filter; New Document; context-aware quick-action workflow buttons; per-group empty-state CTAs.
- WikiPage — entity browser: type tabs (all/character/location/item/event/lore), debounced search, New Entry, "Populate from documents" (AI, reports created count), skeletons, dual-CTA empty state.
- WikiEntityCard — type icon/color, name, type badge, aliases, truncated description.
- WikiEntityDetail — slide-out Sheet editor: name, type select, alias chips, description, key/value attributes, source label; Save + Delete.

## 9. Reports tabs (`components/reports/`)

- AnalyticsTab — Recharts sub-tabs: Beta Scores (per-chapter bars w/ click-to-chapter, avg line, histogram, progression), Readability (FK/Fog/Coleman-Liau vs genre ranges), Pacing (tension area vs genre avg), Dialogue (per-character), Overuse (word ratios), Cost (total + key-source pie / "100% your keys"); empty state prompts analyst run.
- ContinuityTab — 6 domain tiles (characters/timeline/geography/objects/relationships/world) w/ severity counts, click-to-filter; renders CONTINUITY_REPORT doc; read-only findings list; "Run Continuity Check" workflow button.
- MarketTab — MARKET_REPORT doc or empty state + "Run Market Analysis".
- EditsOverviewTab — 5 stat cards + recent-20 findings (read-only).
- DocumentsTab — flat doc list linking to viewer; empty state.

## 10. Series (`components/series/`)

- SeriesBookManager — reorder up/down, add existing series-less book or create new, remove w/ confirm dialog (doesn't delete the book).
- SeriesProgressGrid — series analytics: 4 totals + per-book status/chapter-status chips.
- SeriesInheritancePanel — target-book picker → inheritable-docs table (Own/Available/Missing) w/ per-doc Inherit + Apply All Available.
- SeriesSynthesisPanel — artifact-type select → per-book Has-Artifact table + Synthesize (book → series doc roll-up).
- SeriesDocumentsPanel — series doc list (title/type/version); empty state points at agent panel.

## 11. Import / export (`components/import-export/`)

- ImportWizard — 3 phases Upload → Preview&Edit → Done; on success optionally auto-starts `onboard-imported-book` workflow (autoAnalyze default on).
- FileDropzone — drag/click, .docx/.md/.txt, 20MB cap, extension filtering.
- ChapterPreviewList — dnd-kit sortable (keyboard-sortable), inline rename, multi-select Merge, remove, auto-renumber, total words, replace-existing warning, create/replace/skip actions.
- ExportPage — FormatSelector (DOCX / PDF-Typst / EPUB3) + guidance; Draft Mode switch (watermark/skip recto); Configure dialog; Export w/ indeterminate progress + elapsed timer; result card (filename/words/chapters/~pages/warnings); Download-last shortcut; Export History card. Export is never plan-gated (`lib/billing/plan-gating.ts:22`).
- ExportConfigDialog — tabs Metadata (title/subtitle/author/series/ISBN/publisher/copyright/scene-break glyph/trim size), Front Matter, Back Matter, Style (oxford comma, spell-out numbers, closed em-dashes, thin-space ellipsis, hyphenation, justified).
- ExportHistoryList — past exports w/ format icon + download.
- ManuscriptReadiness — pre-export gate: 6 checks (drafted/edited/beta-passed/pending findings/fingerprint/story bible) pass/warn/fail + quality-score bar; "Run Publishing Check" / "Export (Anyway)".
- ExportPreview — CSS-only Vellum-style device preview (print/kindle/ipad/phone); not imported by ExportPage — unmounted (?).

## 12. Onboarding (`components/onboarding/`)

- OnboardingWizard — 3 steps w/ progress dots: Welcome (BYOK pitch) → Add Keys (ProviderCards; Continue requires ≥1 connected) → Default Provider (radio); Finish → POST /settings/onboarding + PATCH default-model → /dashboard.
- ProviderCard — per-provider states disconnected/adding/validating/connected/error; key input + label, Validate & Save (server-side validation), Replace, Remove (400 last-key / 409 active-session errors surfaced), masked key, "Get key" doc links, cost hints; providers: anthropic, openrouter, openai, gemini, grok.
- OnboardingWatcher (mounted on chapter editor) — invisible driver for write-first onboarding offers (by word count/setup state) surfacing as bubble offer pills.
- AnalysisProgress — maps agent SSE delegation events to a 4-step checklist (read→style→bible→architecture).
- Middleware onboarding gate — authed routes without `wmb_onboarded=1` cookie redirect to /onboarding (exempt: /onboarding, settings/onboarding + api-keys APIs).

## 13. Settings, BYOK & models (`components/settings/`, `components/memory/`)

- ApiKeysSection — all providers as ProviderCards + per-provider usage summary (sessions · ~$cost).
- ModelSelectionSection — global default model + 6 per-role overrides (ghostwriter/editor/beta-reader/analyst/coach/creative), 500ms-debounced saves; providers derived from validated keys only.
- ModelPicker — grouped-by-provider, tier-sorted, cost-tier badges ($/$$/$$$), "Use Default" sentinel, "No providers connected" fallback.
- MemorySettings — Qdrant status badge, chunks/searches/last-indexed/embedding-cost, unhealthy warning.
- MemoryStatsCard (book overview) — per-book chunk count, Rebuild index + Clear (confirm dialog).
- WriterMemoryPanel — writer-preference CRUD grouped by category, AI-learned source badges; not mounted anywhere in src (?).

## 14. Billing, plans & gating (`components/billing/`, `lib/billing/`)

- Plan matrix (`lib/billing/stripe-client.ts`) — Founder $19/mo (200 slots, ∞ books, no trial); Indie $49/mo|$490/yr (2 books, gated: series, analytics); Professional $99/mo|$990/yr (∞); Publisher $499/mo|$4990/yr (+"Coming Soon" multi-user/API/white-label); 14-day trials except Founder; Enterprise = mailto only.
- UpgradeModal — zustand-driven dialog (reason + tier blurb) → /settings/billing; mounted in AppSidebar.
- PlanGate + usePlanAccess (`plan-gate.tsx`) — blur+lock overlay component; defined but consumed nowhere in src (?) — client gating is ad-hoc `hasProAccess` lock icons.
- Client-side gating (non-blocking lock icons, `app-sidebar.tsx:105,213,334,604`) — Series nav, Series analytics, Reports for plans below professional.
- Server-side enforcement (`lib/billing/plan-gating.ts`; api routes) — create_book vs maxBooks; create_series + use_analytics require professional+; run_agent quota gates agent/batch/inline-edit/ghost-text APIs; export always allowed; inactive subscription → read-only; no Stripe configured → everything open.
- Landing PricingSection — monthly/annual switch, Founder ring + FounderCounter ("Only N remaining" via /founder-count), CTAs Claim Founder Spot / Contact Us / Start 14-Day Free Trial.
- Feature flags — none; only env-conditional behavior: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY presence (hides auth UI, landing redirect, middleware 503/401), DEV_AUTH_BYPASS (non-prod), E2E_TEST_SECRET header (non-prod), STRIPE_SECRET_KEY (billing off ⇒ gating open), NEXT_PUBLIC_SENTRY_DSN.

## 15. Shelf (`components/shelf/`)

- ShelfSection — titled grid per state; empty active shelves hidden; Archived is a collapsible `<details>`.
- ShelfBookCard — title link, genre badge, per-shelf CTA (Continue → Ch N / Review feedback / Open); archived dimmed.
- ArchiveMenu — dropdown Archive (confirm dialog) / Restore → POST /books/{id}/archive, toast + router.refresh().

## 16. Style & journey (`components/style/`, `components/journey/`)

- StyleProfileViewer — fingerprint dashboard: metric cards (sentence/paragraph length, vocab richness, dialogue ratio, punctuation, narrative distance, POV, metaphor domains), calibration quotes, collapsible prose fingerprint; empty/no-metrics states.
- CharacterLensEditor — per-POV voice lenses CRUD (sensory priority, metaphor domain, interior style, register, blind spots); not mounted anywhere in src (?).
- JourneyChecklist (sidebar) — journey steps done/current/pending, warnings, X/Y counter, change-journey pencil, completion celebration.
- JourneySelectorDialog — journey picker grid w/ recommended badge; confirm step when switching journeys.
- JourneyBanner — exists but not mounted (removed per book-layout comment) (?).

## 17. Client state driving UI (`stores/`, `hooks/`)

- editor-store — per-pane zustand registry (split view); isDirty/isSaving/documentVersion/saveConflict/loadEpoch/lastSaveErrorKind + UI toggles; no content field (Tiptap is source of truth); in-memory only.
- active-editor-store — global active book/chapter/document + split mode; feeds `usePageContext` so the agent knows what you're looking at.
- agent-ui-store / agent-session-store — panel modes + persistence keys (§4); running-session recovery via sessionStorage; workflow queue in-memory.
- editorial-store — chapter selection + finding filters for editorial page; export-store — export config state.
- Notable hooks — use-draft-buffer (IndexedDB autosave shadow), use-online-status, use-agent-stream (SSE), use-continuity-scan (idle scan on chapter switch + 20s after last edit; markIntentional optimistic), use-ambient-context (series context, 5min stale), use-workflow-costs (pre-flight estimates), use-onboarding-offers, use-page-context, use-mobile (768px), use-billing, use-api-keys, use-find-replace, use-inline-edit.

## 18. Mobile & accessibility (verified in code)

- Mobile — use-mobile breakpoint 768px; MobileBottomNav (4 tabs); agent bottom sheet 60vh; editor dvh heights + `interactiveWidget: resizes-content` viewport (Android keyboard); ProseMirror scrollMargin note for iOS; split view auto-disabled on mobile; findings render as modal sheet below lg (never self-summons mid-typing); toolbar 3-stage responsive density.
- A11y — LiveAnnouncer polite region (finding nav, immersive enter/exit); aria-live save status in status bar + inline-edit popup; roving tabindex toolbar; aria-pressed toggles; sr-only labels throughout (theme toggle, sheets, dialogs, severity text); 24px gutter touch targets; focus restore on sheet/tooltip/popover close; immersive focus trap + aria-modal.
- Verified absent — no skip links; no prefers-reduced-motion handling anywhere in src/ or globals.css.

## 19. Present-but-unmounted surfaces (?)

Verified no importer in src/: BookOverviewTabs (`book/book-overview-tabs.tsx`), ExportPreview, JourneyBanner (barrel-exported only), BlackboardPanel (`agent/blackboard-panel.tsx`), WriterMemoryPanel, CharacterLensEditor, DescribeYourChange (`editor/describe-your-change.tsx`), AgentPanelPlaceholder (legacy "Phase 4" stub), ShareableProgressCard + WritingAchievements + CompletionForecast (no page-level importer found — internal-only or dormant (?)). AuthorshipTracker mounted but self-hides (honesty gate + placeholder data).

## 20. States & cross-cutting

- Streaming (SSE) — agent sessions: `EventSource` on `/api/books/{bookId}/agent/{sessionId}/stream` (single live-stream surface; AnalysisProgress and ProactiveGuide consume the same stream events). Batch UI uses 3s polling, ghost-text/inline-edit use plain POST.
- Destructive-action confirms — Delete Book (typed book-name confirmation dialog); Archive book (confirm dialog); Remove book from series (confirm dialog); Clear memory index (confirm dialog); Restore version (confirm dialog); journey switch (confirm step); re-running capture-style/story-bible/architecture (inline confirm); replace-existing chapters warning in import; batch Cancel; beforeunload/window.confirm guards on unsaved-with-conflict navigation.
- Undo affordances — Finding Undo after Apply/Dismiss; editor Ctrl+Z/Ctrl+Shift+Z; draft-recovery toast "Discard" action; version Restore (with pre-restore version retained in history); save-conflict "Keep mine"/"Load theirs" (with backup save); canvas/corkboard reorder rollback on failed PATCH. No global toast-level undo for archive/delete.
- Error toasts (sonner, richColors, bottom-right; auto-dismissed on route change by ToastRouteGuard) — autosave failure streak (3+), offline-while-dirty, save conflict ("Review" action), document changed outside editor, create book/chapter/series errors, delete book failure, archive failure, reorder rollback, API-key add/delete results, import/export failures, batch submit errors, workflow cost/key errors (invalidates api-keys), sprint/milestone celebration toasts (success class).
- Loading/empty states — skeletons (chapters index, editorial history, wiki, writing dashboard); zero-states with CTAs on books, series, chapters, documents, findings, wiki, style, reports tabs, export history; error-retry states on StoryRadar and series detail.
