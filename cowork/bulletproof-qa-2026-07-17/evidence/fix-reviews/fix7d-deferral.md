# fix 7 sub-fix (d) — deathChapter = earliest death EVENT — INVESTIGATE-FIRST → STOP / DEFER

**Verdict: STOP (do NOT write code). Defer with rationale.** Triggered hard-stop condition #2:
*"If no deterministic death-EVENT anchor exists in the model → STOP (deathChapter has nothing
better to key on than today's coalesce; defer with rationale)."*

Owner: opus-fix-7c. Read-only trace only. NO-COMMIT. Graph tree untouched (clean at HEAD).

---

## 1. Current deathChapter flow (traced)

- **Derivation** (`graph-builder.ts:1078-1084`, `deriveEntityGraphProps`): when `label==="Character"`,
  `chapterNumber >= 1`, and `isDeadStatus(properties.status)` → `derived.deathChapter = chapterNumber`.
  The value is the **raw SCAN chapter** (`chapterNumber`), the chapter being extracted — **not** a
  story-time value. Death has no `occursInChapter` channel (Events do; death does not).
- **Persist** (`graph-builder.ts:399-405`):
  - ON CREATE → `createProps.deathChapter = derived.deathChapter`
  - ON MATCH → `n.deathChapter = coalesce(n.deathChapter, $chapter)` — **first-write-wins on scan order**.
- **Retirement** (`graph-builder.ts:466-475`, D-80): a DELIBERATE authoritative move away from "dead"
  sets `n.deathChapter = null`. Stochastic scans never reach this branch.
- **`$chapter`** originates from `ExtractionResult.chapterNumber` (the chapter handed to the per-scan
  extraction), threaded through `upsertEntities`.

## 2. Is a death-EVENT anchor identifiable in the model? NO.

Death is a **scalar transition on the Character node**, never a reified event:

- `EventNode` (`types.ts:38-59`) has no death typing. Its only categorical field is
  `significance` = major|minor|turning-point|climax (narrative weight, not event kind).
- No death relationship exists. All 15 `RelationshipType` values (`types.ts:118-158`) —
  APPEARS_IN, LOCATED_AT, PARTICIPATES_IN, KNOWS, ALLIED_WITH, OPPOSES, OWNS, PART_OF, LEADS_TO,
  FORESHADOWS, RESOLVES, OCCURS_IN, BELONGS_TO, MENTIONED_IN, TRANSFORMS_INTO — carry no
  DIES_IN / KILLED_IN / DEATH_OF. `PARTICIPATES_IN` (Character→Event) is generic participation and
  holds while the character is **alive**.
- The `dead_character_reappears` query itself (`graph-queries.ts:438-459`) reads death only from
  `c.status="dead"` + `c.deathChapter`, then finds post-death `PARTICIPATES_IN` events. There is no
  event it treats as "the death".
- A titled Event like *"The Death of X"* MAY exist as an ordinary Event node (referenced at
  `graph-queries.ts:407`), but it is not bound to the Character as a death anchor — fix-7
  canonicalization only stops it forking a duplicate; it confers no death semantics, no
  Character↔deathEvent link, and PARTICIPATES_IN to it is shared by killer/witnesses too.

**The ONLY temporal death signal in the model is "the chapter of the first scan that emitted
status=dead" — which is exactly today's `coalesce(n.deathChapter, $chapter)`.** There is nothing
earlier or more authoritative to key on.

## 3. Why the goal cannot be met soundly (the manufacture-a-false-anchor trap)

The bug is real: extraction non-determinism can MISS the death in its true chapter and first emit
`dead` a few chapters later, so `deathChapter` is stamped too late and reappearances in the gap
chapters (after the real death, before the recorded one) escape the `> c.deathChapter` gate.

But to move deathChapter EARLIER you need evidence the character was dead earlier — and in the exact
miss the goal describes, **that evidence does not exist in the graph** (the death scan was missed;
no node/edge records deadness in the gap chapters). The only "earlier" signals available are
meaningless for death:
- earliest `PARTICIPATES_IN` / `MENTIONED_IN` chapter → the character's FIRST APPEARANCE (characters
  participate while alive) — anchoring death there is catastrophically wrong.
- free-text `Event.description` NL-parse for "died/killed" → reintroduces the very non-determinism
  the fix is meant to remove, and is out of scope (entity-extractor / types owned elsewhere).

So the sound choices are: **(a) keep today's coalesce** (first-observed-dead), or **(b) guess an
earlier chapter with no supporting signal = manufacture a false death anchor.** (b) violates the
campaign guiding rule ("reduce non-determinism WITHOUT manufacturing a false flag/anchor — prefer
do-nothing over guess"). Therefore (a): defer.

## 4. Monotonicity / D-79 status — already SAFE today (no regression, nothing to fix)

- Today's `coalesce(n.deathChapter, $chapter)` is **already sticky/monotonic**: once set, later scans
  never move it (first-write-wins). The only reset is the D-80 deliberate authoritative resurrection.
  So (b)'s sticky-dead invariant is intact.
- D-79 (`continuity-flags.ts:38-41`, `signatureChapters`) collapses `dead_character_reappears`
  chapters to `min(chapters)` = the death anchor for the signature. Because deathChapter does not
  churn scan-to-scan today, the signature is already STABLE across repeated scans — the exact churn
  (b)+D-79 fixed stays fixed. No change here, so no signature movement is introduced.

## 5. One-time re-surface wave — N/A

Not applicable: no code change ships, so there is no data migration and no re-surface wave of
previously-suppressed `dead_character_reappears` flags. (Had an earlier-death anchor been sound, it
would have produced exactly such a wave — documented here only to confirm it is moot under the defer.)

## 6. Residual / founder-decision note

The gap-chapter miss is a genuine (rare) correctness gap, but it is a **model-shape limitation, not a
graph-builder bug**: death is not reified as a chapter-stamped event, so "earliest death event" has no
referent. Closing it soundly requires a MODEL change owned outside this lane — either:
- add a death-typed Event (or a `DIES_IN`/`DEATH_OF` Character→Event edge) the extractor emits, giving
  a discrete `occursInChapter`-stamped death anchor to `min()` over; or
- give Character a story-time `deathOccursInChapter` the extractor can supply, mirroring Event RC-2.

Both touch `entity-extractor.ts` / `types.ts` (out of this task's scope) AND still depend on the LLM
reliably emitting the death — i.e. they reduce, not eliminate, the same non-determinism. Flag for
**founder decision** as the fix-7(d) residual; no in-code action taken.

## 7. Gates

No code changed → gates unchanged from baseline (1005 passing / 129 files at HEAD). tsc/vitest not
re-run for a zero-diff verdict; graph working tree clean.
