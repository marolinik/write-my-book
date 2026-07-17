# TEST PLAN — 8 Personas, Full-Platform Bulletproof QA (wmb-pub) 2026-07-17

Each persona = fresh user with a distinct writing job, scripted multi-day journey, explicit exit criteria. The union of the 8 covers **every feature** (COVERAGE-MATRIX). Run each in an isolated identity: **own user row (distinct clerkId), own books, own BYOK key entry, own WriterMemory** — never share the single DEV_AUTH_BYPASS user across personas (user-scoped state poisons D8/D9 measurements). Exactly ONE worker process during any agent measurement (GRADING §8).

Journey structure for all: **Day-0 signup/onboarding → core daily writing loop → power features → edge/error paths → return-visit (habit hooks) → tier/paywall boundary probe → W1 head-to-head vs their incumbent.**

---

## P1 — "Maya", Debut Novelist (first book, no process, budget-anxious)
**Job:** finish a first literary novel; needs coaching, not judgment.
**Primary surface:** write-first onboarding, blank-editor start, offer toasts (2K/5K/10K), guided-setup wizard (opt-in path), CAS coach chat, fingerprint/architecture/bible generation, findings as teaching, dashboard, streaks/daily plan.
**Journey:**
- Day-0: signup → new book → typing in Chapter 1. TIME IT (target ≤ 60s signup→typing). No wall before the editor. BYOK ask must arrive at first AI use, not before — record exactly what the wall says (W11 funnel step).
- Core: write ~2K words (scripted paste-in-bursts + real typing) → style-fingerprint offer toast fires ONCE → accept → fingerprint generated (verify quality: does it describe HER voice or generic boilerplate?). Continue to 5K → architecture offer → accept, from her rough outline. 10K → story bible.
- Power: CAS coach conversation ("why does chapter 2 sag?") — teach-don't-scold tone judged; run dev-edit pass → triage findings via apply / dismiss / "Let's talk about this" 3-turn discuss → verify her stated intent ("she's evasive on purpose") produces adaptation + a WriterMemory constraint → NEXT session proves the constraint is honored.
- Edge: dismiss all offer toasts → verify they never re-nag; abandon onboarding mid-way; invalid BYOK key entry (clear plain-language error, no jargon dump); network kill mid-CAS-stream.
- Return: day-2 (seed backdated word counts) — streak real, daily plan references HER actual book state, dashboard numbers all real (no hardcoded zeros).
- Tier probe: exhaust whatever trial/plan boundary exists → paywall clean, work never held hostage (draft still readable/exportable).
**Exit:** onboarding ≤ 60s; offers fire-once semantics proven; discuss→memory→honored loop proven end-to-end; coaching tone graded; no fake metrics. Grade ≥ 9.5.

## P2 — "Gerald", Career Genre Novelist (30+ books, deadline-driven, paranoid about his words)
**Job:** revise thriller #31 on deadline; will leave forever the first time the tool loses a word.
**Primary surface:** autosave + versioning + 409 conflict UI, offline buffer, find/replace, chapter reorder, version history/rollback, full editorial cycle (dev-edit + line-edit), findings triage at volume, export docx, cost tracking, story health.
**Journey:**
- Day-0: import/paste an existing 8-chapter manuscript (~40K words); verify structure lands intact.
- Core: heavy editing sessions — every W4 data-safety scenario runs HERE (two-tab 409, network-kill mid-autosave + reconnect sync diff-verified, crash mid-save, immersive-mode unload flush, restart recovery). Book-wide find/replace (with a trap: replace inside a finding-anchored span → anchors survive or degrade honestly). Transactional chapter reorder under a concurrent autosave.
- Power: full revision cycle on 3 chapters: dev-edit → triage 20+ findings → line-edit → verify voice intact (feeds W2) → export docx → open in Word: chapter titles correct, TOC real, zero content loss (normalized diff vs DB), page estimate honest.
- Edge: version rollback after a bad apply-all; export mid-edit (consistent snapshot?); worker killed mid dev-edit (honest error, no zombie "running" state, retry works).
- Return: story health reflects the revision work; cost tracker matches OpenRouter actuals.
- Tier probe: whatever gates his plan carries — attempt bypass via direct API.
**Exit:** ZERO words lost across all fault scenarios (diff-proven); export fidelity 0-loss; 409/offline/immersive all hold under hostility; cost accurate. Grade ≥ 9.5; D2 floor 9.0 non-negotiable.

## P3 — "Selena", Series Author (book 2 of a fantasy series — THE moat persona)
**Job:** draft book 2 without contradicting book 1.
**Primary surface:** series creation/linking, series-context sidebar (cast last-known state, plot threads, tone-drift chip), Neo4j entity extraction, continuity net (all flag types), cross-book queries in CAS, alias matching, `[Go to Ch N]` + `[Intentional]` flows.
**Journey:**
- Day-0: seed Book 1 (scripted: characters incl. one who DIES, locations, timeline markers, relationships; run extraction; verify graph populated — counts + spot entities in Neo4j). Create Book 2 in the same series.
- Core: draft Book 2 chapters that legitimately reference Book 1 → series sidebar surfaces each on-stage character's last-known state (role · status · last-seen), alias-matched, diacritic-insensitive, latest-book-wins; unresolved plot threads listed; tone-drift chip advisory-only.
- Power (seeded contradictions, W2): resurrect the dead character → dead-character-reappears flag; teleport a character between locations in one scene → location-conflict; violate timeline → timeline-violation; contradict a relationship → book-level indicator. Each flag: anchored correctly, `[Go to Ch N]` jumps right, `[Intentional]` permanently silences (re-scan does NOT resurrect it), fixing the text auto-clears the flag.
- Edge: Neo4j DOWN mid-session → sidebar distinguishes "graph offline" from "nothing to show", editor never blocked, no 500s; standalone book → sidebar auto-hides; extraction JSON failure → jsonrepair fallback path exercised; partial graph → NO false confidence (labeled incomplete).
- Cross-user probe: attempt to link persona B's book into her series via API → rejected.
- Return: next-session scan picks up yesterday's chapters without re-extraction storms (≤once/90s throttle honored).
**Exit:** 0 false positives on clean chapters; all 4 seeded contradiction classes caught; intentional-suppression sticky; graph-offline degradation honest; known attribute-level miss (rank/title change) documented as N-A-STRUCTURAL, not silently skipped. Grade ≥ 9.5.

## P4 — "Priya", High-Volume Commercial Author (6+ KU books/year — money-path persona)
**Job:** unattended overnight throughput at predictable cost.
**Primary surface:** batch API (create/status/cancel), FlowProducer fan-out, Now/Tonight-2am presets, aggregate budget ledger, pre-child skip guard, circuit breaker, digest, per-session caps, cost tracker, queue-state honesty, worker recovery.
**Journey:**
- Day-0: standard setup; seed a 12-chapter draft needing editorial passes.
- Core: batch line-edit over 6 chapters (Now preset) → fan-out visible, per-child status honest, digest aggregates truthfully, chapter auto-advance suppressed (spec decision 7), Redis ledger totals match provider actuals exactly.
- Power (W6 money gates): at-cap batch → children skip with `skipped` status, spend ≤ `cap + (concurrency−1)×perSessionCap` (verify the documented bound, not zero-overshoot); force 3 consecutive child failures → circuit breaker halts; cancel mid-batch → clean; Tonight-2am preset via short synthetic delay → children do NOT spend before schedule (the fixed HIGH bug — regression-proof it); the real 24-child overnight run as a background job (final validation per BATCH-SPEC §8).
- Edge: mutating agents rejected at API (safe-editors-only v1); batch created then worker dies → recovery on worker restart; TTL expiry; duplicate batch submission; DB-halted fail-safe.
- Return: morning digest is the payoff — accurate, readable, actionable; failed children honestly listed.
- Tier probe: batch eligibility/cap validation vs her plan.
**Exit:** every money gate holds with numbers in evidence; scheduled batch spends $0 before its time; 24-child run completes with truthful digest; cost display = provider actuals within tolerance. Grade ≥ 9.5; any cap overrun = S1.

## P5 — "Sam", Weekend Hobbyist (phone-first, no budget, zero jargon tolerance)
**Job:** write fan-fic on the phone; "does this confuse or insult a normal human?"
**Primary surface:** mobile editor (Tier 2.4), a11y (Tier 2.5), locale ×7, plain-language everything, empty states, free-path boundaries, the BYOK cliff (measured honestly), export on mobile.
**Journey:**
- Day-0: phone-emulated signup → new book → typing. Mobile editor: collapsible panels, responsive type, keyboard doesn't cover the caret, no horizontal scroll.
- Core: write + autosave on flaky mobile network (offline buffer honesty on mobile); hit the first AI feature → the BYOK/subscription wall — record EXACTLY the wall UX for the funnel scorecard (W11): what he understands, where he stalls, whether any path forward exists for him. This is a measurement, not a pass/fail — but jargon-dump = D3 defect.
- Power: everything reachable WITHOUT a key must work and feel complete (editor, export, shelf, word counts); locale sweep — switch through all 7 locales on his core screens: no "2.026 words"-class leaks, no untranslated strings, dates/numbers correct.
- Edge: a11y spot pass on mobile (focus, labels, contrast); reduced-motion; landscape; tiny viewport (SE-class).
- Return: does the free surface alone give a reason to return, honestly?
- Tier probe: every paywall he hits: plain-language, respectful, never traps his words.
**Exit:** mobile editor genuinely usable (not "renders"); zero locale leaks on judged screens; BYOK-cliff funnel documented with screenshots; key-less experience coherent and never lies about what's locked. Grade ≥ 9.5 on what he CAN reach; the cliff itself feeds W13/W16 and the founder list (known #2 deferred move — managed tier).

## P6 — "Owen", Literary Stylist (voice is everything; assumes AI flattens)
**Job:** line-edit a voice-heavy manuscript without losing HIM.
**Primary surface:** style fingerprint depth, PROTECTED SIGNATURE DEVICES gate, line-editor, AI-tell detection, rewrite comparison in-place, ghost text, immersive/focus mode, discuss pushback, authorship honesty.
**Journey:**
- Day-0: paste his voice-heavy corpus (reuse the line-edit-quality-validation corpus + fresh pages); fingerprint generation → verify it captures signature devices (and-stacks, inference anchors, fragments — the known-hard 2/6).
- Core (W2 heart): line-edit passes on pre-registered pages → blind pairwise judging vs original (flattening rate, device survival vs 4/6 qwen baseline); every suggestion rendered via rewrite-comparison in place, never auto-applied; findings quote verbatim (feeds misquote probe N).
- Power: argue back through discuss on style findings → agent adapts or holds ground with a reason (not boilerplate); "keep as-is" respected forever (no re-flag of the same span); ghost text — does it write in HIS register?; immersive mode as his default writing surface (its data-safety already proven by P2 — HE judges its feel).
- Edge: adversarial pages (deliberate rule-breaking prose: fragments, comma splices as style) → line editor must respect them or flag gently, not "correct" them; run same pass on a stronger model if key available → report both (model-conditional verdict, W7/W14).
- Return: authorship tracker honest (no fabricated "100% yours"); his accumulated style constraints persist.
**Exit:** flattening within pre-registered bound; ≥4/6 devices survive on qwen (6/6 stronger model or founder-decision on Change-2); 0 misquotes in his N; adversarial prose respected. Grade ≥ 9.5; D8 floor 9.0.

## P7 — "Bao", Migrator / Finisher (brings a finished manuscript in; wants a book OUT)
**Job:** import a full existing manuscript, polish, and produce publishable files.
**Primary surface:** import paths (paste/docx if present — verify what exists), chapter management at scale, wiki/entity pages, export docx/epub/pdf end-to-end, TOC/titles/metadata, estimated pages, data portability (full export of everything), GDPR-style delete.
**Journey:**
- Day-0: bring in a 20-chapter, 80K-word manuscript (scripted). Structure intact, chapter titles preserved, word counts right; editor stays fast at this size (D5 numbers at 80K).
- Core: organize — reorder at scale, rename, merge/split if supported (verify what exists, don't invent); wiki/entity pages populated from extraction; radar/health on a big book.
- Power (export fidelity, pre-registered): export all 3 formats → normalized-diff every chapter vs DB (0 loss), titles + TOC correct (F9 fixed — regression-proof), EPUB opens in a real reader, PDF page count vs estimate honest (B3 was ~47% off — verify fixed or report), metadata (title/author) correct, F10 residual (xhtml file titles) verified as the known minor a11y note.
- Edge: export with unicode/diacritics throughout; export mid-autosave; concurrent exports; malformed/oversized paste (>50K chars single paste); delete book → truly gone (API-level 404s, graph cleaned, files cleaned) then full-account data check.
- Portability: can he get EVERYTHING out (chapters + bible + findings + memory)? Absence = W17 finding.
- Return: re-export after edits → deterministic, no stale cache.
**Exit:** 0 content loss across formats (diff-proven); titles/TOC/metadata correct; big-book editor within latency budget; delete verifiably complete; portability honestly mapped. Grade ≥ 9.5.

## P8 — "Rita", The Skeptical Operator (billing, security, abuse — trust persona)
**Job:** try to break trust: steal, overspend, inject, bypass. Runs API-first.
**Primary surface:** Stripe lifecycle, entitlement enforcement, ownership checks on EVERY resource route, rate limits, prompt-injection defense, key confidentiality (W5), health/DRIFT/worker probes, Sentry hygiene, admin surfaces.
**Journey:**
- Billing (W6): test-mode checkout monthly/annual → entitlement flips; upgrade/downgrade proration; cancel → period-end honored; synthetic signed webhooks for past-due/dunning → correct in-app state + honest UX; webhook signature validation (reject unsigned/bad-sig); replayed webhook idempotent; billing portal round-trip.
- Ownership sweep: with persona A + B credentials, attempt cross-user access on every resource class (books, chapters, findings, series, batches, exports, memory, keys) — expect 403/404, uniform error envelope, no existence leaks.
- Injection (W5): hostile manuscript prose + hostile finding-discuss inputs across all agent surfaces → inert; hostile content in export → renders as text, no template injection.
- Limits/abuse: discuss 200/24h rate limit; concurrent session storms; oversized payloads; malformed JSON; SSRF-ish inputs in any URL-accepting field.
- Confidentiality: server-layer egress capture session (mitmproxy) while personas run → only provider endpoints see prose; DB shows key ciphertext; Sentry events scrubbed; logs clean.
- Ops honesty: `/api/health/dependencies` truthful under each dependency kill (Redis/Neo4j/worker down); DRIFT probe red on a schema-drifted throwaway DB; ONE-worker liveness probe honest.
- Prod dress rehearsal (W4): throwaway DB backup→push→smoke→restore drill; document the C0/C2 runbook results.
**Exit:** zero S1s (or fixed + regression-locked); every billing transition lands correct entitlement; egress ledger from server-layer capture; health probes honest under real dependency kills. Grade ≥ 9.5; D7 floor 9.0.

---

## Cross-feature race conditions (assigned owners; every persona runs theirs)
- X1 two-tab same-chapter edit war (P2) · X2 batch running + manual edit same chapter (P4) · X3 continuity scan during chapter reorder (P3) · X4 export during batch line-edit (P7) · X5 discuss thread while a dev-edit pass rewrites the anchored span (P6) · X6 plan downgrade mid-batch (P8+P4) · X7 delete book while a job is queued on it (P8) · X8 locale switch mid-session with dirty editor (P5).

## Gap personas (W13 — the tasks wmb-pub CANNOT do, graded honestly)
G1 zero-config managed start (Sudowrite) · G2 live co-editing + comments (Google Docs) · G3 phone-native offline drafting (iA Writer) · G4 voice dictation (ChatGPT mobile) · G5 grammar/mechanics depth (ProWritingAid) · G6 publish-ready pipeline presets (Atticus/Vellum) · G7 share-link to a beta reader (Docs/Notion) · G8 plot board / corkboard (Scrivener/Plottr). Output: honest WIN/TIE/LOSE + dealbreaker-per-segment verdict → founder backlog.

## Coverage guarantee
The 8 personas' union must touch **every row** of `COVERAGE-MATRIX.md`; gap personas cover §MC. Any row with no journey owner = self-judge blocker. NF/UX/design dims are judged only on rows a journey actually exercises (sweep-only rows carry functional PASS only).

## Cross-cutting checks every persona runs
- No uncaught console errors on any happy path (D2).
- Light AND dark screenshotted on every judged screen (D6).
- Every destructive action confirms; every async action shows state; every long agent run is cancellable (D3).
- Editor keystroke latency + first-token + autosave timings recorded (D5).
- Worker-count proof captured before any agent measurement (GRADING §8).
