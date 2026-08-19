# W-D fix 7 — RC-3 deterministic extraction hardening (SPEC / executor brief)

**Root cause (w-d-rootcause.md §RC-3):** the extractor's stochastic output is written straight into a delete-then-write graph with no name normalization, blanket property overwrite, weak alias identity, and mention-anchored deathChapter. Each sub-failure is independently D8-floor-relevant and D2-relevant. **Any single confirmed continuity FP re-caps D8 at 8.5** — so the guiding rule for every sub-fix is: *reduce non-determinism WITHOUT manufacturing a false flag.* Prefer "do nothing / preserve" over "guess" whenever identity is uncertain.

**Owner:** opus executor (model:opus). **Mode:** TDD, no-commit, minimal diff. Team-lead gates (tsc + full vitest) + Fable adversarial verify, then commits by explicit pathspec.
**Files (own these; disjoint from fix 10):** `src/lib/graph/graph-builder.ts` (primary), `src/lib/graph/entity-extractor.ts` (canonicalization source of truth if shared), `src/lib/graph/types.ts` (only if a shared normalizer/type is hoisted). Do NOT touch `post-session.ts`, retriever, or graph-maintenance.ts failure economics (D-73 just landed there).

Current semantics confirmed in-tree this pass (re-derive line numbers yourself; they drift):
- `upsertEntity`: builds `allProps` then `ON MATCH SET n += $updateProps` = **blanket overwrite** of role/status/description on every scan (graph-builder.ts ~:235-238). chapter/occursInChapter/deathChapter/aliases are already deleted from allProps and handled with coalesce/union stable semantics (~:154-234) — DO NOT regress those.
- MERGE identity is `{bookId, name}` (~:256) — raw extractor name, no canonicalization → "The Death of X" vs "X's Death" fork into distinct nodes.
- `deriveEntityGraphProps` injects deathChapter (read it; sub-fix d changes its anchor).
- Alias handling unions (D-27) but the *identity match* that decides which node an alias-bearing entity folds onto is the hazard (sub-fix c).

---

## Sub-fix (a) — event-name canonicalization before MERGE (kills "The"-prefix forking) — D-32c

**Failure:** extractor prefixed "The" to an existing event name (2/2), and Day-0 drafting already holds BOTH "Death of Corvin Ashe" AND "Corvin Ashe's Death" → forked nodes both stamped the same chapter → every `LEADS_TO` becomes chXX→chXX, making `timeline_violation` unconstructible.

**Fix:** a deterministic, pure `canonicalizeEntityName(label, rawName)` applied to the MERGE key for Event nodes (and any label prone to article/possessive forking — scope initially to Event; justify if widening). Requirements:
- Strip a leading definite/indefinite article ("The ", "A ", "An ") case-insensitively.
- Normalize whitespace + unicode (NFC), trim.
- Do NOT lowercase the stored `name` (display fidelity) — canonicalize a **match key**, keep the original as a stored/alias value. Two viable shapes; pick and defend one in the handoff:
  1. MERGE on a derived `canonicalName` property (store original as `name` + add to aliases). Preferred if it avoids migrating existing nodes.
  2. MERGE on normalized `name` and push the original spelling into `aliases`.
- **Determinism proof:** same event referred to two ways in the SAME extraction batch must MERGE to one node. Distinct events that merely share an article must NOT collide (e.g. "The Wedding" in ch2 vs "The Wedding" in ch40 are the same *name* — that's expected same-node; do not over-engineer disambiguation here, that's sub-fix c's concern for characters).
- **FP guard:** possessive/genitive folding ("X's Death" ≡ "Death of X") is HARD and error-prone — if you cannot do it deterministically without false-merging distinct events, DO NOT attempt it; limit (a) to article-stripping + normalization and register the possessive-forking residual as a follow-up defect. A false merge of two distinct events is itself a D8 FP.

## Sub-fix (b) — protect role/status/description from blanket overwrite (only-upgrade / monotonic) — D-32a

**Failure:** the violating chapter's own extraction emitted `status:"transformed"` → overwrote a prior `status:"dead"` → `dead_character_reappears` check's `c.status="dead"` gate went false → NO flag until a lucky canon-neutral re-extraction re-asserted "dead". Blanket `+= $updateProps` let a single stochastic scan silently downgrade a load-bearing fact. This is the DIRECT cause of D1=4.0.

**Fix — replace blanket overwrite of these three fields with monotonic/priority merge (keep everything else as-is):**
- **status:** define a monotonic lattice for the continuity-relevant transition. `dead` must be **sticky** — once a character is `status:"dead"`, a later extraction emitting `alive`/`transformed`/`missing`/anything must NOT clear it (a resurrection is an authorial event that the *check* should surface, not something extraction silently applies). Preserve via `ON MATCH` coalesce/CASE so dead cannot regress. If a legitimate transition ordering exists (alive→missing→dead), encode only what the continuity checks actually read; do not invent states.
- **role:** only-upgrade (don't let "minor"/"unknown" overwrite an established "protagonist"); if you cannot rank roles deterministically, prefer **preserve-first-non-empty** over blanket overwrite.
- **description:** do not blanket-overwrite with each scan's stochastic paraphrase (causes signature churn → D8 precision). Either keep first non-empty, or version/append. Whatever you choose must be deterministic and must not unbounded-grow the property.
- Everything NOT in {role,status,description,chapter,occursInChapter,deathChapter,aliases,userId} may keep `+= $updateProps`. Keep lastMentioned/updatedAt/contentHash refreshing as today.
- **Do not** reintroduce a path where a re-scan of clean canon flips a real state — test both directions (dead stays dead across a "transformed" scan; a genuine first-time death still lands).

## Sub-fix (c) — alias-merge disambiguation (no fold on shared common alias) — D-27-adjacent

**Failure:** identity match folds entities on a shared common alias with a weak `LIMIT 1`, so two distinct characters sharing e.g. a title/first-name collapse (or an alias regression drops a variant). Find the identity-resolution path (the query that decides which existing node an incoming entity/alias binds to).

**Fix:** require a stronger identity match than a single shared alias + `LIMIT 1`. Options (pick + defend): match on `{bookId, name}` primarily and only treat aliases as *additional* labels on an ALREADY name-matched node; never fold two different `name`s just because they share one alias unless the match is unambiguous (exactly one candidate AND the shared token is not a common/stop alias). When ambiguous (≥2 candidates), DO NOTHING (create/keep separate) rather than guess — a false fold is a D8 FP and loses a character. Preserve D-27 union semantics (never drop an existing diacritic variant).

## Sub-fix (d) — deathChapter = earliest *death-event*, not earliest *mention* — C5

**Failure:** `deriveEntityGraphProps` / upsert sets deathChapter to the first chapter the character is *seen with status dead*; a posthumous mention / recap BEFORE the real death chapter anchors deathChapter too early, offsetting the baseline for `dead_character_reappears`.

**Fix:** anchor deathChapter to the chapter of the actual death **event/transition**, not the first mention that happens to carry a dead status. Concretely: only stamp deathChapter when THIS chapter's extraction represents the death occurring (status transition to dead sourced from this chapter's content), and prefer the earliest such *death-event* chapter. If distinguishing "death occurs here" from "dead is mentioned here" is not reliably available from the extractor payload, define the most defensible deterministic rule (e.g. earliest chapter with an explicit death event edge/marker; fall back to earliest dead-status mention only if no event exists) and document the residual. Keep the coalesce first-write-wins stability once correctly anchored.

---

## Tests (TDD — write RED first, against the real function shapes; mock neo4j session like the existing graph tests)
- (a) two article/spelling variants of one event name in a batch → ONE node; two genuinely distinct events → TWO nodes (no false merge).
- (b) status: dead survives a subsequent `transformed`/`alive` scan; first genuine death still lands; role only-upgrade; description no-churn. Assert `dead_character_reappears` now fires WITHOUT needing a lucky re-arm (the D1 driver).
- (c) two distinct characters sharing a common alias stay separate; diacritic variant never dropped (D-27 regression pinned).
- (d) posthumous mention in ch3 + real death in ch7 → deathChapter=7 (or the documented rule), and the check baseline is correct.
- Full regression: the D-31 poison contract, RC-2 story-time coalesce/CASE, RC-6 tenant stamps, and D-63 sanitizer must all stay green and byte-intact. `escapeLabelForQuery` / `sanitizeRelationshipType` must remain applied on every interpolation you touch.

## Gates + invariants (verifier will attack these)
- `tsc --noEmit` exit 0; full `npx vitest run` green (currently 894/118 — additions raise it). Environment: PowerShell 5.1, Bash broken.
- **No new FP:** every sub-fix must be biased to preserve/do-nothing under uncertainty. State each residual you deliberately did NOT fix (esp. possessive forking in (a)) so it can get a D-number rather than a silent gap.
- **Injection boundary untouched.** **Tenant stamps untouched.** **No prose ever lost.**
- Deliver a verifier-facing handoff at `evidence/fix-reviews/fix7-handoff.md` enumerating each sub-fix's before/after, the chosen design per (a)/(b)/(c)/(d), the proof tests, and every deliberate residual.
