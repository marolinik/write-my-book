# COVERAGE MATRIX — every feature, every capability, mapped to an owning persona

Built from `inventory/{UI,API,CAPABILITY}-SURFACE.md` (verified 2026-07-17, main@478359c).
> **Rule:** every row must end **PASS / FIXED+PASS / N-A(reason) / BLOCKED-ENV(reason)** — no blanks. Every row ≥1 owner persona; no orphans (see §Z).
**Owner** = persona whose journey executes the row (P1 Maya debut · P2 Gerald pro · P3 Selena series · P4 Priya volume · P5 Sam hobbyist · P6 Owen stylist · P7 Bao migrator · P8 Rita trust/ops). ALL rows additionally carry cross-cutting §NF capture regardless of owner.
**Status** + **Evidence** columns filled during execution (evidence path under `evidence/<persona>/`).

NF legend: `Pf`=perf timing · `Lf`=look&feel light+dark · `Er`=ergonomy/keyboard/click-count · `Ax`=accessibility · `Rs`=resilience/error-path.

---

## SECTION A — UI SURFACE

### A1. Global chrome & shell — Owner P5 (Sam) unless noted
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A1.1 | RootLayout / fonts / theme | 4 fonts load; next-themes light/dark/system, no pre-paint flash; class attr swaps everywhere | P5 | Lf Ax | |
| A1.2 | AppSidebar | Dashboard/Books/Series spine; contextual book group (Setup/Transfer/Style/Chapters/Library/Dashboard/Editorial/Reports/Export); status bars + NEXT badge; Series/Reports lock icon < pro; offcanvas collapse | P5 | Er Lf Ax | |
| A1.3 | AppHeader | breadcrumbs (i18n segment map, book/chapter names, chapter status badge); theme toggle; agent toggle; Clerk UserButton | P5 | Er Lf | |
| A1.4 | CommandPalette (⌘K) | groups Pages/Current Book/Workflows/Actions; workflow opens agent panel; ⚠ book links use legacy /documents /import /export /wiki redirect stubs — verify they resolve | P5 | Er Rs | |
| A1.5 | KeyboardShortcutsDialog (⌘/) | lists Global/Editor/Agent shortcuts; each listed shortcut actually fires | P5 | Er Ax | |
| A1.6 | MobileBottomNav | md:hidden bar Home/Books/Agent/Settings; Agent toggles overlay↔bubble | P5 | Er Lf | |
| A1.7 | ThemeToggle | Light/Dark/System dropdown; sr-only label; applies on every judged screen | P5 | Lf Ax | |
| A1.8 | Toasts (sonner) | success/error/info fire + dismiss; ToastRouteGuard clears on nav; no stacking overflow | P5 | Lf | |
| A1.9 | LanguageProvider ×7 locales | switch each locale on core screens; no untranslated strings; no "2.026 words"-class number/date leaks | P5 | Lf | |
| A1.10 | Onboarding cookie gate (middleware) | authed w/o `wmb_onboarded` → /onboarding; exemptions honored; loop-free | P5 | Rs | |

### A2. Onboarding — Owner P1 (Maya) + P5
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A2.1 | LandingPage | hero/features/how-it-works/BYOK cost examples/pricing/FAQ/JSON-LD; authed → /dashboard redirect | P5 | Lf | |
| A2.2 | OnboardingWizard 3-step | Welcome → Add Keys (≥1 required to continue) → Default Provider; Finish → dashboard | P1 | Er Rs | |
| A2.3 | ProviderCard states | disconnected/adding/validating/connected/error; server-side validate; Replace/Remove (400 last-key, 409 active-session); masked key; plain-language errors (Sam lens) | P1 | Rs Ax | |
| A2.4 | Write-first offer (OnboardingWatcher) | new book → typing in Ch1; offers surface by word-count (2K/5K/10K) as bubble pills; fire ONCE; dismiss = gone forever (anti-nag) | P1 | Er | |
| A2.5 | Time-to-first-word | signup → typing measured ≤ 60s target; BYOK ask arrives at first AI use, not before | P1 | Pf | |

### A3. Manuscript editor (Tiptap) — Owner P2 (Gerald) + P6 (Owen) for AI, P5 mobile
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A3.1 | Core editing + toolbar | Bold/Italic/Underline (aria-pressed), H1-3, lists, blockquote, scene-break HR, undo/redo; 3 responsive densities; roving tabindex | P2 | Er Ax Lf | |
| A3.2 | Autosave + CAS | 2s debounce; backoff 2→60s; failure-streak toast at 3; `expectedVersion` PUT; 409 real-conflict suspends + "Review" toast (dialog never auto-opens); A→B→A loadEpoch guard | P2 | Rs Pf | |
| A3.3 | Draft buffer / recovery (IndexedDB) | write-behind every 2s while dirty; flush on pagehide/hidden/unmount; decideRecovery restore-vs-conflict; "Recovered unsaved changes" + Discard; multi-tab clearDraft | P2 | Rs | |
| A3.4 | Offline handling | offline toast once when dirty; reconnect resets backoff + saves; beforeunload guard when dirty+conflict/offline; localStorage conflict-draft | P2 | Rs | |
| A3.5 | GraduatedFocus + Typewriter | levels Normal/Focused/Paragraph; typewriter caret-centering at 40% | P6 | Lf | |
| A3.6 | ImmersiveFocusMode | full-screen dialog (dark/sepia/paper); session words/timer/wpm; requestFullscreen; Esc exit; focus trap; **sanitize via immersive-safety.ts**; 1.2s/2.5s sync scheduler back to Tiptap (S10 loss-window ≤4.5s claim — VERIFY under kill) | P6 | Rs Ax | |
| A3.7 | AmbientSoundscape + ReadAloud | 6 brown-noise scapes + volume; Web Speech read-aloud play/pause/skip, voice select, per-sentence highlight; survive compact toolbar | P6 | Ax | |
| A3.8 | AIGhostText | 1.5s-pause trigger, ≥50-char ctx, ≤150-char suggestion, Tab accept/Esc dismiss, abortable | P6 | Pf | |
| A3.9 | InlineEditPopup (F2) | 8 preset pills + free text; 3 alternatives; arrow-browse; Enter accept; rendered in-place | P6 | Er | |
| A3.10 | EditorContextMenu | right-click selection: Expand/Tighten/POV/Sensory/Tension/Show-don't-tell/custom/Ask-Coach | P6 | Er | |
| A3.11 | FloatingAgentInput | selection-anchored quick chat → agent panel w/ quoted selection | P6 | Er | |
| A3.12 | Find & Replace | chapter/book scope, case-sensitive, 300ms live preview, replace-all plain-text; anchors survive replace-in-anchored-span (trap) | P2 | Rs Er | |
| A3.13 | Split view | 2 resizable panes, min 30%, secondary store destroyed on close, single-ownership shortcuts, auto-disabled mobile | P2 | Er | |
| A3.14 | Version history | change-type badges, word delta, View/Compare (LCS DiffView)/Restore-with-confirm; SaveConflictDialog Keep-mine/Load-theirs (backup save first) | P2 | Rs | |
| A3.15 | Editor status bar | word count + reading time; SessionTimer presets + SVG ring + overtime; annotation cluster + legend; aria-live save states (Saving/Offline-device/Offline-not-saved/Sync-pending/Unsaved/Saved) | P2 | Ax Lf | |
| A3.16 | ChapterContextHeader | title + 8-status badge + WordTargetPopover (set/edit/clear) + progress bar | P2 | Er | |
| A3.17 | Analysis toys | PacingHeatmap, ProseSyntaxHighlight (word-class coloring, adverb/adjective %), caret never stolen while typing | P6 | Pf | |
| A3.18 | Mobile editor | dvh heights + interactiveWidget viewport; keyboard doesn't cover caret; no horizontal scroll; toolbar compact density; findings = modal sheet (never self-summon mid-typing) | P5 | Er Ax Rs | |
| A3.19 | AuthorshipTracker | mounted but self-hides (honesty gate, provenance unwired) — confirm it does NOT fabricate "100% yours" | P6 | — | |

### A4. Findings-in-editor & continuity — Owner P3 (Selena) continuity, P6 findings
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A4.1 | AnnotationExtension decorations | insert/delete/comment/ai/finding/severity/continuity types; overlapping-click detection | P6 | Lf | |
| A4.2 | AnnotationTooltip | Accept/Reject; continuity Go-to-chapter/Intentional; "Let's talk about this"→discussion; auto-apply diff | P6 | Er | |
| A4.3 | GutterMarkers | right-edge severity dots, 24px targets, hover previews | P6 | Ax | |
| A4.4 | EditorFindingsPanel + FindingsSheet | inline 40% resizable panel lg+; modal sheet <lg (bottom phone/right tablet, restores focus); filter chips; highlight+pulse | P6 | Er Ax | |
| A4.5 | F8/Shift+F8 nav | "Finding N of M" announced via LiveAnnouncer | P6 | Ax | |
| A4.6 | ContinuityIndicator | "checking…"/"N here · M elsewhere"; silent when clean | P3 | Lf | |
| A4.7 | AmbientSeriesPanel | on-stage cast last-known state, open threads, tone-drift chip; graph-offline vs not-ready vs standalone all distinct | P3 | Rs | |

### A5. AI co-author (CAS) / agent panel — Owner P1 (coach) + P4 (queue/background)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A5.1 | Panel modes | hidden/bubble/mini/overlay/panel; full-width routes force overlay; auto-downgrade <1400px; mobile 60vh sheet; localStorage persistence | P1 | Er Lf | |
| A5.2 | AICompanionBubble | floating bubble, unread badge on completion-while-collapsed, retrievable offer pills | P1 | Lf | |
| A5.3 | AgentPanel | idle ProactiveGuide; WorkflowSelector (Journeys/All tabs, CostBadge, tier-block); running header status+step, Stop, dock/undock; stats bar Turn N/50 + tokens + live $cost/$budget% + ETA; +15min ext (max 2) | P1 | Er Rs | |
| A5.4 | MessageStream | markdown+GFM; tool-call status; thinking blocks; ApprovalCard (Approve/Modify/Reject + countdown "Timed Out"); completion card; ended-early "Continue"; Session Complete summary + suggested-next | P1 | Rs Lf | |
| A5.5 | ConversationInput | auto-resize; Enter send / Shift+Enter newline (no slash/attach/model-picker) | P1 | Er | |
| A5.6 | Streaming (SSE) | EventSource per running session; complete invalidates ~12 keys; cost_update/budget_warning/error; 45s no-first-msg "no worker" backstop; cancel POST | P4 | Rs Pf | |
| A5.7 | WorkflowQueue | Queue(N) reorder/remove/Clear/Start-All; auto-chain 2s after completion (in-memory) | P4 | Er | |
| A5.8 | SessionProgressList | multi-session rows: status, BG badge, live step, elapsed vs estimate, live $cost, activate/dismiss | P4 | Rs | |
| A5.9 | ProactiveGuide | greenfield conversational onboarding; book-state summary; setup x/3; primary CTA + pre-flight cost + beta score; "Run all setup" batch | P1 | Er | |
| A5.10 | CharacterChat | pick wiki character, role-played chat (last-10 history), serif-italic bubbles, reset | P3 | Er | |
| A5.11 | SuggestionFeedback | thumbs up/down (+≤500 text) fire-and-forget; negative feeds writer-memory | P6 | — | |
| A5.12 | Session recovery | sessionStorage running-sessions; SSE re-attach after restart; hydrated once from layout | P4 | Rs | |

### A6. Editorial & findings surface — Owner P2 (Gerald) + P6
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A6.1 | EditorialPage | ChapterSelector; Run Dev-Edit/Line-Edit/Beta-Read; Batch trigger; per-stage counts; tabs Findings/History/Summary; zero-chapter → Setup | P2 | Er Rs | |
| A6.2 | FindingCard | severity/category/status + auto-apply/stale badges; collapsible diff; Jump/Apply/Dismiss/Discuss; Undo after apply/dismiss; inline 409 "text not found" | P2 | Er Rs | |
| A6.3 | FindingConversation | role-styled bubbles; AI revision in AIRewriteComparison (accept→apply/reject→dismiss); Use-it/Keep-as-is (persists constraint "I'll remember:…"); 3-exchange cap | P6 | Er | |
| A6.4 | FindingsFilters | severity/category (20 incl. continuity/ai-tell/crutch-phrase)/status/agent-type + Reset | P2 | Er | |
| A6.5 | EditHistoryTimeline | apply/dismiss/undo/session_complete timeline, chapter-scoped, skeleton+empty | P2 | Lf | |
| A6.6 | EditorialSummary | total/pending/applied/dismissed cards + severity bars + chapters-with-pending | P2 | Lf | |

### A7. Batch / overnight — Owner P4 (Priya)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A7.1 | BatchEditorialDialog | multi-select passes (safe editors only); chapter range; cap USD ($10 default/$25 max); schedule now/tonight-2am; POST /batch | P4 | Er Rs | |
| A7.2 | Batch status view | 3s poll; status badge, $spent/$cap, progress, done/total, skipped/failed/halted+reason; Cancel; New batch | P4 | Rs | |
| A7.3 | Digest rendering | ⚠ digest fetched in response type but NOT rendered in dialog — verify morning digest reaches the user somewhere (BookNotification?) | P4 | Rs | |

### A8. Book views, stats & gamification — Owner P1 (Maya) + P5
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A8.1 | BookViewSwitcher | List/Canvas/Pipeline/Corkboard toggle (persisted); List inline-editable | P1 | Er | |
| A8.2 | Canvas/Corkboard/Pipeline reorder | dnd-kit + HTML5 drag → atomic renumber PATCH; rollback toast on failure; kanban status drag | P1 | Rs | |
| A8.3 | WritingDashboard | today/streak/weekly-avg/total cards; DailyWordChart 30-day; 3 GoalProgressCards inline-set; StoryHealthDashboard; WritingSprints; MarketingKit | P1 | Lf | |
| A8.4 | StoryHealthDashboard | 5 metrics (drafting/editorial/beta/findings/foundation) + honest overall % (NOT vanity 100%) | P1 | Lf | |
| A8.5 | StoryRadar | pacing/staleness alerts from /radar; refresh; loading/error-retry/all-clear; **real analysis not template** | P1 | Rs | |
| A8.6 | ProactiveNotifications | streak-at-risk/pending-findings/stale-chapters priority-sorted deep links | P1 | Er | |
| A8.7 | DailyWritingPlan | checkable tasks (emoji, est. minutes); ⚠ checkbox state client-only — verify persistence expectation | P1 | Er | |
| A8.8 | WritingHeatmap | 365-day grid, tooltips, streak badges, legend | P1 | Lf | |
| A8.9 | Streaks / today-words | **REAL computed values, not hardcoded 0** (the fixed dead-loop); day-2 return hook fires (seed backdated) | P1 | — | |
| A8.10 | WritingSprints | 5-30min timer start/pause/resume/end; live words+wpm; localStorage best; celebration toast | P1 | Er | |
| A8.11 | Achievements / Milestones / Lifetime | 13 badges; unlockable themes/sounds/fonts; all-time boxes; localStorage-tracked | P1 | Lf | |
| A8.12 | DraftCertificate / ShareableProgress / Wrapped | printable cert at 100% drafted; screenshot milestone card; Spotify-Wrapped deck | P1 | Lf | |
| A8.13 | MarketingKit | AI logline/blurb/store/social/email/comps tabs + copy buttons; ⚠ verify bookTitle not empty when invoked from dashboard | P1 | Rs | |

### A9. Wiki / story bible / documents library — Owner P7 (Bao) + P3
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A9.1 | DocumentsLibrary | docs grouped by stage + per-chapter sub-groups; search + type filter; quick-action workflow buttons; empty-state CTAs | P7 | Er | |
| A9.2 | WikiPage | type tabs (character/location/item/event/lore); debounced search; New Entry; "Populate from documents" (AI, count); dual-CTA empty | P3 | Rs | |
| A9.3 | WikiEntityCard + Detail | card (icon/color/aliases/desc); slide-out editor (name/type/aliases/desc/attrs/source) Save+Delete | P3 | Er | |
| A9.4 | DocumentEditor | Tiptap doc editor per-pane; 2s CAS autosave + SaveConflictDialog (toast "changed outside"); versions; inline AI; prev/next same-type nav; findings auto-open lg+ | P7 | Rs | |

### A10. Reports — Owner P2 (Gerald) + P3 (continuity)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A10.1 | AnalyticsTab | Beta Scores/Readability(FK/Fog/Coleman-Liau)/Pacing/Dialogue/Overuse/Cost sub-tabs; empty prompts analyst run | P2 | Lf | |
| A10.2 | ContinuityTab | 6 domain tiles + severity counts + click-filter; CONTINUITY_REPORT render; Run Continuity Check | P3 | Rs | |
| A10.3 | MarketTab / EditsOverview / DocumentsTab | MARKET_REPORT or empty; 5 stat cards + recent-20; flat doc list | P2 | Lf | |

### A11. Series — Owner P3 (Selena)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A11.1 | SeriesList / NewSeries | cards (type/x-of-planned/doc count); create form (title/genre/type/planned/desc); zero-state | P3 | Er Lf | |
| A11.2 | SeriesDetail tabs | Overview (stats/SeriesBookManager/3 series-doc cards/continuity status) + Documents/Inheritance/Synthesis/Analytics; Cross-Book Continuity Check button | P3 | Rs | |
| A11.3 | SeriesBookManager | reorder; add existing (ownership-checked)/create new; remove w/ confirm (doesn't delete book) | P3 | Rs | |
| A11.4 | SeriesInheritancePanel | target-book picker → inheritable-docs table (Own/Available/Missing) + Inherit/Apply-All | P3 | Er | |
| A11.5 | SeriesSynthesisPanel | artifact-type select → per-book Has-Artifact table + Synthesize (book→series roll-up) | P3 | Er | |
| A11.6 | SeriesProgressGrid (analytics) | 4 totals + per-book status chips; **pro-gated** — prove DENY below pro | P3 | Rs | |

### A12. Import / export — Owner P7 (Bao)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A12.1 | ImportWizard | Upload→Preview&Edit→Done; auto-start onboard-imported-book (autoAnalyze on) | P7 | Rs | |
| A12.2 | FileDropzone | .docx/.md/.txt, 20MB cap, extension filter, drag+click | P7 | Rs | |
| A12.3 | ChapterPreviewList | dnd-kit + keyboard sortable; inline rename; multi-select Merge; remove; auto-renumber; replace-existing warning | P7 | Er | |
| A12.4 | ExportPage | FormatSelector (DOCX/PDF-Typst/EPUB3); Draft Mode watermark; Configure; indeterminate progress + timer; result card (filename/words/chapters/~pages/warnings); Download-last; History | P7 | Rs Lf | |
| A12.5 | ExportConfigDialog | Metadata/FrontMatter/BackMatter/Style tabs (ISBN/trim size/oxford comma/em-dash/ellipsis/…) | P7 | Er | |
| A12.6 | ManuscriptReadiness | 6 pre-export checks + quality-score bar; Run Publishing Check / Export Anyway | P7 | Lf | |
| A12.7 | Export fidelity | every chapter 3 formats: normalized-diff vs DB = 0 loss; titles/TOC correct (F9); EPUB opens in reader; page-count vs estimate honest (B3); metadata correct; F10 xhtml-title residual noted | P7 | — | |

### A13. Settings & billing — Owner P8 (Rita) + P6 (models)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A13.1 | Settings root | language select; ApiKeysSection; ModelSelectionSection; MemorySettings; BYOK info | P6 | Er Rs | |
| A13.2 | ApiKeysSection | all providers as ProviderCards + per-provider usage (sessions·$cost) | P6 | Rs | |
| A13.3 | ModelSelectionSection | global default + 6 per-role overrides (500ms debounce); providers from validated keys only | P6 | Er | |
| A13.4 | ModelPicker | grouped-by-provider, tier-sorted, cost badges, Use-Default sentinel, no-providers fallback | P6 | Er | |
| A13.5 | MemorySettings / MemoryStatsCard | Qdrant status; chunks/searches/last-indexed/cost; Rebuild + Clear (confirm) | P7 | Rs | |
| A13.6 | Billing page | Stripe-unconfigured warning; trial banner; Monthly/Annual toggle; 4 plan cards (current ring, Founder sold-out 30s-poll); checkout + manage-billing; Token Usage (agent/model/book) | P8 | Rs Lf | |
| A13.7 | BookSettings | model overrides (book default + 6 roles w/ resolution-source labels); Style strictness+auto-commit; Beta panel size/consensus/convergence; Danger Zone Delete (typed-name confirm) | P2 | Rs | |

### A14. Style & journey — Owner P6 (Owen)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A14.1 | StyleProfileViewer | metric cards (sentence/para length, vocab, dialogue ratio, punctuation, narrative distance, POV, metaphor domains); calibration quotes; prose fingerprint; empty states | P6 | Lf | |
| A14.2 | Style page actions | Capture/Refresh/Evolve Style; re-run confirm if fingerprint exists; captured-date | P6 | Rs | |
| A14.3 | JourneyChecklist + Selector | steps done/current/pending; X/Y counter; change-journey confirm; completion celebration | P1 | Er | |

### A15. Shelf — Owner P1 (Maya) + P2
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A15.1 | BookShelfPage 4 shelves | Currently Writing/Waiting/Completed/Archived(collapsible); chapter-status rollups; last-chapter Continue deep-link; graceful degrade on query fail | P1 | Lf Rs | |
| A15.2 | ShelfBookCard | title link, genre badge, per-shelf CTA (Continue→Ch N / Review feedback / Open); archived dimmed | P1 | Lf | |
| A15.3 | ArchiveMenu | Archive (confirm)/Restore → POST /archive, toast + refresh | P1 | Rs | |

### A16. Dashboard & book overview — Owner P1 (Maya)
| ID | Surface | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| A16.1 | Dashboard | 4 quick actions; 4 stat cards; Continue-where-left-off deep link; 7-day activity chart; Pending Alerts; Recent Sessions; Recent Books + zero-state; Series grid | P1 | Lf Rs | |
| A16.2 | BookOverview | header/status/synopsis; Recommended-Next-Step banner (rule-based) + StartWorkflowButton; Progress meter + word-target; stats + MemoryStatsCard; setup x/5 banner; radar+daily-plan; ProactiveNotifications; DraftCertificate at 100% | P1 | Lf | |
| A16.3 | Setup wizard 6-step | Basics→Import→Style→Story Bible→Architecture→Done; auto-resume first incomplete; re-run confirms; blocks steps while agent running | P1 | Rs Er | |

---

## SECTION B — API SURFACE (direct-HTTP verification, per-persona auth)

### B1. Books/chapters/documents core — Owner P2 (Gerald) + P7
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B1.1 | books CRUD + archive | list/create(+Ch1+plan-gate+409 dup+cross-user seriesId reject)/get/patch/delete(cascade+vector cleanup)/archive(ownership updateMany→404) | P2 | Rs | |
| B1.2 | chapters CRUD + content | list/create/get/patch/delete; **PUT content CAS 409 version_conflict** w/ serverContent; U+FFFD sanitize | P2 | Rs | |
| B1.3 | chapters reorder | atomic two-phase renumber (chapters + scoped docs); unique-safe; foreign chapterId→404; dup ids/numbers→400 | P2 | Rs | |
| B1.4 | documents CRUD + versions + restore | list/create/get/patch(CAS 409)/delete(vector cleanup); versions list/get; restore | P7 | Rs | |
| B1.5 | search + replace | GET search (2-200 chars, zod); POST replace-all (versions minted, chapterIds narrowed to book) | P2 | Rs | |
| B1.6 | import/export API | import (JSON confirm | multipart 20MB); import/preview (per-file warnings); export (pipeline); export list; **export/[filename] path-traversal reject**; export/config get/put | P7 | Rs | |

### B2. Agent / CAS / batch — Owner P1 + P4
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B2.1 | POST agent | Writing Coach start; plan-gate 429; prereq 422; setup guard 422+redirect; min-tier 422; BYOK 400; dual-path inline-vs-queue; finite budget | P1 | Rs | |
| B2.2 | SSE stream | Redis replay + in-memory; Last-Event-ID; 15s keepalive; 10s worker watchdog SSE-error; 13 event types; auth 401 JSON vs missing-session SSE-error | P4 | Rs | |
| B2.3 | message / approve / cancel | continue conversational (DB rehydrate); approve/reject/modify (Redis 10-min TTL, 409 resolved); cancel idempotent (halt flag + terminal publish + job removal) | P1 | Rs | |
| B2.4 | batch create/list/get/cancel | eligibility guard (safe-editors 400 else); cap $10/$25 finite→400; quota 429; fan-out 201; poll child-status; cancel (Redis halt 24h + digest still runs) | P4 | Rs | |

### B3. Editorial / continuity — Owner P6 + P3
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B3.1 | findings list/create/patch/undo | apply (exact→fuzzy match, **409 if text gone**); dismiss (writer-memory inference + constraint persist); undo (revert edit, 400 if pending) | P6 | Rs | |
| B3.2 | discuss GET/POST | thread + canDiscuss; **rate limit 200/24h→429**; **3-turn cap FOR UPDATE→409**; LLM outside lock | P6 | Rs | |
| B3.3 | dismiss-pattern + history + summary | pattern upsert; EditAction log; groupBy stats | P6 | — | |
| B3.4 | continuity scan/intentional | Neo4j checks + flag sync; 90s throttle; 5s graph timeout → degraded:true (never deletes flags); intentional updateMany→404 | P3 | Rs | |

### B4. Writing-assist AI — Owner P6 + P1
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B4.1 | ghost-text / inline-edit | cheap-tier; quota 429; zod; 400 no key; UsageRecord | P6 | Rs | |
| B4.2 | character-chat | ⚠ **no plan gate, no zod** (manual check); ⚠ 500 leaks raw error.message — VERIFY/FIX | P3 | Rs | |
| B4.3 | daily-plan/radar/analysis/cost-estimate | heuristic (no LLM); ⚠ requireUser outside try/catch → 500 not 401 (daily-plan/radar/wiki/marketing/wrapped) — VERIFY | P1 | Rs | |
| B4.4 | feedback | thumbs upsert; negative→writer-memory (never fails POST); ⚠ 500 echoes err.message | P6 | — | |
| B4.5 | marketing-kit / wiki + wiki/populate | read ($queryRaw parameterized) + generate (BYOK); wiki CRUD (relation-filter ownership); populate (20k-char truncation) | P1 | Rs | |

### B5. Series API — Owner P3
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B5.1 | series CRUD + books | list/create(plan-gate 403)/get/patch/delete(detach books); add/detach/reorder books (ownership-checked) | P3 | Rs | |
| B5.2 | series docs + inherit + synthesize | doc CRUD; inherit check/apply; synthesize list/apply (book→series) | P3 | Rs | |
| B5.3 | series analytics | **plan-gate use_analytics 403** — prove DENY below pro | P3 | Rs | |
| B5.4 | series agent | inline orchestrator; BYOK; ⚠ **no checkQuota gate** (unlike book agent) — VERIFY/FIX | P8 | Rs | |
| B5.5 | series-context | ambient sidebar; hides unless series.userId===user; prior-book re-scoped by userId; 5s timeout degrades never 500 | P3 | Rs | |

### B6. Memory API — Owner P8 (security) + P1
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B6.1 | memory list/create/patch/delete | WriterMemory userId-scoped; ⚠ POST accepts foreign bookId (low); patch/delete 0-row returns success not 404 | P1 | Rs | |
| B6.2 | memory/stats | ⚠ **bookId NOT ownership-checked** before getBookChunkCounts — IDOR read (memory/stats/route.ts:13-28) — VERIFY/FIX | P8 | Rs | |
| B6.3 | memory/clear + rebuild | book-fence; confirm:true required; zod | P7 | Rs | |

### B7. Settings / BYOK / usage — Owner P6 + P8
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B7.1 | api-keys CRUD | list (decrypt→mask); POST validates-against-provider-before-store + AES encrypt; health re-validate; delete (block last-key 400, active-session 409, promote default) | P6 | Rs | |
| B7.2 | default-model / language / onboarding | get/set (registry-id validated→400); language; onboarding (≥1 key required, sets HttpOnly cookie) | P6 | Rs | |
| B7.3 | usage / usage/books | 30-day rollups userId-scoped; per-book LLM/embedding split | P8 | — | |

### B8. Billing / webhooks — Owner P8 (Rita)
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B8.1 | checkout | zod; 503 if unconfigured; **atomic 200-slot founder txn**; trial config; metadata userId/plan/interval | P8 | Rs | |
| B8.2 | portal / subscription | portal 404 no-customer; subscription 5-min-stale re-sync from Stripe | P8 | Rs | |
| B8.3 | founder-count | ⚠ comment says public but middleware blocks anon (mismatch) — VERIFY behavior on pricing page | P8 | Rs | |
| B8.4 | Stripe webhook | sig verify (400 bad-sig, 503 off); **idempotency StripeWebhookEvent P2002**; 7 events (checkout/sub created/updated/deleted/trial-end/invoice paid/failed); status mapping | P8 | Rs | |
| B8.5 | Clerk webhook | svix sig; user.created/updated/**deleted (destructive cascade)**; payload cast not schema-validated (sig is trust boundary) | P8 | Rs | |

### B9. Health — Owner P8
| ID | Route(s) | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| B9.1 | health + health/dependencies | env health (public); dependency readiness incl. **schema DRIFT probe** + **worker-liveness 503** under each dep kill (Redis/Neo4j/worker down) | P8 | Rs | |

---

## SECTION C — CAPABILITY SURFACE (backend / worker / AI)

### C1. Job system — Owner P4 (Priya) + P8
| ID | Capability | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| C1.1 | 2 queues / 1 worker | agent-sessions (concurrency 2) + batch-digest; ONE worker proof captured | P4 | Rs | |
| C1.2 | retry/backoff | 3 attempts 30/60/120s; children restate options + ignoreDependencyOnFailure; jobId=sessionId dedup | P4 | Rs | |
| C1.3 | FlowProducer fan-out | (workflows×chapters) children + 1 digest parent; **delay on CHILDREN not parent** (the fixed HIGH bug) — regression-proof | P4 | Rs | |
| C1.4 | digest fan-in | defensively wrapped, never throws; reads DB+ledger; writes BatchRun.digest + BookNotification | P4 | Rs | |
| C1.5 | aggregate budget ledger | Redis spent INCRBYFLOAT; cap→halted; pre-child guard (Redis + durable BatchRun.halted fail-safe); skip as `skipped` zero-spend | P4 | Rs | |
| C1.6 | circuit breaker | 3-consec OR 5-total provider-auth failures halt; clean completion clears streak | P4 | Rs | |
| C1.7 | cancel / TTL | session cancel Redis flag every-5th-msg; batch halt 24h TTL; SessionCancelledError no-retry; all keys 24h TTL | P4 | Rs | |
| C1.8 | crash policy | uncaughtException→Sentry flush→exit(1) (supervisor restart); stalled 60s / lock 5min | P8 | Rs | |
| C1.9 | worker liveness | /health/dependencies 503 when getWorkers()=0; SSE watchdog + client backstop | P8 | Rs | |

### C2. AI capabilities — Owner varies
| ID | Capability | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| C2.1 | Model routing (BYOK, 5 providers/37 models) | direct→OpenRouter→LiteLLM chain; per-role resolution (book→global-role→default→registry); retry 3× 10/30/60s | P6 | — | |
| C2.2 | 29 workflows × 14 agent types | each named workflow runs (ghostwriter/dev-edit/line-edit/beta-read/analyze/bible/architecture/style/onboard/revise/publishing-check/market/research/series/coach); cost+wall-clock caps; 80% wrap-up | P2 | Rs | |
| C2.3 | Line-edit voice gate (W2) | PROTECTED SIGNATURE DEVICES precedence; ≥4/6 devices survive qwen (target 6/6 stronger); blind pairwise flattening bound | P6 | — | |
| C2.4 | Findings quality (W2) | CreateFinding verbatim anchor 0/N misquote; alternatives; grounding; content-hash dedup (verify "Test finding" junk + dedup bug fixed) | P6 | — | |
| C2.5 | CAS / ConversationTurn | isConversational persists history; message continuation; immersive CAS | P1 | Rs | |
| C2.6 | Discuss (4.2) | 1 cheap turn max_tokens 700; 3-turn cap; extracts WriterMemory(source=conversation); constraint honored next session | P6 | Rs | |
| C2.7 | Continuity extraction (4.4) | cheap-tier structured JSON + jsonrepair guard; Neo4j write → ContinuityFlag derive; tool-use path verified (path=tool_use) | P3 | Rs | |
| C2.8 | Ambient series (4.3) | series-context non-LLM assembly; latest-book-wins; alias/diacritic match | P3 | — | |
| C2.9 | WriterMemory loop | CRUD + learned-from-negative-feedback; SessionBrief on budget/timeout end | P1 | — | |
| C2.10 | Embeddings (only non-BYOK) | OpenAI text-embedding-3-small 1536-dim; graceful disable when absent | P7 | Rs | |
| C2.11 | Post-session processing | findings persist via CreateFinding; beta-gate parse; chapter status advance (suppressed for batch children) | P2 | Rs | |
| C2.12 | Prompt-assembler context | fingerprint + writer memory + retrieved context injected; parity vs raw model (W7); Tier-1 wiring | P6 | — | |

### C3. Data / vector / graph — Owner P7 + P3
| ID | Capability | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| C3.1 | Prisma 32 models | schema integrity; recent tables (BatchRun/ContinuityFlag/FindingReply/WriterMemory/Book.archivedAt) present in DEV; **PROD schema push status (C0)** | P8 | Rs | |
| C3.2 | Qdrant wmb_memory | 7 docTypes embedded; search precision at scale (W3); old 3-collection auto-delete | P7 | Pf | |
| C3.3 | Neo4j graph | Character/Location/Event/Object/PlotThread nodes + 15 rel types; continuity queries; graph populates from chapters (entity-extraction key threading) | P3 | Rs | |

### C4. Billing / entitlements — Owner P8
| ID | Capability | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| C4.1 | Plans + gating invariants | 4 plans; export always allowed; Stripe-unset=open; canceled=read-only; expired-trial=canceled; **past_due grace** | P8 | Rs | |
| C4.2 | Metering | UsageRecord per session/route; estimateCost; cost display vs OpenRouter actuals (tolerance) | P8 | — | |
| C4.3 | Batch money caps | $10/$25 aggregate; per-child max(2×est,$5); ≤4 workflows; **bound = cap+(concurrency−1)×perChild** (W6 money) | P4 | — | |
| C4.4 | Stripe lifecycle | checkout→active; upgrade/downgrade proration; cancel→period-end; past_due/dunning synthetic events; entitlement flips correct in-app | P8 | Rs | |

### C5. Infra / export / ops — Owner P8 + P7
| ID | Capability | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| C5.1 | docker-compose stack | pg/redis/minio/neo4j/qdrant/app/worker; healthchecks; 127.0.0.1 binds; prod db-backup sidecar | P8 | Rs | |
| C5.2 | Env validation | 21 web + 7 worker required keys; placeholder fail-closed prod; DEV_AUTH_BYPASS banned prod; HTTPS enforced | P8 | Rs | |
| C5.3 | Sentry key redaction | key-shaped + sk-ant/sk-or/sk-proj/xai/AIza patterns scrubbed from ALL events (W5) | P8 | — | |
| C5.4 | LiteLLM proxy | 6 OSS models on server key; ⚠ **undeclared prod dependency** (no compose service; direct openai/gemini/grok keys route here); port 30399/30400 mismatch (?) | P8 | Rs | |
| C5.5 | S3/MinIO storage | document/version bodies + backups; path-style; StorageAdapter read/write/list/delete | P7 | Rs | |
| C5.6 | Export pipeline | pandoc (docx/epub) + typst (pdf); lua filters; EPUB JSZip post-process; heading normalization | P7 | Rs | |
| C5.7 | Server-layer egress (W5) | mitmproxy capture: prose only to chosen provider; no third-party analytics carries content; vault ciphertext in DB | P8 | — | |

### C6. Test / durability — Owner P8 (+ W12)
| ID | Capability | Verify step | Owner | NF | Status |
|---|---|---|---|---|---|
| C6.1 | Vitest money-path suites | 61 suites ~422 cases; orchestrator-budget/batch-budget/batch-lifecycle/billing-webhook/plan-gating green; CI runs them | P8 | — | |
| C6.2 | Playwright e2e | 19 specs ~123 cases (offline-autosave/mobile-editor/a11y/billing/…); confirm CI executes on runner OS | P8 | — | |
| C6.3 | Golden-path regression (W12) | one journey/persona added to CI; each S1/S2 fix ships RED-pre-fix test | P8 | — | |
| C6.4 | Deployment smoke | smoke:deployment HTTP + deployment-smoke browser vs live URL; wired into pipeline | P8 | — | |

---

## SECTION MC — Missing Capabilities (gap personas W13; N-A-STRUCTURAL, graded as honest LOSSES)
| ID | Missing capability | Gap journey | Incumbent | Status |
|---|---|---|---|---|
| MC.1 | Managed no-key/free tier | G1 zero-config start | Sudowrite/NovelAI | N-A |
| MC.2 | Real-time collaboration / comments | G2 live co-editing | Google Docs/Novelcrafter | N-A |
| MC.3 | Native mobile app / offline-first mobile | G3 phone-native drafting | iA Writer/Scrivener iOS | N-A |
| MC.4 | Voice dictation | G4 voice draft | ChatGPT mobile | N-A |
| MC.5 | Image generation (covers/art) | (probe only) | Midjourney/ChatGPT | N-A |
| MC.6 | Grammar/mechanics depth | G5 copyedit pass | ProWritingAid/Grammarly | N-A |
| MC.7 | Publish pipeline presets (KDP/Ingram) | G6 publish-ready | Atticus/Vellum | N-A |
| MC.8 | Share/publish link to beta reader | G7 share link | Docs/Notion | N-A |
| MC.9 | Plot board / corkboard-canvas planning | G8 plot board | Scrivener/Plottr | N-A |

---

## SECTION Z — Orphan check + pre-known defect register

**Owner completeness:** every A/B/C row above carries an owner. §NF applies to all. No row is ownerless.

**Pre-known defects (from inventory ⚠ + mission memory — enter these into the matrix as OPEN, verify + fix in Phase 4, do NOT inherit as pass):**
| # | Sev | Item | Source | Owner |
|---|---|---|---|---|
| Z1 | S1? | memory/stats bookId IDOR (read foreign chunk counts) | API §memory | P8 |
| Z2 | S1? | style-lens DELETE cross-tenant (delete by lensId w/o bookId check) | API §style | P8 |
| Z3 | S2 | series agent route missing checkQuota gate | API §series | P8 |
| Z4 | S3 | founder-count public/middleware mismatch (anon pricing blocked) | API §billing | P8 |
| Z5 | S3 | memory POST accepts foreign bookId (low) | API §memory | P8 |
| Z6 | S3 | error hygiene: raw error.message at 500 (character-chat/feedback/memory/export); ~12 bare catch→401 mask faults | API §cross-cutting | P8 |
| Z7 | S3 | character-chat no zod + no plan gate | API §writing-assist | P3 |
| Z8 | S2 | BullMQ retry × LLM spend (double-spend, retried partial unrecorded) | CAP risk #1 | P4 |
| Z9 | S2 | batch cap between-children only (concurrent overshoot to per-child budget) | CAP risk #2 | P4 |
| Z10 | S2 | Redis 24h TTL vs >24h-scheduled batch loses halt/cancel flag | CAP risk #3 | P4 |
| Z11 | S3 | digest ledger best-effort zeros on Redis hiccup (under-report) | CAP risk #10 | P4 |
| Z12 | S2 | LiteLLM undeclared prod dep (direct openai/gemini/grok keys hard-fail w/o proxy) | CAP risk #9 | P8 |
| Z13 | S3 | 11 built-but-unmounted components (dead surface or missing wiring) | UI §19 | P2 |
| Z14 | S3 | immersive-mode ~30s loss window (S10) — verify shipped fix holds under kill | mission memory | P6 |
| Z15 | S2 | export finish: page-estimate ~47% off (B3), F10 xhtml titles | mission memory | P7 |
| Z16 | S1-ops | PROD schema push (C0), backup restore drill (C2), live Stripe/Clerk (C3) — founder ops gates | mission memory | P8 |
| Z17 | S3 | no prefers-reduced-motion handling anywhere; no skip links | UI §18 | P5 |
| Z18 | S3 | daily-plan checkbox client-only; DailyWritingPlan persistence expectation | UI §A8.7 | P1 |
| Z19 | S3 | batch digest fetched but not rendered in dialog — does morning digest reach the user? | UI §A7.3 | P4 |

Every Z-row must resolve to FIXED+PASS or a founder-decision entry with reason — none may silently vanish.
