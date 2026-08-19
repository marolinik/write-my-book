# P2 "Gerald" — Defects (Phase A, data-safety)

## D-16 — [S1, DATA INTEGRITY] Racing first-saves to a chapter create duplicate `Document` rows; GET/PUT then resolve to either one nondeterministically, silently defeating the app's own two-tab conflict detection

**Severity: S1** (silent data loss / lost-update, with zero error surfaced anywhere — not even the 500-with-empty-body class of other Z6 findings; the request reports a clean 200 and the user has no way to know their save didn't "take"). Register checked fresh 2026-07-18 immediately before filing: D-01..D-15 in use across all `evidence/*/defects.md`, D-16 is the next free slot.

### Discovery context

Found while investigating a curl PUT-then-GET staleness anomaly on the shared W4/X1 drill fixture (bookId `f6616d35-f28d-4525-a312-6ad5c59046aa`, chapterId `556d0a01-f982-4ee1-8934-b20f963819ad`) during my own (now-superseded — task ownership moved to p5-sam) attempt at the X1 two-tab drill. Root-caused via a direct Postgres query against the `documents` table, not through the app/ORM, to rule out any caching-layer or Prisma-client explanation first.

### Proof (direct DB query, not inference)

```sql
-- documents table, book_id = f6616d35-f28d-4525-a312-6ad5c59046aa, type = CHAPTER_CONTENT, chapter_number = 1
id                                    | current_version | storage_key                        | created_at
f8581548-a235-4a9d-be3d-2241ded4638a  | 4                | manuscript/act-1/chapter-01.md    | 2026-07-17T23:36:33.096Z
a075fc55-77f7-4819-a272-1f5a8af9cd55  | 3                | manuscript/act-1/chapter-01.md    | 2026-07-17T23:36:33.246Z
```

Two rows, **same chapter, same storage_key, created 150ms apart**, independently-tracked version counters. Confirmed via raw curl (bypassing Playwright/browser entirely) that repeated `PUT` then immediate `GET` (and `GET` again after a 1-5s delay, ruling out async/eventual-consistency) can return a *different* `documentId` and *older* content than the PUT just wrote — because each request's `findByType()` call independently and nondeterministically picks one of the two duplicate rows.

### Root cause (exact file:line)

1. **`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts` PUT, lines 107-165** — unguarded check-then-create: `existingDoc = await svc.findByType(...)` (a `SELECT`) followed by `svc.create()` (an `INSERT`) with no transaction, no upsert, no row lock between the two. Two concurrent first-saves to a chapter with no existing `Document` row (the normal state of a brand-new chapter, or any chapter never yet saved) can both observe `existingDoc === null` and both proceed to create — this is exactly the "two tabs, same chapter, both go dirty, both save" scenario the X1 drill is designed to probe, just one step earlier than the CAS/`expectedVersion` layer the drill targets.
2. **`src/lib/documents/document-service.ts`, `findByType()`, lines 190-198** — `return db.document.findFirst({ where })` with **no `orderBy`**. Prisma/Postgres do not guarantee a stable row order for an unordered `findFirst` when multiple rows match; once duplicates exist, every subsequent GET/PUT can independently land on either one.
3. **`prisma/schema.prisma`, `Document` model (lines 234-252)** — only `@@index([bookId, type])`; no unique constraint on `(bookId, type, chapterNumber)` to prevent the duplicate `INSERT` from ever succeeding in the first place.
4. **`document-service.ts`, `create()`, line 37** — `storagePath = getStoragePath(type, chapterNumber, actNumber)` is derived deterministically from the chapter number, so both duplicate rows point at the **same** underlying MinIO object, while each tracks its own independent `currentVersion`/`DocumentVersion` history — DB version and actually-stored content can diverge per row.

### Why this is worse than an ordinary race

The app's entire two-tab safety net (`expectedVersion` CAS check → `VersionConflictError` → 409 → `SaveConflictDialog`, A3.2/A3.14) operates on **one row's** `currentVersion`. If two tabs' concurrent first-saves land on two different duplicate rows, there is no version mismatch for either write to detect — no 409 ever fires, no conflict chip, no toast, nothing. One tab's content can become silently and permanently unreadable (its writes keep landing on a row nobody's GET resolves to) with a clean 200 response at every step. This defeats, rather than merely bypasses, the exact guarantee X1 exists to verify — and it triggers *before* the conflict-detection code path is ever reached.

### Repro

1. Ensure a chapter has no existing `CHAPTER_CONTENT` document (new chapter, or one never saved).
2. Fire two concurrent `PUT /api/books/:id/chapters/:chapterId/content` requests with different markdown bodies and no `expectedVersion` (e.g. two racing Playwright workers, or two real tabs' simultaneous first autosave — reproduced here as an unintended side effect of an early, since-fixed test-harness parallelism bug in my own X1 spec attempt, `fullyParallel: true` racing two `seedBaseline()` calls before `mode: "serial"` was added).
3. Query `documents` for that `(bookId, type=CHAPTER_CONTENT, chapterNumber)` — two rows exist, same `storage_key`, different `id`/`current_version`.
4. Subsequent `PUT`-then-`GET` cycles on the same chapter intermittently show the GET returning different content/version/`documentId` than what the immediately-prior PUT wrote and confirmed as saved.

### Fix direction (not applied — no `src/` edits per scope)

- Add a DB-level unique constraint on `(bookId, type, chapterNumber)` (and the series-scoped equivalent) so the duplicate `INSERT` becomes impossible at the source.
- Wrap the check-then-create in `content/route.ts` PUT in a transaction, or better, use an actual `upsert` keyed on that same unique constraint instead of separate `findByType` + `create` calls.
- Add an explicit `orderBy: { createdAt: "asc" }` (or similar deterministic tiebreaker) to `findByType()` as defense-in-depth, though the real fix is preventing the duplicate row from being created at all.
- Separately: the two existing duplicate rows on the shared W4/X1 fixture chapter should be cleaned up (delete the loser, keep the row with the most recent/complete content) before further two-tab drill runs against this fixture, or the drill should be pointed at a fresh chapter — flagged to p5-sam (current owner of the X1 task) and team-lead 2026-07-18.

### Status

**Reported, not fixed.** Escalated to team-lead and p5-sam 2026-07-18 given p5-sam was actively executing the X1 drill against this exact corrupted fixture at time of discovery.

## D-01 — corroboration only (originally filed by P8 Rita, see `evidence/p8-rita/defects.md`)

Reproduced against my own test book/chapter per mission instructions ("known D-01, record only, do not fix"). `PUT /api/books/{id}/chapters/{chapterId}/content` with a deliberately malformed JSON body (`{not valid json!!`) returns **500** `{"error":"Failed to save content"}` instead of a clean 400. Confirms P8 Rita's finding is not route- or persona-specific — reproduced cleanly on a completely different book/chapter/session. No data loss (the malformed PUT never reaches the DB write). Raw trace: `api-traces/malformed-json-d01-repro.txt`. Not fixed — out of this phase's scope.

### FIXED-VERIFIED (2026-07-18, `parseJsonBody` fix, commit `ca01cb5`)

Re-ran the malformed-JSON repro against the fixed code plus two more legacy routes (one style route, one settings route, both of which used a bare `req.json()` before the fix). All 3/3 now return a clean 400 with the standard error envelope — no 500s, no leaked stack/parse detail:

| Route | Method | Before | After |
|---|---|---|---|
| `/api/books/{id}/chapters/{chapterId}/content` | PUT | 500 `{"error":"Failed to save content"}` | **400** `{"error":"Invalid JSON body"}` |
| `/api/books/{id}/style/lenses` | POST | 401 (pre-fix legacy behavior per team-lead) | **400** `{"error":"Invalid JSON body"}` |
| `/api/settings/api-keys` | POST | 401 (pre-fix legacy behavior per team-lead) | **400** `{"error":"Invalid JSON body"}` |

The style/settings routes' pre-fix 401 (rather than 500) is a separate, intentional behavior change noted by team-lead, not something this spot-check re-litigates — the only thing checked here is that all 3 now converge on the same clean 400 contract. Full raw trace: `api-traces/d01-spot-reverify.txt`. **Status: FIXED-VERIFIED.**

## D-03 — [S1, DATA INTEGRITY] docx/pdf/epub export silently swaps chapter body content onto the WRONG chapter title after a reorder — FIXED-VERIFIED

**Severity: S1** (data corruption in the exported deliverable — the actual artifact an author submits/publishes does not match the manuscript, with zero error/warning). Directly threatens P2's export-fidelity exit criterion ("ZERO content loss ... chapter titles correct, order correct") and the D2 data-safety floor (≥9.0).

### Symptom

After reordering two chapters (chapterNumber swap via `PATCH /api/books/:id/chapters/reorder` — a normal, supported, first-class editor operation, e.g. corkboard/canvas drag-drop), exporting the book to docx produces a document where the chapter **headings** are in the correct (post-reorder) order, but the **prose body** under each of the two reordered headings is the OTHER chapter's content. Title and body are silently mismatched. No warning, no error — `warnings: []` in the export response.

### Proof (exact SHA-256, first 16 hex chars, of normalized body text)

Book `636a1f02-8520-4b66-8e78-08c8e0fee5f0` had chapters "No Names in Marseille" (chapterNumber 4 at creation) and "The Kőszeg Drop" (chapterNumber 5 at creation) swapped via reorder (now chapterNumber 5 and 4 respectively — confirmed correct via direct `GET .../chapters` and `GET .../content`, which read the DB's live `chapterNumber` column and are NOT affected by this bug).

| | local (DB, ground truth) | docx (under that heading) |
|---|---|---|
| "No Names in Marseille" heading | sha `165c45337912de71` | sha `a018c4b04cf7a450` |
| "The Kőszeg Drop" heading | sha `a018c4b04cf7a450` | sha `a644e8fde7654979`* |

`docx-under-"No Names in Marseille"-heading == local "The Kőszeg Drop" content` — **exact match**.
`docx-under-"The Kőszeg Drop"-heading` is local "No Names in Marseille" content **plus an injected `Act 2` divider paragraph** (+2 words, explains the sha not being byte-identical — see root cause) — everything else exact.

The two bodies are fully swapped. Titles are correct; prose is not.

### Root cause (pinpointed)

`src/lib/import-export/export-pipeline.ts`, `exportManuscript()`, lines ~253-306:

```ts
const manuscriptFiles = await storage.list("manuscript/**/*.md");
const sorted = manuscriptFiles.filter(...).sort();
for (let i = 0; i < sorted.length; i++) {
  const content = await storage.read(sorted[i]);
  ...
  const chapterMatch = sorted[i].match(/chapter-(\d+)/);
  const chapterNumber = chapterMatch ? parseInt(chapterMatch[1], 10) : i + 1;
  cleaned = applyChapterHeading(cleaned, chapterNumber, chapterTitles?.get(chapterNumber));
  ...
}
```

The export pipeline does **not** resolve chapter content the way the rest of the app does (`DocumentService.findByType(type, chapter.chapterNumber)`, keyed off the DB's live `chapterNumber` column). Instead it lists raw manuscript files from storage and **parses the chapter number back out of the file path** (`manuscript/act-XX/chapter-NN.md`). The reorder route's two-phase transaction (`src/app/api/books/[id]/chapters/reorder/route.ts`) deliberately renumbers the DB `chapter.chapterNumber` and `document.chapterNumber` columns but leaves `document.storageKey` (the file path) untouched — by design, per its own comment: *"the physical content pointer, so leaving it put keeps every version's bytes exactly where they are — only the lookup column moves."* That design is correct for every other code path (all of which key off the DB column), but the export pipeline is the one place that keys off the **stale, never-renamed file path** instead. After a reorder, file path number and DB `chapterNumber` diverge for the swapped chapters, so `applyChapterHeading()` stamps the (correct, DB-sourced) title from `chapterTitles.get(chapterNumber)` onto the (stale, file-path-sourced) body — title and body no longer agree.

The bug is format-agnostic (`combinedMd` assembly happens before the docx/pdf/epub branch). **Independently confirmed present in both pdf and epub** (2026-07-18, team-lead-requested corroboration, same book/reorder, evidence-only — no source fix):

- **epub:** body under "No Names in Marseille" heading is a byte/word-exact SHA match to local "The Kőszeg Drop" content. Body under "The Kőszeg Drop" heading is local "No Names in Marseille" content plus the same +2-word "Act 2" divider artifact seen in the docx repro (difflib ratio 0.9998, single diff opcode = a trailing 2-word insert). Identical swap signature to docx.
- **pdf:** exact SHA equality isn't achievable for pdf because pypdf's text extraction is inherently lossy (line-wrap hyphenation splits words mid-token, e.g. `"replaced"` → `"re"` + `"placed"`, `"safehouse"` → `"safe"` + `"house"` — 21 such splits found, zero semantic content difference). Word-level similarity (difflib ratio) instead: body under "No Names in Marseille" heading is 99.42% similar to local "The Kőszeg Drop" (vs only 24.56% similar to its own local "No Names in Marseille" content); body under "The Kőszeg Drop" heading is 99.65% similar to local "No Names in Marseille" (vs only 23.47% similar to its own local content). Same swap, same direction, as docx/epub.

Full raw evidence: `api-traces/d03-format-corroboration-pdf-epub.txt`.

Secondary, cosmetic artifact of the same root cause: the act-boundary divider (`## Act N`) is inserted based on the stale file-path act directory too, and in this repro landed inside the wrong chapter's body span (the +2-word "Act 2" discrepancy above) — same fix should resolve both.

### Trigger condition

Only manifests when a chapter's **current** `chapterNumber` differs from its **file-path-embedded** number at creation time — i.e., reorder, then export. Un-reordered chapters (6 of 8 in this test) exported byte-exact. This is a common sequence: reordering chapters via drag-drop is a first-class, documented editor feature.

### Repro

1. Create a book with ≥2 chapters, write distinct content per chapter.
2. `PATCH /api/books/:id/chapters/reorder` swapping the `chapterNumber` of two chapters.
3. `POST /api/books/:id/export {"format":"docx"}`, download the result.
4. Compare the prose under each swapped chapter's heading against that chapter's live content (`GET /api/books/:id/chapters/:chapterId/content`) — the two swapped chapters' bodies are exchanged.

### Status

**FIXED-VERIFIED** (2026-07-18, commit `4e9c8c5` "export DB-order assembly"). Re-ran the exact reproduction method that originally found this bug against the fixed code, in two rounds, on all three export formats, across all 8 chapters (not just the originally-swapped pair):

- **Round 1** — the book's existing already-reordered state (chapters 4/5 swapped by the earlier W4 concurrent-reorder test, the original trigger). Re-exported docx/pdf/epub.
- **Round 2** — performed a **second, independent reorder** swapping two *different* chapters ("The Trieste Signal" / "A Debt in Zürich", untouched by the original bug), then immediately re-exported all 3 formats again — proving the fix generalizes to a fresh permutation and that the round-1 pair didn't regress.

Method per format (same discipline as the original bug repro):
- **docx** — word-for-word exact diff (`difflib.SequenceMatcher` opcodes) between each chapter's DB content and the prose sitting under its heading in the exported document. Zero mismatches across all 8 chapters × 2 rounds.
- **pdf** — word-level similarity ratio (exact SHA equality isn't achievable due to pypdf's lossy line-wrap hyphenation). Every chapter's own-title similarity is 0.994–0.997; every cross-chapter similarity is 0.25–0.29. The gap between "own" and "best other" is enormous and consistent — no ambiguity, no swap.
- **epub** — exact SHA-256 match (word-normalized) between DB content and the prose under each heading. Zero mismatches across all 8 chapters × 2 rounds.

Total: **74/74 checks PASS** (`d03_fix_verify_state.json`, trace `api-traces/d03-fix-verify-2rounds.txt`).

**Self-corrected false-positive note (transparency):** the first run of this verification showed 8 spurious FAILs (docx +2-word and epub +2..+10-word mismatches on 4 of the 8 chapters). Root-caused via a dedicated diagnostic dump (not assumed): these were **test-harness extraction artifacts**, not a recurrence of the bug — (1) the book's own `Act N` divider paragraph/text was bleeding into the adjacent chapter's slice because my heading-to-heading extraction didn't exclude it (same class of cosmetic artifact already documented above in this bug's own root-cause section), and (2) `title_page.xhtml` sorts alphabetically after the last chapter file and its 10 words were bleeding into the final chapter's slice, which has no next-heading boundary to stop at. Both are extraction-boundary issues in the *test script*, confirmed by direct inspection of the raw docx paragraphs and epub xhtml files — not swaps (the independent pdf similarity check on those same 4 chapters was clean on the very first run: 0.994–0.997 own-similarity vs 0.25–0.29 cross-chapter, i.e. never ambiguous). Fixed the extraction to filter both, reran, got 74/74 clean. Documented here so the FAIL history isn't mistaken for defect flakiness.

Original root-cause pinpoint (`export-pipeline.ts` chapter-assembly loop resolving content via storage file path instead of DB chapter identity) retained above for the record; fix confirmed to resolve it via the DB-order assembly change in `4e9c8c5`.


## ENV-01 (was filed here as D-02) — [BLOCKER, environment] All API routes with ≥5 path segments return a Next.js routing-layer 404 (HTML "page not found"), not the app's JSON handler

**Campaign incident ID: ENV-01**, credited to P2 (first detected/escalated here; corroborated independently by P1 Maya). Retitled per team-lead's campaign-wide environment-incident numbering; original in-file id D-02 kept below for continuity with earlier evidence/messages that reference it.

**Severity:** S1-class blocker for QA purposes (blocks essentially all of P2's scope, and overlaps heavily with P1/P4/P6's scope). **Not** believed to be an application code defect — see root-cause analysis below. Filed here because it stopped Phase A cold; the fix is outside this executor's permission scope (no src/ writes, explicitly forbidden from restarting server/worker).

### Symptom

`GET/PUT/POST/PATCH/DELETE` on any route whose path has 5 or more segments after `/api/` returns HTTP 404 with `Content-Type: text/html`, body = Next.js's generic "This page could not be found." page (React server-component payload, no app JSON). This is the **routing layer** rejecting the request — it happens even for anonymous requests with zero auth headers, i.e. before middleware/auth logic ever runs. Routes with ≤4 segments resolve correctly and return proper JSON (either success or the app's own `{"error": "..."}` 404/other status).

### Repro (isolated, no e2e auth needed to reproduce — see anon test)

```
GET /api/books/{any_book_id}/chapters/{any_chapter_id}/content
  -> 404, Content-Type: text/html, Next.js "not found" boilerplate
  (expected: 200 with {markdown, wordCount, ...} or app-level 404 JSON if IDs are bogus)
```

Confirmed on **both** a book I created in this session (`636a1f02-8520-4b66-8e78-08c8e0fee5f0`) and P1's pre-existing book/chapter (`4116055c-6183-4675-926a-e04f31126951` / `ed84e638-0436-4cee-a458-669ce81cad50`, the same IDs P8 Rita used successfully yesterday). Consistent across 3 retries — not flaky/intermittent.

### Scope (systematically probed — table of route depth vs verdict)

| Route (segments after /api/) | Depth | Result |
|---|---|---|
| `/api/books` | 1 | OK — JSON |
| `/api/books/{id}` | 2 | OK — JSON |
| `/api/books/{id}/chapters` | 3 | OK — JSON |
| `/api/books/{id}/batch` | 3 | OK — JSON |
| `/api/books/{id}/chapters/{chapterId}` | 4 | OK — JSON |
| `/api/books/{id}/batch/{batchId}` | 4 | OK — JSON |
| `/api/books/{id}/wiki/{entityId}` | 4 | OK — JSON |
| `/api/books/{id}/style/lenses` | 4 | OK — JSON |
| `/api/series/{id}/analytics` | 3 | OK — JSON |
| `/api/series/{id}/documents/{docId}` | 4 | OK — JSON |
| `/api/series/{id}/books/{bookId}` | 4 | OK (405 on wrong method, still routes) |
| `/api/settings/api-keys/{id}` | 3 | OK — JSON |
| `/api/books/{id}/chapters/{chapterId}/content` | 5 | **BROKEN — HTML 404** |
| `/api/books/{id}/documents/{docId}/versions` | 5 | **BROKEN — HTML 404** |
| `/api/books/{id}/documents/{docId}/versions/{version}` | 6 | **BROKEN — HTML 404** |
| `/api/books/{id}/documents/{docId}/restore` | 5 | **BROKEN — HTML 404** |
| `/api/books/{id}/style/lenses/{lensId}` | 5 | **BROKEN — HTML 404** |
| `/api/books/{id}/editorial/findings/{findingId}` | 5 | **BROKEN — HTML 404** |
| `/api/books/{id}/editorial/findings/{findingId}/discuss` | 6 | **BROKEN — HTML 404** |
| `/api/books/{id}/editorial/findings/{findingId}/undo` | 6 | **BROKEN — HTML 404** |
| `/api/books/{id}/batch/{batchId}/cancel` | 5 | **BROKEN — HTML 404** |
| `/api/books/{id}/agent/{sessionId}/cancel` | 5 | **BROKEN — HTML 404** |
| `/api/series/{id}/books/{bookId}/reorder` | 5 | **BROKEN — HTML 404** |

The cutover is clean: every probed route at depth ≤4 works, every probed route at depth ≥5 fails, across three unrelated resource trees (`/api/books`, `/api/series`, and implicitly `/api/settings` which has no depth-5 routes to test). Not scoped to one file, one recent commit, or one resource type.

### Root-cause hypothesis (not application code)

- No `src/` changes since `8c9c2a1` (P8 Rita's evidence commit, this morning), and P8 Rita's own evidence (`evidence/p8-rita/journey-log.md`, `own-11`, `inj-05-deep-fence`) shows `DELETE /api/books/{id}/style/lenses/{lensId}` — a depth-5 route — **resolving correctly** (proper JSON 404s) yesterday. So this is a regression that appeared between her run and now, with zero code changes in between.
- Anonymous (no auth header at all) requests get the same HTML 404 before middleware runs `clerkMiddleware`/`isE2ETestRequest` logic — ruling out an auth/middleware-layer cause.
- This matches the shape of a **stale/corrupted dev-server route manifest** under Turbopack (Next.js dev), i.e. an environment/process-state issue, not a code defect — the same class of problem `ENVIRONMENT-AND-LIMITS.md` already flags for the BullMQ worker ("stale `tsx` worker OS processes survive TaskStop and process jobs on OLD code"). This may be the same underlying cause as the previous session's "P1 Maya executor stalled" note in the mission memory.
- Most likely fix: restart the Next.js dev server (`npm run dev`) to force Turbopack to rebuild its route table. **Not attempted** — explicitly out of scope for this executor (told not to restart server/worker) and would affect other personas' in-flight sessions; escalated to team-lead instead.

### Status

**RESOLVED (environment).** Reported to team-lead 2026-07-18, blocking. Re-probed `GET /api/books/{id}/chapters/{id2}/content` afterward: now returns `200 application/json` (app-level `{"error":"Chapter not found"}` for a dummy chapter id) instead of the Turbopack HTML 404. Phase A resumed and completed Day-0 import successfully (18/18 checks pass, see journey-log.md) — confirms the fix held under real traffic, not just the probe. Root cause (stale Turbopack route manifest) consistent with hypothesis above; corroborated independently by P1 Maya hitting the same class of failure. No src/ code was at fault, no application-level regression to track post-fix.

**Confirmed root cause (team-lead, authoritative):** stale Turbopack route table in `.next` after today's cold Docker/server boot. **Fix applied:** team-lead wiped `.next` and restarted the Next.js dev server (BullMQ worker process left untouched). Team-lead independently re-verified the depth-5 content route and a depth-6 route (`.../findings/:id/discuss`) both return `application/json`, plus `/api/health/dependencies` all green. This executor independently re-confirmed post-fix on this exact book/chapter (`GET /api/books/636a1f02-8520-4b66-8e78-08c8e0fee5f0/chapters/9978956d-9b61-42aa-810a-f5a5fe13df0d/content` → 200, full 34,314-char content intact) after Phase A had already completed end-to-end on top of the fix, with zero content loss observed at any point. Retained here as a record for the campaign retro (dev-server hygiene / restart-between-personas policy, cold-boot `.next` staleness under Turbopack).
