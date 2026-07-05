# Wave-1 whole-branch review — verdict & follow-ups (2026-07-04)

Branch `feat/mission-wave-1` (units S6, S1, S2, S3, S4, F1–F3, S13) reviewed via a
6-lens adversarial workflow (correctness / security / prisma-db / i18n-ux /
integration-wiring / redundancy), every high/critical finding refuted by an
independent skeptic. **Verdict: `READY_TO_MERGE`** — 0 high/critical of 11 findings.
Merged FF to `main` @ `6b1e7cd`.

Strong confirmations: security lens clean (every new/changed route userId-fenced,
cross-user 404 no leak, find/replace plain-text `indexOf` — no ReDoS, no raw SQL,
zod strips unknown keys — no mass-assignment); S3 reorder is atomic + P2002-safe +
correctly propagates `chapter_number` to documents; integration-wiring 0 findings.

## Resolved before merge
- **S2 interior-alternation (MEDIUM, confirmed)** — FIXED @ `6b1e7cd`. `loadConversationHistory`
  now collapses interior runs of consecutive same-role turns to their latest entry
  before the boundary trims, so a cancelled/errored turn followed by a restart no
  longer 400s "roles must alternate." +3 regression tests (254/254 green).
- **S6 qwen36 cap — VERIFIED no-op.** `qwen/qwen3.6-27b` real OpenRouter
  `max_completion_tokens` = **262140** (≫ the 64000 the orchestrator requests), so it
  cannot hit the instant-400 S6 guards; no cap needed. `openrouter-qwen-max/*` stays
  capped at 32768. Adding a cap here would have wrongly truncated long generations.

## Non-blocking follow-ups (LOW) — carry into the readiness punch-list
1. **S4 replace atomicity** — whole-book replace does N per-chapter `wordCount` writes
   then one book increment with no wrapping transaction; a mid-loop throw leaves
   `book.wordCount` stale. Wrap in `db.$transaction` or recompute from
   `SUM(chapter.wordCount)`. `src/app/api/books/[id]/search/replace/route.ts`
2. **S3 reorder bound** — `reorderSchema.chapterNumber` has `min(1)` but no max; a
   client final ≥ `TEMP_OFFSET(10000)` can collide with a parked temp offset → P2002
   500. Add `.max(MAX_CHAPTERS)`. `src/app/api/books/[id]/chapters/reorder/route.ts`
3. **S2 turnIndex race** — `count()`-derived `turnIndex` under
   `@@unique([sessionId,turnIndex])`; concurrent same-session POSTs collide and the
   P2002 is only `console.error`'d → a turn is silently dropped. Retry-on-P2002 or
   derive via `INSERT..SELECT COALESCE(MAX+1,0)`. Low likelihood (sequential cadence).
   `src/lib/agents/session-manager.ts`
4. **S13 toast i18n** — word-target save-failure toast is hardcoded English while the
   rest of the popover is localized. Add `wordTarget.saveError` to all 7 UIStrings
   blocks. `src/components/editor/word-target-popover.tsx`
5. **S4 dialog i18n** — the entire Find & Replace dialog + toolbar labels + count
   pluralization are hardcoded English; `bookLanguage` is available at the call site
   but unused (matches pre-existing dialog debt).
   `src/components/editor/find-replace-dialog.tsx`
6. **S1 redundancy** — `resolveConductorModel` re-derives the per-role override map 3×
   in one request path; replace with a direct
   `resolveModelForRole("coach", ...)`. `src/app/api/books/[id]/agent/route.ts`
7. **S4 redundancy** — local `SearchSnippet` duplicates the exported pure `Snippet`
   interface from the client-safe `lib/search/find-replace.ts`. `src/hooks/use-find-replace.ts`
8. **S3 redundancy** — `corkboard-view` hand-rolls the reorder PATCH the new
   `useReorderChapters` hook now encapsulates (adopting it also adds query
   invalidation the corkboard currently omits — verify that's wanted).
   `src/components/book/corkboard-view.tsx`

None are launch-blocking; several (4,5) match pre-existing repo i18n debt.
