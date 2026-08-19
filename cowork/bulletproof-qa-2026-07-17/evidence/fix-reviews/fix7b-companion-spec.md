# fix 7 sub-fix (b) companion bundle — clear the two BLOCKING defects the verify panel found

**Context:** sub-fix (b) / D-32a (sticky-dead + monotonic role/description) is implemented and UNCOMMITTED in the working tree (graph-builder.ts + tests/unit/graph-entity-property-monotonic.test.ts + fix7-handoff.md). A 4-lens Fable adversarial panel verified the **core mechanic is SOUND and must be KEPT** (dead sticky so stochastic re-extraction cannot silently un-arm continuity gates), but two independent lenses (fp-injection, regression-blast) returned **REJECT/blocking**: the stickiness exposes two pre-latent defects that now become reachable and must land in the SAME batch. You build ON TOP of the uncommitted (b) diff — do NOT revert or rewrite it (a byte-identical backup exists; the team-lead will detect drift).

**Backup of the (b) state (do not touch):** scratchpad\fix7b-backup\ (patch + test + handoff). Current graph-builder.ts SHA256 = 95D3E020FF0BAEDDA30EB3DE8B3BE87DCF699AE87E18F78BBE379415652994A8.

**Owner:** opus executor (model:opus). Mode: TDD RED-first, NO-COMMIT, minimal diff. Team-lead gates (tsc + full vitest) + re-verify + commits by pathspec.

**Guiding rule (unchanged):** reduce non-determinism WITHOUT manufacturing a false flag. "Any confirmed continuity FP re-caps D8 at 8.5." A user/agent DELIBERATE correction must always be honored (never silently no-op); only STOCHASTIC re-extraction is sticky.

---

## D-79 (BLOCKING) — dead_character_reappears suppression key churns, so [Intentional] never sticks for resurrection arcs

**Mechanism (confirmed end-to-end by 2 lenses):**
- `dead_character_reappears` (src/lib/graph/graph-queries.ts ~:438-459) returns `chapters = [deathChapter, ...collect(DISTINCT post-death participation chapters)]` — the list GROWS every chapter the (now permanently-dead, post sub-fix b) character participates in.
- `continuityIssueSignature` (src/lib/continuity/continuity-flags.ts ~:29-33) = `sha1(type | sorted entities | sorted chapters)` — so the signature CHANGES each new chapter.
- `[Intentional]` suppression: intentional route (src/app/api/books/[id]/continuity/intentional/route.ts ~:24-27) marks the existing row; the scan route (src/app/api/books/[id]/continuity/scan/route.ts ~:134) filters intentional flags by EXACT signature. Growing signature → the dismissal stops matching next chapter → planFlagSync mints a fresh ACTIVE flag. `dead_character_reappears` is in INLINE_TYPES → renders as a CRITICAL inline editor annotation. Result: legitimate resurrection/fake-out-death arc = a fresh un-dismissable critical flag EVERY chapter, forever. Pre-(b) this self-healed (resurrection chapter's own scan overwrote dead→alive).

**Fix — stabilize the suppression identity for this flag type WITHOUT reverting sticky-dead.** The flag's IDENTITY is (character, deathChapter); the growing "reappears" chapters are EVIDENCE, not identity. Make the signature stable while keeping the full chapter list for DISPLAY. Pick the cleanest of:
1. For `dead_character_reappears`, compute `continuityIssueSignature` from `type | entities | deathChapter` (the death anchor) instead of the full chapter list — decouple the signature-bearing key from the displayed evidence chapters. Preferred if the flag object can carry an anchor/key separate from its display chapters.
2. Or match intentional suppression by `type + entities` (+ deathChapter) rather than exact full-signature for this type.
3. Or have the Cypher return only the EARLIEST post-death chapter for the signature-bearing field (keep collect for display if a display field is separate).
Do NOT weaken suppression for OTHER flag types — scope the change to `dead_character_reappears` (and any other flag type whose chapter list is inherently growing; audit continuity-flags.ts types and note any siblings). 

**Tests (RED first):** simulate the arc — flag fires {death ch4, reappear ch6}; writer marks [Intentional]; a later scan produces {ch4, ch6, ch7}; assert NO new active flag is created (the intentional suppression still matches). Assert a genuinely DIFFERENT contradiction (different character, or different deathChapter) still produces its own flag. Keep display chapters full if the UI shows them.

## D-80 (BLOCKING, failure-states-lie) — UpdateGraphEntity silently no-ops deliberate corrections while reporting success

**Mechanism:** `executeUpdateGraphEntity` (src/lib/agents/tools.ts ~:1508) funnels through `upsertEntities` → the sticky/preserve-first clauses now apply to DELIBERATE agent/user edits. The tool is advertised as "Create or update entities... properties (role, description, etc.)" (~:566-593). Post-(b): a writer asking the agent "Milan is not dead" / to change a role/description gets `Graph updated: 0 created, 1 updated` with NOTHING changed. Combined with D-79 there is NO in-product path to clear a wrong `dead`. This is the judged failure-states-lie crater.

**Fix — deliberate edits are AUTHORITATIVE.** Thread an `authoritative` (a.k.a. `source: 'user-edit' | 'extraction'`) flag through the upsert path:
- Stochastic re-extraction callers (post-session graph scan / graph-maintenance rebuild / import) pass authoritative=FALSE → sticky/preserve-first (unchanged behavior from sub-fix b).
- `UpdateGraphEntity` (tools.ts) passes authoritative=TRUE → status/role/description are set directly (blanket/explicit), so a deliberate correction lands. deathChapter/aliases coalesce may stay as-is (they're additive); confirm an authoritative status change away from "dead" also clears/updates deathChapter appropriately, or document the residual.
- Keep the default FALSE so any caller you don't touch stays sticky.
Find the exact upsert signature (upsertSingleEntity / upsertEntities) and thread minimally. If authoritative-write is too broad to thread safely, the fallback is HONEST reporting: the tool result must state which fields were preserved-not-updated (never report "1 updated" when the sticky CASE dropped the change) — but AUTHORITATIVE is strongly preferred because the tool's purpose is correction.

**Tests (RED first):** UpdateGraphEntity path CAN change a Character's status dead→alive and CAN change role/description; a normal extraction upsert (authoritative=false) still CANNOT (sub-fix b invariants intact — re-run the monotonic tests, they must stay green).

## D-81 (LOW, fix inline) — sticky CASE is label-blind

The sticky-dead CASE is appended for ALL entity labels. If extraction ever emits `status:"dead"` for a PlotThread/Object it locks forever (silently exits `orphan_plot_thread` gate `status IN ["introduced","developing"]`; never resolvable). No false flag — silent MISS only. **Fix (one line):** apply the sticky CASE only when `label === "Character"`; other labels use plain `n.status = $incomingStatus` (their statuses never equal "dead", so this restores exact pre-(b) behavior for them). Pin with a test: an Object/PlotThread status update is latest-wins.

## character_undocumented role-freeze (MED, fix inline) + handoff correction
The handoff's rationale "role/description are read by no continuity check" is FALSE (all 3 non-fp lenses caught it): `character_undocumented` (graph-queries.ts:344-346) gates on `c.role = "mentioned" AND c.description IS NULL`. preserve-first can freeze role at "mentioned" (the schema's explicit weakest rung) and keep the advisory armed. It's non-blocking (filtered out of writer-facing INLINE/BOOK_LEVEL flag nets — continuity-flags.ts:5-10; surfaces only via the agent consistency-checks tool, severity minor). **Fix inline (deterministic):** treat the placeholder "mentioned" as empty-equivalent in the role CASE: `WHEN n.role IS NULL OR n.role = "" OR n.role = "mentioned" THEN $incomingRole ELSE n.role END` — so a documented-role upgrade lands without reopening general role churn. **Correct the handoff sentence** and add this as disclosed residual.

## D-82 (MED, NON-blocking — REGISTER + DEFER, do NOT implement) — Tier 4.3 ambient serves frozen first role/description
`getPriorCharacters`/`getCharacterStates` → ambient-sources.ts / ambient-context.ts / ambient-series-panel.tsx carry role/description into series writing context; preserve-first means a prior book's character is forever described by their FIRST-appearance extraction ("timid apprentice" though they ended "guild master"). Quality drift, NOT a false flag. Fix belongs to a later dispatch (only-upgrade or refresh-on-end-of-book for description). Register D-82, note in handoff, do not implement here.

---

## Files you OWN (disjoint from other subsystems)
- src/lib/graph/graph-builder.ts (D-81 label guard, 'mentioned' role tweak, D-80 authoritative param — building ON the uncommitted (b) diff)
- src/lib/continuity/continuity-flags.ts (D-79 signature stability)
- src/lib/graph/graph-queries.ts (D-79, only if you narrow the returned signature chapters)
- src/lib/agents/tools.ts (D-80 UpdateGraphEntity passes authoritative=true)
- whichever extraction caller invokes the upsert (thread authoritative=false) — likely src/lib/agents/post-session.ts and/or graph-maintenance.ts. TOUCH ONLY the upsert call-site param; do NOT alter D-73 failure economics in graph-maintenance.ts or the vector logic in post-session.ts.
- tests: extend graph-entity-property-monotonic.test.ts + a new continuity-dead-suppression-stability.test.ts (or similar) + a UpdateGraphEntity-authoritative test.
- Update cowork/bulletproof-qa-2026-07-17/evidence/fix-reviews/fix7-handoff.md (correct the role/description claim; document D-79/D-80 fixes + D-81/D-82/'mentioned' residuals).

## Invariants the verifier WILL re-attack
- All sub-fix (b) monotonic invariants stay green (dead sticky under STOCHASTIC re-extraction; genuine first death still lands; role/description preserve-first for extraction path).
- D-63 sanitizer + escapeLabelForQuery applied on every interpolation; values ride as params. RC-2 coalesce (chapter/occursInChapter/deathChapter/aliases), RC-6 tenant userId, D-31 poison, D-30 scoping byte-intact.
- tsc --noEmit exit 0; full `npx vitest run` green (currently 920/122 — your additions raise it). Report exact counts.
- Deliverable handoff must enumerate each defect's before/after, the design chosen, proof tests, and every residual. Next free defect ID after this bundle: D-83.
