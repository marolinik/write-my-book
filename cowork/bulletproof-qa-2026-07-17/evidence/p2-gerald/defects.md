# P2 "Gerald" — Defects (Phase A, data-safety)

## D-01 — corroboration only (originally filed by P8 Rita, see `evidence/p8-rita/defects.md`)

Reproduced against my own test book/chapter per mission instructions ("known D-01, record only, do not fix"). `PUT /api/books/{id}/chapters/{chapterId}/content` with a deliberately malformed JSON body (`{not valid json!!`) returns **500** `{"error":"Failed to save content"}` instead of a clean 400. Confirms P8 Rita's finding is not route- or persona-specific — reproduced cleanly on a completely different book/chapter/session. No data loss (the malformed PUT never reaches the DB write). Raw trace: `api-traces/malformed-json-d01-repro.txt`. Not fixed — out of this phase's scope.

## D-03 — [S1, DATA INTEGRITY] docx/pdf/epub export silently swaps chapter body content onto the WRONG chapter title after a reorder

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

**NOT fixed** — outside this executor's scope (`src/` is read-only for this phase A run). Reported here with full root-cause pinpoint and exact fix location (`export-pipeline.ts` chapter-assembly loop should resolve content via the DB `chapterNumber`/chapter identity, not the storage file path) for whoever picks it up.


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
