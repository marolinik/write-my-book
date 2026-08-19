# fix 7 sub-fix (c) + D-86 — round-3 guard-attack re-verify (verify-fix7c-r3, Fable)

**Verdict: APPROVE — blocking: NO.** Closes the 3-round adversarial cycle on the alias-fold disambiguation.

## Cycle summary
- **Round 1** (guard-attack): REJECT — the retained shared-alias fold still false-folded distinct characters sharing a surname/first-name/epithet/honorific. → fixed with two evidence classes + `isDistinctiveSharedAlias` guard (c) "not a word in both full names".
- **Round 2** (guard-attack): REJECT/BLOCKER — guard (c)'s naive whitespace-split exact-string word compare was defeated by SURFACE FORM (hyphen compounds `Reynolds-Vane` reopened c8/c9; diacritic-stripped `José`/`Jose`; curly/straight apostrophe `O'Brien`; incomplete stop-list/epithet). → fixed by rewriting `nameWords` into a principled normalizer + completing stop-list + extending `isEpithetAlias`.
- **Round 3** (this pass): APPROVE. Behavioral + exact-name/gate-integrity lenses APPROVE in both prior rounds.

## Round-3 confirmation (live-executed via `npx tsx`, real exported predicates, dispatch mirrored :174-186)
`nameWords` pipeline: NFD → strip combining marks [̀-ͯ] → unify apostrophes [‘’ʼ＇]→' → toLowerCase → split /[\s\p{Pd}]+/u → strip edge punct [.,'"!?;:] → drop empties.

- **6 round-2 vectors all STAY SEPARATE:** c16 `Reynolds-Vane` (\p{Pd} split → shared-family-word), c17 `Anne-Marie`/`Marie-Claire` on `Marie`, c18 two `José`s via `Jose` (NFD strip), c19 curly/straight `O'Brien` (apostrophe unify), c20 `Doc` (stop-list), c21 `El Lobo` (extended epithet article alternation).
- **No over-tightening:** c3 `Zoë Rasmussen`←`Z. Rasmussen` STILL folds (`z.`→`z`, never `zoë`); c4 rename-link STILL folds.

## Residuals — all EXOTIC / non-blocking (registered)
- **D-89** (registered fix7c-handoff): two distinct chars sharing a DISTINCTIVE non-name nickname (`Red`/`Ghost`, two bare `Bill`s) false-fold in the 1-candidate arrival-order direction — inherent to class-2, irreducible without dropping the c3 union. Founder-decision flag: class-1-only (kills D-89, loses c3-style convergence) vs class-1+class-2 (current).
- **E1** non-decomposable stroke/slash letters Ł/Ø/Đ/Æ/Œ/ß/Þ (NFD can't fold) — 7-entry translit map if ever wanted.
- **E2** backtick/prime apostrophe not in unify class. **E3** double-quote-embedded epithet alias. **E4** elided Romance article `L'Ombra` (same accepted-ambiguity class as bare nicknames). **E5** foreign familial/rank stop-list tail (`Madre`/`Capitán`) — singular-office, one-holder-per-book, low risk.

None are surface forms the extractor realistically emits (`.trim()`-only sanitize; NFD-common variants now all covered). Trace script: scratchpad/trace-fix7c.ts (rerunnable, imports real module, never connects to Neo4j).
