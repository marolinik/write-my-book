# Fix lane — D-188 … D-194 (P2 Gerald, 44-series)

**Branch:** `qa/bulletproof-2026-07-17` · **Lane base:** `12f0d43` · **Date:** 2026-07-27
**Register:** `evidence/fix-reviews/D-188-D-194-p2-44series-observations.md`
**Capture:** `evidence/p2-gerald-rejudge/UI-CAPTURE-2026-07-27.md` §7
**Gate:** per-defect TDD (RED observed before every fix) · `tsc --noEmit` clean for this
lane (only pre-existing `cowork/**` evidence-script errors remain, unchanged from the
pre-lane baseline) · `eslint` 0 errors on every touched file · **full unit suite
207 files / 1698 tests, all green** (includes two concurrent lanes' work).
**No live LLM/network calls, no `.env` touched, dev server and worker left running.**

| id | S | verdict | commit |
|---|---|---|---|
| **D-188** story-bible fake success | S2 | **FIXED** (recovery + structural honesty + prompt) | `f13e8ba` |
| **D-189** find/replace whole word | S2 | **FIXED** (matcher + wire + dialog, default ON) | `673d8fa` |
| **D-190** silent adoption of deleted prose | S3 | **FIXED** (guard on all 3 read/write paths) | `7b8e60e` |
| **D-191** conflict-backup version badge | S3 | **NOT TAKEN** — lane collision (see below) | — |
| **D-192** no chapter-delete UI | S3 | **NOT TAKEN** — product-surface decision (see below) | — |
| **D-193** ghost POV break (n=1) | S3 | **NOT ACTIONABLE** as code (see below) | — |
| **D-194** `books.chapter_count` drift | S3 | **FIXED** (root cause was elsewhere) | `60b83b5` |

62 new tests across 10 files.

---

## D-188 — `create-story-bible` success with no artifact · `f13e8ba`

### Mechanism found (this is the important part)

The register's two hypotheses were "tool not offered?", "output not parsed?", "silent
catch?". None of them. Source audit:

* `WriteDocument` **is** offered to `writing-coach` (`definitions.ts:15`), and the
  executor works — the same conductor persisted a `FINGERPRINT` via `capture-style`
  on the same book in the same wave (the register's own contrast case).
* `executeWriteDocument` (`tools.ts:1074-1171`) pushes into `ctx.documentIds`, so
  `documentIds: []` is a *truthful* report: **the tool was never called.**
* `create-story-bible` is a DIRECT (non-delegating) conversational workflow. Its whole
  instruction to save was one clause in
  `prompt-assembler.ts` `CONDUCTOR_WORKFLOW_INSTRUCTIONS["create-story-bible"]`:
  *"Write the STORY_BIBLE document when you have enough information."* Compare
  `onboard-imported-book` in the same table, which says **"CRITICAL: You MUST … Call
  WriteDocument"**.
* So a model that streamed the finished bible into chat and stopped satisfied every
  layer: the loop ended `natural`, the orchestrator set `success: !providerFailure`,
  and **no layer anywhere checked the declared deliverable**. `resultMeta` reported
  `documentIds: []` and `suggestedNext: ["build-architecture"]` in the same breath —
  the step whose prerequisite is exactly the missing document.

Root cause therefore = **an unenforced completion contract** (plus a weak prompt),
not a broken write path.

### Shape (both halves the task asked for)

1. **Declaration.** `WorkflowDefinition.producesDocument` (`types.ts`), set on
   `create-story-bible` → `STORY_BIBLE`, `build-architecture` → `ARCHITECTURE`,
   `capture-style`/`refresh-style` → `FINGERPRINT`. `post-session.maybeAutoSynthesize`
   now reads that instead of its own duplicate map, so the two cannot drift.
2. **Recovery** (`lib/agents/artifact-contract.ts`). If the declared artifact is absent
   and the run's final text IS a document — `>= 300` words **and** `>= 2` markdown
   headings — persist it via `DocumentService.create` with
   `changeSource: "transcript-recovery"`. The writer already paid for those tokens;
   discarding them and calling it success was the defect. Deliberate guard rails:
   never overwrite an existing artifact, never recover when the run wrote documents of
   its own, never synthesise a document out of ordinary chat (length alone is refused —
   a 400-word wall of prose with no structure does not qualify).
3. **Structural honesty.** `honest = artifactExists || (!claimedComplete && !recoveryAttempted)`.
   Both chat routes act on it:
   * `POST /api/books/:id/agent` — `artifactBroken` flips `success` to false, writes
     `agent_sessions.status = "failed"`, and pushes an SSE **error** message
     ("The Story Bible was NOT saved — no STORY_BIBLE document exists …").
   * `POST /api/books/:id/agent/:sessionId/message` — the same contract inline
     (that route never calls `processPostSession`, and the bible is normally written on
     a later turn). Evaluated **before** `completeSession` so the client is never told
     "success" and contradicted afterwards.
   * **Spend is still recorded in both branches.** A lie about the artifact must not
     become a second lie about the money (D-36 family).
4. **No more 422-bait routing.** `filterBlockedNextSteps` replaces a suggestion whose
   prerequisites are unmet with the workflow that satisfies them
   (`build-architecture` → `create-story-bible`), or drops it. The product can no
   longer recommend the click it is about to reject.
5. **Prompt hardening.** The conductor instruction now says *"You MUST call
   WriteDocument with documentType='STORY_BIBLE' — pasting the story bible into the
   chat does NOT save it … Never tell the user the story bible is complete or ready
   unless you have called WriteDocument in this session."*

`claimsArtifactComplete` is sentence-scoped and hedge-aware (`?`, "once", "shall",
"will" … disqualify a sentence), and **English-only** — a disclosed limitation. It is
the backstop: the recovery path is language-independent (word count + markdown
structure) and covers the captured symptom in any language.

### Files
`src/lib/agents/artifact-contract.ts` (new, 245 lines) · `types.ts` · `workflows.ts` ·
`post-session.ts` · `index.ts` · `prompt-assembler.ts` (+ `CONDUCTOR_WORKFLOW_INSTRUCTIONS`
exported for the prompt lock) · `src/app/api/books/[id]/agent/route.ts` ·
`src/app/api/books/[id]/agent/[sessionId]/message/route.ts`

### Tests (30)
`artifact-contract.test.ts` (20) — deliverable/claim detectors, the captured defect
recovered, claim-with-nothing → dishonest, in-progress turn stays honest, never
overwrites, recovery failure reported not swallowed, declaration read off the registry,
`filterBlockedNextSteps` (5) · `story-bible-prompt-contract.test.ts` (3) ·
`agent-artifact-honesty-route.test.ts` (3) — FAILED + honest message + spend still
billed; recovered → success + disclosure; no-contract workflow untouched ·
`agent-message-artifact-contract.test.ts` (4).

---

## D-189 — whole-word find & replace · `673d8fa`

**Shape.** `wholeWord` added to `findInText`/`replaceInText` (default `false`, so all
existing call sites are byte-identical), threaded through
`searchQuerySchema`/`replaceRequestSchema`, `GET /search`, `POST /search/replace`,
`useBookSearch`/`useBookReplace`, and the dialog — where the switch is **ON by
default**, because a book-wide character rename is the job the dialog exists for.

Two design points worth recording:

* **Escape-safe by construction.** The writer's query is never compiled into a regex.
  Matching stays `indexOf` + a boundary test on the *surrounding* characters, so
  `(net)`, `a.b` and `[[REPLACED]]` stay literal. One missed escape in a
  `new RegExp("\\b" + q + "\\b")` implementation would turn a rename into a silent
  mass edit — exactly the failure class this defect is in.
* **Unicode-aware.** Word characters are `[\p{L}\p{N}_]`, so `Zürich`/`Łódź`/`Kőszeg`
  are single words (an ASCII `\w` rule would treat `ü` as a boundary and cut names in
  half) and `ch1` never matches inside `ch12`.

A term that does not begin AND end with a word character (`—`, `...`, ` the `) can never
satisfy the boundary rule, so the toggle **disables itself and says why** instead of
returning a silent zero (`isWordLikeQuery`). The preview query and Replace all always
use the same effective flag, so the previewed count is the count that gets applied.

**Files.** `src/lib/search/find-replace.ts` · `src/lib/validation.ts` ·
`src/app/api/books/[id]/search/route.ts` · `.../search/replace/route.ts` ·
`src/hooks/use-find-replace.ts` · `src/components/editor/find-replace-dialog.tsx`

**Tests (18).** `find-replace-whole-word` (10) — the captured `Maxe`/`Maxple`/`Maxovar`
corruption kept as the RED contrast case, then 4 standalone matches only; unicode;
digits/underscore; end-of-text; escape safety; default-substring regression ·
`find-replace-route-whole-word` (4) — flag survives the wire both ways (these two
routes had no direct coverage at all before) · `find-replace-dialog-whole-word` (4) —
closes the captured `dialog_offers_whole_word_option: false` assertion.

---

## D-190 / D-115 (browser variant) — deleted prose adopted in silence · `7b8e60e`

**Mechanism.** `Document` has no `chapterId` (`prisma/schema.prisma:251-274`); chapter
docs are addressed by `(bookId, type, chapter_number)`. Delete chapter 2 → the row
survives; `/chapters/new` auto-defaults to the freed number → `GET content` resolves
the dead chapter's document **and its version**, so the editor loads deleted prose with
a valid stamp and the first save is a legal 200 (silent adoption). The registered API
repro hits the other face of the same state: a phantom 409 whose `serverContent` leaks
the deleted text.

**Shape.** New pure guard `lib/documents/orphan-chapter-content.ts`: a content document
created BEFORE the chapter row that now holds its number is not that chapter's prose.
Conservative in the safe direction — both timestamps must be known and the chapter must
have **zero** counted words, because hiding a writer's real prose would be worse than
the defect. Verified against `chapters/reorder`, which renumbers chapters *and* their
documents in one transaction and touches no `created_at`, so the pairing survives a
reorder. Wired into all three writer-visible resolutions:

* `GET .../content` — serves the chapter as empty and **withholds the orphan's id and
  version**, so the editor can neither show it nor stamp against it.
* `PUT .../content` — the first save **reclaims** the row wholesale: no CAS stamp
  demanded (this is a genuine first save, which is why the phantom 409 existed) and no
  merge, so the deleted prose cannot re-enter the manuscript. Stamped
  `changeSource: "orphan-reclaim"` so version history shows the boundary. Self-limiting:
  after that save `wordCount > 0`, so normal D-47 CAS applies again.
* `export-pipeline.assembleChapterSections` — same guard, so deleted words can never
  ship inside an exported manuscript.

**Not done, by instruction:** no migration, no schema change. Existing orphan rows —
including the campaign's already-adopted fixtures, whose current version legitimately
contains merged prose — remain a founder-level cleanup policy call.

**Tests (11).** `orphan-chapter-content` (6, pure) · `chapter-content-orphan-guard` (4)
— no leak on GET, reclaim on PUT, plus both regressions (a real document is still
served; a stampless overwrite of a real document still 409s) ·
`export-order-integrity` (+1).

---

## D-194 — `books.chapter_count` drift · `60b83b5`

**The register's diagnosis was wrong, and the real cause is worse.**
`POST /api/books/:id/chapters` *does* increment. The drift comes from
`POST /api/books`: it creates the write-first placeholder Chapter 1 and never counts it,
so `chapter_count` keeps its schema default `0` while one chapter exists. **Every book
created in-product starts life off by one** — which is exactly the measured pattern
(1 vs 2, 1 vs 2, 7 vs 8 in-product; imported books correct, because the import path
assigns `chapterCount: bookChapters.length` outright).

**Shape.** `chapterCount: 1` folded into the existing `s3Prefix` update (no extra
write), and both delta sites replaced by the **authoritative** `db.chapter.count`, so
already-drifted books self-heal on the next create/delete and the counter can never go
negative.

**Tests (3).** `chapter-count-integrity` — placeholder counted; create and delete both
store the real row count.

---

## Not taken — with reasons

**D-191 (conflict-backup version badge, S3).** Purely presentational fix in
`src/components/editor/version-history-panel.tsx` — badge rows by `change_source` rather
than `change_type`. **Not touched: file collision.** A concurrent lane owns the
discuss/editorial UI and `src/lib/i18n/**` this session, and a writer-facing badge label
needs new strings in all 7 locales of `ui-strings.ts`. Cheap and safe to land in the
lane that already owns those files; nothing here blocks it. (Note for whoever takes it:
`orphan-reclaim` from D-190 above is a second `change_source` worth surfacing in the
same pass, since it marks where a deleted chapter's versions end.)

**D-192 (no chapter-delete UI, S3).** The task said "if an obvious existing surface
(chapter row menu) accepts a guarded Delete, add it; otherwise leave a note". There is
**no existing row menu**: `app/(app)/books/[bookId]/chapters/page.tsx` renders each row
as a bare `<Link>`, there is no `AlertDialog`/confirm primitive in `src/components/ui`,
and every label would need new keys in the 7-locale `ui-strings.ts` that another lane
owns right now. More substantively, the affordance is **not just UI work**: chapter
delete is irreversible (no restore path, no undo), it leaves the orphan CHAPTER_CONTENT
row whose cleanup is the founder call in D-190, and shipping a one-click destructive
button for a whole chapter of prose into a product whose grade floor is data-safety
would be the wrong trade. **Recommendation:** ship it together with the orphan-cleanup
decision, as "Delete chapter → confirm typing the chapter number → 30-day restore from
version history", i.e. one product decision, not a button.

**D-193 (ghost-text POV break, n=1, S3).** Explicitly a single sample of model output
(first-person insertion into close-third prose) served by
`openrouter-deepseek/haiku`. No deterministic code defect to close: it is a
prompt/model-fitness question that needs the D8 measurement lane (now unblocked by
D-188) to establish a rate before anything is changed. Left open.

---

## Residuals and disclosures

1. **Other CHAPTER_CONTENT readers still resolve by number only.** The D-190 guard
   covers the editor GET/PUT and export. The agent tools (`ReadChapter`,
   `ReadAllChapters`) and vector/continuity readers resolve by `chapter_number` without
   a chapter row, so an agent could still quote an orphan's prose on a brand-new
   chapter. Root fix is the orphan-cleanup policy (founder call), not seven more
   guards.
2. **D-188 honest-failure detector is English-only.** Recovery is language-independent;
   the claim regex is not. A non-English run that claims completion with a short reply
   and nothing recoverable would still report success with `documentPersisted: false`
   in `resultMeta`.
3. **D-188 recovery threshold is a heuristic** (300 words + 2 headings). A genuine
   bible written in unstructured prose would not be recovered — it would fall to the
   honesty branch and be reported as a failure, which is the safe direction.
4. **BullMQ worker path evaluates but cannot repair.** `agent-worker.ts` was not
   touched (another lane is in the batch area, and the worker process is running). It
   calls `processPostSession`, so it gets the contract *evaluation* for free, but
   passes no `assistantText`, so no recovery happens there and the outcome is reported
   only in `PostSessionResult`.
5. **D-189 leaves the "how many matches sit inside longer words" count unshown.**
   Whole-word ON by default prevents the corruption; telling the writer *"6 whole-word,
   17 including partial"* would need a second query and was left out.
6. **Pre-existing, untouched:** `find-replace` derives match indices from a lowercased
   haystack, so a locale-expanding `toLowerCase` (e.g. `İ`) could mis-index a
   case-insensitive match. Older than this defect and out of lane.
7. Nothing in this lane was verified in a browser. All four fixes are covered by unit
   tests only; the on-camera re-capture (story-bible run that persists, rename that
   does not corrupt, new chapter that opens empty, shelf count that matches) is the
   next wave's job.
