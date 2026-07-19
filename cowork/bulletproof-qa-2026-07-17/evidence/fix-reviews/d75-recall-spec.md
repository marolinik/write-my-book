# D-75 — vector moat retains only the last chapter (CRITICAL recall crater) + D-76/D-77 seriesId-durability cluster

**Discovered by:** verify-fix10 (notes N2/N3/N4) during fix-10 verify; confirmed by team-lead grep.

**Owner:** opus executor (model:opus). Mode: TDD (RED first), NO-COMMIT, minimal diff. Team-lead gates + Fable adversarial verify + commits.
**Files you OWN (disjoint from opus-fix-d5's fix 7 = graph-builder/entity-extractor/graph-maintenance — DO NOT touch those):** `src/lib/vector/indexer.ts`, `src/lib/vector/memory-manager.ts`, `src/lib/vector/cleanup.ts` (already has the tool), `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts` (call site), `src/lib/agents/post-session.ts` (call site :832 only — fix 10 already landed here, tree clean). If you must touch `retriever.ts`/`types.ts`, confirm no overlap first.

---

## D-75 (CRITICAL) — chapter-content indexing is book-scoped, not chapter-scoped

**Mechanism (confirmed in-tree, re-derive line numbers):**
- `memory-manager.ts:67`: `const docId = metadata?.docId ?? `${bookId}:${documentType}`` — when a caller omits `docId`, ALL chapters collapse to `${bookId}:CHAPTER_CONTENT`.
- Both chapter-content callers omit docId: human save `content/route.ts:~226` (`onDocumentChanged(bookId,"CHAPTER_CONTENT",...)` passes chapterId/chapterNumber/seriesId but NO docId) and agent write `post-session.ts:~832` (passes chapterNumber/seriesId, NO docId, NO userId).
- `indexer.ts:~73`: `deleteChunksForDocument(bookId, docType, docId)` deletes every chunk sharing that docId BEFORE inserting the current chapter's chunks. Since docId is book-wide, indexing chapter N deletes chapters 1..N-1.
- `indexer.ts:~16-17`: `debounceKey = `${bookId}:${docType}:${docId}`` also collides → a chapter save within the debounce window cancels a different chapter's pending index.

**Net effect:** the `wmb_memory` vector store retains chunks for exactly ONE chapter per book (the last one written, via either path). This guts within-book semantic recall — the core "remembers your whole manuscript" value prop — and is a primary hidden driver of the D8 recall weakness and D2.

**The tool already exists:** `cleanup.ts:64 deleteChapterChunks(bookId, chapterNumber)` deletes by `(bookId, chapterNumber)` — chapter-scoped, docId-independent. Its own doc comment says chapters "may be indexed via multiple paths ... with different docIds," i.e. the design intended chapter-scoped replacement; the indexer just doesn't use it for chapter content.

**Fix (both parts — a per-chapter identity AND a chapter-scoped delete):**
1. **Per-chapter docId** so distinct chapters no longer collide and the debounce key is per-chapter. Give chapter content a stable per-chapter docId at BOTH call sites. Prefer the real chapter identity (`chapterId`) where available; the agent path `post-session.ts:832` must supply it too (it has `chapterNumber` and can look up the chapter — mirror how the human route already has `chapterId`). If chapterId is awkward on one path, a synthetic stable `${bookId}:CHAPTER_CONTENT:${chapterNumber}` is acceptable IF used identically on BOTH paths so they target the same logical doc (avoid one path using chapterId and the other synthetic → duplicate chunks for one chapter).
2. **Chapter-scoped delete for CHAPTER_CONTENT.** In `indexDocument` (or the chapter-content branch), replace the docId-scoped `deleteChunksForDocument` with `deleteChapterChunks(bookId, chapterNumber)` when indexing chapter content with a chapterNumber present. This guarantees a chapter's chunks are atomically REPLACED regardless of which path (import / agent / document-API) last wrote it, and that distinct chapters coexist. Keep the docId-scoped delete for NON-chapter docTypes (research/session/finding etc. keyed by their own unique docId).
   - Watch the interaction with the document-API path (`books/[id]/documents/[docId]/route.ts:146`) which DOES pass a unique docId and may index a chapter document under docId=doc.id: chapter-scoped delete-by-chapterNumber makes these converge safely (same chapterNumber → replaced together) instead of duplicating. Verify a chapter saved via both the content route and the document API ends with ONE set of chunks, not two.

**Tests (TDD, RED first; mock qdrant as existing vector tests do):**
- Index ch1, then ch2, then ch3 (agent path AND human path) → assert ALL THREE chapters' chunks are queryable afterward (RED today = only ch3 survives). This is the crater pin.
- Re-index the SAME chapter (edit) → old chunks for that chapter replaced, other chapters untouched, no duplicate chunks.
- A chapter indexed via the content route then via the document API → exactly one set of chunks for that chapter (no cross-path duplication).
- Debounce: two DIFFERENT chapters saved within the debounce window → both eventually index (neither cancels the other).

## D-76 (MED) — rebuildBookIndex strips seriesId
`cleanup.ts:~155-159` (rebuild path) re-indexes without carrying `seriesId`, so a VM2 rebuild nulls the seriesId stamp that fix 10 just added. Thread seriesId through the rebuild so a rebuilt index keeps series scope. Add a test asserting a rebuilt chapter chunk retains seriesId. (If the rebuild reads from Postgres, source seriesId from the book, same as the live path.)

## D-77 (MED/LOW) — other write paths null-stamp seriesId
`books/[id]/documents/[docId]/route.ts:146` (document-API PUT) and any import path call `onDocumentChanged` without seriesId → those chunks index seriesId:null. Thread the book's seriesId through these callers too, for parity with fix 10. Lower priority than D-75; include if cheap, else register residual.

## D-78 (MED) — latent: no searchMemory caller passes seriesId (RC-5 recall completion)
Out of scope for THIS fix, note only: `searchMemory` ANDs required bookId with seriesId, and no production caller (`memory-manager.ts:~184`, `tools.ts:~1552`) passes seriesId, so true cross-book (series) recall has no live entry point yet. fix 10 is the correct prerequisite (honest stamp); wiring a series-recall caller is a separate follow-up. DO NOT implement here — just leave D-78 registered.

---

## Gates + invariants (verifier will attack)
- `tsc --noEmit` exit 0; full `npx vitest run` green (currently 900/120 — additions raise it). Environment: PowerShell 5.1, Bash broken.
- **No prose lost, indexing stays fire-and-forget** (never fail/block a save). Embeddings may be graceful-disabled — tests must mock, not require live OpenAI.
- **No tenant regression:** don't touch userId filtering (D-67/D-68). Keep the `MemoryChunkPayload` shape back-compatible or migrate all writers together.
- The delete-strategy change is the load-bearing one — be certain chapter-scoped delete cannot delete ANOTHER chapter's or another book's chunks (filter must be `bookId` AND `chapterNumber`).
- Deliver a verifier-facing handoff `evidence/fix-reviews/d75-handoff.md`: the mechanism, the two-part fix, the exact call sites + delete-strategy change, proof tests, and D-77/D-78 residual disposition. COMMIT NOTHING.
