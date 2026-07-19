# Fix 10 adversarial verify — series-scope vector indexing for agent writes (RC-5)

**Verifier:** Fable (adversarial) · **Date:** 2026-07-19 · **Branch:** `qa/bulletproof-2026-07-17` (uncommitted)
**Claim under attack:** `updateChapterGraph` now correctly series-scopes agent-write vector indexing, no leak, no regression.

## VERDICT: APPROVE-WITH-NOTES

Gates: `npx tsc --noEmit` → **exit 0**. `npx vitest run` → **900 passed / 120 files** (matches claim exactly).
Diff surface confirmed: `git diff --stat` = `src/lib/agents/post-session.ts | 24 +++---` (21/-3), one source file. New untracked: 2 test files + handoff. graph-builder / entity-extractor / graph-maintenance (opus-fix-d5's files) untouched.

---

## Attack results

### 1. Wrong seriesId source — REFUTED
`post-session.ts:828-831` reads `db.book.findUnique({ where: { id: bookId }, select: { seriesId: true } })` using the **same `bookId` parameter** threaded through `updateChapterGraph` from `ctx.bookId` (post-session.ts:275) — the same id used for the graph update and docService reads in the same function. No re-fetch mismatch, no cross-book fetch possible. Standalone book → `seriesId: null`; missing book row → `book?.seriesId ?? null` → `null`, never `undefined` (and `onDocumentChanged` re-coerces `metadata?.seriesId ?? null` at memory-manager.ts:71 regardless). TOCTOU posture identical to the human-save mirror (content route reads `book.seriesId` at save time, route.ts:230). The lookup is not userId-scoped, but neither is any other internal lookup in this function and `bookId` comes from the authorized session context — no new tenant vector.

### 2. Fire-and-forget invariant — REFUTED (holds)
The added lookup is inside `updateChapterGraph`, whose **only** call site is post-session.ts:275-277: invoked **without `await`**, `.catch()`-guarded (`console.error("[PostSession] Graph update failed (non-fatal)")`). A rejecting `findUnique` can never fail or delay the save; the prose is already persisted via docService before this runs. Marginal new failure mode: if the book lookup rejects, that pass skips indexing entirely (pre-fix it would have indexed with null) — negligible, because the function already depends on the DB earlier (`db.user.findUnique` at :783), so a DB outage blocked indexing pre-fix too; the incremental window is between two queries inside one already-guarded function. Logged, self-heals on next write. Note-level only.

### 3. Recall correctness — mechanism REAL, not rigged; but impact claim is overstated (see Note N1)
The recall test (`tests/unit/agent-write-series-recall.test.ts`) mocks only boundaries: Qdrant, embeddings, chunker, cost-tracker, DB, and post-session's non-vector collaborators. The load-bearing modules are **real**: `indexDocument` (payload built with `seriesId: metadata.seriesId ?? null`, indexer.ts:86), `onDocumentChanged` (memory-manager.ts:69-76), `searchMemory`/`buildFilter` (retriever.ts:134-177). The fake Qdrant honors `must`/`should`/`is_null` clauses (test :25-32). RED-for-the-right-reason verified by inspection: with the pre-fix bare `{ chapterNumber }`, the real indexer stamps `seriesId: null` and the real `must {key:"seriesId", match:{value:"series-1"}}` clause (retriever.ts:164-166) excludes the chunk, while the bookId-only sanity query still finds it — exactly the handoff's RED (`expected +0 to be 1`, 1/2 failed; the standalone test legitimately passes pre-fix).
**Empirical RED attempt:** I reverted only the fix hunk (keeping the export) to re-run RED; the permission classifier blocked vitest against the reverted tree. File restored **byte-for-byte** (SHA256 `3257C5D7…C333D927` identical before/after), then both test files re-ran GREEN 6/6 on the fixed code. Tree state verified clean-equivalent after restore.
**Parity:** human-save route stamps `seriesId: book.seriesId` (content/route.ts:226-233) — same field, same `string | null` shape; the agent path is now equivalent for seriesId. It still omits `userId`/`chapterId`/`language`/`version` (declared residual, D-67/D-68).

### 4. Tenant/userId regression — REFUTED
retriever.ts:144-154: the userId filter is `should: [{key:"userId", match:{value}}, {is_null:{key:"userId"}}]` — genuinely null-safe, so agent chunks (still `userId:null`, unchanged by this fix) remain reachable under userId-filtered search. No new leak: stamping a book's true seriesId onto that book's own chunks only enables legitimate series-tag matches; book→series ownership is enforced at join (books/route.ts:66-70), and `searchMemory` still ANDs bookId. d5's parallel files are not in the diff.

### 5. Type/plumbing — PASS
`seriesId?: string | null` is optional end-to-end: memory-manager.ts:53-61 → indexer.ts:32-39/86 → types.ts:39 (`MemoryChunkPayload.seriesId`) → retriever.ts:164-166. All other `onDocumentChanged` callers compile unchanged (optional field). tsc exit 0.

---

## Notes (non-blocking; N2-N4 are PRE-EXISTING adjacent defects surfaced while attacking — file as new defect IDs)

**N1 — The "silently halved series recall" impact claim is latent, not live.** No production caller of `searchMemory` passes `seriesId` today. The only call sites in `src` are `getRelevantMemory` (memory-manager.ts:184 — no seriesId) and the agent tool `executeSearchMemory` (tools.ts:1552 — no seriesId). The seriesId `must` clause is a shipped-but-unqueried capability. The fix is still correct — index-time stamping is the only way to avoid permanently poisoning history before a series-recall caller ships — but the handoff's "every cross-book query silently missed agent prose / flagship sidebar" framing describes a future query path. Related: `searchMemory` takes `bookId` as a required positional and ANDs it with seriesId (retriever.ts:141-143,164-166), so true cross-book series recall additionally needs a caller that passes a falsy bookId — that caller does not exist yet. The TEST-PLAN §D live re-judge item can't exercise series-filtered recall until one does.

**N2 — Synthetic docId collision clobbers per-chapter chunks (pre-existing, bounds fix 10's win).** `onDocumentChanged` defaults `docId = ${bookId}:${documentType}` (memory-manager.ts:67). Both the agent path AND the human content-save pass no `docId`, so every CHAPTER_CONTENT index for a book shares ONE docId, and `indexDocument` delete-and-replaces by (bookId, docType, docId) (indexer.ts:73 → deleteChunksForDocument indexer.ts:247-265). Net: only the most recently indexed chapter's prose survives in vector memory via these paths (import survives — per-chapter `import-ch-N` ids, import/route.ts:170). The debounce key collides the same way (indexer.ts:16-18), so rapid multi-chapter writes (batch/overnight) cancel earlier chapters' pending indexing. Series recall post-fix will surface at most the latest agent-written chapter per book.

**N3 — VM2 rebuild strips the stamp (pre-existing).** `rebuildBookIndex` re-indexes with `{ userId, chapterNumber, version: 1 }` — no seriesId (cleanup.ts:155-159) — so any rebuild resets `seriesId:null` on every chunk, human-saved and agent-written alike. Fix 10's stamp is not durable across a rebuild.

**N4 — Two more CHAPTER_CONTENT index paths still null-stamp seriesId (pre-existing):** documents/[docId] PUT (documents/[docId]/route.ts:146-150) and import (import/route.ts:165-173).

None of N1-N4 is caused or worsened by fix 10, and each is outside its declared scope. The change itself is correct, minimal, non-blocking, parity-true, and both gates pass.

**COMMIT NOTHING respected — nothing committed by this verify.**
