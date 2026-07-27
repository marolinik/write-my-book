# D-200 — deleting a chapter never removes its words from the book total

**Severity S2.** Found by DB-cross-checking the 50b capture that closed D-190/D-115.
Branch `qa/bulletproof-2026-07-17`. Not yet fixed.

## Symptom

`books.word_count` is maintained by delta increments and is never reconciled on delete,
so every deleted chapter's words stay in the book total permanently. The number can only
go up.

Measured on book `df2269b0-0d86-41f7-8a28-7d3a86cfa2d5` during 50b:

| step | API `bookWordCount` | truth |
|---|---|---|
| wrote 23-word sentinel into ch1 | 23 | 23 |
| deleted ch1 | — | 0 |
| new ch1, saved 6 words | 29 | 6 |
| grew to 14 words | 37 | 14 |

Final DB state: `books.word_count = 37`, `books.chapter_count = 1`, and the `chapters`
table holds exactly one row with `word_count = 14`. Overstated by 23 — precisely the
deleted chapter — with no path back down.

## Root cause

`src/app/api/books/[id]/chapters/[chapterId]/route.ts:120-125` (DELETE) recounts chapters
authoritatively but leaves the word aggregate alone:

```ts
// D-194: authoritative recount (see the create route) — a blind decrement
// can drive an already-drifted counter negative and never self-corrects.
const chapterCount = await db.chapter.count({ where: { bookId } });
await db.book.update({
  where: { id: bookId },
  data: { chapterCount },
});
```

The only writer of `books.wordCount` is the delta path at
`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts:315`:
`data: { wordCount: { increment: wordDelta } }`.

The comment above the recount describes this exact failure mode for `chapterCount` — a
delta-maintained counter that is never reconciled and never self-corrects. D-194's fix
applied that reasoning to `chapterCount` and stopped one field short.

## Why S2, not cosmetic

`book.wordCount` is not just a tile. From `src/app/(app)/books/[bookId]/page.tsx`:

- `:336` book overview word display; `:48` of `books/page.tsx` the shelf listing
- `:550`/`:557` -> `src/components/book/lifetime-stats.tsx:65` **"Total Words"** StatBox and
  `novelEquivalent(totalWords)` ("Member for N days — X novels")
- `:562` -> `src/components/book/milestone-rewards.tsx:65`, which gates awards on
  `totalWords >= r.requiresWords` — **a writer can be handed a milestone they never wrote**
- `:576` -> `src/components/book/shareable-progress-card.tsx`, i.e. an inflated figure the
  writer publishes to other people
- `chapters/[chapterId]/page.tsx:75` seeds the editor's live counter from it

So the defect converts a deletion into a permanent overstatement on a public-facing claim
and can unlock unearned achievements. It also compounds: every future delete adds more.

## Suggested fix

Mirror the D-194 shape — reconcile both counters in the same transaction:

```ts
const [chapterCount, agg] = await Promise.all([
  db.chapter.count({ where: { bookId } }),
  db.chapter.aggregate({ where: { bookId }, _sum: { wordCount: true } }),
]);
await db.book.update({
  where: { id: bookId },
  data: { chapterCount, wordCount: agg._sum.wordCount ?? 0 },
});
```

Existing books are already drifted, so the reconcile should also run wherever
`chapterCount` self-heals today, not only on delete. Worth checking the bulk/import and
reorder paths for the same asymmetry.

---

## FIXED and witnessed live — `6640963`

Fix shape: `src/lib/books/book-counters.ts` exposes `reconcileBookCounters(bookId)`, which
reads `_count._all` and `_sum.wordCount` in **one** aggregate and writes both columns in
**one** update, so the two counters can never disagree about the chapter rows they describe.
Wired into all six structural paths — chapter create/delete, document create/delete, and two
import paths. The hot content-save path at `content/route.ts:321` deliberately keeps its
exact per-save delta; drift can now only be introduced structurally, and every structural
path reconciles.

Suite after the fix: **1709/1709 across 209 files**, 0 failures (independently checked).
D-194's `chapter-count-integrity` tests were extended onto the shared aggregate rather than
bypassed, so D-194's contract — authoritative recount, never a blind delta — still holds.

**Live convergence proof** against the running build, on the very book this defect was
measured on (`df2269b0`, stored 37 vs real 14):

| step | `books.word_count` \| `chapter_count` |
|---|---|
| before (drifted) | `37 \| 1` |
| after POST one chapter | `14 \| 2` |
| after DELETE that chapter | `14 \| 1` |
| truth from `chapters` table | `1 row, 14 words` |

The 23 stale words disappeared on the **first** structural touch. So already-drifted books
self-heal as soon as they are touched and no backfill migration is needed — which is why
none was written. Books never touched again keep their inflated total; that is the one
knowingly-accepted residual.
