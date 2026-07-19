# W-D fix 7 (RC-3) — verifier-facing handoff

One section per sub-fix. Each records before/after semantics, the chosen design,
the ON MATCH clause written, proof tests, and every deliberate residual.

Sub-fixes (a) event-name canonicalization, (c) alias disambiguation, and (d)
deathChapter anchor are separate later dispatches — NOT implemented here.

---

## Sub-fix (b) — protect role/status/description from blanket-overwrite (D-32a)

Owner: opus executor. Files touched (only these):
- `src/lib/graph/graph-builder.ts` (impl)
- `tests/unit/graph-entity-property-monotonic.test.ts` (new, 11 tests)

### Before / after

**Before.** `upsertSingleEntity` built a single `allProps` map (`...properties`,
plus bookId/contentHash/lastMentioned/updatedAt) and applied it as
`ON MATCH SET n += $updateProps` — a **blanket overwrite** of `role`, `status`,
and `description` on every scan. A single stochastic extraction emitting
`status:"transformed"` overwrote a prior `status:"dead"`, so
`dead_character_reappears` (graph-queries.ts:440, gate `WHERE c.status = "dead"`)
went false and NO flag fired until a lucky later scan re-asserted `"dead"`. Same
class of churn silently rewrote `role` (e.g. `protagonist`→`minor`) and
`description` (paraphrase churn hurting D8 signature precision) on every re-scan.

**After.** `role`, `status`, `description` are pulled OUT of the blanket
`+= $updateProps` map (joining chapter/occursInChapter/deathChapter/aliases/userId,
which were already handled). They are written verbatim on `ON CREATE`, and on
`ON MATCH` follow deterministic rules:

- **status — `dead` is a STICKY terminal state.** A later
  `transformed`/`alive`/`unknown` scan cannot downgrade a node already recorded
  dead. A genuine first-time death still lands (a non-dead node adopts the
  incoming status). `dead` is the *only* status value protected.
- **role / description — preserve-first-non-empty.** The first scan supplying a
  non-empty value wins; later scans neither overwrite nor unbounded-append.

Everything NOT in {role, status, description, chapter, occursInChapter,
deathChapter, aliases, userId} still keeps `+= $updateProps`.
`lastMentioned`/`updatedAt`/`contentHash` keep refreshing every scan (verified by
test b5). The RC-2 coalesce/CASE clauses for chapter/occursInChapter/deathChapter/
aliases are byte-intact — untouched.

### The ON MATCH clauses written

Appended to `onMatchStableItems` (so they join, not replace, the existing
`ON MATCH SET n += $updateProps, <stable items>`), each guarded by whether the
incoming scan supplied a non-empty value (`isNonEmptyString`):

```cypher
n.status = CASE WHEN n.status = "dead" THEN n.status ELSE $incomingStatus END
n.role = CASE WHEN n.role IS NULL OR n.role = "" THEN $incomingRole ELSE n.role END
n.description = CASE WHEN n.description IS NULL OR n.description = "" THEN $incomingDescription ELSE n.description END
```

Values ride as Cypher params (`$incomingStatus` / `$incomingRole` /
`$incomingDescription`), never string-interpolated — the D-63 injection boundary
(`escapeLabelForQuery` on the label, param-only values) is unchanged (test b6).

### Why `dead` can't regress AND genuine death still lands

- **Existing node is `dead`** → the CASE takes the THEN branch → keeps
  `n.status` = `"dead"` regardless of the incoming value. The
  `dead_character_reappears` gate stays armed with no re-arm needed.
- **Existing node is NOT `dead`** (alive/unknown/absent) → the CASE takes the
  ELSE branch → adopts `$incomingStatus`. A first real `alive→dead` transition
  writes `"dead"`, and `deriveEntityGraphProps` stamps `deathChapter` via the
  untouched `coalesce(n.deathChapter, $chapter)` clause. So the flag arms on the
  first death exactly as before.

Design choice — why `dead`-only and not a full state machine: the continuity
checks read exactly one Character status literal (`"dead"`, graph-queries.ts:440);
no other Character-status transition is read by any check. Per the guiding rule
(reduce non-determinism WITHOUT inventing states), only `dead` is encoded.
Object statuses (`intact|destroyed|lost|transformed`) and PlotThread statuses
(`introduced|developing|…`, read by `orphan_plot_thread`) are never `"dead"`, so
the same clause always takes the ELSE branch for them → their scan-to-scan update
behaviour is unchanged (test b2'' pins non-terminal Character updates too).

Design choice — role/description preserve-first-non-empty (not only-upgrade):
**CORRECTION (was wrong in the original handoff).** `description` is read by no
continuity gate, but `role` IS read by exactly one: `character_undocumented`
(graph-queries.ts:344-346, `WHERE c.role = "mentioned" AND c.description IS
NULL`). The prior claim "neither is read by a continuity gate … never a flag
WHERE" was incorrect for `role`. This is non-fatal for sub-fix (b) proper
(character_undocumented is `minor` and is neither INLINE nor BOOK_LEVEL, so it is
dropped by `toContinuityFlags` and never surfaces as a writer-facing flag), but
it means preserve-first must treat the placeholder `"mentioned"` as
empty-equivalent so a later documented role can still upgrade — see the
`character_undocumented role-freeze` companion section below. Otherwise the
rationale stands: free-form LLM role strings can't be ranked deterministically
without guessing, and the guiding rule is "prefer preserve over guess", so
first-non-empty (with `"mentioned"` empty-equivalent) is the deterministic,
bounded rule. `description` uses the same rule (bounded, no append growth).

### Proof tests (`graph-entity-property-monotonic.test.ts`, 11/11 green; RED-first)

RED baseline against unmodified code: 6 of 11 failed (every sticky/preserve
assertion), 5 passed (paths not depending on stickiness). After fix: 11/11.

- **b1** — `dead` (ch4) SURVIVES a subsequent `transformed` scan (ch7): stored
  `status="dead"`, `deathChapter=4`, gate armed; the downgrading scan's
  `updateProps.status` is `undefined` and the query carries the sticky CASE.
- **b1'** — `dead` also survives an `alive` scan (resurrection churn can't disarm).
- **b2** — genuine first death lands: `alive`(ch2)→`dead`(ch6) ⇒ `status="dead"`,
  `deathChapter=6`, gate armed.
- **b2'** — posthumous already-dead on ON CREATE lands (`deathChapter` coalesce
  clause still present).
- **b2''** — non-terminal status still updates freely (`alive`→`unknown`).
- **b3** — role preserve-first: later `minor` cannot overwrite `protagonist`.
- **b3'** — role backfills when the first scan omitted it, then sticks.
- **b4** — description preserve-first: no paraphrase churn across re-scans.
- **b5** — role/status/description absent from `updateProps`, present on
  `createProps`; `lastMentioned`/`contentHash`/`updatedAt` still refresh.
- **b6** — new fields flow as params (`$incomingStatus`), label MERGE key still
  escaped; a malicious status value never appears in query text.
- **b7** — re-running the identical dead scan is idempotent (no churn).

Full regression: `npx tsc --noEmit` exit 0; `npx vitest run` = **920 passed /
122 files, 0 failed** (baseline 909/121 → +11 new, zero pre-existing regressions).
D-31 poison contract, RC-2 story-time coalesce/CASE, RC-6 tenant stamps, and D-63
sanitizer tests all stayed green.

### Deliberate residuals (not defects — preserve/do-nothing choices)

1. **Legitimate in-story resurrection surfaces a dismissible flag.** With `dead`
   sticky, a character the author genuinely brings back (e.g. narratively
   "transformed") keeps `status="dead"`, so `dead_character_reappears` will flag
   their later participation for author confirmation rather than silently
   suppressing it. This is the intended trade (surface > silent miss) and matches
   the spec's "dead must be sticky". Not a defect.
2. **Non-canonical status casing is out of scope.** Stickiness matches the exact
   literal `"dead"` the check reads; a prior scan that wrote `"Dead"` never armed
   the check in the first place, so it is neither protected nor newly broken here.
   Any status-normalization work belongs to a future dispatch, not sub-fix (b).
3. **role/description first-non-empty can lock an early mislabel.** If the very
   first scan mislabels role with a *real* value (`minor` before any
   `protagonist` mention) or gives a weak description, that value persists.
   (The placeholder `"mentioned"` is the one exception — it is empty-equivalent
   and upgradeable; see the companion section.) Acceptable: `description` gates
   no check, `role` gates only the dropped-before-surfacing `character_undocumented`,
   and a DELIBERATE fix always lands via authoritative UpdateGraphEntity (D-80).
   "prefer preserve over guess" is the stated rule for stochastic scans.

---

## Companion bundle (D-79 / D-80 / D-81 / 'mentioned' / D-82)

A 4-lens adversarial panel confirmed sub-fix (b)'s CORE is sound and must be
KEPT, but found that making `dead` sticky exposed two pre-latent, now-reachable
BLOCKING defects. These land in the SAME batch, built ON TOP of (b) (its clauses
are byte-intact; only the label/authoritative branching and the 'mentioned'
empty-equivalent were added around them).

Owner: opus executor. Files touched (companion): `src/lib/graph/graph-builder.ts`,
`src/lib/continuity/continuity-flags.ts`, `src/lib/agents/tools.ts`, and tests
(`graph-entity-property-monotonic.test.ts` extended, new
`continuity-dead-suppression-stability.test.ts`, new
`updategraphentity-authoritative.test.ts`, `continuity-flags.test.ts` D-79 case
updated). `graph-queries.ts` was NOT changed (D-79 was solved purely in the
signature layer). Next free defect ID after this bundle: **D-83**.

### D-79 (BLOCKING) — dead_character_reappears suppression key churned every chapter

**Before.** `continuityIssueSignature` hashed `type | sorted(entities) |
sorted(chapters)`. For `dead_character_reappears`, `runConsistencyChecks` returns
`chapters = [deathChapter, ...postDeathChapters]` (graph-queries.ts:438-459), and
`collect(DISTINCT …)` of post-death chapters GROWS by one every chapter the
resurrected character keeps participating. So the signature changed every
chapter. The writer's `[Intentional]` dismissal stores the signature that existed
when the flag was created (scan/route.ts:158 `signature: f.signature`); a later
scan computed a NEW signature that was NOT in `intentionalSignatures`
(scan/route.ts:134), so `toContinuityFlags` (continuity-flags.ts:63) never
suppressed it → a fresh, **un-dismissable CRITICAL inline flag every chapter,
forever** for any legit resurrection / fake-death arc.

**After.** A new `signatureChapters(issue)` returns the IDENTITY-bearing chapters:
for `dead_character_reappears` only, `[Math.min(...chapters)]` — the death anchor
(the earliest chapter; graph-queries guarantees every post-death chapter is
`> deathChapter`, so `min` is always the death). Every other flag type keeps its
full chapter set (their lists are bounded singletons/pairs — `location_conflict`
`[chapter]`, `timeline_violation` `[earlier, later]`, `relationship_contradiction`
`[chapter]` or `[]` — so they never churn, and narrowing them would wrongly merge
distinct contradictions). `continuityIssueSignature` now hashes
`type | entities | signatureChapters`. Display + `[Go to Ch N]` are UNCHANGED —
`siteFor` and the flag's `description` still use the full `issue.chapters`.

Both sides of suppression use the same `continuityIssueSignature`, so the write
side (flag creation stores it) and the read side (intentional-set membership) stay
consistent by construction; no route change was needed.

**Design (no weakening of other types):** scoped strictly to
`dead_character_reappears`. Audited siblings: `character_undocumented`'s chapter
list also grows (`[first, last]`) but it is never a flag (dropped by
`toContinuityFlags`), so it is irrelevant to suppression; all surfaced types are
bounded. A genuinely different contradiction still gets its own flag — different
character ⇒ different `entities`; different death chapter ⇒ different anchor.

**Proof tests** (`continuity-dead-suppression-stability.test.ts`, 6, RED-first;
plus a D-79 case in `continuity-flags.test.ts`): signature invariant as
reappearances grow; dismissal at ch6 still suppresses at ch7 (0 new active flags);
different character NOT suppressed; different death chapter is its own flag;
full reappearance list still present for display/jump; other flag types still
differ by full chapters.

**Residual (disclosed):** flags created BEFORE this fix carry the old
full-chapter signature. On the next scan a pre-existing intentional resurrection
flag re-surfaces ONCE (old sig ≠ new anchor sig) and must be re-dismissed once;
pre-existing active flags self-heal (replaced by the anchor-sig flag). One-time,
self-healing; acceptable on a pre-release DB.

### D-80 (BLOCKING, failure-states-lie) — UpdateGraphEntity silently no-op'd deliberate corrections

**Before.** `executeUpdateGraphEntity` (tools.ts:~1508) funnels agent/user edits
through `upsertEntities` → `upsertSingleEntity`, so sub-fix (b)'s sticky-dead and
preserve-first-role/description clauses applied to DELIBERATE corrections too. A
writer/agent asking to set a dead character back to alive, or to fix a
role/description, changed NOTHING while the tool still reported
`"… 1 updated …"` — an in-product failure-states-lie (the exact theme the QA
campaign is hunting).

**After.** `upsertEntities(result, authoritative = false)` gained an
`authoritative` flag, threaded to `upsertSingleEntity`. When `true`, status /
role / description are written directly (`n.status = $incomingStatus`,
`n.role = $incomingRole`, `n.description = $incomingDescription`) — the sticky/
preserve-first CASE guards are bypassed so the correction lands. A deliberate move
away from `"dead"` additionally sets `n.deathChapter = null` (Neo4j removes the
property) so the `dead_character_reappears` gate cannot linger on a stale anchor;
an authoritative move INTO `"dead"` still stamps the first-death anchor via the
untouched `coalesce(n.deathChapter, $chapter)` clause. `executeUpdateGraphEntity`
passes `authoritative: true`. **Default is `false`**, so every stochastic caller
(graph-maintenance rebuild / post-session — untouched) stays sticky.

Values still ride as Cypher params ($incoming*), never interpolated — injection
boundary (escapeLabelForQuery + D-63 sanitizeRelationshipType + RC-6 userId
stamp) unchanged. deathChapter/aliases coalesce/union (additive facts) are left
as-is on authoritative writes; only the death anchor is cleared, and only when
status leaves "dead" (documented, intentional).

**Proof tests:** behavioural (`graph-entity-property-monotonic.test.ts` d80-1..3)
— authoritative dead→alive lands + overwrites role/description + clears anchor +
disarms gate; default(false) still cannot resurrect (sub-fix b invariants intact);
authoritative→dead still stamps deathChapter. Wiring
(`updategraphentity-authoritative.test.ts`) — `executeTool("UpdateGraphEntity")`
calls `upsertEntities` with `authoritative === true`, book-scoped.

### D-81 (LOW) — sticky-dead CASE was label-blind

**Before.** The sticky-dead CASE was appended for EVERY label. An Object/PlotThread
erroneously scanned `status:"dead"` would freeze forever — silently exiting the
`orphan_plot_thread` gate (`status IN ["introduced","developing"]`) and never
resolvable. No false flag; a silent MISS.

**After.** The sticky CASE is emitted only when `label === "Character"` (the sole
label whose status any continuity gate reads). Other labels use plain
`n.status = $incomingStatus` (latest-wins) — the exact pre-(b) behaviour for them,
since their statuses are never `"dead"`. Pinned by `(b8/D-81)` PlotThread
dead→developing correction lands, and `(b8')` Object destroyed→intact latest-wins.

### character_undocumented role-freeze — `"mentioned"` is empty-equivalent (MED, inline)

`character_undocumented` keys off the placeholder `c.role = "mentioned"`. Under
plain preserve-first, a first scan writing `"mentioned"` would lock it, so a later
documented role never lands and the undocumented condition never clears. Fix: the
non-authoritative role CASE now treats `"mentioned"` as empty-equivalent —
`n.role = CASE WHEN n.role IS NULL OR n.role = "" OR n.role = "mentioned" THEN
$incomingRole ELSE n.role END`. A real established role is still preserve-first.
Pinned by `(b9)` mentioned→advisor upgrade lands and `(b9')` a real role is not
overwritten by a later `"mentioned"`.

### D-82 (MED, NON-blocking — REGISTERED + DEFERRED, not implemented)

Tier 4.3 ambient series awareness (`getPriorCharacters`/`getCharacterStates` →
ambient-sources.ts / ambient-context.ts / ambient-series-panel.tsx) carries
role/description into series writing context. Preserve-first means a prior book's
character can be surfaced by their FIRST-appearance extraction ("timid apprentice"
though they ended "guild master") — quality drift, NOT a false flag. The proper
fix (only-upgrade / refresh-role-and-description at end-of-book) belongs to a later
dispatch. **Registered as D-82; deliberately not implemented here.**

### Companion gates

`npx tsc --noEmit` exit 0; `npx vitest run` = **935 passed / 124 files, 0 failed**
(sub-fix (b) baseline 920/122 → +15 tests, +2 files: 6 D-79 suppression-stability,
1 D-80 wiring, 7 monotonic (b8/b8'/b9/b9'/d80-1..3), 1 D-79 case in
continuity-flags). Sub-fix (b) monotonic invariants, RC-2/RC-6/D-63/D-30/D-31
suites all still green. NO-COMMIT — left in the working tree for the team-lead's
gate + commit.
