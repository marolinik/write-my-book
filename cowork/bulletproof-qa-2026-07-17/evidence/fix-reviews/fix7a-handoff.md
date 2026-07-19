# Fix 7 sub-fix (a) — Event-name canonicalization before MERGE (RC-3 / D-32c) — verifier handoff

**Executor:** opus-fix-7a · **Branch:** qa/bulletproof-2026-07-17 · **Mode:** TDD, no-commit, minimal diff.
**Files owned/touched (only these):**
- `src/lib/graph/graph-builder.ts` (+125 / −5)
- `tests/unit/graph-event-name-canonicalization.test.ts` (new, 23 tests)

No touches to `entity-extractor.ts`, `types.ts`, `continuity/**`, `vector/**`, `agents/**`, `graph-maintenance.ts`, or any route (see "Why not entity-extractor/types" below).

## Gates (exact counts)
- `npx tsc --noEmit` → **exit 0**.
- `npx vitest run` → **964 passed / 125 files** (baseline before this fix: **938 / 124**; delta = +26 tests, +1 file, **0 regressions**).
- New file alone: **26 passed** (23 behavior/canonicalizer + 3 canonical-key-poisoning guards from the Fable blocker). RED-first confirmed twice: the initial implementation run was **17 failed / 6 passed** (the 6 = the "must-stay-separate" guards that hold with no implementation); the poison-guard round was **2 failed / 1 passed** pre-strip (a12/a13 RED — poison reached `$updateProps` and repointed the stored key under pessimistic sequential SET semantics).

## Post-verify blocker fix (Fable HIGH — canonical-key poisoning)
Fable's verify surfaced one BLOCKING finding, now fixed on the same uncommitted diff: `canonicalName` is identity-load-bearing (the pre-MERGE lookup folds on `n.canonicalName = $canonicalName`) but was NOT stripped from the LLM-controlled `properties` spread into `allProps` / `$updateProps`. A smuggled `properties.canonicalName` (extractor `record_narrative_graph` properties are unconstrained; `UpdateGraphEntity` is an open object; agents now SEE `canonicalName` on `QueryGraph` results, so a round-trip echo is realistic) would survive `ON MATCH SET n += $updateProps`; the trailing `n.canonicalName = coalesce(n.canonicalName, $canonicalName)` only repairs it under snapshot SET semantics, which **Neo4j does not specify** — under sequential application the coalesce reads the just-written poison and freezes it, then the lookup's `n.canonicalName = $canonicalName` branch deterministically false-merges a genuinely distinct Event (a D8-FP).

**Fix:** added `delete allProps.canonicalName;` beside the existing stable-key deletes (`bookId`/`userId`/`chapter`/`occursInChapter`/`deathChapter`/`aliases`/`status`/`role`/`description`), so the app-derived `canonicalName` is the ONLY writer — exactly how bookId (D-30) and userId (RC-6) are protected in that same block.

**ON CREATE path confirmed clean:** `createProps = { ...allProps }` is built AFTER the strip (so the poison is already gone from the spread), and the Event block then assigns `createProps.canonicalName = canonicalName` (the app-derived value) — a second, independent guarantee. Verified by test `(a12)`: `createProps.canonicalName === "Funeral"` for an input smuggling `canonicalName:"Wedding"`.

Proof tests (`(a12)`–`(a14)`): poison never reaches `$updateProps`/`$createProps`; an ON MATCH re-scan carrying poison cannot repoint the stored key (mock models the **pessimistic** sequential coalesce, so this is a genuine regression test, not one masked by a lenient snapshot emulation); a distinct "The Funeral" carrying `canonicalName:"Wedding"` does NOT fold onto "Wedding", and a later real "Funeral" still converges onto the app-derived key.

---

## The failure (root cause)
The MERGE identity for every entity is the RAW `{bookId, name}` (`graph-builder.ts`, the `MERGE (n:LABEL {bookId: $bookId, name: $name})`). Stochastic extraction refers to one event two ways — the confirmed repro is the extractor prefixing "The" to an existing event name (2/2) — so "The Wedding" and "Wedding" fork into two Event nodes. Both are stamped the same `chapter`, so every `LEADS_TO` becomes chXX→chXX and `timeline_violation` becomes unconstructible. Day-0 drafting already holding both spellings makes this a live D8/D2 hazard.

## The mechanism
For **Event nodes only**, a deterministic pre-MERGE **canonical-resolution** step (mirroring the existing alias-rename lookup right above it) runs before the MERGE:

1. Compute `canonicalName = canonicalizeEntityName(name)`.
2. Enumerate `nameCandidates` = the set `{ name, canonicalName, "The "+canonicalName, "A "+canonicalName, "An "+canonicalName }` — every article-variant spelling that canonicalizes to the same key.
3. Look up an existing Event in **this book** whose stored `canonicalName` equals the incoming canonical **OR** whose stored `name` is one of the candidates:
   ```cypher
   MATCH (n:Event {bookId: $bookId})
   WHERE n.canonicalName = $canonicalName OR n.name IN $nameCandidates
   RETURN n.name AS existingName
   ORDER BY n.firstAppearance, n.name
   LIMIT 1
   ```
4. If a match is found under a **different spelling** (`existingName !== name`), set `mergeName = existingName` (so the MERGE hits that node) and stage the incoming spelling as a folded alias.
5. The MERGE key param becomes `mergeName`; the incoming spelling is unioned into `aliases` (D-27); and `canonicalName` is stamped on the node (ON CREATE) / coalesced (ON MATCH).

Determinism within a batch relies on session read-your-writes — the **same** guarantee the existing alias-rename lookup already depends on (both are reads issued before the MERGE inside the one `withSession`).

## The shape I chose — and why (defended)
**Chosen = a variant of spec shape (1): MERGE stays on the RAW `{bookId, name}`; a derived `canonicalName` property is stored for matching; the original spelling is preserved as `name` and folded variants go into `aliases`.**

This deliberately **does not** change the primary MERGE key. Reasons it beats the alternatives:

- **Shape (2) — "MERGE on normalized name" — forks EXISTING nodes.** A live node stored `name:"The Wedding"` (created before this fix) would, under a normalized-name MERGE, be keyed "Wedding"; the next scan of "The Wedding" normalizes to "Wedding" and **forks** the existing node (or a migration is required). Shape (2) also degrades display fidelity (the primary/display name becomes the article-stripped form). Rejected.
- **Pure shape (1) — "MERGE on `canonicalName`" — forks EVERY existing node** that predates the property (their `canonicalName` is null, so a `MERGE {bookId, canonicalName}` never matches them). Rejected without a migration; and I was told to prefer the shape that avoids migrating existing nodes.
- **My hybrid keeps the raw-name MERGE as the primary key** (so an exact-spelling re-scan always matches — zero forking of existing data, full display fidelity) and adds canonical convergence as an *additional pre-step*. It composes cleanly with the RC-2 coalesce and D-27 alias-union already on the node (the fold routes through the **same** MERGE + ON MATCH clauses, so `chapter`/`occursInChapter`/`deathChapter` stay first-write-wins and aliases stay unioned). `canonicalName` is stamped **going forward**, and **legacy nodes (no `canonicalName`) are still caught by the enumerated article-variant name candidates** and self-heal their `canonicalName` on that match — so the confirmed article failure is fixed for both new and pre-fix data **without a migration**.

## The canonicalizer's exact transform
`canonicalizeEntityName(rawName: unknown): string` (pure, exported):
1. non-string → `""` (never throws);
2. `String.prototype.normalize("NFC")` — combining vs precomposed diacritics converge;
3. `.replace(/\s+/g, " ").trim()` — collapse internal whitespace runs, trim;
4. `.replace(/^(?:the|an|a)\s+/i, "")` — strip **one** leading article, case-insensitive, **only if a non-empty remainder survives** (a one-word title that IS an article, e.g. "The", is preserved).

Idempotent (`canonicalize(canonicalize(x)) === canonicalize(x)`) and deterministic. It does **not** lowercase, stem, or fold possessives.

## Determinism proof (the required tests)
- **Same event two ways in one batch → ONE node** — `(a1)`/`(a1')`/`(a2)`: `[ev("The Wedding"), ev("Wedding")]` (and the reverse, and a 3-variant article+whitespace+NFC batch) collapse to exactly one Event node; the second spelling lands as an alias.
- **Two genuinely-distinct events sharing an article → TWO nodes (no false-merge)** — `(a6)`/`(a6')`: "The Wedding" vs "The Funeral", "The Red Vow" vs "The Blood Vow" stay two nodes (different canonical). `(a6'')`: article-only difference of the SAME name string is the SAME event (spec-accepted for Events — no over-disambiguation).
- **Stored display name + aliases retain original spelling** — `(a7)`/`(a8)`: folded node keeps the first-seen spelling as `name`, canonicalName as the derived key, every variant in `aliases`.
- **Across-batch + legacy bridge** — `(a3)`/`(a5)`: later variant folds onto the existing node; a seeded pre-fix node with NO `canonicalName` is still caught by the article-variant candidates and self-heals.
- **Idempotent re-scan** — `(a4)`: re-scanning the identical spelling does NOT spuriously self-alias.
- **Injection boundary** — `(a9)`: canonical values (incl. a `"}) DETACH DELETE n //` payload) ride as Cypher params; the MERGE key stays `{bookId: $bookId, name: $name}` and the label stays escaped in both the lookup and the MERGE. `escapeLabelForQuery` / `sanitizeRelationshipType` remain applied on every interpolation; nothing regressed.
- Plus 8 pure-canonicalizer unit tests covering each transform, idempotency, and non-string input.

## Event scope does NOT touch Character (or Object) identity — confirmed
The canonical block is gated `if (label === "Event")`. **No canonical lookup is issued and no `canonicalName` is stamped for any non-Event label**, proven by `(a10)`/`(a10')`/`(a11)`:
- "The Prophet" vs "Prophet" as **Characters** stay TWO nodes; no `MATCH (n:Character ... canonicalName ...)` query is ever issued;
- a Character never carries `canonicalName`;
- "The Sword" vs "Sword" as **Objects** stay TWO nodes.

Because the change never alters a Character's MERGE key, `deathChapter` derivation/anchoring, sticky-dead (7b/D-81), the `authoritative` path (D-80), RC-2 coalesce, D-27 union, RC-6 userId, and D-30 book scoping are all byte-intact for Characters. The just-landed graph-builder work (`escapeLabelForQuery`, `sanitizeRelationshipType`, D-63 sanitizer) is untouched — every interpolation still goes through the escaper; the new canonical/candidate values are params. The full 938→961 suite (incl. `graph-entity-property-monotonic`, `continuity-alias-union`, `continuity-graph-properties`, `graph-cross-book-isolation`, `updategraphentity-authoritative`) stays green.

**D-79 interaction:** this change is Event-scoped and never moves a Character's `deathChapter` anchor, so it does not interact with the D-79 continuity-flag anchor or Character identity. Confirmed.

## Deliberate residuals (register these)
1. **D-85 — possessive/genitive forking is NOT folded.** "Corvin Ashe's Death" vs "Death of Corvin Ashe" still fork. Per spec this is error-prone and cannot be done deterministically without risking a false-merge of two distinct events (itself a D8 FP), so it is deliberately out of scope. **= D-85.**
2. **D-86 — relationship endpoints match by literal name (folded-away spelling drops the edge).** `upsertRelationship` MATCHes its two endpoints by literal `{name, bookId}` with no canonical/alias resolution. So a relationship that names the *folded-away* spelling ("Wedding" after "The Wedding" became the stored name) finds no node and the edge is silently dropped (a FN, not a FP). Non-blocking: pre-fix those same edges pointed at a forked/degenerate node and were already useless. Natural home to fix = sub-fix (c) (endpoint identity resolution). **= D-86.**
3. **D-87 — double-article non-idempotency + bare-canonical candidate can fold across canonical keys.** The canonicalizer strips only ONE leading article, so a (rare) double-article input "The The X" canonicalizes to "The X" (not "X") — non-idempotent — and its bare-canonical `nameCandidate` ("The X") can match an existing literal-named "The X" node whose own canonical is "X", folding across canonical keys. LOW (double-article inputs are pathological; the outcome is usually the desired convergence anyway). **= D-87.**
4. **Remainder-case forking (folds under D-85's umbrella).** The canonicalizer strips the *article* case-insensitively but preserves the *remainder* case (no lowercasing — keeps display fidelity and stays within the spec's enumerated transforms: article/NFC/whitespace/trim, no case-fold). So "The wedding" (canonical "wedding") and "The Wedding" (canonical "Wedding") do **not** converge. The confirmed failure (identical-remainder article prefix) IS fixed; remainder-case variance is the rarer residual.
5. **Pre-existing forks are not auto-migrated.** If the live graph already contains two forked nodes ("Wedding" ch2 + "The Wedding" ch5), a new variant folds onto the earliest (`ORDER BY firstAppearance`) and future writes converge there, but the two pre-existing nodes are not merged (no migration ships — matches the D-19/RC-2 FP-A "no migration" reality). Not a false-merge; convergence-going-forward only.
6. **Alias-rename fold path does not stamp `canonicalName`.** An Event folded via the *alias-rename* lookup (the block above, which early-returns a minimal update) is not stamped with `canonicalName`. Harmless: a later variant is still caught by the article-variant `nameCandidates` enumeration (which matches on literal `name`), and the node self-heals `canonicalName` on that match.

**Why not `entity-extractor.ts` / `types.ts`:** the MERGE identity lives solely in `graph-builder.ts`; nothing else needs the canonicalizer for sub-fix (a). It is defined + exported in `graph-builder.ts` (co-located with the MERGE it guards, exported for unit testing) to keep the diff to one source file. If a later sub-fix needs it in the extractor, hoist it then.

## No new false-positive
Every path is biased to preserve/do-nothing under uncertainty: the fold only fires on an exact canonical/candidate match within the same book+label; an exact-spelling match never self-aliases; distinct canonicals never cross; possessive/case folding is refused rather than guessed. The fold can only ever merge two spellings that share the article-stripped/NFC/whitespace-normalized key — which the spec explicitly accepts as the same event.
