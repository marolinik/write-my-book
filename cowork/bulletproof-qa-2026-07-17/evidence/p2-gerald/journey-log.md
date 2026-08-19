# P2 "Gerald" — Journey Log (Phase A: data-safety, no LLM)

Book under test: **"Dead Reckoning 31 QA P2"** (thriller), id `636a1f02-8520-4b66-8e78-08c8e0fee5f0`, 8 chapters / ~40K words, seeded deterministically with unicode (Zürich, Łódź, Kőszeg, Novosibirsk), diacritics, em-dashes, and curly quotes throughout.

All requests authenticated as `user_qa_p2` via `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p2`. No file under `src/` was edited. Server/worker were never restarted by this executor. No LLM/agent job (dev-edit, line-edit, CAS, extraction) was ever invoked.

## 0. Environment blocker (ENV-01, resolved)

Before Phase A could start, all API routes with ≥5 path segments (e.g. `/api/books/:id/chapters/:chapterId/content`) were returning a Turbopack routing-layer HTML 404 instead of the app's JSON handler — this blocked essentially the entire mission. Filed as **ENV-01** (in-file id D-02) **[BLOCKER]**, escalated to team-lead, execution paused. Corroborated independently by P1 Maya hitting the same class of failure.

**Detection:** anonymous (no auth header) probes at increasing path depth showed a clean cutover — every route ≤4 segments returned proper JSON, every route ≥5 segments returned the Turbopack HTML 404, across three unrelated resource trees (`/api/books`, `/api/series`, `/api/settings`). Ruled out an auth/middleware cause since it reproduced pre-auth.

**Resolution (team-lead, authoritative):** stale Turbopack route table in `.next` after that day's cold Docker/server boot. Fixed by wiping `.next` and restarting the Next.js dev server (BullMQ worker left untouched, per this executor's constraint not to restart it). Team-lead independently verified the depth-5 content route and a depth-6 route both return `application/json`, plus `/api/health/dependencies` all green.

This executor re-probed post-fix on the exact test book/chapter and confirmed 200 JSON with full content intact (34,314 chars on chapter 1 — Phase A's find/replace and edge-case edits were all still present, zero content loss through the restart). Phase A then proceeded and completed in full on top of the fix. First requests after the restart were slower (fresh Turbopack compile) — not counted as product latency in the export-latency checks above. Full detail in `defects.md`.

## 1. Day-0 import

Created the book, then created 8 chapters and PUT ~40,466 words of seeded manuscript prose across them (unicode-heavy: Zürich, Łódź, Kőszeg, Novosibirsk, em-dashes, curly quotes). For each chapter: PUT content, then GET it back and diff byte-for-byte against what was sent.

- **18/18 checks PASS.** All 8 chapters round-tripped byte-exact (zero mojibake, zero mangled diacritics/em-dashes/curly-quotes). Book structure (`GET /api/books/:id/chapters`) confirmed 8 chapters in the expected order with correct titles.

## 2. W4 data-safety

**Test A — two-writer 409 conflict.** Writer A reads content at version N, writer B also reads at version N. Writer A PUTs successfully (version → N+1). Writer B then PUTs using its now-stale `expectedVersion: N`. Expected and observed: **409**, with `currentVersion` and `serverContent` in the response body so the client can rebase — writer A's content is never clobbered. See `api-traces/two-writer-409-conflict.txt`.

**Test B — rapid autosave storm.** 20 sequential PUTs to the same chapter, each correctly incrementing `expectedVersion`. All 20 succeeded, final GET matched the last PUT byte-exact, version counter incremented exactly 20 times with no gaps or double-increments.

**Test C — concurrent autosave vs reorder (real threading).** Fired a content PUT to one chapter and a `PATCH /chapters/reorder` (swapping two chapters' `chapterNumber`) genuinely concurrently via Python threads. Both settled cleanly (no 5xx, no deadlock); post-race GETs confirmed the autosave content landed intact and the reorder was applied consistently (chapter 4/5 order swapped as requested, content stayed attached to the correct chapter id). This deliberate swap is also what surfaced **D-03** in Phase 4 below.

**Test D — version history (list / rollback / roll-forward).** Confirmed `GET .../documents/:docId/versions` lists all versions in order; confirmed `POST .../documents/:docId/restore {version}` appends a new version carrying the old content forward (does **not** rewind `currentVersion` — read `version-manager.ts` to confirm this is the intended design, not a bug) and the restored content round-trips byte-exact.

- **33/33 checks PASS.** Zero data loss found across all four data-safety scenarios.

## 3. Book-wide find/replace

Replaced `"the"` → `"[[REPLACED]]"` across the whole book via `POST /api/books/:id/search/replace`. Independently replicated the server's exact plain-text replace algorithm (`replaceInText()` from `src/lib/search/find-replace.ts`) in Python to compute an expected count and expected byte-for-byte result per chapter ahead of time, then compared against the API's reported counts and a fresh GET of each chapter afterward.

- **29/29 checks PASS.** API-reported `totalReplacements` (4,617) matched the independently-computed local sum exactly; every chapter's post-replace content matched the expected byte-exact result; zero remaining case-insensitive occurrences of "the" in any chapter; chapters with zero matches were correctly skipped (no spurious version bump).

## 4. Export fidelity (docx)

First pass (`export-01` .. `export-10`) exported the book to docx, downloaded it, parsed `word/document.xml`, and diffed the whole document's words against the DB. 8/10 passed, including a full re-export-after-edit canary test (edited a chapter immediately before re-export; the new content appeared in the fresh download — **no stale export cache**). Two failures (`export-05` title order, `export-06` whole-doc word diff) turned out to be a **test-methodology artifact**: the test's expected order/word-sequence was hardcoded to the book's original (pre-Test-C-swap) chapter order, not the live post-reorder order.

Rewrote the check (`phase4b`) to fetch the current chapter order live from the API instead of hardcoding it, and to diff each chapter's **body** in isolation (slicing the docx between heading paragraphs) rather than the whole document at once, so front-matter/title-page content (which has no DB counterpart) doesn't pollute the comparison.

- Title order re-verified against live API order: **PASS** (the original failure was purely the stale hardcoded expectation).
- Front matter correctly isolated (13 paragraphs / 59 words before chapter 1's heading — expected, not a defect).
- 6 of 8 chapters' bodies matched byte/word-exact.
- **2 of 8 chapters — exactly the two chapters reordered in Test C — had swapped body content.** Their word counts cross-matched each other's expected counts. This is a genuine, previously-unknown defect, not a test artifact.

A follow-up SHA-256 cross-comparison proved conclusively that the docx body under "No Names in Marseille"'s heading is byte-identical to the live "The Kőszeg Drop" chapter content (and vice versa, modulo an injected Act-divider paragraph) — the two bodies are fully swapped while the headings are correct.

**Root cause** (read `src/lib/import-export/export-pipeline.ts` lines ~253-306): the export pipeline resolves chapter identity by listing storage files and parsing the chapter number **out of the file path** (`chapter-(\d+)`), rather than using the DB's live `chapter.chapterNumber` column that every other code path uses. The reorder route deliberately never renames `document.storageKey` (correct for every other consumer, since they all key off the DB column) — but export is the one place that keys off the stale file path instead, so after a reorder the (DB-correct) title gets stamped onto the (stale-file-path) body.

Filed as **D-03 [S1, DATA INTEGRITY]** — see `defects.md` for the full SHA proof table, exact code excerpt, and repro steps. **Not fixed** (outside this phase's read-only `src/` scope).

- **20/23 checks PASS across phase4+phase4b** (3 "failures" are the 2 test-artifact false-positives from the first pass, superseded by the corrected phase4b run, plus the resulting real body-mismatch findings for the 2 affected chapters that constitute the D-03 evidence itself).

## 5. Edge cases

- **Export mid-content-PUT** (genuinely concurrent, threaded): both the PUT and the export POST settled with 200. The exported chapter's body matched **one full version or the other** (the pre-edit snapshot, in this run's timing) — never a torn/partial mix of both. No inconsistent snapshot.
- **Oversized paste, 60,000 chars in one PUT** (well over the "50K chars" edge-case threshold, well under the 2,000,000-char schema max): accepted with 200, round-tripped byte-exact (94,731 total chars including prior content).
- **Content exceeding the 2,000,000-char schema max** (2,000,050 chars): clean **400** with a Zod `too_big` validation error — never a 500, never silent truncation.
- **Malformed JSON body** (`{not valid json!!`) on a content PUT: reproduced the known **D-01** defect — **500** `{"error":"Failed to save content"}` instead of a clean 400. Recorded only, per mission scope; not fixed.

- **11/11 checks PASS** (D-01's reproduction is scored PASS-as-"successfully recorded", per the mission's "record only" instruction — the defect itself is pre-existing and out of this phase's fix scope).

## 6. Cost / health

`GET /api/usage` for `user_qa_p2`: `llmCosts.costEstimate = 0`, `llmCosts.sessions = 0` — **confirmed $0 LLM spend** throughout all of Phase A, as required (no dev-edit/line-edit/CAS/extraction was ever triggered). `embeddingCosts.costEstimate = 0.00069226` (34,613 tokens) is expected and unrelated — VM1 auto-indexes real prose into vector memory on every content save; this is not LLM agent spend and does not violate the $0 constraint.

- **2/2 checks PASS.**

## Totals

**111/116 checks PASS.** The 5 "FAIL" entries are: 2 test-methodology artifacts from the first export pass (superseded, not real defects — see §4) and 3 that are the actual positive evidence for defect D-03 (2 per-chapter body mismatches + the aggregate all-bodies-exact check). Zero word-loss found anywhere. One genuine new S1 defect found (D-03, export/reorder body-swap) and fully root-caused. One known S3 defect (D-01, malformed-JSON 500) reproduced and recorded per scope. One environment blocker (D-02) hit, escalated, and resolved externally.
