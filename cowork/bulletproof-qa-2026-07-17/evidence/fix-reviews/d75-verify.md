# D-75 adversarial verify — chapter-scoped vector indexing (+ D-76/D-77)

**Verifier:** Fable adversarial (default-skeptic). **Date:** 2026-07-19.
**Verdict: APPROVE-WITH-NOTES** — I could not break the delete filter, the docId parity, the debounce, or the back-compat contract. The two notes are a disclosed, bounded legacy-chunk limitation and a transient cross-path race that the fix strictly improves; neither blocks.

**Gates (run by me, this tree):**
- `npx tsc --noEmit` → exit 0.
- `npx vitest run` → **121 files / 909 tests passed**, exit 0 (matches claimed 909/121).
- RED empirically reproduced (see §7). Tree restored byte-identical (`fc /b`: no differences) and re-verified green after the experiment. Nothing committed.

---

## 1. Delete-filter blast radius (load-bearing) — HOLDS

`deleteChapterContentChunks` (src/lib/vector/indexer.ts:302-319) filter is
`must: [bookId, chapterNumber, chapterContent=true]`. Attacked each clause:

- **Another book's chunks:** blocked by the `bookId` clause. Pinned by the cross-book guard test (vector-chapter-recall.test.ts:224-235) — if `bookId` were dropped, book-B ch1 would be deleted and the test fails.
- **Another chapter's chunks:** blocked by `chapterNumber`. Pinned by the 3-chapter coexistence tests (:142-175) — a `[bookId, chapterContent]`-only filter would wipe ch1 when ch2 saves. Typing checked end-to-end: `chapterNumber` is a JS number on every write path (content route `chapter.chapterNumber` Int, post-session param, import zod number, rebuild `doc.chapterNumber`) and stored as a number in the payload (indexer.ts:110), so a Qdrant integer match cannot miss or over-match.
- **A sibling brief/plan (the naive-filter trap):** blocked by `chapterContent=true`, and the clause is honestly load-bearing — CHAPTER_BRIEF/CHAPTER_PLAN share the mapped `"chapter"` docType AND the chapterNumber. Pinned by the brief-preservation guard (:237-257); I confirmed a `[bookId, chapterNumber]`-only filter would match the brief's payload and fail that test.
- **Stamp discipline:** `chapterContent: true` reaches the payload ONLY via indexer.ts:120, gated on `metadata.chapterContent`. I enumerated every writer: memory-manager stamps it from the RAW type check `documentType === "CHAPTER_CONTENT"` (memory-manager.ts:80,94 — brief/plan → false); rebuild from `doc.type === "CHAPTER_CONTENT"` (cleanup.ts:173); import stamps only chapter prose (import/route.ts:175,326); `onSessionCompleted` and the remember-insight tool (tools.ts:1574, docType "conversation") never pass it. No path stamps a non-prose row.
- **Null guard:** indexer.ts:89 requires `chapterNumber != null` before taking the chapter-scoped branch; a (pathological) CHAPTER_CONTENT doc with null chapterNumber falls back to the docId-scoped delete and its chunk (chapterNumber:null) can never be matched by any chapter-scoped delete. Safe.

## 2. Back-compat / legacy chunks — DISCLOSED LIMITATION (Note 1)

Pre-fix chunks live under the old collapsed docId `${bookId}:CHAPTER_CONTENT` with NO `chapterContent` field, so the new chapter-scoped delete misses them (missing key never matches `true` — same semantics in real Qdrant and the test fake). Consequences, bounded:

- Exposure is at most **one chapter's chunk set per book** — the pre-fix bug itself guarantees only the last-written chapter survived.
- It becomes a **stale duplicate only if that exact chapter is re-saved** post-deploy; otherwise the legacy set is still-valid recall for its chapter.
- It IS removed by `rebuildBookIndex` (deleteBookChunks, bookId-wide) and by the chapter DELETE route (cleanup.deleteChapterChunks has no chapterContent clause, so it catches legacy rows). Handoff discloses this with rebuild as remediation. Rolling-deploy overlap (old instances writing legacy-shaped chunks) lands in the same bucket.

**Optional hardening (cheap, non-blocking):** in the chapter-content branch, also fire a surgical legacy sweep `must:[bookId, chapterNumber, docId="${bookId}:CHAPTER_CONTENT"]`. Legacy content chunks all carry chapterNumber (both pre-fix callers passed it), and briefs' legacy default docId was `${bookId}:CHAPTER_BRIEF`, so this cannot touch a brief. Team-lead's call whether to fold it in.

## 3. Per-chapter docId parity — HOLDS

Both docId-less callers — content route (content/route.ts:226) and agent post-session (post-session.ts:832) — pass `chapterNumber` and omit `docId`, so the single derivation in memory-manager.ts:81-85 yields the IDENTICAL `${bookId}:CHAPTER_CONTENT:${n}` for the same chapter. Centralizing beats editing both call sites: divergence is structurally impossible. The document-API path keeps `docId = doc.id` (a second docId for the chapter), but the chapter-scoped delete converges the chunk sets — pinned by the convergence test (:190-209, asserts exactly `["document-api body v2"]`, not two sets). I grepped for any other chapter-content writer and found none (tools.ts:1574 is conversation-type; the agent write_document tool does not index — post-session covers it). Non-chapter-content defaults (`${bookId}:${documentType}`) are unchanged, so research/bible/etc. re-index still replaces its own legacy chunks docId-scoped.

## 4. Debounce — HOLDS (Note 2: transient cross-path race, strictly improved)

Key = `${bookId}:chapter:${docId}` with per-chapter docId → two DIFFERENT chapters in one window keep distinct keys and both index (pinned, :177-188). Same chapter re-saved rapidly via the same path — or via human+agent, which share the synthetic docId — coalesces to one timer (replace guard, :212-222).

**Note 2:** same chapter via content route AND document API inside one window = two debounce keys firing near-simultaneously → the two `indexDocument`s can interleave delete/delete/upsert/upsert and transiently leave both chunk sets. Both sets carry `chapterContent=true` + chapterNumber, so the NEXT save of that chapter sweeps both — self-healing. Pre-fix this exact scenario duplicated PERMANENTLY, so the fix strictly improves it; inherent delete-then-upsert race, not introduced here. No action required.

## 5. D-76 / D-77 no-regression — HOLDS

- **D-76:** `rebuildBookIndex` reads `seriesId` once from the book being rebuilt (cleanup.ts:116-120) and threads it into every doc. The rebuild loop is otherwise unchanged — all chapters still index; within a concurrent batch of 5 each chapter-content doc's delete filters its OWN chapterNumber (after the bookId-wide clear), so no cross-chapter clobbering and no re-introduced collapse. Test added (vector-rebuild-content.test.ts:72-96); pre-existing file edits verified additive-only via git diff.
- **D-77:** document-API PATCH stamps `seriesId: book.seriesId` where `book` was loaded with `findFirst({ id: bookId, userId: user.id })` (route.ts:79-81,152) — right book, tenant-verified, no cross-tenant source. Import stamps `chapterContent: true` on both handlers (structured + legacy) with correct chapterNumbers; import-seriesId residual is registered/disclosed, and self-heals on first content-route edit.

## 6. Fire-and-forget + tenant — HOLDS

All four call sites keep non-blocking semantics (`void …catch`, `.catch(() => {})`, `.catch(console.error)`); `scheduleIndex` is synchronous scheduling; both delete helpers swallow collection-missing errors; a failed index can never fail a save or lose prose. `retriever.ts` untouched (not in the diff) — userId/tenant filtering (RC-6/D-67/D-68) unchanged. `MemoryChunkPayload.chapterContent` is optional (types.ts:50) — absent on all pre-D-75 chunks and all non-prose chunks; no reader depends on it. Tests mock qdrant/embeddings; no live-key requirement.

## 7. RED-for-right-reason — EMPIRICALLY VERIFIED

I backed up the fixed `memory-manager.ts`/`indexer.ts`, restored HEAD versions, and ran the new suite against the REAL pre-fix code:

- **4/4 crater tests failed with exactly the claimed mechanism:** human path `expected … length of 3 but got 1`; agent path `[ 'Agent chapter three body.' ] … got 1` (only the LAST chapter survived — the real collapse, not a rigged mock); debounce `[ 'Debounce chapter two.' ] … got 2 but got 1` (real setTimeout cancellation under fake timers); convergence `[ 'content-route body v1', …(1) ]` vs `[ 'document-api body v2' ]` (real cross-path duplicate).
- **3/3 guards passed pre-fix** — they pin invariants, not the fix (no tautology).
- The fake Qdrant faithfully implements `must`/`match`/`is_null`/`should` with missing-key-no-match (`payload[key] === value`), matching real Qdrant filter semantics for every clause the production filters use; the suite drives the real memory-manager → scheduleIndex → indexDocument → searchMemory chain.
- Fix files restored byte-identically (`fc /b`: no differences on both), single-file re-run green (11/11), full-suite result above stands.

---

**Verdict: APPROVE-WITH-NOTES.** Notes: (1) disclosed legacy-chunk staleness — bounded to one chapter set per book, rebuild/chapter-delete remediate, optional one-line surgical sweep suggested; (2) transient same-chapter cross-path debounce race — self-healing, strictly better than pre-fix. No blocking findings; the load-bearing filter survived every constructed worst case.
