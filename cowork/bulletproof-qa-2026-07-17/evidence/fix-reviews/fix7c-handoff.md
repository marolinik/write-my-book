# Fix 7 sub-fix (c) — alias-merge disambiguation — AND D-86 Event relationship-endpoint resolution — verifier handoff

**Executor:** opus-fix-7c · **Branch:** qa/bulletproof-2026-07-17 · **Mode:** TDD, no-commit, minimal diff.
**Files owned/touched (only these):**
- `src/lib/graph/graph-builder.ts` (alias-rename block rewritten; exact-name guard added; D-86 resolver added + hoisted; helpers split)
- `tests/unit/graph-alias-merge-disambiguation.test.ts` (15 tests — sub-fix c)
- `tests/unit/graph-event-rel-endpoint-resolution.test.ts` (5 tests — D-86)

No touches to `entity-extractor.ts`, `types.ts`, `continuity/**`, `vector/**`, `agents/**`, `graph-maintenance.ts`, any route.

## Gates (exact counts)
- `npx tsc --noEmit` → **exit 0**.
- `npx vitest run` → **1005 passed / 129 files** (0 failed). This executor's owned files: `graph-alias-merge-disambiguation` **21 passed**, `graph-event-rel-endpoint-resolution` **5 passed**. (My own-scope delta across the two hardening rounds: +8 then +6 = +14 tests; the remaining full-suite growth beyond that is concurrent teammates' test files landing in the same working tree — not this scope, and 0 regressions.)
- RED-first, round 1 (Fable c-fold-safety): the 8 fold-safety/exact-name tests `(c8)`–`(c15)` FAIL against the first-cut source (fold false-folds siblings; `OR n.name = $name` absent) and PASS after.
- RED-first, round 2 (Fable guard-attack): the 6 surface-form tests `(c16)`–`(c21)` FAIL against the surface-naive primitive (verified by reverting `nameWords`/`isEpithetAlias`/stop-list to their pre-round-2 forms on a byte-exact backup — all 6 RED — then restoring, SHA256 identical) and PASS after. `(c1)`–`(c15)` stay green throughout (no over-tightening).

---

# PART 1 — sub-fix (c): alias-merge disambiguation (Fable c-fold-safety hardened)

## The blocker Fable found (confirmed via dynamic probe)
The first-cut fold trigger was "1 candidate + ≥1 distinctive (non-stop) linking token", where a linking token could be a **shared THIRD alias**. That false-folds two DISTINCT characters that merely share a distinctive-LOOKING but actually-common descriptor — each has exactly ONE candidate, so the ≥2-count guard can't help:
- shared **surname**: `Elena Reynolds` + `Marcus Reynolds` both aliased `Reynolds` (siblings)
- shared **first name**: two distinct `Anna`s (stop-list has zero given names)
- shared **epithet**: `the Stranger`, `the Priestess`
- shared **rank/honorific** not in stop-list: `Sheriff`, `Señor`
The extractor prompt designs surname/first-name/nickname aliases, so this is the PRIMARY pipeline path; the P3 family-saga persona hits it constantly. A folded character is lost irreversibly.

## Root principle
Fold via alias requires **STRONG identity evidence (a genuine rename)**, NOT a coincidental shared descriptor/family token. The stop-list alone is insufficient for names (unbounded space).

## Fold decision AFTER (two evidence classes; else DO NOTHING)
Pre-MERGE lookup (no `LIMIT`, returns ALL candidates + `existingAliases`, now also `OR n.name = $name`):
```cypher
MATCH (n:LABEL {bookId: $bookId})
WHERE n.name IN $aliases OR any(a IN coalesce(n.aliases, []) WHERE a IN $aliases) OR n.name = $name
RETURN n.name AS existingName, coalesce(n.aliases, []) AS existingAliases
ORDER BY n.firstAppearance, n.name
```
Fold fires only when **no exact-name node is present AND exactly ONE candidate** AND ONE of:

1. **NAME↔ALIAS rename link** (`renameLinkTokens`, gated by `!isCommonAlias`): the candidate's stored NAME is one of our incoming aliases, OR our incoming NAME is a stored alias of the candidate. A bare common title never qualifies, so `Doctor`↔`Doctor` (c5) does not fold.
2. **DISTINCTIVE shared alias** (`isDistinctiveSharedAlias`): a handle both list that is (a) not a common title/honorific, (b) not an epithet (leading article), and (c) NOT a word appearing in BOTH full names. Guard (c) is the unbounded-name-space defense a stop-list can't provide: it keeps two `Reynolds` siblings / two `Anna`s separate, while still folding a diacritic variant (`Zoë` links `Zoë Rasmussen` ← `Z. Rasmussen` because `Zoë` is a word in only ONE of the two names).

The **weak "two nodes share a third alias" rename link was DROPPED entirely** — that path is what folded Reynolds/Anna/Sheriff/Señor. A shared alias now only folds through the guarded class (2) above.

### exact-name blindness fix (HIGH)
`hasExactNameNode` was blind to an exact-name node whose stored aliases don't intersect the incoming aliases → a pre-existing `Marcus Reynolds` node could be redirected onto `Elena Reynolds`. Added `OR n.name = $name` (with `$name` param) to the lookup WHERE; the exact node is excluded from `candidates` by the `existingName !== name` filter, so it just trips `hasExactNameNode` and the whole fold block is skipped (the MERGE hits its own node).

### helpers (small, pure, exported for unit test)
- `renameLinkTokens(incomingName, incomingAliases, candidate)` — the two NAME↔ALIAS tokens only (no shared-third-alias).
- `isEpithetAlias(token)` — leading `the/a/an ` ⇒ epithet.
- `isDistinctiveSharedAlias(token, incomingName, existingName)` — the class-(2) predicate (common/epithet/both-names guards).
- `isCommonAlias(token)` — unchanged logic; `COMMON_ALIAS_STOPWORDS` extended with the bounded rank/honorific vocab (`sheriff`, `marshal`, `constable`, `deputy`, `magistrate`, `señor/senor/señora/…`, `herr`, `frau`, `doktor`, `monsieur`, `signor/…`, `don`, `doña`, `san`, `sama`, `sensei`, `sahib`, `sheikh`, …) AND the colloquial fiction forms Fable's guard-attack round named: `doc`, `cap`, `sarge`, `coach` (office); `padre`, `vicar`, `parson`, `chaplain`, `friar`, `monk`, `nun`, `elder` (clergy); `ma`, `pa`, `pop(s)`, `gran`, `grand(d)ad`, `nan(a/na)`, `mommy/mummy`, `daddy`, `bro`, `sis` (familial). The stop-list comment was corrected — a MISSING entry ENABLES a false fold (reads as distinctive), it does not merely "decline to merge".

### surface-form hardening (Fable guard-attack, round 2)
`nameWords` (the guard's word-compare primitive) and `isEpithetAlias` were surface-naive and defeatable. Both are now principled:
- `nameWords` runs one normalized pass: NFD-decompose + strip combining marks (so `José`≡`Jose`, `Zoë`≡`Zoe`); unify apostrophe forms U+2018/2019/02BC/FF07→U+0027 (so curly-vs-straight `O'Brien` unify); split on unicode whitespace **and all dashes** `\p{Pd}` (so `Reynolds-Vane`→`[reynolds,vane]`, `Anne-Marie`→`[anne,marie]`); lowercase; strip surrounding punctuation; drop empties. This only ever ADDS word-matches → can only make the guard DECLINE more folds (fail-safe); c3's `Zoë`←`Z. Rasmussen` fold is unaffected (`zoe` is still a word in only ONE of the two names — proven green).
- `isEpithetAlias` now matches leading English + Romance/Germanic/Italian articles (`the|a|an|el|la|los|las|le|les|der|die|das|il|lo|gli`), so `El Lobo` / `La Sombra` / `Der Wolf` are recognized as epithets.

### D-27 union preserved on fold path (diacritic never lost)
Fold SET is append-only union of `name` + every incoming alias into the surviving node (nothing dropped); proven by `(c3)`: `["Zoë","Zoe"]` + incoming `["Zoë"]` → `["Z. Rasmussen","Zoe","Zoë"]`, one node.

## Proof tests (sub-fix c) — 15
- `(c1)` shared title `Doctor` (two chars) → SEPARATE.
- `(c2)` distinctive alias shared by TWO existing nodes → separate (count guard).
- `(c3)` distinctive shared-alias fold NEVER drops a stored diacritic variant (D-27). **(regression pin)**
- `(c4)` genuine name-anchored rename (`Corvin` → `Corvin Ashe` aka `Corvin`) still binds, no duplicate. **(regression pin)**
- `(c5)` name-anchored match on a COMMON title (`Doctor`) still does NOT fold.
- `(c6)` structural: lookup has no `LIMIT 1`, returns `existingAliases`.
- `(c7)` injection: alias/name values ride as params; label escaped; book bound.
- `(c8)` shared SURNAME `Reynolds` (siblings) → SEPARATE. **(Fable RED driver)**
- `(c9)` shared FIRST-NAME `Anna` → SEPARATE. **(Fable RED driver)**
- `(c10)` shared EPITHET `the Stranger` → SEPARATE. **(Fable RED driver)**
- `(c11)` shared RANK `Sheriff` → SEPARATE. **(Fable RED driver)**
- `(c12)` shared non-English honorific `Señor` → SEPARATE. **(Fable RED driver)**
- `(c13)` structural: lookup contains `OR n.name = $name` and passes the `name` param. **(HIGH RED driver)**
- `(c14)` exact-name node with NO intersecting aliases self-binds, not folded onto a DISTINCTIVE alias-sibling (`Nightingale`) — isolates the exact-name guard from guard (c). **(HIGH RED driver)**
- `(c15)` team-lead scenario: exact `Marcus Reynolds` (no aliases) + `Elena Reynolds` aka `Reynolds` + incoming `Marcus Reynolds` aka `Reynolds` → Marcus binds to himself. **(HIGH RED driver)**
- `(c16)` hyphen-compound SURNAME (`Reynolds-Vane` vs `Reynolds`) → SEPARATE. **(guard-attack BLOCKER RED driver)**
- `(c17)` hyphen-compound FIRST-NAME (`Anne-Marie`/`Marie-Claire`, shared `Marie`) → SEPARATE. **(guard-attack RED driver)**
- `(c18)` two `José`s linked only by diacritic-stripped `Jose` → SEPARATE. **(guard-attack RED driver)**
- `(c19)` two `O’Brien`s whose names use a curly apostrophe → SEPARATE. **(guard-attack RED driver)**
- `(c20)` colloquial title `Doc` shared by two chars → SEPARATE. **(guard-attack RED driver)**
- `(c21)` non-English epithet `El Lobo` shared by two chars → SEPARATE. **(guard-attack RED driver)**

---

# PART 2 — D-86: Event relationship-endpoint resolution

`upsertRelationship` MATCHed endpoints by literal `{name, bookId}`, so after sub-fix (a) folds an Event variant onto a surviving node, a same-batch relationship naming the folded-away spelling MATCHed nothing and the edge (LEADS_TO timeline edge) was silently dropped (FN).

## design (mirrors sub-fix (a)'s guards)
Read-only helper `resolveEventEndpointName(session, bookId, name)` runs BEFORE the endpoint MATCH, for `Event` endpoints only (Character/Object pass through literally):
```cypher
MATCH (n:Event {bookId: $bookId})
WHERE n.canonicalName = $canonicalName OR n.name IN $nameCandidates
RETURN n.name AS existingName
ORDER BY n.firstAppearance, n.name
LIMIT 1
```
`canonicalName = canonicalizeEntityName(name)`, `nameCandidates = dedupe([name, canonicalName, "The "+canonicalName, "A "+canonicalName, "An "+canonicalName])` — byte-identical to sub-fix (a)'s pre-MERGE lookup. Returns the surviving node's stored name, else the literal name.

Guards: never creates a node (pure MATCH); never cross-folds distinct events (canonical-key/article-variant match only); `{bookId}`-scoped, `Event` label literal, all values params; relationship MATCH…MERGE query string byte-intact (only `$fromName`/`$toName` VALUES are now resolved names).

**LOW fix (Fable d86 lens):** the two `resolveEventEndpointName` awaits were moved INSIDE `upsertRelationship`'s `try` so a transient driver error while resolving one endpoint skips only THAT edge instead of aborting the rest of the relationship batch.

## Proof tests (D-86) — 5
- `(d86-1)` `"The Wedding"` endpoint attaches to stored `"Wedding"`.
- `(d86-2)` reverse: `"Wedding"` attaches to stored `"The Wedding"`.
- `(d86-3)` genuinely-unknown `"The Funeral"` endpoint → 0 edges (no crash, no node created).
- `(d86-4)` Character endpoint stays literal (Event-scoped resolver).
- `(d86-5)` resolver rides an injection payload in `$nameCandidates` param, never interpolated.

---

## Non-regression (just-landed work byte-intact except intended changes)
Full 964→984 suite green, incl. sub-fix (a) `graph-event-name-canonicalization` (26, incl. a12/a13 pessimistic-coalesce poison guards), sub-fix (b) monotonic merge, D-27 `continuity-alias-union`, D-80/D-83 authoritative, D-30 `graph-cross-book-isolation`, D-63 `graph-rel-type-sanitization`, RC-2/D-19 continuity properties, empty-extraction-poison. MERGE identity stays raw `{bookId, name}`; every interpolation still goes through `escapeLabelForQuery`/`sanitizeRelationshipType`; new values ride as params.

## Deliberate residuals (register)
1. **D-88 — distinctive alias legitimately shared by ≥2 existing nodes is never folded** (count guard = preserve-over-guess; a later authoritative `UpdateGraphEntity` can reconcile).
2. **D-89 (NEW) — two genuinely-distinct characters sharing a DISTINCTIVE non-name nickname false-fold in the 1-candidate direction.** When both a `Red`/`Ghost` (or two unrelated `Bill`s stored under bare first-name nodes) already exist, the count guard keeps them apart; but when the SECOND arrives before its own node exists, there is exactly ONE candidate and the shared nickname is distinctive (not a title, not an epithet, not a word in both full names), so class-2 folds it. This is **PERMANENT and self-reinforcing** (the merged node accretes both characters' facts; later scans see one node). It is **IRREDUCIBLE in code without dropping class-2 entirely** — and dropping class-2 would kill the legitimate c3 `Zoë Rasmussen`←`Z. Rasmussen` diacritic-union fold. **Founder-decision flag:** the underlying tension is *class-1-only* (fold ONLY on a NAME↔ALIAS rename — eliminates D-89 but loses pure diacritic/spelling-variant convergence like c3) *vs. class-1+class-2* (current — converges c3 but accepts the D-89 nickname-collision risk). Not resolvable by the executor; needs a product ruling on which failure is cheaper for the P3 series surface.
3. **Common-title / epithet renames are declined, not merged** — a character introduced ONLY as a bare title/epithet (`the Doctor`) and later revealed under a full name stays two nodes. Preserve-over-guess; a genuine full-name rename still folds. (D-88 family.)
4. **Shared-name-word guard is per-word exact-match** — a rare same-person case whose only link is a shared surname that is ALSO in both display names (e.g. a maiden-name reveal) is declined. Preserve-over-guess.
5. **D-86 resolver does not migrate pre-existing edges** — it fixes new same-batch edges only (consistent with sub-fix (a)/RC-2's no-migration stance).

The whole path is biased to preserve/do-nothing under uncertainty: the alias fold fires only on exactly one candidate, with either a distinctive NAME↔ALIAS rename link or a distinctive shared alias that is not a title/epithet/shared-name-word, and never when an exact-name node exists; the D-86 resolver only resolves onto a node sharing the incoming's canonical key and otherwise leaves the literal name so the edge simply doesn't attach. **Next free defect ID after this handoff: D-90** (D-89 registered above).
