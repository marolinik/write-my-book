# Ambient Series Awareness — Design Spec (Tier 4.3, foundation pass)

*Date: 2026-07-02 · Roadmap: `docs/IMPROVEMENT-ROADMAP.md` Tier 4.3 (+ shared foundation for 4.4).*

## 1. Goal & scope

Make the editor **series-aware while writing**: when an author works on a later book in a
series, a read-only sidebar surfaces what they need to stay consistent with earlier books —
the on-stage characters' last-known state, unresolved plot threads carried forward, and any
material tone drift from the series' established voice. All of it computed from **cheap,
already-maintained data** (per-book Neo4j graph, Qdrant memory, structured StyleProfile
metrics) with **no agent/LLM run** on the request path.

**In scope (this pass):**
- A pure, unit-tested **ambient-context resolver** (cross-book character/alias matching, thread
  relevance filtering, tone-drift computation).
- A thin, read-only **`GET /api/books/[id]/series-context`** route with per-source failure
  isolation.
- A toggle-able **`AmbientSeriesPanel`** editor sidebar (3 sections), context-aware to the
  currently-open chapter's cast, cached with manual refresh.

**Explicitly deferred:**
- **4.4 live in-book continuity net** (as-you-type inline contradiction flags). This spec builds
  the cross-book resolver + source helpers that 4.4 will reuse, but ships **no** editor
  decorations, autosave-triggered checks, or write-back.
- Thread discovery from `SERIES_ARCHITECTURE` document parsing (v1 threads are **graph-only**;
  document-parse is a documented follow-up).
- Cross-book deep-link navigation ("jump to Book 1 Ch 18").
- BYOK embeddings (unchanged known gap — see §9).

**Success criteria:** opening a later-book chapter shows correct prior-book state for that
chapter's on-stage cast within one cached fetch; every dependency can be offline without the
sidebar 500-ing or showing fake data; `tsc` clean, full Vitest suite green, prod build compiles.

## 2. Existing machinery this builds on (verified in codebase survey)

| Capability | Location | Reuse |
|---|---|---|
| `Series` model, `Book.seriesId` + `bookNumber` ordering, `@@unique([seriesId, bookNumber])` | `prisma/schema.prisma:109-175` | Resolve prior books |
| Per-book Neo4j graph; `CharacterNode {role,status,firstAppearance,lastMentioned,aliases,description}` | `src/lib/graph/types.ts:20-29`, `neo4j-client.ts` | Prior-book character state |
| `QueryGraph` cheap Cypher: `chapter-entities`, `character-network`, `plot-threads`, `consistency-checks` | `src/lib/graph/graph-queries.ts:229-387`, `src/lib/agents/tools.ts` (executeQueryGraph) | On-stage cast + prior state + threads, no LLM |
| Entity extraction already runs on autosave (haiku, content-hash-diffed, fire-and-forget) | `src/lib/graph/graph-maintenance.ts:17-61` (`updateFromChapter`) | Graph is fresh; we only read |
| `searchMemory(bookId, query, {seriesId,...})` — Qdrant, ~$0.00004, <100ms | `src/lib/vector/retriever.ts:34-82` | Optional enrichment; series-scoped |
| `StyleProfile.metrics` (structured JSON) + `sourceBookNumber` | `prisma/schema.prisma:458-475` | Tone baseline |
| Route pattern: `requireUser()` → `findFirst({id,userId})` → work → envelope | `radar/route.ts`, `daily-plan/route.ts`, `.../discuss/route.ts` | Route skeleton + ownership |
| Sidebar widget pattern: `useQuery` staleTime + manual refresh, loading/error/empty states | `src/components/book/story-radar.tsx:44-110` | `AmbientSeriesPanel` |
| Version-history sidebar mount (`w-64` `lg+` / Sheet mobile) | `manuscript-editor.tsx:1321-1342` | Panel mount + responsive |
| Editor pane store (`showFindings`, toggles) + `active-editor-store` (`chapterNumber`) | `src/stores/editor-store.ts`, `active-editor-store.ts` | Toggle flag + chapter subscription |

**Key constraint discovered:** Neo4j graphs are **isolated per `bookId`** — the same character is
a distinct node in each book. Cross-book state therefore requires an explicit name/alias match
across prior books' graphs (this is the resolver's core job). No series-wide graph exists and we
do **not** build one here.

## 3. Architecture

Three isolated units + one I/O helper:

```
active-editor-store (chapterNumber)
        │
   useAmbientContext(bookId, chapterNumber)   ── GET ──▶  /api/books/[id]/series-context?chapterNumber=N
        │                                                        │  (route: auth → ownership → gather → resolve → envelope)
   AmbientSeriesPanel  ◀── AmbientContextView (JSON) ───────┐    │
   (Characters | Threads | Tone sections)                   │  src/lib/series/ambient-sources.ts  (I/O; each call failure-isolated)
                                                             │    ├─ graph: chapter-entities (current book) → on-stage names
                                                             │    ├─ graph: prior-book character state (per prior book)
                                                             │    ├─ graph: prior-book open plot threads
                                                             │    └─ style: StyleProfile baseline + cheap current-chapter metrics
                                                             │            │
                                                             └── buildAmbientContext(...) [PURE, no I/O] ──▶ AmbientContextView
```

- **`src/lib/series/ambient-context.ts`** — pure resolver. Deterministic, total, crash-safe. Holds
  the cross-book matching, thread filtering, tone-drift math. **This is the seam 4.4 reuses.**
- **`src/lib/series/ambient-sources.ts`** — I/O layer. One narrow async function per source, each
  individually mockable and each returning empty on failure (never throws to the route).
- **`GET /api/books/[id]/series-context`** — thin orchestration. No agent, no writes.
- **`AmbientSeriesPanel` + `useAmbientContext`** — editor sidebar + fetch hook.

### Types (illustrative)

```ts
// ambient-context.ts (pure)
export interface PriorCharacter {
  bookNumber: number; name: string; aliases: string[];
  role: string | null; status: string | null;
  lastMentioned: number | null; description: string | null;
}
export interface PriorThread {
  bookNumber: number; name: string; status: string; relatedNames: string[];
}
export interface StyleMetrics { avgSentenceLen: number; dialogueRatio: number; avgParagraphLen: number; }

export interface AmbientContextInput {
  currentBookNumber: number;
  onStageNames: string[];
  priorBookCharacters: PriorCharacter[];
  openThreads: PriorThread[];
  currentStyleMetrics: StyleMetrics | null;
  seriesBaselineMetrics: StyleMetrics | null;
  baselineBookNumber: number | null;
}

export interface AmbientCharacterView {
  name: string; matchedFrom: string | null;   // alias/token that matched, if != name
  lastBook: number; lastChapter: number | null;
  role: string | null; status: string | null; description: string | null; aliases: string[];
}
export interface ToneMetricView { key: string; current: number; baseline: number; deltaPct: number; material: boolean; }
export interface AmbientContextView {
  characters: AmbientCharacterView[];
  threads: { name: string; fromBook: number; status: string; relatedNames: string[] }[];
  toneDrift: { baselineBook: number; metrics: ToneMetricView[] } | null;   // null → tone panel hidden
  notReady: boolean;   // current-chapter graph empty (not yet extracted)
}

export function buildAmbientContext(input: AmbientContextInput): AmbientContextView;
```

### Matching rules (in the pure resolver)

- **Normalize** each name/alias: lowercase + strip diacritics (`Miloš`→`milos`) — required for the
  Serbian/i18n author segment (roadmap 4.7). Trim, collapse internal whitespace.
- For each `onStageName`, match against every prior character's `name ∪ aliases` (normalized).
- On multiple prior matches, keep the **latest**: `bookNumber` desc, then `lastMentioned` desc.
  `matchedFrom` is set to the on-stage token when it differs from the canonical `name`.
- On-stage names matching nobody prior are **dropped** (they're new to this book — nothing to show).
- **Threads:** keep a prior thread only if its `relatedNames` intersect the on-stage cast
  (normalized). Threads with resolved status are pre-filtered upstream and, defensively, also
  excluded here.
- **Tone drift:** for each metric, `deltaPct = round(100*(current-baseline)/baseline)`; `material`
  = `|deltaPct| >= MATERIALITY_PCT` (default 20). `baseline<=0` or null → skip that metric (no
  divide-by-zero). `currentStyleMetrics` or `seriesBaselineMetrics` null → `toneDrift = null`.

## 4. Data flow (route)

1. `requireUser()`; validate `chapterNumber` query param (zod: coerced positive int). On invalid → 400.
2. Ownership: `db.book.findFirst({ where:{ id, userId }, include:{ series:true } })`. Missing → 404.
3. **Standalone book** (`seriesId == null`): return `{ series:null, ... empty ... }` 200 → sidebar hides.
4. Prior books: `db.book.findMany({ where:{ seriesId, bookNumber:{ lt: current.bookNumber } }, orderBy:{ bookNumber:'asc' } })`.
5. Gather concurrently via `ambient-sources.ts`, **each wrapped in its own try/catch → empty on error**:
   - `getOnStageNames(currentBookId, chapterNumber)` — `chapter-entities`. Empty → `notReady:true`.
   - `getPriorCharacters(priorBookIds)` — per book; a failing book contributes `[]`.
   - `getOpenThreads(priorBookIds)` — `plot-threads` filtered to unresolved.
   - `getStyleBaseline(userId, series)` + `computeChapterMetrics(chapterText)` — pure string stats.
6. `buildAmbientContext(...)` → `AmbientContextView`.
7. Envelope (see §5). `meta.sourcesAvailable` reflects which sources returned without error.

**Never** on this path: agent orchestration, LLM calls, DB writes, synchronous extraction.

## 5. Response envelope

```jsonc
{
  "series": { "id": "…", "title": "…", "seriesType": "TRILOGY", "currentBookNumber": 2 },
  "chapterNumber": 7,
  "characters": [
    { "name": "Milan", "matchedFrom": "the Captain", "lastBook": 1, "lastChapter": 18,
      "role": "supporting", "status": "alive", "description": "distrusted by the council",
      "aliases": ["the Captain", "Milan Kovač"] }
  ],
  "threads": [
    { "name": "What Milan knows", "fromBook": 1, "status": "developing", "relatedNames": ["Milan"] }
  ],
  "toneDrift": {
    "baselineBook": 1,
    "metrics": [ { "key": "avgSentenceLen", "current": 24, "baseline": 18, "deltaPct": 33, "material": true } ]
  },
  "meta": { "notReady": false, "sourcesAvailable": { "graph": true, "vector": true, "style": true } }
}
```
Standalone book → `series:null`, all arrays empty, `toneDrift:null`.

## 6. Degradation matrix

| Source down | Effect |
|---|---|
| No `seriesId` | Whole sidebar hidden (`series:null`), 200 |
| Current-chapter graph empty | `notReady:true`, panels empty, gentle "keep writing" hint |
| One prior book's graph errors | That book's characters omitted; other books render |
| Neo4j entirely down | `characters`/`threads` empty; `meta.sourcesAvailable.graph=false` → UI shows "graph offline" note; tone panel may still render |
| No `StyleProfile`/metrics | `toneDrift:null`, tone panel hidden |
| Qdrant/embeddings down | Only optional enrichment affected; panels still render |

Principle (roadmap): *fake AI insight destroys trust* — the UI distinguishes "offline" from
"genuinely nothing to show" via `meta.sourcesAvailable`, never rendering a fake-empty list.

## 7. UI

- **Toggle:** new `EditorToolbar` entry → `showSeriesContext` on the editor pane store.
  **Auto-hidden when `series===null`** (no dead button on standalone books).
- **Mount:** `lg+` fixed `w-72` right sidebar (`border-l`), same slot as `VersionHistoryPanel`;
  coexists with findings by **segmenting** (findings | series) rather than adding a competing 4th
  column. Mobile/tablet → right `Sheet` (VersionHistorySheet pattern; respects Tier 2.4).
- **`AmbientSeriesPanel`** — 3 collapsible sections, each with independent loading/empty state:
  - **Characters:** name, `lastBook·lastChapter` pill, `role · status`, one-line description,
    and a `matchedFrom` alias line when the matched token ≠ canonical name (match transparency).
  - **Open threads:** name + `fromBook · status`.
  - **Tone:** one advisory chip per *material* metric, styled as **advisory, not a finding**
    (muted, no severity color); never becomes an `EditFinding`.
  - **States:** loading skeleton; `notReady` → "Keep writing — series context appears once this
    chapter's cast is detected"; `graph offline` → muted note (not fake-empty).
- **Data:** `useAmbientContext(bookId, chapterNumber)` — `useQuery`, `staleTime` 5m, `enabled`
  only when panel open **and** `seriesId` present, manual `⟳` refetch; keyed to `chapterNumber`
  from `active-editor-store` so switching chapters re-queries.

**Not in scope:** inline decorations, cross-book deep-links, write-back, autosave auto-refresh.

## 8. Testing

**Unit (Vitest) — the pure resolver carries the load:**
- `ambient-context.test.ts`: exact match; alias match; **latest-book-wins** (B1+B2 → B2);
  case+diacritic-insensitive (`milan`, `Miloš`/`Milos`); unmatched on-stage name dropped;
  no-prior-match → empty (no crash); threads kept only on cast intersection; resolved threads
  excluded; alias-based thread match; drift math; below-threshold metric omitted; `baseline<=0`/null
  → skipped (no div-by-zero); `currentMetrics=null` → `toneDrift:null`; empty inputs → valid empty
  view; malformed prior records don't throw.
- `ambient-sources.test.ts` (mocked graph/db): chapter-entities → names; a prior-book query error
  → `[]` for that book, others still return; unresolved-thread status filter correct.
- `series-context.route.test.ts` (mocked `requireUser`/`db`/sources): 400 invalid `chapterNumber`;
  401 unauthorized; 404 non-owned book; **standalone → `series:null` 200**; happy-path envelope
  shape; **one source throwing → 200 with that panel empty + `meta.sourcesAvailable` flag** (the
  "never 500 the sidebar" invariant); `notReady` when current-chapter graph empty.

**Component (light):** `AmbientSeriesPanel` renders 3 sections from a fixture; `notReady` and
graph-offline copy; hidden when `series:null`; `⟳` triggers refetch.

**Verification gate before "done"** (live DB/graph unreachable in this env — mirrors 4.1/4.2):
`tsc --noEmit` = 0; full Vitest suite green (existing + new); prod build compiles.

**Deferred verification (documented, not silently claimed):** live smoke against real Neo4j/Qdrant
— chapter-switch refresh, alias/i18n name match, multi-book series, graph-offline path.

## 9. Security & correctness invariants

1. **Ownership:** `findFirst({id,userId})`; prior books filtered by `seriesId` under the owned
   (already user-scoped) book → no cross-user leakage.
2. **Read-only / zero-cost:** route triggers no agent, no LLM, no write. (Asserted by test +
   review — no `client.messages.create`, no `db.*.update/create` on this path.)
3. **Failure isolation:** every external source wrapped; a dependency outage yields an empty panel,
   never a 500.
4. **Input validation:** `chapterNumber` zod-validated (positive int) before use in graph queries.
5. **No injection surface:** names flow graph→resolver→JSON only; no user free-text reaches Cypher
   from this route (chapter cast comes from the stored graph, not the request body).

## 10. Files (planned)

New:
- `src/lib/series/ambient-context.ts` (pure resolver) + `ambient-context.test.ts`
- `src/lib/series/ambient-sources.ts` (I/O helpers) + `ambient-sources.test.ts`
- `src/app/api/books/[id]/series-context/route.ts` + `series-context.route.test.ts`
- `src/components/editor/ambient-series-panel.tsx`
- `src/hooks/use-ambient-context.ts`

Modified:
- `src/components/editor/editor-toolbar.tsx` (toggle)
- `src/stores/editor-store.ts` (`showSeriesContext` flag + toggle action)
- `src/components/editor/manuscript-editor.tsx` (panel mount, segment with findings)
- `docs/IMPROVEMENT-ROADMAP.md` (mark 4.3 foundation shipped, on completion)

No schema changes. No migration. Additive only.

## 11. Open follow-ups (deferred, documented)

- **4.4 live continuity net** — reuse `buildAmbientContext` + `ambient-sources` on the autosave
  seam (`computeOnboardingOffers` watcher) with inline ProseMirror `continuity-contradiction`
  decorations and `[Fix here][Go to ChN][Intentional]` (sticky Intentional → WriterMemory
  constraint, closing the 1.4 loop).
- **Thread discovery from `SERIES_ARCHITECTURE`** document parse (graph-only in v1).
- **Cross-book deep-link** navigation to the source chapter.
- **Precomputed series tone-vector** (v1 computes chapter metrics on the fly).
- **BYOK embeddings** (unchanged platform-wide gap; ambient panel degrades cleanly without them).
