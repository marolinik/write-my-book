# Fix 10 handoff — series-scope vector indexing for agent writes (RC-5)

**Branch:** `qa/bulletproof-2026-07-17` · **Mode:** TDD, minimal diff, NO-COMMIT · **Owner:** fixer-fix10 (opus)
**Root cause:** `w-d-rootcause.md` §RC-5 "Adjacent architectural defect" · **Fix-list row:** #10 (size S, RC-5)

---

## The defect (before)

`updateChapterGraph()` in `post-session.ts` — the agent-write index path, fired after
`write-chapter` / `revise` sessions — indexed chapter prose into the vector store with **no
seriesId**:

```ts
// src/lib/agents/post-session.ts:817 (before)
await onDocumentChanged(bookId, "CHAPTER_CONTENT", content.content, { chapterNumber });
```

`onDocumentChanged` defaults `seriesId ?? null`, so every agent-written chunk landed with
`seriesId: null`. Series-filtered vector recall applies a `seriesId` **`must`** clause that matches
by exact value:

```ts
// src/lib/vector/retriever.ts:164-166
if (filter.seriesId) {
  must.push({ key: "seriesId", match: { value: filter.seriesId } });
}
```

A `null`-stamped chunk can never satisfy `match: { value: "series-1" }`, so **every cross-book
(series) query silently missed all agent-written prose.** Only human saves stamped seriesId (the
content PUT route below), so cross-book recall for the flagship series persona was silently halved
whenever the writing was agent-assisted.

## The plumbing was already correct — this is a caller-only fix

seriesId is accepted end-to-end already; only the caller omitted it:
- `onDocumentChanged` metadata accepts `seriesId?: string | null` — `memory-manager.ts:53,71`
- `scheduleIndex` forwards `seriesId` — `indexer.ts:135,141`
- `indexDocument` writes it onto the payload — `indexer.ts:87`
- `MemoryChunkPayload.seriesId` field exists — `types.ts:39`
- `buildFilter` applies the seriesId `must` — `retriever.ts:164-166`

The mirror (human-save path) already does the right thing and was copied exactly:
```ts
// src/app/api/books/[id]/chapters/[chapterId]/content/route.ts:226-231
return onDocumentChanged(bookId, "CHAPTER_CONTENT", data.markdown, {
  userId: user.id, chapterId, chapterNumber: chapter.chapterNumber,
  seriesId: book.seriesId, language: book.language, version,
});
```

## The fix (after)

`src/lib/agents/post-session.ts` — the **only** source file changed (21 insertions, 3 deletions):

1. **seriesId source** — looked up from the book already in scope (mirrors `maybeAutoSynthesize`
   at `:719` and the human-save route), never invented:
   ```ts
   const book = await db.book.findUnique({
     where: { id: bookId },
     select: { seriesId: true },
   });
   await onDocumentChanged(bookId, "CHAPTER_CONTENT", content.content, {
     chapterNumber,
     seriesId: book?.seriesId ?? null,   // standalone book → null, legitimately
   });
   ```
2. **`updateChapterGraph` exported** for direct unit testing (precedent: `advanceChapterStatus`,
   exported for the D-48 test in the same file).

**Exact call site changed:** `post-session.ts` — the trailing `onDocumentChanged` inside
`updateChapterGraph` (was line 817; now 830-836 after the added comment + lookup).

## Scope discipline

- **Did NOT touch** `graph-builder.ts` / `entity-extractor.ts` / `graph-maintenance.ts`
  (opus-fix-d5 owns those — no collision; `git diff --stat` shows one source file).
- **Did NOT touch userId/tenant plumbing** (D-67/D-68). The agent-write call still omits `userId`
  exactly as before — out of scope for fix 10. (Note for the verifier: agent-written chunks
  therefore still carry `userId:null`; the retriever's userId filter is null-safe so recall is
  unaffected, but this is the remaining half of RC-6/D-67 on this path.)
- **Did NOT** add the roadmap's optional "trigger graph extraction on human save" — explicitly out
  of scope for fix 10.
- No prose path touched; indexing stays fire-and-forget / non-blocking (the `onDocumentChanged`
  call is unchanged in its await/catch posture — the enclosing `updateChapterGraph` is invoked
  `.catch()`-guarded at `post-session.ts:275`).

## Proof tests (TDD — RED before, GREEN after)

Two new files, both RED against pre-fix code, GREEN after:

**`tests/unit/agent-write-series-index.test.ts`** (4 tests) — caller unit, mocks memory-manager/db:
- stamps the book's seriesId onto agent-written prose (+ asserts the `book.findUnique({ where:{id}, select:{seriesId} })` lookup)
- standalone book (no series) → indexes `seriesId: null` without error
- missing book row → falls back to `seriesId: null`, never throws / never `undefined`
- regression pin: metadata must have a `seriesId` property (pre-fix bug was bare `{ chapterNumber }`)

**`tests/unit/agent-write-series-recall.test.ts`** (2 tests) — end-to-end through the REAL
memory-manager + indexer + retriever over a fake Qdrant that honors payload `must` filters
(scheduleIndex debounce replaced with a synchronous call to the real `indexDocument`):
- **series recall returns an agent-written chapter that a null seriesId would miss** — this is the
  RC-5 assertion. Pre-fix: `searchMemory(book, q, { seriesId })` returned `[]` (`expected +0 to be 1`);
  post-fix returns the chunk. A bookId-only search finds it either way (proves it was indexed, just
  unreachable by series recall).
- standalone book indexes `seriesId: null`, stays reachable by bookId recall, and is NOT surfaced by
  an unrelated series query.

### RED (before fix, with only the `export` added)
```
tests/unit/agent-write-series-index.test.ts   (4 tests | 4 failed)
tests/unit/agent-write-series-recall.test.ts  (2 tests | 1 failed)  → "expected +0 to be 1"
```

### GREEN (after fix)
```
tests/unit/agent-write-series-index.test.ts   6 passed  (both files)
tests/unit/agent-write-series-recall.test.ts
```

## Gates

- `npx tsc --noEmit` → **exit 0**
- `npx vitest run` → **900 passed / 120 files** (baseline 894 / 118 → +6 tests, +2 files, no
  regressions). stderr noise in the run is pre-existing intentional failure-path logging.

## Files

- Changed (source): `D:\Projects\wmb-pub\src\lib\agents\post-session.ts`
- New (tests): `D:\Projects\wmb-pub\tests\unit\agent-write-series-index.test.ts`,
  `D:\Projects\wmb-pub\tests\unit\agent-write-series-recall.test.ts`

## Residual / notes for verifier

- `userId` still omitted on this agent-write index call (D-67/D-68 territory) — deliberately left.
- Recall improvement is proven at the vector layer with a fake Qdrant; a live re-judge should still
  exercise the "agent-written-prose recall" item in TEST-PLAN §D (fix 10) against real Qdrant +
  qwen3.6, with a series that has ≥2 books and agent-written chapters.

**COMMIT NOTHING — team-lead commits after Fable adversarial verify.**
