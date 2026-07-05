# Author friction log — The Salt Letters acceptance test

Running log of everything that hurt, confused, or delighted while writing a real book in the product.
(F# = friction, D# = delight, B# = bug. Status: OPEN / FIXED / WONTFIX-ENV)

## Session 2026-07-03

- **B1 [FIXED 76d4a66]** OpenRouter routing 404'd every request (SDK baseURL built `/api/v1/v1/messages`); non-Claude OpenRouter models additionally detoured to a dead localhost LiteLLM proxy. Found via first real ghost-text call. → Fixed both; verified E2E.
- **F1 [OPEN]** Locale leakage: dashboard "Writing Activity" day labels render in system locale (sub/ned/pon…) and numbers as "500.000" while `preferredLanguage=en`. `toLocaleString()` without locale arg.
- **F2 [OPEN]** Dashboard "view all books" link is labeled "Total Books" (i18n string misuse).
- **F3 [OPEN]** Dashboard "Continue Where You Left Off → Resume" deep-links to `/documents` (library) instead of the last-edited chapter editor.
- **F4 [OPEN, minor]** Dev-bypass mode still mounts ClerkProvider with placeholder key → endless script-load retries in console (noise, masks real errors).
- **D1** Write-first onboarding is excellent: name → one click → typing in Chapter 1 in ~30s.
- **D2** Autosave machinery is real: 191→946 words, versions v1/v2, optimistic locking, byte-exact round-trip through MinIO.
- **F5 [OPEN, API polish]** Content GET returns `{markdown}` but chapter save PUT takes `{markdown}` while several sibling doc APIs use `{content}` — naming inconsistency cost me a false data-loss alarm.

## From exploration (structural, confirmed in code — candidates for M3 waves)

- **S1** Coach conductor model FORCED to `${provider}/sonnet` (agent/route.ts:196-201) — ignores user's coach-role model. Model identity dishonest.
- **S2** ConversationTurn persistence dead (addUserMessage/addAssistantMessage never called) → `/message` continuations amnesiac + can't delegate after turn 1.
- **S3** Chapter reordering impossible: corkboard PATCHes nonexistent `/chapters/reorder` (404); canvas fires parallel chapterNumber PATCHes racing `@@unique([bookId,chapterNumber])` (P2002).
- **S4** No find & replace anywhere in the product.
- **S5** Non-chapter document editor (story bible etc.) has NO optimistic locking — agent writes silently clobber manual edits.
- **S6** Orchestrator hardcodes `max_tokens: 64000` on every call — models with lower output ceilings (qwen3.6-27b) may 400 (instant death, no retry).
- **S7** Budget-exhaustion wrap-up turn excludes WriteChapter → ghostwriter's final draft silently dropped at cap.
- **S8** write-chapter/dev-edit/beta-read hang forever if BullMQ worker isn't running — no diagnosis surfaced to the user.
- **S9** Discuss threads (4.2) + entity extraction hardcode Claude Haiku regardless of user's model/provider.
- **S10** Immersive focus mode is a raw contenteditable with ~30s content-loss window (bypasses the hardened autosave).
- **S11** AuthorshipTracker is a stub (always "100% yours" / "0% yours").
- **S12** Dead-but-built power features: finding-review-mode, version-branching UI (its API exists!), entity mentions, story-health dashboard, word sprints (dashboard-only).
- **S13** Word targets shown in 4 places, settable in 0 (chapter PATCH schema rejects targetWordCount).
- **S14** No outline view / chapter synopses; plans buried in Library, never beside the editor.
- **F6 [OPEN]** Locale leak is ALSO on The Shelf cards ("2.026 words") — wave-1 dashboard fix must extend to shelf-book-card/summarize + anywhere else toLocaleString renders counts (book overview, editor footer?). Sweep repo-wide.
- **D3** The Shelf with a live book is genuinely good: correct state grouping, "drafted 2/2 · last touched today", Continue → Ch 2.
- **F7 [OPEN, minor]** SSE tool_use events surface name=None to consumers (checked during capture-style); completion metadata documentIds[] empty though FINGERPRINT was written.

## Session 2026-07-05 (part 2) — feature-breadth test (beta-read, export, continuity fix, browser UI)

Tested four previously-untested product surfaces against the live "The Salt Letters" novella (book `4a37715f`, 5 drafted chapters, ~6.1k words) on dev-auth bypass: EXPORT (API), beta-read, the continuity-graph fix, and the browser UI (Shelf / Story Health / chapter editor).

### EXPORT — works, ships real binaries, does NOT silently degrade to markdown ✅

The launch-relevant fear (export secretly substituting a `.md` file when pandoc/typst are missing) did **not** materialize. All three formats produced genuine, magic-byte-verified binaries containing the full novella prose (all 5 chapters, all three letters, explicit "Chapter 5: The Third Letter" heading present in every output):

- **docx** — real OOXML (PK zip, `Microsoft Word 2007+`), 23,798 B, 5 chapters + full prose.
- **epub** — real `EPUB document` PK zip, 18,847 B, 5 chapter xhtml files (ch001–ch005).
- **pdf** — real `%PDF-1.7`, 17 rendered pages, 164,094 B, full prose incl. the Ch5 heading.

`warnings:[]` on every format confirms pandoc/typst were present — no degradation path taken.

### Beta-read — smoke only (not a substantive quality read this pass)

Beta-read returned without error but this pass exercised only a shallow smoke of the surface; no substantive craft-quality assessment was produced. Treat beta-read quality as **not yet validated** — flag for a dedicated deep pass.

### Continuity-graph fix — NOT verified this session ⚠

Entity extraction / continuity population was **not** exercised in this pass: the extraction path is LLM-gated (hardcoded Claude Haiku, see S9) and no API key was available in the dev environment, so we could not confirm the graph now populates. Verdict deferred — needs a keyed run.

### Browser UI — Shelf & Story Health work and look good; chapter editor is a hard BLOCKER ❌

- **The Shelf (`/books`)** — WORKS + discoverable. All 4 state shelves render (Currently Writing 4 / Waiting for Feedback 2 / Completed 3 / Archived 1-collapsed). "The Salt Letters" leads Currently Writing with "6,083 words · drafted 5/6 · last touched today" and a working "Continue → Ch 6" CTA. (Note: word count "6,083" still renders through locale formatting — same class as F6.)
- **Story Health (`/books/:id/dashboard`)** — WORKS + shows REAL scores, not a fake 100%. "63% healthy" across 5 real pillars (Drafting 5/6, Editorial 2/6, Beta 0/6, Findings Health, Foundation ✓Style ✓Bible ✓Architecture), each with its own progress bar. This retires part of S12's "story-health dashboard is dead-but-built" concern — it is live and honest.
- **Chapter editor** — COMPLETELY BROKEN for this book. Every chapter route (Ch6 `ca44ce90`, Ch5 `242c5cb1`) renders the "Something went wrong" error boundary instead of the editor, blocking all three features under test (word-target popover, Find & Replace, immersive focus mode) — none reachable.

### New bugs

- **B2 [OPEN, BLOCKER]** Chapter editor crashes to the page error boundary for book `4a37715f` (both Ch5 & Ch6). Root cause is a real, reproducible hydration bug: `TypeError: existingArtifactTypes.has is not a function` at `src/lib/onboarding/offers.ts:55` in `computeOnboardingOffers`, invoked from `src/hooks/use-onboarding-offers.ts:68-72` inside `<OnboardingWatcher>`. `use-onboarding-offers.ts:45-52` stores `artifactTypes` as a `Set<string>` in the React Query cache; a JS `Set` cannot survive SSR dehydration→hydration (it deserializes to a plain `{}` with no `.has`), so the effect throws on the hydrated editor page and `<ErrorBoundaryHandler>` swallows the whole route. Non-editor pages don't mount the watcher in a hydration-poisoned state, so they render fine. **Fix:** normalize to an array (`Array.from`) at the cache boundary and use `.includes()`, or reconstruct the `Set` in the queryFn/`select` on the client. This kills the headline happy-path — the Shelf's "Continue → Ch 6" CTA dead-ends here.
- **B3 [OPEN]** Export `estimatedPages` is wrong: POST reports `estimatedPages:25` but the rendered PDF is 17 pages (~47% over). Do not surface this as a page count to users until the estimator is corrected against actual render.

### New frictions

- **F8 [OPEN, API contract]** Export is a two-step contract that contradicts the naive expectation: `POST /api/books/:id/export` does NOT return the file — it generates+stores the manuscript and returns JSON metadata `{filename, storageKey, wordCount, chapterCount, estimatedPages, warnings, format}`. The bytes require a second call `GET /api/books/:id/export/:filename`. Piping `-o file` on the POST saved a 205-byte JSON blob; a consumer following the obvious contract would wrongly conclude "export returns a tiny non-binary file." Document the two-step flow (or add a one-shot download alias).
- **F9 [OPEN]** Chapter titling is inconsistent in exported manuscripts: only Ch5 has a real title ("The Third Letter"). In the EPUB nav/TOC and per-chapter headings, ch001/ch003 fall back to the book title "The Salt Letters" and ch002/ch004 have empty headings — 4 of 5 chapters are effectively untitled, producing a near-useless TOC. (Reflects source data, but export should degrade to "Chapter N" rather than blank/booktitle.)
- **F10 [OPEN, a11y]** EPUB per-file `<title>` tags are the raw filenames ("ch001.xhtml" … "ch005.xhtml") instead of chapter titles — weak metadata and poor screen-reader experience.
- **F11 [OPEN]** No chapter index route: navigating to the plausible `/books/:id/chapters` returns a Next.js 404. A chapter is only reachable via a specific chapter id, so there is no browsable chapter list to recover from a broken deep-link.
- **F12 [OPEN, sec-env]** Export/download routes succeeded via unauthenticated `curl` (no session cookie) in dev — expected given the dev-auth bypass, but the routes are only as protected as `requireUser()` under that bypass; confirm real auth gating in a non-bypass environment before launch.

### New delights

- **D4** Export is real and trustworthy: three true binary formats (docx/epub/pdf), full prose, magic-byte verified, `warnings:[]` — no silent markdown fallback. This is a genuine ship-quality output pipeline.
- **D5** Story Health shows honest, real numbers (63% across 5 computed pillars with live progress bars), not a vanity 100% — turns a "dead-but-built" S12 item into a working, credible feature.
- **D6** The Shelf holds up in the browser: correct 4-state grouping, real per-book meta, collapsed Archived group, working Continue CTA — discoverable and coherent.

### Top UX improvements to ship next (prioritized)

1. **Fix B2 (editor hydration crash).** Highest priority — it dead-ends the entire write happy-path (the Shelf's own "Continue" CTA lands on an error screen). Normalize the `Set` at the React Query boundary.
2. **Fix export chapter titling (F9) + EPUB `<title>` metadata (F10).** Degrade untitled chapters to "Chapter N"; use chapter titles for EPUB per-file titles and TOC. Small change, large perceived-quality gain on the deliverable users actually hand out.
3. **Correct or hide `estimatedPages` (B3).** Either fix the estimator against real render or stop presenting it as a page count.
4. **Add a `/books/:id/chapters` index route (F11).** Gives a recovery path and a browsable structure; also a natural home for the missing outline view (S14).
5. **Document the two-step export contract (F8)** (or add a single-call download endpoint) so integrators/tests don't misread the JSON metadata as the file.
6. **Run keyed passes for the two deferred surfaces:** verify the continuity-graph fix actually populates entities, and do a substantive beta-read quality read — both were blocked this session by the missing API key.

### Resolved same session (2026-07-05, part 3)

- **B2 [FIXED `adfebf9`]** Editor hydration crash. `use-onboarding-offers.ts` now caches `book-documents` as a plain `string[]` (not a `Set`) and reconstructs the `Set` at the use site (`Array.isArray`-guarded), so it survives SSR dehydration. **Verified in a real browser:** the Ch5 editor renders fully — prose, toolbar, live word count, and the Findings panel with Apply/Dismiss/Discuss. The write happy-path is restored.
- **Continuity-graph fix [VERIFIED + extended `dcca7ca`/`f39045e`]** The "No API key available for entity extraction" gap is closed on BOTH callers (post-session `updateChapterGraph` AND the on-demand `continuity/scan` route) via the new `getExtractionKeysForUser`. **Verified via direct Neo4j query:** the graph now holds **24 entities** for the book (4 Character, 6 Location, 7 Object, 3 PlotThread, 2 Faction, 2 Event) — it was empty/failing before.
- **B4 [OPEN, PARTIAL]** qwen3.6 entity-extraction JSON sometimes fails the parser (`Failed to parse extraction JSON`), so the graph populates but is INCOMPLETE (not every chapter's entities land). Mitigated in `f39045e` (slice to outermost `{..}` braces to tolerate prose-wrapping; raise `max_tokens` 8192→16384 against mid-array truncation; log `len+HEAD+TAIL` on failure). Not exhaustively re-verified against a fresh qwen call — remaining hardening: make the extractor JSON-robust to qwen (structured-output/tool mode, or a lenient/repair parser).
- **F12 note:** still valid — export/download auth is only as strong as the dev-auth bypass; confirm in a real-auth env.
