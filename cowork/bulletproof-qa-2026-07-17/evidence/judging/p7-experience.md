# P7 Bao — Judge verdict: EXPERIENCE lens (UX / onboarding / design) (blind, 2026-07-18)

> Verbatim final report of blind judge (bundle: p7-bao + competitive-teardown). Saved unedited by team-lead. (Judge model: Opus 4.8 — re-dispatched after Fable spend limit. Harness note: safety classifier claude-sonnet-5 was unavailable during this subagent's run.)

I have now read every file in the bundle and retrieved the full uncompressed content of the compressed traces. Here is my complete verdict.

---

# PANEL P7 (Bao) — BLIND JUDGE VERDICT — Lens: EXPERIENCE (UX/onboarding/design)

## Bundle character (orienting note for aggregation)
This is a **data-layer / portability audit run entirely at the API layer** (persona `user_qa_p7`, professional/BYOK, zero LLM spend). The journey-log explicitly defers *all* UI/visual work: "Editor UI rendering (verified via API only, not visually in-browser)" (`_results.json` `deferred_out_of_scope`). Consequently the exact dimensions I am charged to scrutinize most (D3b, D4, D6, D9, D10) have little or no direct evidence, and I mark them honestly rather than guess.

Evidence-availability caveat that colors everything below: **Phases 1 and 2 have no raw traces in the bundle.** `p7-phase1-day0-import-summary.txt` states outright it is "a faithful summary of the persisted state file, not a literal console transcript." There is **no Phase-2 trace file at all** — the export-fidelity 19/21, D-05, and Z15/B3 exist only as prose in `journey-log.md` / `_results.json`. The state JSONs those summaries cite (`p7_phase1_state.json`, `p7_phase2_state.json`, `p7_phase5_state.json`, `p7_reorder_*_state.json`) are **not included**. Only Phases 3/4/5/reorder/x4 ship byte-inspectable raw traces. I therefore byte-verified what I could and flag what I could not.

## Per-dimension scores

**D1 Functionality — 7.5**
Everything the API exposes and that was tested completes correctly: rename+revert (`p7-phase3-organize-portability.txt` p7-30/32/33), delete-drill 14/14 clean 404s (`p7-phase4-delete-drill.txt`), edge boundaries (`p7-phase5...` p7-71/72), and a genuine 20-chapter full-reversal reorder+export verified in all three formats after harness-bug correction (`p7-reorder-reanalyze.txt` p7ro2-02..05, EPUB ratio 1.0000, PDF own-argmax ≥0.9956). Two real export-fidelity fails persist (`_results.json` failed_checks: page-estimate, PDF title). Held below 8 because (a) two export fails and (b) "Phase 1 import" is API seeding (`POST /books` + `PUT content`), **not** the migrator's actual import-wizard feature — the defining journey is functionally unexercised.

**D2 Reliability & data safety — 8**
Strongest, best-verified part of the bundle and the persona's core promise. Byte-exact 81K round-trip incl. every diacritic is corroborated by raw post-reorder EPUB exactness (`p7-reorder-reanalyze.txt`: "Nagüel Huapi Endgame"→ch006 ratio 1.0000, "The Łódź Ledger", "Coöperate or Die", "The Façade in Zürich" all 1.0000). Concurrent-autosave race with distinct RACE-MARKER payloads shows no torn writes, export captured exactly one marker (`p7-x4-race-export-autosave.txt` x4-06 `{'RACE-MARKER-A'}`), restore verified. Oversized paste 400-not-500 (`p7-phase5...` p7-72). Export determinism properly root-caused: A==B byte-identical (sha `9717faacce2a227e`), only `dcterms` timestamps differ (diag block). Deductions: the rubric's "no silent hangs" facet is **untested** — every worker-gated path (where the campaign's own teardown says "six core workflows hang forever with no error") is deferred; and this tests only the API `PUT` path that HAS the autosave safety net, not the editor/immersive mode which the teardown says does *not* share it (and has a ~30s content-loss window). Excellent on the tested slice; the scariest data-loss modes are scoped out.

**D3 Usability — 6.5** (partial; one of three facets evidenced)
Evidenced facet — plain-language recoverable errors — is decent: clean 400 on 2M+1 chars explicitly contrasted with the known D-01 500 (`p7-phase5...` p7-72), clean 404s with `{"error":"Book not found"}` / `{"error":"Not found"}` on delete (`p7-phase4-delete-drill.txt` p7-58..62). **No evidence** for the other two facets (user control: stop/cancel/undo; state visibility) — no long-running op or UI in scope. Ding: the export response surfaces `"estimatedPages":232` to the user when the PDF is 165 pages — a *visible* wrong number (see D-defect below).

**D3b Ergonomy & efficiency — 5.5** (only the "no dead-ends" facet evidenced; keyboard/click-path = NO-EVIDENCE)
The primary meaning (keyboard-first writing, click-path economy) has **zero evidence** (API-only). The one evidenced facet leans negative: the portability "dead-end" — to leave with story-bible/wiki/memory/findings a user needs N separate raw API calls, no one-file path (`journey-log.md` Phase 3; `_results.json` `portability_summary.honest_gap`) — plus merge/split proven absent (p7-34 probes) and no find&replace (teardown §Synthesis-1 #2). Score reflects only that negative slice; do not read it as a measured ergonomy result.

**D4 Onboarding / time-to-first-word — NO-EVIDENCE**
Nothing. Critically, the migrator's real onboarding IS the import wizard, and it was substituted by programmatic API seeding. The persona's most decision-relevant first-hour flow has no evidence. (Called out as a top defect below.)

**D5 Performance feel — 7**
Real captured latency at the heaviest realistic size (`p7-phase1...` D5 table / `_results.json` `d5_latency_80k_scale_ms`): chapter-list GET p50 47/p95 47, dashboard p50 46/p95 62, content GET p50 47/p95 63, content PUT n=20 p50 172/p95 188 (min 140/max 203). No cliff at 80K. Deductions: **server not labeled dev-vs-prod** (rubric asks for this); n only 10 per GET series; no stream-cadence or queue-honesty evidence (no LLM/jobs in scope). Solid for CRUD/read paths.

**D6 Look & feel — NO-EVIDENCE**
Zero visual evidence (deferred). No themes/contrast/empty/loading states, no locale-completeness test. The only adjacent data point is charset/diacritic fidelity in exports (façade/Zürich/Łódź/Kőszeg preserved) — a data-layer positive, not UI look-and-feel, and it does not substitute.

**D7 Trust & safety — NO-EVIDENCE**
This bundle runs single-tenant; no cross-tenant/ownership isolation, tier-gate, key-confidentiality, injection, or billing-state probe (those live in other panels). Lone thin positive: `$0` LLM spend maintained and asserted (`_results.json` `cost_health`) = no surprise billing — noted, not scorable.

**D8 Manuscript intelligence quality — NO-EVIDENCE**
No LLM output at all. The single "finding" (p7-41) is a plain CRUD write, not an anchored editorial finding, so there is no quote/anchor to verify, no voice-flattening, no continuity flag. The fixture is synthetic template prose (cross-chapter similarity 0.89–0.94, `p7-reorder-reanalyze.txt` p7ro2-05) — deliberately non-literary, so this bundle *could not* test voice preservation even in principle. Hard-rule caps (misquote/flattening) do not bite because no editorial output exists.

**D9 Retention / habit — NO-EVIDENCE**
Streaks/heatmap/radar/health all deferred (LLM-gated). Word-count accuracy (api wordCount == computed) is a foundation-level positive that *would* underpin honest stats, but no retention surface is exercised.

**D10 Delight — NO-EVIDENCE**
No user-facing surface captured. The robustness is quietly reassuring but that's reliability (D2), not a captured exceed-expectation moment.

**D11 Competitive edge — 4.5**
`competitive-teardown.md` is high-quality, cited, and refreshingly honest — but for *this* persona it documents a competitive **loss**. Bao's incumbents are Scrivener (organize/compile) and Vellum/Atticus (finishing); the teardown's own synthesis concludes "every self-publisher still buys a $147–$250 formatter" because wmb-pub's export is "thin, never-smoke-tested," and this very bundle confirms the finish artifacts are flawed (wrong page count, missing PDF metadata, no one-file portability). wmb-pub's real moats (series continuity, editorial loop) are orthogonal to a migrator/finisher. Answer to "would Bao switch and pay?" per the evidence: no, not for the finishing job. Low score is well-evidenced, not a knock on analysis quality.

## Defects I found (executor missed or under-weighted)

1. **[S2 — coverage] The migrator's defining journey (import-wizard UX) is untested; "Day-0 import" is API seeding.** `journey-log.md` Phase 1 and `p7-phase1-day0-import-summary.txt` show book creation via `POST /books` + per-chapter `PUT content` — not the actual import feature (upload/paste a real .docx) that a migrator uses in hour one. For a persona whose thesis is "can wmb-pub *safely receive* my existing manuscript," the receive-path is the one thing not exercised. Directly voids D4 and hollows D1's "import."

2. **[S3 — trust/UX, mis-categorized] User-facing page count is wrong by 40.6%.** Executor files the page-estimate as pure export-fidelity (Z15/B3). But `"estimatedPages":232` is returned in the export *success* payload (`p7-reorder-export-verify.txt` p7ro-05/p7ro-10) while the rendered PDF is 165 pages. It's a visible dishonest number shown to a *finisher*, not merely an internal estimator error — a D3/D6 trust ding the bundle never connects.

3. **[S2/S3 — portability, under-severitied] "No export-everything bundle" is a real portability defect for THIS persona, not just "founder triage."** `_results.json` `portability_summary.honest_gap`: story-bible/wiki/memory/findings are retrievable only via N separate raw API calls — "not one file/zip producible from the UI." A non-technical migrator genuinely *cannot* leave with everything; the executor only proved retrievability by making curl-level calls itself. For the "can I leave with all my data" persona this is more than S3.

4. **[S3 — persona severity of D-05] PDF metadata-title omission bites this persona harder than the assigned S3.** `defects.md`/`_results.json` p7fmt-12: docx sets `<dc:title>The Kőszeg Manuscript P7</dc:title>`, PDF metadata title is `None`. For a finisher handing PDFs to POD/beta/agents, the file shows no title in Preview/Acrobat/library views. S3 is defensible but low for the exact buyer.

5. **[minor — evidence completeness] Export `warnings` field never captured.** Every export response is truncated at `...,"estimatedPages":232,"warning...` (p7ro-05/10/15, x4-02). The pipeline self-reports warnings that the executor never surfaced or investigated. Unknown content; should have been read.

6. **[minor — label massage] p7-31 recorded `match=False` then relabeled PASS on an unverified "by design" claim.** `p7-phase3...` p7-31: content-GET returns `title=None`; executor asserts "route doesn't echo title by design" with no source access to confirm. Benign but it's a FAIL re-badged PASS on an assumption.

7. **[coherence gap] "Reorder is broken" (teardown #1 gap) vs. "reorder works" (P7 evidence) left unreconciled.** `competitive-teardown.md` ranks broken reorder as the top competitive wound (corkboard→404, canvas→P2002); P7 proves API reorder works cleanly at 20-ch reversal (`p7-reorder-reanalyze.txt`). They concern different layers (UI vs API) but the bundle never says so, leaving contradictory trust signals for a reader.

## "Suspiciously clean" analysis
125/128 PASS, but this is **not** dishonest cleanliness — the opposite. The executor repeatedly self-flags its own harness bugs (the p7-76/p7-78 self-matching bug that "could never actually report FAIL," disclosed in `p7-phase5...`; 47 first-pass reorder FAILs root-caused as three test-oracle bugs and corrected in `p7-reorder-reanalyze.txt`; smart-quote/act-divider/front-matter oracle gaps). Integrity is high.

The real suspicion is **scope selection**: the clean result is achieved by drawing the boundary around the product's strong core and excluding every path the campaign's *own* teardown calls broken or risky — the import-wizard UX, all worker-gated paths ("hang forever with no error"), editor/immersive-mode autosave (the 30s content-loss window the teardown names), GDPR delete, all LLM quality, and all UI. So 125/128 is true *for the safe plumbing*, and says nothing about the persona's actually-risky journeys. Additionally, Phases 1–2 ship only prose summaries (no raw traces; state JSONs absent), so the two largest check-counts (67 + 21) are the least byte-verifiable in-bundle — I could only rehabilitate the 81K round-trip claim indirectly via the raw reorder-reanalyze exactness. Expected-but-missing failure evidence: any import-parse failure, any hang/timeout, any editor-mode data-loss, any first-run friction, any screenshot.

## One-line overall impression
A high-integrity, adversarially self-checked **data-integrity/portability audit** that convincingly proves the API plumbing is safe (strong D2) but supplies essentially no EXPERIENCE evidence (D4/D6/D9/D10 empty, D3b negative-thin), substitutes API seeding for the migrator's real import journey, and — through its own honest teardown — shows wmb-pub does not win the finisher persona from Scrivener/Vellum.
