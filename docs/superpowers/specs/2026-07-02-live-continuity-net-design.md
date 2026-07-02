# Live In-Book Continuity Net — Design Spec (Tier 4.4)

*Date: 2026-07-02 · Roadmap: `docs/IMPROVEMENT-ROADMAP.md` Tier 4.4. Builds on the Tier 4.3 ambient-series foundation (shipped) and the Tier 4.2 conversational-findings constraint loop (shipped).*

## 1. Goal & scope

As a writer works in a chapter, detect **contradictions with the book's own established state** and surface them as **non-blocking inline flags** shortly after they pause typing — "Ana died in Ch 12 but appears here" — with actions to inspect the source (`[Go to Ch 12]`) or accept it as deliberate (`[Intentional]`, which permanently silences that flag and feeds the learning loop). Detection is **deterministic graph-consistency only** (no LLM in the detector, zero false positives), triggered on writing-idle, and cost-bounded.

**In scope (this pass):**
- A pure **detection/view module** (`continuity-flags.ts`) and a pure **sync planner** (`finding-sync.ts`).
- A thin, best-effort **`POST /api/books/[id]/continuity-scan`** route (throttled extraction → cheap Cypher check → idempotent `EditFinding` sync → return flags).
- A client **idle trigger** + **inline "continuity" annotation type** with a `[Go to Ch N]` / `[Intentional]` tooltip and a quiet live-count indicator.

**Explicitly out of scope (documented, deferred):**
- **Attribute-level detection (rank/title/appearance).** The graph's `CharacterNode` has no rank/title field, so the roadmap's "became a Major in Ch 15" example is **not deterministically detectable**. An LLM/embedding attribute-detector is a clean **phase 2** that can emit the same flag shape into the same route/render/constraint pipeline — the machinery here is built to accept it.
- `orphan_plot_thread` / `character_undocumented` consistency types (they are todos/advisories, not contradictions — the on-demand `continuity-checker` still covers them).
- Auto-suggested rewrite for a contradiction; batch resolve; LLM explanation beyond the deterministic description.

**Success criteria:** after a writer introduces a graph-detectable contradiction and pauses, a distinct inline flag appears on the offending entity within one idle-scan; editing the text away auto-clears it on the next scan; `[Intentional]` silences it permanently; every dependency can fail without a 500 or a wrongly-cleared flag; `tsc` 0, full Vitest green, `next build` compiles. **No schema change / no migration** (additive; reuses existing models).

## 2. Existing machinery this builds on (verified in codebase survey)

| Capability | Location | Reuse |
|---|---|---|
| `runConsistencyChecks(bookId): ConsistencyIssue[]` — 6 pure-Cypher checks, `{type, severity, description, entities[], chapters[]}` | `src/lib/graph/graph-queries.ts:271-429` | The detector (no LLM) |
| `updateFromChapter(bookId, chapterNumber, content)` — hash-diffed, fire-and-forget haiku entity extraction | `src/lib/graph/graph-maintenance.ts:17-61` | Graph refresh (throttled) — **not currently called on save** (net-new wiring) |
| `EditFinding` model — `category`, `severity`, `type`, `description`, `chapterNumber`, `originalText`, `status`, `source` | `prisma/schema.prisma:360-395` | Persist live flags (`category="continuity"`, `source="live"`) |
| `/api/books/[id]/editorial/findings` GET filters by category | `.../editorial/findings/route.ts`, `continuity-tab.tsx` | Live flags also visible in the existing continuity report |
| `upsertConversationConstraint({userId,bookId,findingId,category,content})` (4.2) | `src/lib/agents/writer-memory.ts:219-232` | `[Intentional]` → book-scoped `WriterMemory` constraint |
| Constraint load/format for prompt/filter (4.2) | `src/lib/agents/writer-memory.ts` | Load active continuity constraints to filter scans |
| Annotation decorations + type map + `findTextPositions` | `src/components/editor/annotation-extension.ts` (`AnnotationType`:17, `TYPE_CLASSES`:32, `findTextPositions`:49, `buildDecorations`:97) | New `"continuity"` type + inline anchor |
| Annotation tooltip w/ action buttons + `TYPE_CONFIG` | `src/components/editor/annotation-tooltip.tsx:28-235` | `[Go to Ch N]` / `[Intentional]` variant |
| `findingsToAnnotations(findings)` | `src/components/editor/editor-utils.ts:95-110` | Map continuity findings → inline annotations |
| Autosave-success signal (`setLastSaved`) + `onUpdate` activity | `manuscript-editor.tsx:521`, editor-store | Idle-trigger source |
| `scrollToFinding` + `setScrollToText` + cross-chapter nav (`router.push`) | `manuscript-editor.tsx:803-831`, editor-store:50/159, `manuscript-editor.tsx:424-428` | `[Go to Ch N]` navigation |
| Route skeleton: `requireUser` → `findFirst({id,userId})` → work → envelope | 4.2/4.3 routes | Route pattern + ownership |

**Key constraint discovered:** `CharacterNode` (`src/lib/graph/types.ts:20-29`) tracks `role/status/deathChapter` + relationships/locations/events, **not** rank/title/arbitrary attributes. Detection is therefore scoped to the contradictions the graph actually models (§4). `runConsistencyChecks` is server-only (Neo4j `withSession`) — hence the route.

## 3. Architecture

Four isolated units (mirrors the 4.3 "pure core + thin route + client" shape):

```
save-success / chapter-switch / blur ──idle ~20s──▶ useIdleContinuityScan
        │
   useContinuityScan ──POST──▶ /api/books/[id]/continuity-scan?chapterNumber=N
        │                          │  (route: auth → ownership → updateFromChapter [best-effort, throttled]
        │                          │   → runConsistencyChecks → load intentional constraints + existing live findings
   inline "continuity" flags        │   → toLiveFlags() + planFindingSync() [PURE] → apply create/resolve → envelope)
   (annotation type) + tooltip      ▼
   [Go to Ch N] [Intentional]   LiveFlag[]  ──▶ live-count indicator + inline decorations
```

- **`src/lib/continuity/continuity-flags.ts`** (pure): `continuityIssueSignature(issue)` + `toLiveFlags({issues, currentChapter, intentionalSignatures})`.
- **`src/lib/continuity/finding-sync.ts`** (pure): `planFindingSync({detected, existing})` → `{toCreate, toResolve}`.
- **`POST /api/books/[id]/continuity-scan`**: thin orchestration; the only LLM is the throttled `updateFromChapter`. No agent session.
- **Client:** `useContinuityScan` + `useIdleContinuityScan`; a `"continuity"` annotation type + tooltip variant; a live-count indicator.

### Types (illustrative)

```ts
// continuity-flags.ts (pure)
import type { ConsistencyIssue } from "@/lib/graph/types"; // {type, severity, description, entities[], chapters[]}

export interface LiveFlag {
  signature: string;          // sha1(type + "|" + normalizedDescription)
  type: ConsistencyIssue["type"];
  severity: "critical" | "major" | "minor";
  description: string;        // deterministic, human-readable
  entities: string[];         // for inline anchoring (first entity name)
  currentChapter: number;     // the conflict site (chapter just saved)
  jumpChapter: number | null; // the "other" chapter to inspect ([Go to Ch N]); null for book-level
  anchor: string | null;      // text to anchor the decoration on (entity name); null → indicator-only
}

export function continuityIssueSignature(issue: ConsistencyIssue): string;
export function toLiveFlags(input: {
  issues: ConsistencyIssue[];
  currentChapter: number;
  intentionalSignatures: Set<string>;
}): LiveFlag[];

// finding-sync.ts (pure)
export interface ExistingFinding { id: string; signature: string; }
export function planFindingSync(input: {
  detected: LiveFlag[];
  existing: ExistingFinding[];
}): { toCreate: LiveFlag[]; toResolve: string[] };
```

### `LiveFlag` mapping rules (in `toLiveFlags`)

- **Type filter:** include only `dead_character_reappears`, `location_conflict`, `timeline_violation` (inline) and `relationship_contradiction` (book-level). Exclude `orphan_plot_thread`, `character_undocumented`.
- **Chapter scoping:** keep an issue iff `issue.chapters.includes(currentChapter)`; `relationship_contradiction` has `chapters: []` → always book-level (surfaced in the indicator, `anchor: null`, `jumpChapter: null`).
- **Jump target:** the "other" chapter to inspect —
  - `dead_character_reappears` → the death chapter (min of `chapters`, the earlier one).
  - `timeline_violation` → the earlier event's chapter (the non-current one).
  - `location_conflict` → same chapter (both locations in the current chapter) → `jumpChapter: null` (nothing to jump to; the conflict is here).
- **Anchor:** the first entity name in `entities` (for `findTextPositions` in the current chapter); `null` for book-level.
- **Intentional filter:** drop any flag whose `signature ∈ intentionalSignatures`.
- **Signature:** `sha1(type + "|" + description.trim().replace(/\s+/g," "))`. `runConsistencyChecks` descriptions embed the specific names/chapters and are deterministic, so the same unresolved contradiction hashes identically across scans. Recomputable from a persisted finding's `type`+`description` → no new column.

## 4. Detection — the 4 surfaced contradiction types

| Type | Severity | Inline? | `chapters[]` | Jump target |
|---|---|---|---|---|
| `dead_character_reappears` | critical | yes | `[deathCh, ...postDeathChs]` | death chapter |
| `location_conflict` | major | yes | `[chapter]` | none (conflict is in-chapter) |
| `timeline_violation` | critical | yes | `[earlierCh, laterCh]` | earlier chapter |
| `relationship_contradiction` | major | book-level (indicator only) | `[]` | none |
| `orphan_plot_thread` | — | **excluded** (advisory todo) | — | — |
| `character_undocumented` | — | **excluded** (bible todo) | — | — |

Deterministic, pure Cypher, zero false positives. Attribute-level (rank/title) is deferred to phase 2 (§1).

## 5. Trigger & cadence

**Idle trigger (`useIdleContinuityScan`):** subscribes to the editor's save-success (`setLastSaved`) + `onUpdate` activity; debounces **~20s after the last keystroke**, then fires one scan. Also fires on **chapter switch** and **window blur**. In-flight scans coalesce (a trigger during a running scan queues at most one follow-up). Never blocks typing.

**Extraction throttle (cost guard):**
1. `updateFromChapter` already **hash-skips** unchanged content (a scan after pure navigation costs $0).
2. **Min-interval guard (route-side):** skip re-extraction if the chapter's graph node was updated < ~90s ago (use the node's existing `contentHash`/`updatedAt`). The **cheap Cypher check runs on every scan regardless**, against current graph state, so flags stay responsive even while extraction is throttled.

Worst case ≈ one haiku extraction per ~1.5 min of active writing on a chapter — within the Tier 2.3 budget envelope. The route triggers no agent session.

## 6. Idempotent finding sync & the `[Intentional]` loop

Per successful scan, the route:
1. Loads existing live findings: `EditFinding` where `bookId, category="continuity", source="live", status ∈ {open/active}` → `{id, type, description}` → recompute each signature.
2. `planFindingSync(detected, existing)` → `{toCreate, toResolve}` by signature diff.
3. **Create** each `toCreate`: `EditFinding` (`category:"continuity"`, `source:"live"`, `severity`, `type`, `description`, `chapterNumber: currentChapter`, `originalText: anchor`). Create is an upsert-by-signature-query (fetch-or-create) so concurrent scans can't duplicate.
4. **Resolve** each `toResolve` id: set status resolved/dismissed (soft — preserves history, drops from the active query, clears the decoration).

**`source:"live"` fences the live path from the on-demand `continuity-checker`** (same `category`, different `source`) — resolve queries filter `source:"live"`, so a live scan can never resolve an editorial or on-demand finding.

**`[Intentional]`** (reuses 4.2 verbatim): client calls the existing dismiss→constraint path → `upsertConversationConstraint({ userId, bookId, findingId, category:"constraint", content:"Continuity: <description> is intentional — do not re-flag." })` → `WriterMemory` (book-scoped, `source:"conversation"`). The next scan loads active continuity constraints, derives their signatures, and `toLiveFlags` filters them out. No new constraint code; feeds the Tier-1.4 learning loop.

**Resolve-only-on-success:** finding resolution runs **only** after a fully successful scan (extraction-optional, but `runConsistencyChecks` succeeded). A transient error → return `{flags:[]}` **without** resolving anything, so a Neo4j blip can never silently clear a real contradiction.

## 7. Inline flag UX, actions & auto-resolution

- **Distinct treatment:** new `"continuity"` `AnnotationType` + `anno-continuity` class (a distinct amber/orange underline, visually unlike editorial severity styles) — reads as "the world-model noticed," not "an editor marked up prose." Anchors to the entity name's occurrence in the current chapter (`findTextPositions` on `originalText`); if not found (pronoun-only), falls back to the indicator.
- **Live-count indicator:** a quiet badge near the toolbar panel toggles ("⚠ N continuity"), surfacing book-level flags (`relationship_contradiction`) that can't anchor inline, and a click target to list them. Silent when clean; a subtle "scanning…" affordance while a scan runs.
- **Tooltip actions** (continuity variant of `annotation-tooltip.tsx`): plain-language contradiction + `[Go to Ch N]` (`router.push` to the jump chapter + `setScrollToText(entityName)`) and `[Intentional]` (§6). **No `[Fix here]` button** — the writer is already in this chapter; fixing = editing the text, which **auto-resolves** the flag on the next scan (contradiction leaves the graph → `planFindingSync` resolves the finding → decoration disappears). Auto-resolution is the primary fix path; buttons are inspect + accept.
- **Non-blocking:** flags never modify text, never steal focus, never open a modal; passive decorations + on-demand tooltip; inherits the annotation overlay's mobile behavior.

## 8. Degradation, security & invariants

**Degradation (best-effort, never a user-facing error):**

| Failure | Effect |
|---|---|
| Extraction (`updateFromChapter`) throws | skip extraction; still run the check on current graph; flags may lag. |
| haiku over budget (Tier 2.3) | extraction skipped; check runs; no error surfaced. |
| `runConsistencyChecks` throws | `{flags:[]}` 200; **no finding resolve** (resolve-only-on-success). |
| Intentional-constraint load fails | treat as none (fail toward showing, never crash). |
| No graph yet (new writer) | zero issues → silent. |

**Security / correctness invariants:**
1. **Ownership:** book via `findFirst({id, userId})`; chapter via `{bookId, chapterNumber}` — no cross-user access.
2. **Write-fencing:** every `EditFinding` create/resolve is scoped to the owned book and `source:"live"`; resolve filters `source:"live"` → can never touch editorial/on-demand findings. `WriterMemory` writes are book-scoped.
3. **Input validation:** `chapterNumber` zod-validated (positive int) before any graph/db use.
4. **No injection surface:** detector is pure Cypher over the stored graph; the only free text is the deterministic description; the `[Intentional]` constraint string is server-composed (agent never controls it — mirrors 4.2).
5. **Cost-bounded:** extraction ≤ once/90s/chapter; no agent session.
6. **Resolve-only-on-success:** a partial/errored scan resolves nothing.

## 9. Testing

**Unit (Vitest, node env — the logic lives in the two pure modules + the route):**
- `continuity-flags.test.ts`: signature determinism/stability + differs-by-type/description; current-chapter filter; book-level (empty `chapters`) surfaced not dropped; intentional-signature filter; type inclusion (3 inline + 1 book-level) / exclusion (`orphan_plot_thread`, `character_undocumented`); jump-target mapping (death-reappears→death chapter, timeline→earlier, location→null); anchor = first entity / null for book-level.
- `finding-sync.test.ts`: new→`toCreate`; still-detected→neither; gone→`toResolve`; empty detected + existing→all resolve; empty/empty→no-op; identical re-scan→no duplicate create.
- `continuity-scan-route.test.ts` (mock `requireUser`/`db`/`updateFromChapter`/`runConsistencyChecks`/`upsertConversationConstraint`): 401/404/400; happy path (detect→create→return); extraction throws → check still runs 200; `runConsistencyChecks` throws → `{flags:[]}` 200 **and no resolve calls**; resolve query fenced to `source:"live"` (seeded editorial finding untouched); intentional constraint → flag filtered + not re-created; two identical scans → one create (idempotent).

**Component:** none (node-env suite, consistent with 4.1–4.3) — panel/annotation wiring gated by `tsc` + `next build`.

**Verification gate before "done":** `tsc --noEmit` 0; full Vitest green (existing + new); `next build` compiles.

**Deferred verification (documented, not claimed):** live smoke vs real Neo4j — a death-reappears flag appearing on idle; `[Go to Ch N]` navigation; `[Intentional]` round-trip clearing the flag; extraction-throttle cost behavior.

## 10. Files (planned)

New:
- `src/lib/continuity/continuity-flags.ts` + `tests/unit/continuity-flags.test.ts`
- `src/lib/continuity/finding-sync.ts` + `tests/unit/finding-sync.test.ts`
- `src/app/api/books/[id]/continuity-scan/route.ts` + `tests/unit/continuity-scan-route.test.ts`
- `src/hooks/use-continuity-scan.ts` (+ `useIdleContinuityScan`)
- `src/components/editor/continuity-indicator.tsx` (live-count badge)

Modified:
- `src/components/editor/annotation-extension.ts` (`"continuity"` type + class)
- `src/components/editor/annotation-tooltip.tsx` (`[Go to Ch N]` / `[Intentional]` variant + `onIntentional`)
- `src/components/editor/manuscript-editor.tsx` (mount indicator + idle trigger + map flags→annotations + action handlers)
- `docs/IMPROVEMENT-ROADMAP.md` (mark 4.4 shipped, on completion)

**No schema change. No migration. Additive only** (reuses `EditFinding` + `WriterMemory`).

## 11. Open follow-ups (deferred, documented)

- **Phase 2 — attribute-level detection** (rank/title/appearance) via a cheap LLM/embedding pass emitting the same `LiveFlag` shape into this route/render/constraint pipeline. Catches the flagship "became a Major in Ch 15" case.
- Surfacing `orphan_plot_thread` as a gentle 4.3-style "unresolved thread" nudge (distinct from contradictions).
- A per-book "pause live continuity" toggle for writers who want silence during drafting.
- Extraction-freshness UX (show when the graph was last refreshed for a chapter).
