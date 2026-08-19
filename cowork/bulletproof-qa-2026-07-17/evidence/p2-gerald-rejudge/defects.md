# P2 "Gerald" RE-JUDGE — Defects (fresh independent capture, 2026-07-20)

Live dev server `http://localhost:3002`, current committed code (branch
`qa/bulletproof-2026-07-17`). Persona `user_qa_p2` over real HTTP (e2e secret +
`x-e2e-clerk-id`). ONE worker at capture (`worker-proof.txt`, runtime PID 61892).
Evidence only — no `src/` edits, no fixes.

Baseline register cross-checked (`evidence/p2-gerald/defects.md`,
`project_qa_campaign_0717.md`) before assigning IDs. New finding here is filed as
provisional **TBD** (orchestrator assigns the real number; canonical register
last reached ~D-115).

---

## RETESTED BASELINE DRIVERS

### D-16 — racing first-saves create duplicate `Document` rows (S1 baseline) → **CLOSED**

Baseline (`p2-gerald/defects.md` §D-16): two concurrent first-saves to a fresh
chapter minted **two** `documents` rows (same `storage_key`, independent version
counters); subsequent GET/PUT resolved either row nondeterministically → silent
lost-update, and the 409 CAS net was structurally defeated *across* rows. Filed
S1, "Reported, not fixed" in the original bundle.

**Re-tested LIVE on current code — CLOSED at every layer:**

| Check | Result | Trace |
|---|---|---|
| Unique constraint present | `documents_book_id_type_chapter_number_key` PRESENT | `api-traces/00-state-probe.txt`, `05-verify-d16-constraint.txt` |
| Duplicate INSERT rejected | P2002 unique violation (canonical script, exit 0) | `05-verify-d16-constraint.txt` |
| 6 concurrent first-saves → row count | **exactly 1 row** (was 2+), 0×500 | `10-d16-race.txt` |
| Race statuses | 5×200 + 1×409 (a writer that observed the winner's row got the D-47 stampless 409 — explicit, not silent) | `10-d16-race.txt` |
| Surviving content | intact raced body (`RACE_5…`), not blank/torn; documentId stable | `10-d16-race.txt` |
| Read-your-writes | **10/10** cycles: GET echoes the just-PUT body, same `documentId`, monotone version chain v5→v15 | `10-d16-race.txt` |
| Two-tab CAS | stale `expectedVersion` → **409** carrying the winner's `serverContent` (no silent overwrite) | `10-d16-race.txt` |
| Stampless interactive overwrite (D-47) | **409** | `10-d16-race.txt` |
| Concurrent CAS storm (10 PUTs, same expectedVersion) | **exactly one 200**, 9×409, 0 errors, version advanced by exactly 1, still 1 row | `20-adversarial.txt` §C |
| Concurrent stampless storm (8 PUTs) | **all 8 → 409** (no silent last-write-wins) | `20-adversarial.txt` §D |

The mechanism the baseline warned about (two rows → CAS defeated across rows) is
gone: the DB unique makes the loser's INSERT fail with P2002, and the route
converges the loser onto the single winner row. No configuration in ~40 racing
writes produced a duplicate row, a 500, or a silently-lost clean-200 write.

**Verdict: CLOSED.**

---

### D-01 — malformed JSON body → 500 (S3 baseline) → **CLOSED**

Baseline: `PUT .../content` with malformed JSON returned raw 500. Re-tested on
3 routes (content PUT, book POST, default-model PATCH):

| Route | Status | Body |
|---|---|---|
| `PUT .../chapters/:id/content` | **400** | `{"error":"Invalid JSON in request body"}` |
| `POST /api/books` | **400** | `{"error":"Invalid JSON in request body"}` |
| `PATCH /api/settings/default-model` | **400** | `{"error":"Invalid JSON in request body"}` |

No stack/parser/path leakage in any envelope. Trace `api-traces/20-adversarial.txt` §A.
**Verdict: CLOSED.**

---

### Onboarding cluster (D4 / D6 / D3b — NO-EVIDENCE at baseline) → **EVIDENCE CAPTURED (API layer)**

Both baseline judges scored **D4 onboarding / time-to-first-word = NO-EVIDENCE**
and **D3b ergonomy = NO-EVIDENCE** (API-only journey, all UI deferred). This
re-capture fills the API-observable portion:

- **Time-to-first-word = 382 ms** wall-clock, book-create → first word durably
  saved and read-back verified (`api-traces/30-onboarding.txt` §3). The write-first
  on-ramp auto-creates an empty Chapter 1 on `POST /api/books` (201 +
  `firstChapterId`); no CHAPTER_CONTENT doc until first save.
- **Card-free / key-free on-ramp confirmed:** `POST /api/settings/onboarding`
  completes onboarding with **no API key required** (200, sets `wmb_onboarded`
  cookie); `GET` reports `onboardingComplete:true, keyCount:1`.
- **Default-model surface honest:** role-override round-trip (set→persist→clear)
  works; **D-39 `.strict()`** rejects an unknown key with 400
  (`Unrecognized key: "bogusField"`); an unknown model id → 400; `defaultModel`
  unchanged after both bad requests.
- **BYOK AI on-ramp works** (`35-ai-touch.txt`): inline-edit (4096-tok budget)
  returned 3 real qwen suggestions in 22.2 s.

**Still NO-EVIDENCE at the UI layer** (no click-path / keyboard / dark-theme /
locale / empty-state screenshots) — this pass is API-driven, same honest limit as
the baseline for D3b/D6 visual surfaces.

---

## NEW DEFECT

### TBD — [S3, DATA-INTEGRITY] Deleting a chapter orphans its `CHAPTER_CONTENT` document; a new chapter reusing that `chapterNumber` **resurrects the deleted prose** and its first save is blocked by a phantom 409 that leaks the deleted text

**Severity: S3** (single-tenant; recoverable; requires chapterNumber reuse — but
deterministic, user-visible, and both a correctness *and* a broken-first-save UX
failure; no live-content loss). This is the concrete, user-reachable manifestation
of the campaign's already-known **deferred D-22** ("unguarded/orphaned document
rows keyed by chapter_number"). Flagged as its live instance so the orchestrator
can dedupe against D-22.

**Root cause:** `DELETE /api/books/:id/chapters/:chapterId`
(`src/app/api/books/[id]/chapters/[chapterId]/route.ts`) deletes the `chapter`
row but never deletes the `CHAPTER_CONTENT` `document` (which is keyed by
`(book_id, type, chapter_number)`, not by `chapterId`). The row, its S3 object,
and its `document_versions` are left orphaned. Because reads/writes resolve
content by `chapter.chapterNumber` (`DocumentService.findByType`), any *new*
chapter created with the same `chapterNumber` inherits the orphan.

**Proof (live, `api-traces/25-orphan-resurrect.txt`):**
1. Create ch#2, save `GHOST_SECRET_9f3a` prose (v1).
2. `DELETE` ch#2 → 200 `{deleted:true}`. Orphan check: **1** `CHAPTER_CONTENT`
   row for `chapter_number=2` survives (`id=a8f4e638…`, v1).
3. Create a **brand-new** chapter with `chapterNumber=2`, fresh title → 201.
4. `GET` its content → **returns the deleted prose verbatim**:
   `"# Original ch2\n\nGHOST_SECRET_9f3a — …must not resurface."`, `documentId`
   = the orphan `a8f4e638…`, version 1.
5. The new chapter's **first save (no `expectedVersion`) → 409 version_conflict**,
   and the 409 `serverContent` **leaks the deleted prose** back to the client. A
   writer opening what should be a blank new chapter sees old deleted text and is
   blocked by a phantom save-conflict on their first save.

**Impact:** (a) deleted content resurfaces in a new chapter; (b) storage leak
(orphaned prose + versions accumulate per delete); (c) first save of a legitimately
new chapter is blocked by a confusing conflict that exposes deleted text. Not
cross-tenant (own book only).

**Repro:** delete a chapter, then create/insert a chapter that reuses that
chapter number (plausible after a mid-list delete, manual insert, or reorder into
a freed slot).

**Not fixed** — evidence only. Fix direction (not applied): cascade the
`CHAPTER_CONTENT` document (+ versions + S3 objects) on chapter delete, or key
content resolution by a stable chapter identity rather than the reusable
`chapter_number`.

---

## CORROBORATION (known open defect, not new)

### D-100 (known, open) — ghost-text 502 on the persona's reasoning-model default — CORROBORATED

`POST /api/books/:id/ghost-text` with the persona's default `openrouter-qwen36/sonnet`
returned **502 retryable** (`"The suggestion was cut off before any text was
produced. Please try again."`, `retryable:true`) in 6.7 s
(`api-traces/30-onboarding.txt` §4). The 60-token ghost-text budget is fully
consumed by the qwen3.6 reasoning model's thinking blocks → no text → honest 502
(**not** a hollow 200, **not** billed). Matches the already-registered open D-100.
The same key on **inline-edit (4096-tok budget) succeeds** (`35-ai-touch.txt`), so
the failure is isolated to the tiny-budget ghost-text path on reasoning models,
not a broken BYOK on-ramp.

---

## OBSERVATIONS (recorded raw, NOT filed as defects)

- **One-off chapter-DELETE latency 10,002 ms** in `20-adversarial.txt` §F. Re-probed
  7 consecutive content-bearing deletes (`40-delete-latency.txt`): 113–194 ms
  (avg 156 ms), **0/7 > 3 s**. Classified as a one-off cold-path stall (likely
  first-of-session vector-delete connection warm-up), **not reproduced** →
  not filed.
- **Storage/version hygiene:** the orphan rows from the D-16 race (5 version rows
  on the surviving doc) and from chapter deletes are retained by design; noted for
  the D-22 sweep, no live-content impact.
