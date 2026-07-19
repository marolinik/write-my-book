# D-75 handoff — vector moat retained only the last chapter (CRITICAL recall crater) + D-76/D-77

**Status:** implemented, gates green, **COMMIT NOTHING** (team-lead commits by pathspec).
**Gates:** `npx tsc --noEmit` → exit 0. `npx vitest run` → **121 files / 909 tests passed** (baseline 900/120 + 9 new = 909/121). No pre-existing test modified except two additive edits (see §Tests).
**Mode:** TDD (RED first, verified), minimal diff.

---

## 1. Mechanism (re-derived in-tree)

Chapter-content indexing was **book-scoped, not chapter-scoped**, via two independent faults that both point the same way:

1. **Shared default docId.** `memory-manager.onDocumentChanged` fell back to `docId = metadata?.docId ?? \`${bookId}:${documentType}\``. Both chapter-content callers omit `docId` — human save `chapters/[chapterId]/content/route.ts:226` and agent write `agents/post-session.ts:832` — so **every** chapter collapsed to the single docId `\`${bookId}:CHAPTER_CONTENT\``.
2. **docId-scoped delete.** `indexer.indexDocument` called `deleteChunksForDocument(bookId, docType, docId)` before every upsert. With the shared docId, indexing chapter N **deleted chapters 1..N-1** first.
3. **Debounce-key collision (same root).** `debounceKey = \`${bookId}:${docType}:${docId}\`` also collapsed, so a chapter save within the 2s debounce window **cancelled a different chapter's pending index**.

**Net:** `wmb_memory` kept chunks for exactly ONE chapter per book (the last written, via either path) — gutting within-book semantic recall (the "remembers your whole manuscript" value prop; a hidden driver of the D8 recall weakness and D2).

---

## 2. The two-part fix

### Part 1 — stable per-chapter docId (`src/lib/vector/memory-manager.ts:78-95`)
Derived centrally in `onDocumentChanged` rather than duplicated at the two call sites (see §5 for why this is equivalent-and-stronger than editing each call site):
```ts
const isChapterContent = documentType === "CHAPTER_CONTENT";
const docId =
  metadata?.docId ??
  (isChapterContent && chapterNumber !== null
    ? `${bookId}:${documentType}:${chapterNumber}`   // e.g. book9:CHAPTER_CONTENT:3
    : `${bookId}:${documentType}`);
scheduleIndex(bookId, docType, docId, content, { …, chapterContent: isChapterContent });
```
Both caller-less paths (content route + agent) pass `chapterNumber`, so they receive an **identical** per-chapter docId → distinct debounce keys (fixes fault 3) and distinct docIds per chapter.

### Part 2 — chapter-scoped delete for CHAPTER_CONTENT (`src/lib/vector/indexer.ts`)
`indexDocument` now branches the pre-upsert delete (`indexer.ts:82-93`):
```ts
if (metadata.chapterContent && metadata.chapterNumber != null) {
  await deleteChapterContentChunks(bookId, metadata.chapterNumber);  // chapter-scoped
} else {
  await deleteChunksForDocument(bookId, docType, docId);             // docId-scoped (unchanged)
}
```
New private helper `deleteChapterContentChunks` (`indexer.ts:302`) — the load-bearing delete filter:
```ts
must: [
  { key: "bookId",         match: { value: bookId } },
  { key: "chapterNumber",  match: { value: chapterNumber } },
  { key: "chapterContent", match: { value: true } },   // ← content-only (see §3)
]
```
This is **strictly stronger** than the spec's `(bookId, chapterNumber)`: it still ANDs bookId with chapterNumber (satisfies invariant #4 — cannot cross books or chapters) **and** adds a content discriminator. A chapter's prose is atomically REPLACED regardless of which path/docId last wrote it, so distinct chapters coexist while the same chapter converges to ONE chunk set across import / agent / content-route / document-API.

`chapterContent: true` is stamped into the payload **only on chapter prose** (`indexer.ts` payload build) and added to `MemoryChunkPayload` as an **optional** field (`types.ts`) — absent on every other chunk and on all pre-D-75 chunks (back-compatible; retriever/search ignore it).

---

## 3. The load-bearing subtlety a naive `(bookId, chapterNumber)` delete gets WRONG

`CHAPTER_CONTENT`, `CHAPTER_BRIEF`, and `CHAPTER_PLAN` **all map to docType `"chapter"`** (`memory-manager.mapDocumentType`, `cleanup.mapDocumentType`) **and all carry the same `chapterNumber`** (briefs/plans are in `tools.CHAPTER_SCOPED_DOC_TYPES` and are indexed with their chapterNumber via `rebuildBookIndex` and via a document-API PATCH). So a delete keyed on `(bookId, chapterNumber)` alone would **silently wipe a chapter's brief/plan chunks every time its content is saved** — a real regression, not theoretical (any rebuilt book has brief/plan chunks).

The `chapterContent=true` third clause is what prevents this. The discriminator is gated on the **raw `CHAPTER_CONTENT` type** (known at `onDocumentChanged` and at `rebuild`), never the ambiguous mapped `"chapter"` docType. Proven by the guard test *"never deletes a chapter's brief/plan when its content is re-indexed."*

---

## 4. Exact call sites + delete-strategy change

| File | Change | D- |
|---|---|---|
| `src/lib/vector/memory-manager.ts:78-95` | per-chapter default docId + `chapterContent` flag from raw type | D-75 p1 |
| `src/lib/vector/indexer.ts:40-55, 82-93, 302-327` + payload + `scheduleIndex`/`indexBatch` metadata types | branch delete (chapter-scoped vs docId-scoped) + `deleteChapterContentChunks` helper + payload stamp | D-75 p2 |
| `src/lib/vector/types.ts` | `MemoryChunkPayload.chapterContent?: boolean` (optional, back-compat) | D-75 p2 |
| `src/lib/vector/cleanup.ts:114-120, 168-174` | `rebuildBookIndex` reads `book.seriesId` once + threads `seriesId` **and** `chapterContent` (`doc.type === "CHAPTER_CONTENT"`) | D-76 + D-75 |
| `src/app/api/books/[id]/documents/[docId]/route.ts:146-152` | document-API PATCH stamps `seriesId: book.seriesId` (book already loaded) | D-77 |
| `src/app/api/books/[id]/import/route.ts` (both `indexBatch` sites) | imported chapters stamp `chapterContent: true` (converge, not duplicate) | D-75 |

**Files deliberately NOT touched:** `post-session.ts:832` and `content/route.ts:226` — Part 1 centralizes the derivation, so both are covered without editing them (smaller diff). `retriever.ts`/`graph-*` untouched (no overlap with opus-fix-d5).

---

## 5. Design decision: centralize docId in memory-manager vs. edit both call sites

The spec allows the synthetic `${bookId}:CHAPTER_CONTENT:${chapterNumber}` "IF used identically on BOTH paths." Deriving it once in `onDocumentChanged` **guarantees** identical derivation (single source of truth) — strictly satisfying that requirement — and also covers the document-API path and any future CHAPTER_CONTENT caller, with a smaller diff than duplicating a literal at two sites. Degenerate case: a caller omitting BOTH `docId` and `chapterNumber` falls back to the old book-scoped docId with `chapterContent` inert (`chapterNumber != null` guard fails) — but **no live caller does this** (content route + agent always pass chapterNumber; document-API always passes docId).

---

## 6. Proof tests (TDD)

New file **`tests/unit/vector-chapter-recall.test.ts`** (7 tests) — REAL memory-manager → real `scheduleIndex` debounce (fake timers) → real `indexDocument` → real retriever, over a fake Qdrant that honors `must` filters (match/is_null/should). **Verified RED on pre-fix code, then GREEN:**

- **RED→GREEN** within-book coexistence, human path: save ch1/ch2/ch3 → all 3 queryable (pre-fix: only ch3).
- **RED→GREEN** within-book coexistence, agent path (post-session:832 metadata shape): all 3 queryable.
- **RED→GREEN** debounce: two chapters saved inside the 2s window both index (pre-fix: ch2 cancelled ch1 → 1).
- **RED→GREEN** cross-path convergence: content route then document API → exactly ONE chunk set, latest wins (pre-fix: 2 = duplicate).
- **GUARD (green throughout)** re-index same chapter replaces, no duplicate.
- **GUARD (green throughout)** cross-book isolation: re-saving book-A ch1 never deletes book-B ch1 (same chapterNumber).
- **GUARD (green throughout)** brief/plan preservation: re-indexing content never deletes the chapter's brief.

Additive edits to **`tests/unit/vector-rebuild-content.test.ts`**: added `db.book.findUnique` to the mock (rebuild now reads seriesId) + 2 tests — D-76 seriesId durability, and `chapterContent` stamped on CHAPTER_CONTENT but NOT on CHAPTER_BRIEF.

RED transcript (pre-fix): 4 crater tests failed (`expected length 3, got 1`; debounce `got 1`; convergence `['content-route body v1', …(1)]` vs `['document-api body v2']`), 3 guards passed.

---

## 7. D-76 / D-77 / D-78 disposition

- **D-76 (rebuild strips seriesId) — DONE.** `rebuildBookIndex` reads `book.seriesId` once and threads it into every re-indexed chunk (`cleanup.ts:114-120,168`). Test added.
- **D-77 (null-stamp seriesId on other write paths) — document-API DONE; import PARTIAL (residual).** Document-API PATCH now stamps `book.seriesId`. Import's `indexBatch` now stamps `chapterContent: true` (D-75 convergence), but **import-seriesId is a registered residual**: the two import handlers don't receive `book` (loaded only in the top-level POST dispatcher), so threading seriesId balloons the diff into a non-owned file for a low-priority parity item. It self-heals — an imported chapter gets the correct seriesId on its first content-route edit (which stamps `book.seriesId`) or on any rebuild (D-76). **Residual: D-77b import-seriesId.**
- **D-78 (no `searchMemory` caller passes seriesId) — OUT of scope, left registered.** Not implemented, per spec.

---

## 8. Invariants held (verifier attack surface)

- No prose lost; indexing stays fire-and-forget/debounced (never fails or blocks a save). Embeddings graceful-disabled → tests MOCK qdrant/embeddings, never require live OpenAI.
- No tenant regression: userId filtering (D-67/D-68) untouched; `MemoryChunkPayload` extended only with an optional field; the single writer (`indexDocument`) migrated in place.
- Chapter-scoped delete filter is `bookId` AND `chapterNumber` AND `chapterContent` — cannot reach another chapter's, another book's, or a brief/plan's chunks. Proven by the two cross-scope guard tests.
- Known limitation (documented): legacy content chunks indexed **before** this fix lack the `chapterContent` field, so the new content-scoped delete won't remove them — a rebuild (recall's natural remediation, already reads real prose per VM2) clears any transient duplicate. Briefs/plans are correctly preserved in this legacy case.
