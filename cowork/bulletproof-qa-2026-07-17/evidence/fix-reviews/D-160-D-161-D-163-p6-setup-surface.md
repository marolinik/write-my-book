# Fix review — D-160 / D-161 / D-163 (P6 "Owen" setup surface)

**Branch:** `qa/bulletproof-2026-07-17` · **Commit:** `6233c44` (code + tests) ·
**Source:** `evidence/judging/P6-REJUDGE-V2-AGGREGATE.md` (3-judge blind panel, 2026-07-27),
pixels `evidence/p6-owen-rejudge/41a…41e`.

**Gates:** `tsc --noEmit` clean · `npx vitest run` **1488 passed / 179 files**, 0 failures
(baseline at HEAD `36f3825` was 1440/174; +28 from this lane, the rest from the concurrent
editorial lane) · `eslint` **0 errors** on every touched file (3 pre-existing warnings
untouched: 2 × `react-hooks/set-state-in-effect` in `setup/page.tsx`, 1 unused
`BookMarkedIcon` import in `app-sidebar.tsx`).

**Not pushed** (per instruction). Nothing written under `evidence/` except this file.

---

## The shape: one pure module, four call sites

`src/lib/onboarding/setup-surface.ts` (new, pure, dependency-free) is the single accounting
for book-setup state. It is imported by the client wizard, the client sidebar and the
server-rendered overview page, so no two surfaces can drift again. `src/lib/i18n/plural.ts`
(new, pure) is the noun-form mechanism for D-163.

| Surface | File | Before | After |
|---|---|---|---|
| Wizard header badge | `src/app/(app)/books/[bookId]/setup/page.tsx` | `2/6 steps done` | `2/5 steps done` |
| Overview banner | `src/app/(app)/books/[bookId]/page.tsx` | `2/5`, own inline count | `2/5` from shared helper |
| Sidebar "Getting Started" | `src/components/layout/app-sidebar.tsx` | `0/2` (bible+arch only) | `✓ 2/5` |
| Recommendation ladder | `src/hooks/use-book-state.ts` | setup artifacts always gate | gated by `nextSetupWorkflow` |

---

## D-160 — setup completion invisible in the chrome (S3, all 3 judges)

### Mechanism (why it was pixel-identical)

Three independent accountings existed for one state:

1. `getCompletedStepCount()` in `use-book-state.ts` counted **6** items — the five
   substantive steps **plus `reviewComplete`** (i.e. `setupComplete` itself). The sixth could
   only flip by pressing the very button that navigates away, so the wizard could never show
   `6/6`; it showed `2/6` for Owen's skip-only walk.
2. The overview banner (`page.tsx:467-499`) counted its own **5** inline booleans → `2/5`.
   Judge C correctly source-verified that this banner *is* gated on `setupComplete`; it was
   never the stale surface.
3. The sidebar badge counted a **completely different pair** — `[hasStoryBible,
   hasArchitecture]` → `0/2` — under the label "Getting Started". Because neither artifact
   exists after a skip-only walk, and because `setupComplete` was not an input at all, this
   badge is *mathematically incapable* of changing when the wizard finishes. That is the
   whole "pixel-identical pre/post" observation.

Two further stale surfaces shared one root: `nextRecommendedWorkflow` in `use-book-state.ts`
gated the entire ladder on `!hasFingerprint → capture-style` **without consulting
`setupComplete`**. That single expression drove both the sidebar's "Next Step" badge on
**Style** and the overview's "Recommended: Capture Style / Start" panel visible in 41e — the
"Start Setup CTA" the judges saw. (Note for the record: the *banner* CTA is gated and was
not the offender; the offender is the ProactiveGuide recommendation panel.)

### Counter-accounting decision (the load-bearing choice)

**Canonical denominator = 5.** `SETUP_STEP_TOTAL = 5`: basics, import, style, story bible,
architecture. Rationale:

* The wizard's sixth card ("Done") is a **confirmation of the five**, not a sixth unit of
  work. Counting it inflated the denominator, produced the `2/6` vs `2/5` disagreement, and
  was unsatisfiable in-flow. Dropped from the count; its own state is still shown by the
  step-bar chip.
* **A step counts when it is RESOLVED, not only when it produced an artifact.** A
  deliberately skipped import counts — which is what the wizard's step bar has always
  rendered (green check on skip). To make the banner agree, its query now also selects
  `settings.setupImportSkipped`; previously the banner counted `chapters.length > 0` only,
  which was a second, quieter disagreement with the wizard for any skip-import walk.
* **`setupComplete` is a STATE, not a step.** It is what flips surfaces from soliciting to
  settled. It deliberately does **not** advance the numerator, because a skip-only walk
  genuinely produced 2 of 5 artifacts and claiming `5/5` would be the same class of lie the
  campaign keeps finding. So the sidebar reads **`✓ 2/5`**: the check says "you finished this
  flow", the fraction keeps telling the truth about what ran.

Result: every surface reports the same numerator **and** the same denominator for the same
state, and finishing the wizard visibly changes three things in the chrome (section check,
Setup-item check, Style badge gone).

### Changes

* `setup-surface.ts`: `SETUP_STEP_TOTAL`, `SetupStepFlags`, `countSetupStepsDone()`,
  `setupSurfaceStatus()` (`done` when `setupComplete` **or** all five resolved — preserving
  the banner's pre-existing "wizard flag never set" escape hatch), `nextSetupWorkflow()`,
  `isSetupPhaseNavKey()`, `showNextStepBadge()`.
* `use-book-state.ts`: deleted `getCompletedStepCount` (the 6-item accounting, now dead);
  the recommendation ladder's three setup branches are gated by `nextSetupWorkflow(...)`
  instead of raw `!hasFingerprint` / `!hasStoryBible` / `!hasArchitecture`. Equivalence when
  `setupComplete === false` is exact (the helper returns the artifacts in the same priority
  order the chain already tested them in). When `setupComplete === true` the ladder falls
  through to the chapter pipeline — for the 41e state (1 chapter, `undiscussed`, 0 words) the
  recommendation becomes `discuss-chapter`, i.e. "go write", instead of a Capture-Style
  solicitation the product cannot even fulfil at 0 words.
* `app-sidebar.tsx`: badge = shared 5-step count; `statuses.setup = setupSurfaceStatus(...)`;
  a `CheckIcon` on the Setup item when done; `countBadge("setup", setupComplete)` renders the
  section check; `nextBadge()` and the Chapters badge both route through
  `showNextStepBadge()`, which suppresses `setup`/`style` badges once setup is complete
  (belt-and-braces with the ladder change).
* `books/[bookId]/page.tsx`: banner uses `countSetupStepsDone` / `setupSurfaceStatus` /
  `SETUP_STEP_TOTAL`; query selects `setupImportSkipped`.

**Deliberately NOT changed:** `setupWorkflows` still lists the skipped artifacts, so
ProactiveGuide's "Run N setup agents" batch offer, the Style page and the Setup wizard remain
fully reachable. Skipped setup becomes an *offer*, never the *blocking next step*.

### Tests (`tests/unit/setup-surface.test.ts`, 21 assertions)

RED first (module absent → both files failed to import). Covers: `SETUP_STEP_TOTAL === 5`;
0/5, 5/5 and the Owen 2/5 state; skipped-import counts; `setupSurfaceStatus` none/partial/done
incl. done-via-`setupComplete` **and** done-via-all-five; `nextSetupWorkflow` priority walk,
null when all artifacts exist, null when `setupComplete`; nav-key classification; badge shown
only on the recommended key, suppressed for setup-phase keys post-completion, preserved for
`chapters`/`editorial`.

---

## D-161 — "Start Writing!" landed on the overview (S3, judge C)

### Mechanism

`handleFinishSetup` PATCHed `setupComplete: true` then `router.push('/books/{id}')`. The
writer then had to find the chapter row and click Edit — two hops between the CTA that
promises writing and the cursor, which is what breaks the D4 "typing ≤ 60s" claim.

### Shape

Create-or-open, resolving a chapter the way the overview's own Edit action does (open by id,
`/books/{bookId}/chapters/{chapterId}`):

1. `pickStartWritingChapter(book?.chapters ?? [])` — **lowest `chapterNumber`**, not array
   order (immutable: no in-place sort; stable on duplicate numbers).
2. Cache miss → one authoritative `GET /api/books/{id}/chapters` **before** creating, so a
   stale or not-yet-loaded book query can never mint a duplicate Chapter 1 (that path returns
   a clean 409 from the route, but not creating is better than recovering).
3. Still nothing → `POST` Chapter 1 (`chapterNumber: 1, actNumber: 1`), then open it.
4. Only if that fails → overview, **with the reason surfaced** (`Setup saved, but the first
   chapter could not be opened: …`) rather than a silent redirect. Setup itself is already
   persisted at that point and the copy says so.

The settings PATCH failure path now also reports its reason instead of discarding the error
object, and the CTA is `disabled` while in flight (`finishing` guard) so a double-click cannot
double-POST settings or create two chapters.

In practice step 1 almost always hits: `POST /api/books` already returns `firstChapterId`, so
every book created through `/books/new` has Chapter 1 before the wizard starts.

### Tests

`pickStartWritingChapter`: null on empty; lowest-numbered regardless of order; stable pick on
duplicate numbers **and** input array unmutated.

---

## D-163 — "1 chapters" ×2 (S4, judges A+B)

### Mechanism

Three sites concatenated a count with a hard-coded plural noun. The project had **no**
pluralisation mechanism at all — the only existing pattern is a two-form dictionary pair
(`bookList.book` / `bookList.books`) chosen at the call site with `count === 1 ? … : …`
(`src/app/(app)/books/page.tsx:98`).

### Shape

Reuse that pattern, promoted to a helper instead of a fourth ad-hoc ternary:
`pluralNoun(count, one, many)` and `countWithNoun(count, one, many)` in
`src/lib/i18n/plural.ts`. Then:

* `setup.chapterOne` / `setup.chapterMany` added to **all 7 locales**, each derived from that
  locale's own existing chapter plural (`en` chapter/chapters, `sr` poglavlje/poglavlja, `de`
  Kapitel/Kapitel, `es` capítulo/capítulos, `fr` chapitre/chapitres, `ru` глава/глав, `zh`
  章/章). No new prose was hand-translated. The now-unused `setup.chaptersLoaded` ("chapters
  loaded") was removed from the interface and all 7 locales in the same edit — the import
  banner now reads `Manuscript imported — 1 chapter`, fully localized.
* Style-step helper (41a): the sentence itself is pre-existing hard-coded prose branching on
  `book.language` (sr vs English), so the noun pair is inlined per branch to keep sentence and
  noun in the same language — `(1 chapter)` / `(1 poglavlje)`. Localizing that whole sentence
  is out of scope for this defect.
* Done summary (41b): the row **label** already says "Chapters", so the value drops the
  redundant noun entirely — `Chapters: 1`. This removes the defect without mixing the
  writer's UI-language noun into an English hard-coded label row.

### Tests (`tests/unit/i18n-plural.test.ts`, 7 assertions)

Singular at 1, plural at 0/2/17; `countWithNoun(1, …)` explicitly asserted **not** to equal
`"1 chapters"`; all 7 `UI_SUPPORTED_LANGUAGES` carry both noun forms (locale-coverage guard
against a future locale being added with only one form); English correct at 1 and 3.

---

## In-lane findings and residual risks

1. **Two-form plurals cannot be right for Russian.** `ru` needs three categories (1 глава /
   2-4 главы / 5+ глав); the dictionaries only carry two, so `countWithNoun` renders
   "2 глав" where "2 главы" is correct. This is the pre-existing limitation of the
   `book`/`books` mechanism, not a regression, and `plural.ts` documents why
   `Intl.PluralRules` was *not* used (it would resolve to a `few` category with no dictionary
   key behind it). Fixing it properly = a third key per countable noun + a `PluralRules`-based
   selector. **Not registered as a defect** — flagging for the register owner as a possible
   S4 if a judge reads Russian.
2. **Behaviour change beyond the three defects, deliberate:** `nextRecommendedWorkflow` now
   changes for any book with `setupComplete=true` and missing setup artifacts. That moves the
   ProactiveGuide primary CTA (`proactive-guide.tsx`) and the documents-library suggestion
   (`documents-library.tsx`) as well as the sidebar badge. All three move in the same
   direction (setup settled → recommend writing). No test asserted the old behaviour.
3. **`✓ 2/5` needs a human read.** A judge could argue that a check next to a fraction below
   100% is itself ambiguous. The alternative (advance the numerator to 5/5 on
   `setupComplete`) was rejected as a lie. A tooltip would need a new 7-locale string, so it
   was left out; if the panel dislikes the glyph, the cheap follow-up is a localized
   `title`/`aria-label` on the badge.
4. **Accessibility parity, not improvement.** The two new `CheckIcon`s are `aria-hidden`,
   matching the file's existing `LockIcon`/`CircleIcon`/status-bar treatment. The sidebar
   conveys all of these states visually only — pre-existing, unchanged, and a legitimate
   separate finding for someone auditing a11y.
5. **Not re-captured on camera.** This lane is code-only; the D4/D3 grade move needs the P6
   re-shoot (41-series redo) to show `✓ 2/5` + checked Setup + no Style badge + the CTA
   landing in the editor. Worth pairing with the panel's requested wall-clock timing, since
   D-161 removes two hops from exactly the leg they want timed.
6. **Single commit for three defects.** All three touch `setup/page.tsx`, and two also share
   `setup-surface.ts` + its spec file; splitting per defect would have required hand-crafted
   sub-hunk staging whose intermediate states could not be verified green while a concurrent
   lane holds the checkout. One verified-green commit was preferred over three unverifiable
   ones. Each defect is independently traceable via its own tests and code comments.
7. **Untouched by design:** `evidence/p6-owen-rejudge/UI-CAPTURE-2026-07-26.md` still claims
   41c proves the post-setup overview is clean; the panel's evidence-integrity note says 41e
   is the proof and 41c is a pre-setup/mid-hydration frame. That correction belongs to the
   capture owner, not this fix lane.
8. **D-162 (usage in/out swap) not addressed** — it is a billing/registry question in the
   concurrent lane's territory and needs one `usage_records` read, not a UI fix.
