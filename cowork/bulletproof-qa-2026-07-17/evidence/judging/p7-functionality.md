# P7 Bao — Judge verdict: FUNCTIONALITY + RELIABILITY lens (blind, 2026-07-19)

> Verbatim final report of blind judge (bundle: p7-bao + competitive-teardown). Saved unedited by team-lead. (Judge model: Fable 5 — third dispatch after Fable then Opus spend limits.)

# PANEL P7 (Bao, migrator/finisher) — BLIND JUDGE VERDICT — Lens: FUNCTIONALITY + RELIABILITY

**Bundle inventory read (exhaustive):** journey-log.md, _results.json, defects.md, all 7 api-traces (p7-phase1-day0-import-summary.txt [reconstructed, disclosed], p7-phase3-organize-portability.txt, p7-phase4-delete-drill.txt, p7-phase5-edge-cases-and-export-determinism-diag.txt, p7-reorder-export-verify.txt, p7-reorder-reanalyze.txt, p7-x4-race-export-autosave.txt), competitive-teardown.md.

**Arithmetic re-derived:** phase totals 67+21+15+14+11 = 128 ✓; passes 67+19+14+14+11 = 125 ✓; PDF estimate error |232−165|/165 = 40.6% ✓; reorder per-chapter word counts in p7-reorder-export-verify.txt sum to exactly 84,556 ✓ (hand-verified). Export speed independently corroborated via filename timestamps in raw traces (docx 00:16:46 → pdf 00:16:49 → epub 00:16:56 → re-export 00:17:00 — an 81K-word book exports each format in ~2–7s).

**Worker-proof rule:** no agent/LLM measurements exist in this bundle (llm_cost_estimate 0, all exports synchronous API 200s) — nothing VOID.
**D8 hard-rule caps:** not triggered — no LLM findings exist, no manuscripts/ dir in bundle, nothing to byte-verify.

## 1. PER-DIMENSION SCORES

**D1 Functionality — 7.5.** Tested journeys complete correctly, raw-trace evidenced: 20-chapter/81K-word import + structure verification (phase1 summary), rename round-trip (p7-phase3 p7-30..33), full-reversal reorder {"reordered":20} with DB-order confirmation (p7-reorder-export-verify p7ro-02..04), word-exact export in all 3 formats post-reorder (p7ro-08 docx 20/20; p7-reorder-reanalyze p7ro2-02 epub 20/20 ratio 1.0000; p7ro2-04 pdf own-sim ≥0.9956 unique argmax ×20), clean delete drill (p7-phase4 14/14). Held back by two genuine functional defects (D-05 PDF metadata title absent; Z15/B3 page estimate 40.6% off) and persona-goal walls: no merge/split (confirmed by 2×404 + 1×405 probes), no export-everything bundle, no find-and-replace (teardown).

**D2 Reliability & data safety — 8.0.** Strongest part of the bundle, mostly raw-trace evidenced: zero content loss across docx/pdf/epub after a 20-chapter full-reversal (p7ro-08/09, p7ro2-02/03/05); no torn snapshot exporting during 5 concurrent autosaves — exactly one race marker in exported slice (p7-x4 x4-06), original restored+verified (x4-08); clean 400 not 500 at the 2,000,001-char boundary (p7-phase5 p7-72); delete leaves no API-visible orphans across 5 surfaces (p7-phase4 p7-58..63); export "determinism" root-caused to timestamp-only byte drift, body text byte-identical (p7-phase5 diag). Deductions: phase-1 byte-exact unicode round-trip is a reconstructed summary, not raw; the 2M-char save was never read back or exported; 5 concurrent PUTs all 200 while 4 versions silently discarded (409/optimistic-locking machinery never probed); user-facing estimatedPages 40% wrong (honesty blemish, pre-tracked).

**D3 Usability — 6 (low confidence, API-layer only).** Evidence limited to error semantics: correct clean-400 at boundary (p7-72), honest plain-JSON 404s post-delete (p7-phase4), sensible 405. No UI, no undo/cancel/recoverability evidence (editor UI explicitly deferred per _results.json). Error copy inconsistent ({"error":"Not found"} for wiki vs {"error":"Book not found"} elsewhere, p7-61 vs p7-58..60/62).

**D3b Ergonomy & efficiency — 5 (low confidence, single-finding).** Only dimension-relevant evidence is a documented dead-end: a non-technical migrator cannot "leave with everything" — full egress requires N separate raw API calls per data class, no one-click bundle (_results.json portability_summary.honest_gap; defects.md portability section). Click-path/keyboard evidence: none.

**D4 Onboarding — NO-EVIDENCE.** Day-0 "import" was scripted API seeding, not the product's import wizard; no fresh-user surface, wall, or offer ever exercised.

**D5 Performance feel — 7.5.** Real numbers at 80K-word scale: chapter-list GET p50/p95 47/47ms, dashboard 46/62ms, content GET 47/63ms, content PUT p50 172/p95 188ms (min 140/max 203, n=20) (phase1 summary; _results.json d5 block); 81K-word exports complete in seconds per format, independently corroborated by filename timestamps in p7-reorder-export-verify.txt. Dings: numbers not environment-labeled (rubric expects dev-server labeling), GET series n=10, phase-1 numbers from reconstructed summary, and the one perf-adjacent number users see (estimatedPages 232 vs 165 actual) is dishonest.

**D6 Look & feel — NO-EVIDENCE.** Zero UI evidence. Locale-adjacent note for aggregation: content-layer diacritics flawless (round-trip, docx dc:title correct) while export FILENAMES mangle diacritics (see J-1).

**D7 Trust & safety — 6.5 (partial-scope).** Positive: deletion actually deletes across all API surfaces immediately (p7-phase4); every data class individually retrievable (egress honesty, p7-phase3 p7-35..42). No tier-gate, cross-tenant, key-confidentiality, or injection evidence in this bundle — score covers only the delete/egress slice.

**D8 Manuscript intelligence — NO-EVIDENCE.** Zero LLM invocations by design; the single editorial finding was manually authored CRUD. Caps not applicable.

**D9 Retention — NO-EVIDENCE.** Dashboard latency-probed but stats content never validated.

**D10 Delight — 6.** The migrator's core anxiety (will 81K diacritic-heavy words survive import → reorder → export → leave?) is handled with quiet excellence — word-exact across a full 20-chapter reversal in three formats — but nothing rises to an exceed-expectation product moment; competence, not delight.

**D11 Competitive edge — 6.** Vs Bao's natural incumbent (Scrivener, teardown §4): wmb-pub now wins the reorder fight the teardown listed as gap #1 (D-03 fix verified here at 20-chapter full-reversal scale, updating the teardown's "export thin & unexercised" — now exercised and largely held), and its data-safety evidence beats anything in the Scrivener column. But merge/split, find-and-replace, outline/synopsis, and compile maturity (D-05, page estimate, no bundle egress) remain Scrivener wins; the teardown's conclusion — the migrator still buys a $147–250 formatter for the last mile — stands on this evidence.

## 2. DEFECTS I FOUND (missed or misrepresented by executor)

- **J-1 (S3/S4) — Export filenames mangle diacritics.** "The Kőszeg Manuscript P7" → "The-Kszeg-Manuscript-P7-*.docx/pdf/epub" — the "ő" is silently DROPPED, not transliterated, misspelling the title in every downloaded file. Visible ≥8 times across raw traces (p7-phase5 p7-76b/p7-77/diag; p7-reorder-export-verify p7ro-05/10/15; p7-x4 x4-02), never remarked upon — a striking miss for a unicode-focused persona. Every non-ASCII book title ships a misspelled filename to beta readers/agents.
- **J-2 (evidence integrity) — X4 payload-size narration contradicts trace arithmetic.** defects.md claims "~9,000-word payloads"; the mid-race export reports wordCount 80,179 vs 81,180 baseline (−1,001), implying ~3,170-word payloads replacing a 4,170-word chapter (x4-02 vs p7ro-05). A 9,000-word payload would push ~86K. The no-tearing conclusion (x4-06 marker check) still stands, but the narration is wrong.
- **J-3 (evidence quality) — Three unreconciled totals for the same unchanged book:** 81,095 (phase 1, API-agreed), 84,556 (reorder-harness local tokenizer, sum verified), 81,180 (export API). Each comparison internally consistent (same tokenizer both sides) but never explained; a naive reader could misread as content growth.
- **J-4 (S3, possibly by-design) — 200-for-lost-writes never probed.** Five concurrent PUTs all 200, four versions silently vanished (p7-phase5 p7-73/74). The product's touted optimistic-locking/409 machinery (teardown "Production-grade data safety") was never exercised — no probe of whether the API can ever 409. For a "writer's words never lost" bar, success responses for discarded writes deserved a finding, not an unqualified PASS.
- **J-5 (test gap) — The 2M-char chapter was never read back nor exported.** p7-71 verifies PUT→200 only; no GET confirming persistence, and the pathological book was never exported — "export never truncates" was only tested at benign ~4K-word chapters. The truncation stress case was set up and abandoned.
- **J-6 (evidence gap) — Export `warnings` field never inspected.** Every export response in every trace truncates at "warning…"; contents never shown or asserted.
- **J-7 (evidence completeness) — Largest phase and both headline defects lack raw artifacts.** Phase 1 (67/128 checks) is a reconstructed summary (disclosed); p7_phase2_state.json — sole cited evidence for both D-05 and the Z15/B3 repro — is NOT in the bundle. Only the estimatedPages=232 half is raw-corroborated (p7ro-05/10); pypdf actual=165 and metadata.title==None are narration-only.
- **J-8 (S4) — Error-copy inconsistency** post-delete: wiki returns {"error":"Not found"} while book/content/chapters/documents return {"error":"Book not found"} (p7-phase4 p7-61 vs p7-58..60/62).
- **J-9 (question) — documents count=21** in the portability sweep (p7-phase3 p7-36) where only 1 was seeded; the other 20 (presumably auto-created per-chapter docs) never explained.

## 3. "SUSPICIOUSLY CLEAN" ANALYSIS

This bundle is conspicuously NOT clean in the suspicious sense — it is self-incriminating in a credibility-earning way: it discloses its own never-fail harness bug (p7-76/78 record() always self-matches, p7-phase5 lines 11–14), preserves 50+ FAIL-labeled lines from the first reorder pass in raw form alongside the corrected re-analysis, and documents six separate self-inflicted test-oracle bugs with root causes. What remains suspicious/missing: (a) the cleanest-looking phase (phase 1, 67/67) is exactly the one with no raw evidence; (b) every referenced state JSON is absent from the bundle, including the sole artifact behind both genuine defects; (c) the disclosed never-fail harness pattern was audited in only 2 checks — nothing rules it out elsewhere; (d) expected-but-absent failure evidence: not a single 500 anywhere (D-01 shows the codebase has 500 paths; none hunted beyond one boundary), no reorder-during-export race (only autosave-during-export), no export of the pathological 2M-char book, and zero UI evidence for a persona whose real-world counterpart lives in the import wizard and corkboard. The 125/128 headline is honest about what was tested, but what was tested is the API happy-ish path of a system whose historically broken layer (UI reorder, per teardown) sits untouched above it.

## 4. ONE-LINE OVERALL IMPRESSION

Exceptionally honest, self-auditing API-level evidence that convincingly proves the migrator's core promise — 81K diacritic-heavy words survive import, full-reversal reorder, triple-format export, races, and deletion word-for-word — but it is UI-blind, missing raw artifacts for its largest phase and both headline defects, and blind to several on-theme misses (mangled diacritic filenames, silent last-write-wins, the abandoned 2M-char truncation stress), leaving a product provably safe to arrive at and leave from, yet still demonstrably thin to LIVE in for this persona.

**Score table for aggregation:** D1=7.5, D2=8.0, D3=6 (low-conf), D3b=5 (low-conf), D4=NO-EVIDENCE, D5=7.5, D6=NO-EVIDENCE, D7=6.5 (partial-scope), D8=NO-EVIDENCE, D9=NO-EVIDENCE, D10=6, D11=6. No score ≥9.5 awarded.
