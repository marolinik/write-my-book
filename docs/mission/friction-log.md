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
