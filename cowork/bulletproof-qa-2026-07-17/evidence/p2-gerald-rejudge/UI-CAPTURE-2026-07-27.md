# P2 "Gerald" — 44-series UI evidence wave

**Date:** 2026-07-27 · **Branch:** `qa/bulletproof-2026-07-17` · **Build under test:** HEAD `108fec3`
(working tree clean at start; no product source changed by this wave).
**Persona:** P2 Gerald — career genre novelist, 30 books shipped, revising thriller #31 on
deadline, *"will leave forever the first time the tool loses a word"* (`TEST-PLAN.md:21-31`).
**Verdict of record being attacked:** **6.0**, floors **D4 / D8 / D10 / D11**
(`evidence/judging/HELD-REJUDGE-AGGREGATE.md` §P2, 3-panel 07-20; FUNC 6.5 / UX 6.0 / TRUST 5.5).

The 07-20 bundle contained **zero screenshots**. Three of P2's four floors are only
movable in pixels. This wave is additive: it re-supplies what the 07-18 baseline had and
adds what neither bundle ever had.

---

## 0. TL;DR for a judge in 12 lines

1. **D10 CAPTURED, complete.** Two-tab race on camera: non-blocking chip → diff dialog →
   "Load theirs" → the discarded words **read back out of Version History**. `44a`-`44c2`.
2. **D4 CAPTURED, complete, with the import leg.** Cold identity, zero books,
   `onboardingComplete=false` → first words autosaved into a 42K-word imported manuscript
   in **31.5 s wall-clock**, 8/8 chapters **byte-exact, delta 0 chars**. `44g`-`44j`, `44i3`.
3. **D11 CAPTURED as documents** (teardown addendum + head-to-head), not as new pixels.
4. **D8 NOT CAPTURED — blocked by a reproducible product wall**, not by budget or time.
   `create-story-bible` reports success and persists nothing → `dev-edit` is unreachable.
   That wall is **new defect D-179** and is the most consequential finding of the wave.
5. **D3b / D6 / D9 deliberately NOT captured** (R1). They are excluded from P2's grade
   today; half-shooting them would create a new floor. Section 6 lists them explicitly.
6. **D-115 is on camera** (`44q1`-`44q3`) and is **worse in the UI than on the record**:
   the browser path has **no phantom 409 at all** — the first save 200s and silently
   adopts the deleted prose into the brand-new chapter. New defect **D-181**.
7. **Gerald's first AI touch is fixed.** The 07-20 honest 502 is now a **200 with real
   prose in 2.6 s**, streamed (`text/event-stream`), accepted with Tab. `44p1`, `44p2`.
8. **The core revision tool corrupts prose.** Book-wide `Sam`→`Max` produced **17
   replacements where 6 were wanted** (`Maxe`, `Maxple`, `Maxovar`) — no whole-word
   option exists. New defect **D-180**. `44k1`-`44k3`.
9. **Gerald's 40,466-word manuscript is byte-identical before and after this wave**
   (`44-manuscript-hashes-PRE/POST.txt`, diff empty). Every destructive drill owned its
   own `P2-CAPTURE-*` book. `qa-seed-personas.ts` was never run.
10. **Worker-proof PASS** (`RUNTIME_WORKER_COUNT = 1`) for every measured number.
11. **Spend: $0.0719** on Gerald's own OpenRouter key, itemised in §5.
12. **`.env` was never modified.** The cold funnel used header identity, not a flip.

---

## 1. Harness, identity, and protocol

| Item | Value |
|---|---|
| Base URL | `http://localhost:3001` — verified `GET /api/health/dependencies` → `status:"ready"`, 8/8 deps ok, `worker: ok`, before and after the wave |
| Identity | **e2e headers only**: `x-e2e-test-secret` + `x-e2e-clerk-id`. `src/lib/auth.ts` checks this branch *before* the dev-bypass branch, so `.env`'s `DEV_CLERK_ID=user_qa_p5` is irrelevant and was left untouched (`git status --porcelain .env` empty at start and end) |
| Personas used | `user_qa_p2` (Gerald, professional plan, BYOK openrouter validated, `default_model=openrouter-qwen36/sonnet`) and `user_qa_p2cold` (see §4 D4) |
| Capture protocol | v8 — `nextjs-portal{display:none !important}` injected via `addInitScript` **and** re-injected with `addStyleTag` after every navigation, per `fix-reviews/D-136-adjudication-nextjs-dev-indicator.md`. The Next.js dev-tools "N Issues" pill is adjudicated harness chrome; it is absent from every 44-series frame by design, not by luck |
| Viewport | 1280→**1440 × 1000, deviceScaleFactor 2**, desktop (P2 is a desktop-pro persona). 1440 chosen so the toolbar renders at non-compact density and the Version History button stays inline |
| ENV-01 route warm | 9 routes GET-warmed before any timed shot; cold `/export` compile took 8.38 s, warm calls 0.10-0.20 s. Recorded so no timing below is a Turbopack artifact |
| Worker proof | `screenshots/44-worker-proof.txt` — enumerate processes whose command line references `src/worker.ts`, distinguish launch chain from runtime. **`RUNTIME_WORKER_COUNT = 1`, VERDICT = EXACTLY ONE WORKER (PASS)**, captured 04:20:54Z, worker unchanged for the whole wave |
| Scripts | `scripts-v2/` in this directory (kept separate from the 07-20 `scripts/`) |
| Never run | `scripts/qa-seed-personas.ts` — it wipes Gerald's 70 books. Not run, not imported |

### R3 — historical artifacts were not overwritten

`tests/e2e/x1-two-tab-conflict.spec.ts` drives the same drill but hardcodes its
screenshot paths to `evidence/w4-ui-drills/screenshots/x1-b-*.png`, the committed 07-18
**pre-fix baseline**. It was **not** run. The drill was re-implemented as a standalone
script (`scripts-v2/shot44a-c.ts`) writing only 44-series paths. `git status` shows no
modification under `w4-ui-drills/`.

---

## 2. Persona-state ledger (what this wave changed in the database)

| Object | Before | After | Note |
|---|---|---|---|
| `Dead Reckoning 31 QA P2` `636a1f02…` (8 ch, 40,466 w) | — | **byte-identical** | `44-manuscript-hashes-PRE.txt` vs `…-POST.txt`, `diff` empty. Read-only except one 807-char excerpt *copied out* for the quick-assist fixture |
| `user_qa_p2` book count | 70 | 74 | +4 `P2-CAPTURE-*` books (conflict, D115, quick-assist, find/replace) + 1 `P2-CAPTURE-D8-*`; all disposable probe residue, named so they are greppable |
| `user_qa_p2cold` | did not exist | created, then walked through onboarding | **New DB row** inserted for the D4 cold funnel: `clerk_id=user_qa_p2cold`, `onboarding_complete=false`, no subscription, no BYOK key. It owns one book, `Dead Reckoning (book 31)` `73247017…` (the imported 42K fixture). Disclosed as capture residue — the P5 precedent left `The Quiet Hours` the same way |
| `user_qa_p2` `usage_records` | 158 rows / $0.007333 lifetime | +33 rows / **+$0.071891** | itemised in §5 |
| `.env` | `DEV_CLERK_ID=user_qa_p5` | **unchanged** | verified twice |
| Dev server / worker | running | **left running** | as instructed |

**Registered-open, do not re-discover** (pre-declared for the panel): **D-115** (captured
here, not fixed), **D-22**, the **stampless first-save** last-write-wins window,
**D-127 / D-148** (model substitution undisclosed at point of use — re-observed here),
**D-100** family, **Z13 / D-141** Radix `useId()` hydration mismatch, the **e2e-layer**
`offline-autosave.spec.ts` gap (closed at the *unit* layer by `c1f31b1`, see `44e`),
**D-121**, and P1/P6's **D-157…D-178**.

---

## 3. Shot inventory

| Shot | File | Dim | Status |
|---|---|---|---|
| 44a | `44a-conflict-chip-nonblocking.png` | D10 / D2 | **PASS** |
| 44b | `44b-conflict-dialog-diff.png` | D10 / D2 | **PASS** |
| 44c | `44c-version-history-after-load-theirs.png` | D10 | **PASS** (1 disclosed retry) |
| 44c2 | `44c2-conflict-backup-version-viewed.png` | D10 / D2 | **PASS** (same retry) |
| 44e | `44e-gate1-offline-autosave-zeroloss.txt` | D2 / D10 | **PASS** — 17/17 green |
| 44g | `44g-cold-onboarding-step1.png` | D4 | **PASS** |
| 44g2 | `44g2-cold-onboarding-keys-skip-available.png` | D4 | **PASS** |
| 44h | `44h-cold-new-book-form.png` | D4 | **PASS** |
| 44h2 | `44h2-cold-post-create-landing.png` | D4 | **PASS** |
| 44i | `44i-import-preview-structure.png` | D4 / D2 | **PASS** |
| 44i2 | `44i2-import-confirmed.png` | D4 | **PASS** |
| 44i3 | `44i3-import-fidelity.txt` | D2 / D4 | **PASS** — 8/8 byte-exact, delta 0 |
| 44j | `44j-first-words-saved.png` | D4 | **PASS** |
| 44k1-3 | `44k1…44k3` | D1 / D3 | **PASS (product FAILS)** — see D-180 |
| 44p1 | `44p1-ghost-text-on-gerald-model.png` | D1 / D5 / D10 | **PASS** |
| 44p2 | `44p2-ghost-accept-armed.png`, `44p2-ghost-accepted.png` | D5 | **PASS** (1 disclosed retry) |
| 44p3 | `44p3-inline-edit-suggestion.png` | D5 / D8 | **PASS** (same retry) |
| 44q1-3 | `44q1…44q3` | honesty / D-115 | **PASS (product FAILS differently than recorded)** — see D-181 |
| 44n | `44n-devedit-start.json`, `44n0*-sse.jsonl` | D8 | **BLOCKED — see D-179. D8 NOT CAPTURED.** |
| — | `TEARDOWN-ADDENDUM-2026-07-27.md`, `HEAD-TO-HEAD-2026-07-27.md` | D11 | **SUPPLIED (documents, not pixels)** |

Every PNG has a sibling `*-assertions.json` with programmatic DOM/API assertions, verbatim
copy, network traces and a timestamped log, so no claim below rests on a human reading a
screenshot.

---

## 4. Per-dimension findings

### D10 — delight (floor 6.0). **CAPTURED COMPLETE.**

The 07-18 baseline scored D10 7.0/6.5 on three artifacts that lived in *other* bundles.
All three were re-shot on the current build, plus the leg nobody had ever shot.

**44a — the conflict is non-blocking.** Two genuinely independent browser contexts, same
persona, same chapter. Tab A types and reaches `Saved` in **3,835 ms**. Tab B, unaware,
types; its stamped PUT 409s and **4,098 ms after B started typing** an amber toast appears
("*Another writer (agent, import, or tab) saved a newer version. Your words are kept in
this editor — review to resume saving.*") plus a status-bar chip "**Conflict — click to
review**". Programmatically asserted in the same frame:

* `dialog_open_count_when_chip_appeared: 0` — the dialog **never auto-opens**
* `typing_continued_after_conflict: true` — B typed " Still typing." *after* the 409 and it landed
* `losers_words_still_live_pre_resolve: true`
* `server_head_untouched_by_loser: true` and `server_head_holds_winner: true`

**44b — the dialog is honest.** Heading "Chapter changed outside this editor", green =
yours / red = theirs line diff, three choices (Cancel / Load theirs / Keep mine), and the
promise, verbatim: *"Whichever you choose, the other version stays in version history."*

**44c + 44c2 — the promise is kept, and proven.** "Load theirs" resolved in **1,997 ms**.
The version ledger afterwards reads
`v5 conflict-resolve · v4 conflict-backup · v3/v2/v1 user`. Opening **v4** in the product's
own version viewer displays the discarded sentence back, verbatim:
*"…The words Gerald typed on the other device — and does not intend to lose. Still typing."*
API cross-check on the same version: `conflict_backup_content_contains_losers_words_API: true`.

**Honest defect found inside the win → D-182.** The Version History panel renders every one
of those five rows with the identical badge "**Manual**". `changeSource` is stored
(`conflict-backup`, `conflict-resolve`) but never surfaced. The dialog promises the words
are in version history; the panel gives no way to tell *which* row they are in short of
opening versions one at a time. The promise is kept in the data model and not in the UI.

**Disclosed retry (1).** The first pass screenshotted the panel while it still read
"Loading versions…" (1.5 s settle too short). Re-shot with a wait on the rendered `vN`
rows; both frames come from the same fixture and the same `conflict-backup` v4.

### D4 — onboarding / time-to-first-word (floor 6.0). **CAPTURED COMPLETE, including the import leg.**

P2 had never had a fresh-user funnel; the 07-20 382 ms figure was measured on an
already-onboarded account. This is a genuinely cold identity: `user_qa_p2cold`,
`onboardingComplete=false`, **0 books** (`GET /api/books` → 200, 0), **0 keys**
(`{"onboardingComplete":false,"keyCount":0}`), no subscription row (free tier).

**Deviation from the brief, and why it is stronger, not weaker.** The brief's §6 allowed a
sanctioned `.env` flip (`DEV_CLERK_ID` + `DEV_ONBOARDING_COMPLETE=false`). It was **not
used**. `src/lib/auth.ts` resolves e2e-header identities with `findUnique`, so a cold
`user_qa_*` row created directly in the database yields exactly the cold state without a
flip — and without the mid-capture tenant-swap risk a hot-reloading `.env` introduces.
`.env` is therefore verifiably untouched (§2).

**Wall clock, single continuous run, warm routes:**

| Mark | +ms from first request |
|---|---|
| `/onboarding` step 1 painted | **420** |
| step 2 (API keys) | 2,935 |
| "Skip for now — start writing free" → `/books/new` | 4,713 |
| book created, **landed directly in the editor** | 7,528 |
| import wizard open | 11,965 |
| **8 chapters / 42,237 words detected** | 15,960 (preview itself: **487 ms**) |
| import confirmed | 23,966 (confirm itself: **6,102 ms**) |
| editor ready on imported ch.1 | 27,583 |
| first words typed | 31,084 |
| **first words `Saved`** | **31,456** |

**The card-free / key-free on-ramp is real** (`key_free_on_ramp_offered: true`): with zero
providers connected the wizard offers "Skip for now — start writing free", and it lands
the writer on *name your book*, not a dashboard of zeros. Step-1 copy is honest about the
model: "No credit card or API key required to start writing… WMB uses your own AI provider
API keys."

**The import leg — Gerald's actual day-0 — lands intact.** A deterministic 8-chapter,
236,650-byte, ~42,188-word Markdown manuscript with the same unicode stress profile as his
canonical book (Zürich / Łódź / Kőszeg / Białystok / Đorđe / Þórunn / em dashes / curly
quotes). The wizard detected **8 chapters**, showed per-chapter word counts, and warned
honestly: *"This book has 1 existing chapter. Chapters with matching numbers will be
available for replacement."* After confirm: 8 chapters, 42,229 words, titles with every
diacritic intact.

**Fidelity, byte level (`44i3`):** source blocks vs stored chapter bodies —
`ALL_CHAPTER_BODIES_BYTE_EXACT = true`, `SOURCE_BODY_CHARS = 227910`,
`STORED_BODY_CHARS = 227910`, **`DELTA_CHARS = 0`**, zero unicode tokens lost in any
chapter. (Chapter 1 is compared with the 33-character sentence that shot 44j deliberately
typed into it removed — that removal is printed in the artifact, not hidden.)

**Reconciliation with the 07-20 number:** 382 ms was an API-level time-to-first-word on a
warm, pre-onboarded account. The pixel number for a cold user who brings a finished novel
is **31.5 s end to end**, of which 6.1 s is the import itself. Both are true; they measure
different journeys, and only the second is Gerald's.

**Disclosed harness limitation (not a product claim either way).** With
`DEV_AUTH_BYPASS=true`, `src/middleware.ts` short-circuits to `devBypassMiddleware`, which
skips the onboarding gate entirely. So the *automatic redirect* of an un-onboarded user to
`/onboarding` cannot be exercised in this environment by any identity method; `/onboarding`
was navigated to directly. The wizard itself, its skip path and its `POST
/api/settings/onboarding` are all real.

**Two disclosed harness retries in this leg, both my bug, neither a product failure.**
(1) the preview wait matched `"Chapter 1"` instead of the rendered `"8 chapters detected"`;
(2) `setInputFiles` fired before React attached the dropzone's `onChange`, so the change
event was dropped. Between attempts the cold identity was reset to true day-0 (books
deleted, `onboarding_complete=false`) so the published run is a single clean funnel.

### D11 — competitive edge (floor 6.0). **SUPPLIED as documents.**

Two new artifacts in this directory, both dated and citation-bearing:

* **`TEARDOWN-ADDENDUM-2026-07-27.md`** — corrects the four now-false claims in the
  2026-07-17 teardown that all three baseline judges filed as an S3 doc-accuracy defect:
  find & replace exists (now with live UI proof), reorder works, conductor model-identity
  fixed (`3159d78`), AuthorshipTracker no longer fakes 100% human
  (`hasTrackedAuthorship` gate verified in source). It also **refuses to over-claim**:
  model substitution is still undisclosed at the point of use (D-127/D-148), and the
  addendum says so. The original file is untouched — the audit trail survives.
* **`HEAD-TO-HEAD-2026-07-27.md`** — Scrivener / Word / Sudowrite comparison across
  Gerald's four jobs with an explicit "would he switch & pay" verdict. Reachability limits
  are stated up front: no paid incumbent accounts exist in this campaign, so the incumbent
  columns are **qualitative and labelled as such**, and the export row is
  `NOT-ADJUDICATED` rather than guessed. Verdicts: **WIN** on two-device conflict safety,
  **WIN/TIE** on import, **LOSE** on book-wide rename (see D-180), **NOT-ADJUDICATED** on
  docx export.
* **`44e`** re-supplies the data-safety moat exhibit that landed in `c1f31b1` and was never
  put in front of a P2 judge: `tests/unit/offline-autosave-zeroloss.test.tsx`,
  **17/17 passing**, covering all 8 W4 disaster classes plus the D-24 hard-crash strong bar
  and the `decideRecovery` decision table ("server MOVED under a stale base → conflict,
  NEVER a silent overwrite"). Honest caveat kept intact: this closes the gap at the **unit**
  layer. The **e2e** spec (`tests/e2e/offline-autosave.spec.ts`) is still 0/8 BLOCKED-ENV
  because it runs as `user_test_e2e`, whose subscription row `global-setup` deletes.
* `c2-restore-drill/` is re-pointed to, not re-run — it is a committed 23-trace dual-leg
  Postgres+MinIO restore with byte-identical spot checks and a <60 s dev RTO, and its
  dev-scale caveat stands.

### D8 — manuscript intelligence (floor 6.0). **NOT CAPTURED. Blocked by D-179.**

This was the wave's most expensive planned leg and it was attempted properly, on Gerald's
own account, on a clean 42K-word imported manuscript (`P2-CAPTURE-D8-…`, book
`90436e20…`), under one-worker proof. It did not fail for budget or time. It failed on a
product wall:

1. `POST /api/books/:id/agent {workflowId:"dev-edit"}` → **422** `Prerequisites not met:
   "Style fingerprint needed for editing" satisfiedBy capture-style`.
2. `capture-style` ran to completion — 607.5 s, 522 events, 0 errors — and **did** persist a
   `FINGERPRINT` document and a `style_profiles` row.
3. `dev-edit` retried → **422** `Setup incomplete`, `redirectTo /books/:id/setup`. The gate
   (`src/app/api/books/[id]/agent/route.ts:113-137`) requires **FINGERPRINT + STORY_BIBLE +
   ARCHITECTURE** documents to all exist.
4. `create-story-bible` ran → **200**, streamed a complete Story Bible into the chat,
   ended `success: true`, `endReason: "natural"`, `errorCount: 0`, told the writer
   *"**Story Bible Status:** Complete and ready for reference"*, and suggested
   `build-architecture` as the next step — with **`documentIds: []`**. No `WriteDocument`
   tool call was ever emitted; the only tools used were `ReadAllChapters`, `ReadDocument`,
   `ListDocuments`.
5. `build-architecture` → **422** `Prerequisites not met: "Story Bible needed before
   designing architecture"`.
6. `create-story-bible` **retried once** (65.5 s, 387 events, 0 errors) → same outcome,
   `success: true`, `documentIds: []`, `suggestedNext: ["build-architecture"]`. **2/2.**

Net: on a freshly imported manuscript, an editorial pass is unreachable, and the product
tells the writer everything is fine at each step. Raw traces: `44n0-capture-style-sse.jsonl`,
`44n0b-story-bible-sse.jsonl`, `44n0b2-story-bible-retry-sse.jsonl`, `44n0c-architecture-start.json`,
`44n-devedit-start.json`.

Per the honesty rules: one retry was taken, it reproduced, and the run stops there rather
than looping. **D8 therefore has no new evidence this wave and remains at n=1** (the 07-20
inline-edit sample). The anchor-verification harness that would have produced the
byte-checked anchors table is written and committed (`scripts-v2/anchor-verify.ts`) so the
lane can be finished in minutes once D-179 is fixed. `44p3` adds a *second* inline-edit
datapoint but a single 3-suggestion rewrite is not a manuscript-intelligence dim and is
not offered as one.

### D-115 on camera (honesty artifact, OPEN by design this wave)

Captured, not fixed — the brief's §5 recommendation and the wave's instruction. Run in its
own book (`P2-CAPTURE-D115-…`), so nothing of Gerald's was risked.

* **Disclosure first:** chapter delete has **no UI affordance at all** — `useDeleteChapter`
  (`src/hooks/use-chapters.ts:127`) has zero component consumers. The delete leg was
  therefore driven over the API. That absence is itself new defect **D-183**.
* `DELETE /chapters/:id` → **200 `{"deleted":true}`**; `GET` on that chapter → **404**. The
  chapter is gone as far as the writer can tell.
* **44q1** — `/books/:id/chapters/new`, the real form, auto-defaults `chapterNumber` to
  **2**, the number just freed. The writer does not have to do anything unusual to walk
  into this.
* **44q2** — the brand-new chapter opens **full of the deleted prose**, sentinel
  `GHOST_SECRET_9f3a` and all, under a "**Fresh Start**" badge, with the footer reading
  **"16 words"** while `GET …/content` for the same chapter returns
  **`wordCount: 0` with a 106-character non-empty body** — the second, cheaper honesty
  defect in the same frame, exactly as the brief predicted.
* **44q3** (`44q3-first-save-silently-adopts-deleted-prose.png` — renamed from the planned
  `44q3-phantom-409-…` because the planned symptom did not occur) **— the recorded symptom
  did not reproduce, and what replaced it is worse.** The
  register's API-level repro ends in a phantom **409** whose `serverContent` leaks the
  deleted text. In the browser there is **no 409 and no dialog**: the editor read the
  orphan document's version, so its first stamped save is *valid*, returns **200**, and the
  deleted prose is silently adopted. Verified after the fact: `version 3`, `wordCount 23`,
  markdown = deleted sentence **+** the writer's new sentence. No warning was ever shown.
  New defect **D-181**, riding the D-115 fix lane.

### D1 / D3 — the core revision tool (not floors, captured opportunistically)

**44k1-44k3 — book-wide Find & Replace, on camera, with the whole-word trap.**
Ctrl+Shift+F opens the real dialog: scope **This chapter / Whole book**, a **Case
sensitive** switch, a live debounced preview with per-chapter counts and highlighted
snippets, **Replace all**. Asserted from the rendered dialog text:
`dialog_offers_whole_word_option: **false**`.

Fixture: two chapters in which "Sam" is a character and "same"/"sample"/"samples"/"samovar"
are ordinary words — the exact class the trust judge filed as S3 at baseline. Renaming
`Sam` → `Max` book-wide produced:

* wanted (whole-word `Sam`): **6**
* actual `Max` occurrences after: **17**
* collateral corruptions: **11** — `Maxe` (×8, from "same"), `Maxple`, `Maxples`, `Maxovar`

The result message counts every one of those as a success. There is no whole-word toggle,
no preview of which matches are inside larger words, and no undo affordance in the dialog.
New defect **D-180**. This is the single most concrete competitive gap in the head-to-head
(both Scrivener and Word ship whole-word matching).

**Corroborating field evidence, disclosed as campaign residue:** every one of the 8
chapters of Gerald's canonical manuscript currently contains `[[REPLACED]]` markers —
614 in chapter 1 alone, 4,617 book-wide — left by the deliberate 07-18 book-wide
find/replace drill and never reverted. Visible on camera in `44p1`, where "them" reads
`[[REPLACED]]m` and "together" reads `toge[[REPLACED]]r`. This is **not** spontaneous
product corruption and must not be scored as such, but it is the same mechanism as D-180,
at manuscript scale, in the campaign's own fixture.

### D5 / D1 — Gerald's first AI touch, re-probed (the brief's #1 free win)

At the 07-20 re-judge Gerald's very first AI interaction returned an honest **502**
("The suggestion cut off before any text was produced") because his default model,
`openrouter-qwen36/sonnet`, is a reasoning model. On the same account, same default model,
current build:

* **44p1** — ghost text renders **2,613 ms** after the typing pause, inline, grey italic,
  as real prose. `POST …/ghost-text` → **200**, `content-type: text/event-stream` — it is
  streamed, per `01192a3`.
* **44p2** — the accept pill arms **4,764 ms** after the pause (D5/D-140: Tab is inert
  until the `done` frame — the first pass pressed Tab mid-stream and correctly got a
  no-op, which is the designed behaviour, disclosed here rather than hidden). Tab then
  inserts the suggestion into the prose: *"The courier was late, so I poured another drink
  and tried to remember what it felt like to believe in anything but the balance of a
  ledger."*
* **44p3** — inline edit (F2 on a 99-character selection) → `POST …/inline-edit` **200** in
  **5,619 ms**, 3 alternative suggestions with Accept/Reject and a 1/3 counter. Unicode
  survived the round trip in the editor: `Zürich`, `protégé`, `—`, `“`, `”` all present.
* **Substitution is real and still undisclosed.** `usage_records` shows both quick-assist
  calls served by **`openrouter-deepseek/haiku`**, not Gerald's `openrouter-qwen36/sonnet`.
  That reroute is `d51514c` working as designed and is *why* the 502 is gone; nothing in
  the editor tells the writer a different model answered. Registered open as D-127 / D-148
  — re-observed, not re-numbered.
* **Abort-unbilled corroborated:** 3 `ghost-text` SSE requests, **2** billed rows.
  Consistent with D-142; offered as an observation, not a proof.
* **Voice observation (n=1), D-184:** the accepted sentence slips into **first person**
  ("*I* poured another drink") inside a close-third passage that otherwise reads "He read…",
  "Marek set…". One sample is not a verdict; it is recorded because P2's exit criteria
  include voice preservation.

---

## 5. Billable usage — Gerald's own OpenRouter key

Authorised ceiling ~$1. **Actual: $0.071891** across 33 `usage_records` rows,
2026-07-27 04:00Z → 05:46Z (`44-spend-PRE.txt` / `44-spend-POST.txt`).

| agent_type | model served | calls | tokens in | tokens out | cost |
|---|---|---|---|---|---|
| `writing-coach` | `openrouter-qwen36/sonnet` | 3 | 148,752 | 11,600 | **$0.070234** |
| `embedding` | `text-embedding-3-small` | 27 | 67,303 | 0 | $0.001346 |
| `inline-edit` | `openrouter-deepseek/haiku` | 1 | 433 | 124 | $0.000158 |
| `ghost-text` | `openrouter-deepseek/haiku` | 2 | 528 | 53 | $0.000153 |

98% of the spend is the three setup-workflow sessions (`capture-style` + two
`create-story-bible` runs) that D-179 made worthless — the writer pays full price for a
Story Bible that is never persisted. That is part of the defect, not an aside.

Per-call honesty note: the two `create-story-bible` runs are billed and produced no
artifact; that is the *correct* accounting (tokens really were consumed) and the *wrong*
outcome.

---

## 6. Dims and surfaces explicitly NOT captured (R1 compliance)

The grade is `min(aggregated dims)`. **D3b, D6 and D9 are currently excluded from P2's
grade as unanimous NO-EVIDENCE.** Supplying any of them badly would create a *new* floor
and could drop P2 below 6.0. Each was left completely untouched rather than half-shot:

| Dim | What a complete capture requires | Status |
|---|---|---|
| **D3b — click-path / keyboard-first** | keyboard-only traversal of the editor with step counts, a dead-end drill, focus-order evidence | **NOT CAPTURED — deliberately.** No partial keyboard evidence is offered anywhere in this bundle |
| **D6 — visual craft** | dark theme, empty states, loading states, at consistent viewport | **NOT CAPTURED — deliberately.** Every 44-series frame is light theme with populated data |
| **D9 — retention surfaces** | streaks, real dashboard/stats data over time | **NOT CAPTURED — deliberately** |
| **D8 — manuscript intelligence** | dev-edit findings with byte-verified anchors, continuity check, line-edit voice read | **ATTEMPTED, BLOCKED by D-179.** Traces published; no partial findings artifact is offered |
| Chapter **reorder** | `PATCH …/chapters/reorder` in the UI under concurrent autosave | **NOT CAPTURED.** Asserted in the teardown addendum from the 07-18 API result only, and labelled as such |
| **Export docx round-trip** (J4) | export → open → normalised diff vs DB | **NOT CAPTURED.** Head-to-head marks it `NOT-ADJUDICATED` rather than guessing |
| **Version restore** after a bad apply-all | restore flow + diff | **NOT CAPTURED.** The Version History *panel* and version *viewer* are captured (44c/44c2); the restore mutation was not exercised |
| **2M-char paste → honest 400** | UI-level oversized paste | **NOT CAPTURED** this wave (API-level proof exists in the 07-18 bundle) |
| **Network-kill / crash / immersive-unload drills** | live browser fault injection | **NOT CAPTURED** as pixels. Covered at unit layer by `44e` (17/17), which is what is claimed — nothing more |
| **Real-device / iOS Safari, human subjects** | founder follow-ups | Out of scope, pre-declared in `ENVIRONMENT-AND-LIMITS.md` |

---

## 7. NEW defects found this wave (described here; register file assigns the numbers)

Register-style notes are in `evidence/fix-reviews/D-179-D-185-p2-44series-observations.md`.
Summary, next free id after this wave: **D-186**.

| id | S | one line |
|---|---|---|
| **D-179** | **S2** | `create-story-bible` ends `success: true` and tells the writer "Story Bible Status: Complete" while persisting **no** `STORY_BIBLE` document (`documentIds: []`, no `WriteDocument` call) — silently blocking `build-architecture` and every editorial workflow behind "Setup incomplete". Reproduced 2/2. Billed both times. |
| **D-180** | **S2** | Find & Replace has **no whole-word option**; a book-wide character rename corrupts every word containing the name (`Sam`→`Max` ⇒ `Maxe`/`Maxple`/`Maxovar`; 17 replacements where 6 were wanted) and reports the corruptions as successes. |
| **D-181** | S3 | D-115's UI variant is **silent**: no phantom 409 in the browser. The editor stamps the orphan document's version, so the first save 200s and permanently adopts the deleted prose into the brand-new chapter. |
| **D-182** | S3 | Version History cannot identify the conflict backup — all rows render badge "Manual"; `changeSource` is stored but never surfaced, so the dialog's "stays in version history" promise is not *findable*. |
| **D-183** | S3 | Chapter delete has **no UI affordance**: `useDeleteChapter` has zero component consumers. |
| **D-184** | S4 | Accepted ghost-text broke POV (first person inserted into a close-third passage). n=1, disclosed as such. |
| **D-185** | S3 | `books.chapter_count` is not incremented by `POST /api/books/:id/chapters` — reproduced on two fresh capture books (1 vs 2 actual) and present on the canonical manuscript (7 vs 8). The import path sets it correctly. |

---

## 8. Environment anomalies and disclosures

* **Harness retries taken (all disclosed above, one per step maximum):** version-history
  settle (44c), import preview selector + dropzone hydration (44i, funnel re-run from a
  reset cold identity), ghost-accept arming and inline-edit settle (44p2/44p3), find/replace
  preview settle (44k). Every one was a harness-timing bug; none is presented as a product
  behaviour, and none was retried more than once.
* **One assertion field was corrected after the fact, in place, with the correction
  printed:** `44k`'s collateral counter originally searched lowercase `maxe` and reported 0.
  The replacement preserves the replacement string's casing (`Maxe`). The counts were
  recomputed **from the prose already stored in that same JSON file** — no re-run, and the
  file carries a `NOTE` field saying so.
* **`style-analyst` delegation fell back mid-run** during `capture-style`: the conductor's
  own text reads "The specialist hit a snag, but I analyzed your manuscript directly."
  Honest self-disclosure by the product; recorded, not filed.
* Gerald's canonical manuscript is `[[REPLACED]]`-polluted campaign residue (§D1/D3). Any
  future P2 wave that needs clean canonical prose should use the fixture generator in
  `scripts-v2/make-fixture.ts` rather than the 07-18 book.
* `book.chapter_count` drift (D-185) means shelf-level chapter counts may under-report; the
  editor sidebar reads the live chapter list and is correct. The exact UI surfaces that
  read the denormalised column were **not** enumerated — the defect note says so.
* Dev server (:3001) and the BullMQ worker were left running. `.env` untouched and verified.
* No product source file was modified by this wave. Everything written lives under
  `cowork/bulletproof-qa-2026-07-17/evidence/p2-gerald-rejudge/`.
