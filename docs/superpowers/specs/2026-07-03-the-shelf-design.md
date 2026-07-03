# The Shelf — Design Spec (Tier 4.8, dashboard/library reframe)

*Date: 2026-07-03 · Roadmap: `docs/IMPROVEMENT-ROADMAP.md` Tier 4.8.*

## 1. Goal & scope

Reframe the flat book library into **The Shelf** — a writing ritual that groups a writer's
projects by the *state they're in* and leads each card with the *next action*, so the library
answers "what should I do with this book?" instead of merely "here are your books." Four shelves:

- **Currently Writing** — active drafts. CTA: *Continue → Ch N*.
- **Waiting for Feedback** — the AI has unaddressed editorial notes, or the book is out with
  beta readers. CTA: *Review feedback*.
- **Completed** — finished / in final export. CTA: *Open / Export*.
- **Archived** — the attic; collapsed, muted. CTA: *Restore*.

Everything is derived from **already-persisted data** (`Book.status`, pending `EditFinding`,
chapter statuses, timestamps) plus **one additive nullable column** (`Book.archivedAt`) for the
one state that isn't derivable. No agent/LLM on the request path.

**In scope (this pass):**
- Pure, unit-tested **shelf classifier** (`assignShelf`), **card-fact summarizer**
  (`summarizeBook`), and **grouper** (`groupBooks`).
- Reframe of **`/books/page.tsx`** (server component) into four `<ShelfSection>`s, with the
  book card extracted into a real `<ShelfBookCard>` component (from the card currently inlined
  in `/books`). The dashboard's separate inline card is left as-is — see the "dashboard
  untouched" deferral below; deduplicating it would require the dashboard to compute
  rollups/shelf state and is out of this pass's scope.
- One additive schema column **`Book.archivedAt`** + a `userId`-scoped
  **`POST /api/books/[id]/archive`** route + an `archive-menu` client island.
- **Ripple audit:** fence every *active-navigation* book listing with `archivedAt: null`, leave
  history/stats untouched.

**Explicitly deferred (documented, non-blocking):**
- Persisted "last-opened chapter + cursor position" (the *Continue* CTA uses **last-edited
  chapter** via `updatedAt`, not a persisted cursor).
- Any dashboard reframe — the dashboard is **untouched** except for ripple fencing.
- Pagination of the Archived shelf (YAGNI — split in memory; paginate only if archives grow huge).
- Drag-between-shelves / manual re-shelving (shelf membership is derived, not user-dragged).
- Celebration/animation polish on Completed beyond subtle styling.

**Success criteria:** every book lands on exactly one shelf by the §3 precedence; archiving hides
a book from active-work surfaces without rewriting history or breaking its deep links; a
secondary-signal outage degrades card detail without blanking the shelf; `tsc --noEmit` clean;
full Vitest suite green (new pure-core + route tests included); prod build compiles.

## 2. Existing machinery this builds on (verified in codebase survey)

| Capability | Location | Reuse |
|---|---|---|
| `Book` model: `status`, `wordCount`, `updatedAt`, `createdAt`, `_count.chapters` | `prisma/schema.prisma:130-176` | Primary shelf inputs |
| `Book.status` values `concept\|planning\|writing\|editing\|beta\|export\|complete` | `src/lib/validation.ts:16-27` | Classifier mapping |
| `EditFinding` (`bookId`, `status`, `agentType`, `chapterNumber`, `createdAt`) | `prisma/schema.prisma:361-396` | Pending-findings = Waiting trigger; agentType/chapter for texture |
| `Chapter.status` values (`…drafted\|dev_edited\|line_edited\|beta_read\|beta_passed`) | `src/lib/validation.ts:60-69` | Progress texture (drafted/analyzed counts) |
| Current `/books` list page (server component, inline card) | `src/app/(app)/books/page.tsx:70-102` | Page being reframed |
| Dashboard recent grid + "Continue where you left off" `lastBook`/last-chapter | `src/app/(app)/dashboard/page.tsx:44-263` | Card extraction source; **ripple fence target** |
| Route pattern: `requireUser()` → `findFirst({id,userId})` → work → envelope | `radar/route.ts`, `.../discuss/route.ts` | Archive route skeleton + ownership |
| shadcn `Card`/`Badge` + Tailwind; Sonner toasts; `router.refresh()` | dashboard + editor | Card + archive-menu island |
| Vitest harness (166/166 across 20 files) | `*.test.ts` | Pure-core + route tests |

**Key constraint discovered:** the 7 `Book.status` values have **no spare slot** to repurpose for
"archived", so Archived is the one state that requires persistence — hence the additive
`archivedAt` column (deploy gate). All other shelves derive purely from existing data.

## 3. The classifier (single membership, first-match precedence)

Each book sits on **exactly one** shelf. `assignShelf(book, signals) → Shelf` evaluates in order;
first match wins:

| # | Shelf | Rule (first match wins) | Rationale |
|---|-------|------------------------|-----------|
| 1 | **Archived** | `archivedAt != null` | Explicit user action; wins over all state. |
| 2 | **Completed** | `status ∈ {complete, export}` | Done or in final export/packaging. A finished book stays finished even if stray findings linger. |
| 3 | **Waiting for Feedback** | `pendingFindings ≥ 1` **or** `status === "beta"` | Unaddressed AI editorial notes, or out with beta readers — the ball is on feedback. |
| 4 | **Currently Writing** | else (`concept/planning/writing/editing`, no pending findings) | Catch-all: work in progress. |

**Locked design calls (user-approved):**
- **Completed beats Waiting.** A `complete` book with leftover pending findings lands on
  **Completed**, not dragged back to Waiting. Declared doneness is a strong signal.
- **`export` counts as Completed** (it's the second-to-last status, semantically "shipping").
- **No recency filter for membership.** State ≠ recency — a draft untouched for weeks is still
  *Currently Writing*, just cold. Recency only **sorts within** a shelf (`updatedAt desc`) and
  drives a "last touched N days ago" line. This prevents the "where did my book go?" bug.

**Page order:** Currently Writing → Waiting for Feedback → Completed → Archived (Archived last, collapsed).

## 4. Architecture

Pure core (no I/O, unit-tested) + thin server shell + one client island:

```
/books/page.tsx  (server component)
  ├─ Q1 book.findMany({ userId }, _count:{ chapters, editFindings where pending }) ─┐
  ├─ Q2 chapter.groupBy({ by:[bookId,status], where:{ book:{ userId } } })          │ 3 batched
  ├─ Q3 chapter.findMany({ where:{book:{userId}}, orderBy:[bookId,updatedAt desc],  │ userId-scoped
  │       distinct:['bookId'] })  → latest chapter per book (Continue deep-link)     │ queries, no N+1
  │                                                                                  │
  ├─ groupBooks(books, rollup, lastChapters)  ── pure ──▶ { currentlyWriting, waiting, completed, archived }
  │        │  (calls assignShelf + summarizeBook per book, sorts each group updatedAt desc)
  │        ▼
  └─ <ShelfSection>×4  →  <ShelfBookCard>  →  <archive-menu>  (client island)
                                                    │
                                          POST /api/books/[id]/archive { archived }
                                          (auth → ownership(404) → set archivedAt → revalidate)
```

**Files**

Pure core — `src/lib/shelf/`
- `types.ts` — `Shelf` union (`'currentlyWriting'|'waiting'|'completed'|'archived'`), `ShelfBook`, `BookSignals`.
- `assign-shelf.ts` — the §3 classifier.
- `summarize-book.ts` — book + chapter-rollup → `{ words, drafted, total, analyzed, lastTouchedDays, pendingFindings }`.
- `group-books.ts` — books + signals → the four sorted groups.

Shell — `src/components/shelf/`
- `shelf-section.tsx` — presentational: heading + count + card grid + per-shelf empty state; Archived variant **collapsible**.
- `shelf-book-card.tsx` — reframed card (server-renderable); extracts the card currently inlined in `books/page.tsx` (the dashboard keeps its own separate inline card — see the dashboard-untouched deferral). Archive control nested as a client island.
- `archive-menu.tsx` — client island: kebab → Archive (confirm) / Restore (one-click); POST then `router.refresh()`; Sonner toast on failure.

Route — `src/app/api/books/[id]/archive/route.ts`.

Page — `src/app/(app)/books/page.tsx` (rewired).

**Per-shelf card — leads with the next action:**

| Shelf | Primary CTA | Card subtitle |
|-------|-------------|---------------|
| Currently Writing | **Continue → Ch N** (deep-link to last-edited chapter; falls back to *Open* if the last-chapter signal is unavailable) | "X words · drafted D/T · last touched N days ago" |
| Waiting for Feedback | **Review feedback** → findings | "N notes pending · dev-edit A/T chapters" |
| Completed | **Open** / Export | "Finished · X words · T chapters" |
| Archived | **Restore** + Open (muted) | "Archived · X words" |

## 5. Data layer & schema

**Schema — one additive column (deploy gate #3; batches with pending 4.2 + 4.4 `db push`):**
```prisma
model Book {
  // …existing…
  archivedAt DateTime? @map("archived_at")   // NULL = active
  @@index([userId, archivedAt])
}
```
Nullable + defaulted → non-destructive, same shape as the 4.4 `ContinuityFlag` gate. Repo
convention is `db push`, no migrations dir (`package.json` `db:push:prod`).

**Three `userId`-scoped queries** (see §4 diagram). Q1 uses Prisma **filtered relation counts**
(`editFindings: { where: { status: "pending" } }`) so the Waiting trigger arrives with the book
list. Q3 uses Prisma's **distinct-per-group** pattern for the *Continue* target. Archived rows are
fetched in Q1 and split in memory by `archivedAt`.

**Confirm at implementation time (grep, don't assume):** the exact `Book`→`EditFinding` relation
field name used in the Q1 `_count.select`, and the `Chapter.status` "analyzed" set
(`{dev_edited, line_edited, beta_read, beta_passed}`) for the A/T progress figure.

## 6. Archive action + the ripple

**Route — `POST /api/books/[id]/archive`**, body `{ archived: boolean }` (zod). Sets
`archivedAt = archived ? new Date() : null`. Invariants (same as 4.2/4.3):
1. **Auth required** (session `userId`).
2. **Ownership check** → non-owned returns **404** (not 403; no existence leak).
3. **No mass-assignment** — only `archivedAt` is written.
4. Revalidates `/books` (+ dashboard).

Client `archive-menu`: confirm dialog on **archive** (reversible → light); **restore** one-click;
POST → `router.refresh()` (re-derive server-side); Sonner toast on failure, no dangling optimistic flip.

**The ripple — one governing rule:**
> **Archiving hides a book from *active work* surfaces. It never rewrites history and never makes
> the book unreachable** — deep links still open it; it lives on the Archived shelf.

- **Fence with `archivedAt: null`** — active-navigation surfaces: dashboard recent-grid +
  "Continue where you left off" `lastBook`, book-picker/selector dropdowns, series "add book"
  lists — every `book.findMany`/`findFirst` used to *list or navigate to* active work.
- **Leave untouched** — history is yours: writing-stats, Writing-Wrapped, heatmap, aggregate word
  totals. Archived words still count in your history.
- **Dashboard "Total Books" counts active only** (archived drop out) — matches the "active work"
  framing. *(The one debatable spot; decided active-only.)*

**Completeness guarantee (not a guess):** the implementation plan includes a **grep audit of every
`book.findMany`/`findFirst` in `src/`**, each classified *active-navigation* (fence) vs
*history/stats* (leave); fence exactly the first set. Same "enumerate all consumers before touching
a cross-cutting field" discipline the 4.4 review enforced.

## 7. Error / empty / loading

- **Per-source degradation** (4.3/4.4 pattern): the primary `book.findMany` (Q1) is essential — if
  it throws, the route error boundary shows a retry. The **secondary** signal queries (Q2
  chapter-rollup, Q3 last-chapter) are wrapped independently: on failure, cards still render — without
  the progress subtitle, CTA falling back to **Open** instead of **Continue → Ch N**. A signal
  outage degrades detail; never blanks the shelf.
- **Empty states:** whole library empty → existing "no books yet" create/import CTA. Individual
  **empty active shelves are hidden** (no "nothing here" walls); the **Archived** section renders
  only when non-empty (and collapsed).
- **Loading:** route-level `loading.tsx` renders shelf-shaped skeletons during the server fetch.

## 8. Testing

Vitest; matches the 166/166 suite, ≥80% money-path. **All verifiable this session** (pure fns +
mocked route, no live DB) — same validation path as 4.1–4.4.

- **`assign-shelf.test.ts`** — full precedence truth table: `archivedAt` set → **Archived**
  regardless of status; `complete` → **Completed**; `export` → **Completed**;
  `complete` + pending findings → **Completed** (Completed-beats-Waiting); `beta` → **Waiting**;
  pending findings on `writing` → **Waiting**; bare `concept/planning/writing/editing` → **Currently Writing**.
- **`summarize-book.test.ts`** — subtitle facts; `lastTouchedDays` boundaries (0 / 1 / N); drafted &
  analyzed counts from a chapter-status rollup.
- **`group-books.test.ts`** — grouping correctness, intra-shelf `updatedAt desc` sort, empty groups.
- **`archive/route.test.ts`** (mocked Prisma) — auth required · non-owner → 404 · zod rejects bad
  body · only `archivedAt` written · `{archived:false}` clears it.
- `tsc --noEmit` clean.

## 9. Safety & rollout

All changes are additive: new pure modules + tests, new `<ShelfSection>`/`<ShelfBookCard>`/`archive-menu`
components, a reframed (not deleted) `/books` page, one additive nullable column, one new route.
No destructive migration. Existing editor / findings / autosave behavior is unchanged.

**Deploy gate:** `Book.archivedAt` needs `prisma db push` before archive works in dev/prod
(`/books` still renders — the three derived shelves work without it; only archive/restore + the
Archived shelf need the column). Batches with the pending 4.2 + 4.4 pushes.

**Rollback:** the feature is a page reframe + one column + one route; revert the commits and (if
already pushed) the `archivedAt` column can stay (nullable, harmless) or be dropped separately.
