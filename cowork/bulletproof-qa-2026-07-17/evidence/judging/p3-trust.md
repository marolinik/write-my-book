# P3 Selena — Judge verdict: TRUST + MANUSCRIPT INTELLIGENCE lens (blind, 2026-07-18)

> Verbatim final report of blind judge (bundle: p3-selena + vector-memory-findings.md + competitive-teardown.md). Saved unedited by team-lead.

## 1. Per-dimension scores

**D1 Functionality — 4.0**
Setup CRUD is clean (series/2 books/21 chapters, all first-try: `_results.json` setup rows, traces `01`–`08`), and one continuity check (`relationship_contradiction`) completes end-to-end on real BYOK extraction (`17_scan_book2_ch9_flagcheck.json`, signature independently recomputed). But the persona's core journey — "catch my Book 2 contradicting Book 1 across 4 advertised failure classes" — does not complete: post-fix, `location_conflict` is founder-disabled, `timeline_violation` is enabled-but-unconstructible (2/2 attempts, `37_neo4j_t4_verify.txt` shows every cross-chapter LEADS_TO degenerating to ch8→ch8 via name-forking), `dead_character_reappears` fires only after a lucky re-arm (`30`→`32`), and chapter-creation 500s on a natural path (D-20, `05a_create_standalone_ch1.json`).

**D2 Reliability & data safety — 4.0**
Prose itself was never lost (all PUTs versioned, first-try). But the derived canon graph — the product's actual value store for this persona — suffered *permanent silent data loss* (D-31: "Eleventh Day Assault" event deleted by `removeChapterEntities`, empty extraction stamped as SUCCESS, poisoned skip-hash — `21` baseline vs `24` poll), and ch7 is a silent permanent failure: 4 triggers across 2 days, every response a clean `200 {"flags":[]}` indistinguishable from healthy (`11_poll_ch7_extraction.log`, 40+ polls, never landed). "Honest failure states" is comprehensively violated on this path.

**D3 Usability — 4.0**
Positives: `meta.notReady` cleanly distinguishes "not yet extracted" from "no series" (`05a_series_context_standalone.json` vs `09_series_context_book2_ch1.json`). Negatives: scan-POST is the only way to list flags (no GET surface), no dismiss verb, throttle is a silent no-op with no indicator (`13a/13b`, `18a/18b`), pre-extraction scans return misleading empty flag lists, and the D-20 collision yields a bare undiagnostic 500.

**D3b Ergonomy & efficiency — NO-EVIDENCE**
Entire bundle is API-level; zero click-path, keyboard, or editor-surface evidence.

**D4 Onboarding / time-to-first-word — NO-EVIDENCE**
Not this persona's mission; the only adjacent datum (D-20's auto-created-chapter trap on the natural create-book→create-ch1 path) is noted under D1/D3.

**D5 Performance feel — 4.5**
Numbers exist and are dev-server-labeled: scans 188–1391ms; extraction ~17–90s in the re-verify session vs 3–5min+ with Monitor timeouts in Day-0 (unexplained variance); `19_intentional_suppress.json` took 9.6s for a status write (executor didn't remark on this). The structural problem is queue honesty: fire-and-forget extraction with zero pending/landed signal — the user cannot tell a scan reflects a stale graph. Worker-proof provided (leaf PID 37060 stable, cross-checked vs P1's capture) — I do not VOID measurements, but note extraction runs in-process in the dev server and the one-in-flight guarantee partly rests on claimed sequencing discipline, not process isolation.

**D6 Look & feel — NO-EVIDENCE**
No UI evidence anywhere in the bundle. (UTF-8 "Zoë" byte-integrity in API payloads is the sole locale-positive, verified in `09b`.)

**D7 Trust & safety — 3.0**
The one ownership probe passed cleanly (`05b_cross_user_link_attempt.json`: 404, no existence leak). Everything else on this lens is damaging: **D-30** is an S1-candidate boundary-crossing WRITE — `upsertRelationship` binds no bookId, and trace `23b` proves it with byte-identical `r.updatedAt` (02:54:33.420Z / 09:04:06.482Z) on edges in BOTH books, Book 1 carrying chapter-6/9 edges it cannot have; the quoted Cypher's only guard (`a.bookId = b.bookId`) makes cross-*tenant* contamination structurally possible for same-named character pairs. **D-28** silently burns the user's own BYOK money on every scan of a failing chapter, forever, with no signal. Injection containment, key confidentiality, and tier-gate behavior: untested in this bundle. For a product whose moat is this graph, a cross-book write defect is disqualifier-grade.

**D8 Manuscript intelligence quality — 4.0** (independently: hard-capped at 8.5 twice over — moot)
Hard-rule findings: (a) **continuity false positives exist** — Book 1's active `relationship_contradiction` flag `52af6dc9` (`26`, `32`, `35`, `38`) flags a contradiction Book 1's prose never contained (contamination-sourced), unsuppressable at source since Book 2's [Intentional] doesn't carry over; and the final `dead_character_reappears` flag includes chapter 8 falsely (retelling, executor's own admission in `38`). (b) **Misquote check**: no line-edit `originalText` exists in this bundle; flag anchors are entity names consistent with graph state; byte-verification against manuscripts is *impossible* because 20 of 21 chapters' prose is absent from the bundle (see §3) — I can confirm no misquote, but I also cannot certify quote fidelity. Genuine positives, verified raw: single-node alias merge across diacritic variants, cross-book alias resolution (`matchedFrom:"Corvin"` in `09b`), death-status flip, one check firing end-to-end with an independently recomputed signature, sticky suppression (`19`/`20a`/`20b`), zero spurious flags from live checks on benign content (`14`). But the net state: 2 of 4 advertised checks non-functional, alias history silently regresses (D-27, `["Zoe"]` across `21`/`25`/`29`/`34`/`37`), the one revived check self-disarms via status overwrite (`29`/`30`), and suppression identity churns with graph evolution (`38`). This is a half-alive moat.

**D9 Retention / habit — NO-EVIDENCE.**

**D10 Delight — 4.0**
One genuine exceed-expectation moment exists and is raw-verified: the sidebar auto-surfacing "Corvin Ashe — dead, matched from alias 'Corvin', last seen Book 1 ch5" (`09b`) is exactly what a series author dreams of. It is undercut in the same payload by a stale deictic description ("died one month prior to this chapter" — wrong book, wrong chapter, wrong timespan; see §2) and by D-25 (sidebar frozen at Book 1's ending forever).

**D11 Competitive edge — 3.0**
The teardown is credible that active cross-book continuity scanning is an open moat nobody (Sudowrite, NovelAI, Novelcrafter, Scrivener) has. But Selena's realistic incumbent is Novelcrafter's mature, *passive but reliable* Codex — and this bundle shows wmb-pub's active alternative currently *corrupts her other books' canon* (D-30), gives false confidence on silently-unextracted chapters (D-28), goes permanently stale for the book she's actually writing (D-25), and loses alias history (D-27), while the table-stakes revision tools she also needs (reorder, find-replace) are broken/absent per the teardown. A continuity-obsessed series pro would not migrate her trilogy onto a graph that writes fiction into books she didn't touch. Concept: moat. Current state: she stays and doesn't pay.

## 2. DEFECTS I FOUND (missed or under-flagged by the executor)

1. **Stale deictic cross-book description (S3, intelligence-quality)** — `09b_series_context_book2_ch2_post_scan.json`: Corvin's sidebar description is "died one month prior to **this chapter**," verbatim graph state written during Book 1 ch5 extraction (`21_neo4j_baseline_book1.txt` line 4) and surfaced unmodified in Book 2 ch2, where the persona's own canon (per `_results.json` setup row) places the death ~6 months back. The flagship sidebar presents contextually-false, deictically-broken canon as fact. Executor logged the payload twice and never flagged it.
2. **Organic event-name forking in Book 1 pre-dates the T4 seeds (S2-family evidence, strengthens D-32c)** — `21_neo4j_baseline_book1.txt`: "Death of Corvin Ashe" (firstAppearance 3) AND "Corvin Ashe's Death" (firstAppearance 5) are BOTH in Book 1's baseline graph — a duplicate Event forked during *plain organic drafting* (ch5's retelling), no adversarial seed involved. The executor proved the fork mechanism adversarially in T4 but missed that their own Day-0 data already exhibits it in the wild, which upgrades it from "edge case under seeded prose" to "happens in normal writing."
3. **`role` churns destructively per chapter (S3, D-27 family)** — Corvin: "supporting" (journey-log ch3 read) → "mentioned" (`21`) → "protagonist" (`25`). Same destructive `ON MATCH +=` overwrite pattern as D-27/D-32a but on `role`, which the sidebar presents as authoritative. Not filed.
4. **9.6-second intentional-suppress response (`19`, elapsedMs 9578)** for a single status-row write — unremarked latency outlier.
5. **Evidence-completeness defect: manuscripts absent.** Only ch7's prose (`ch7_failing_content.md`) exists in the bundle; all other PUT traces carry responses only, with bodies pointed at non-bundle scratchpad files ("bodyFile": "ch9_opposes.md", "Full prose = scratchpad ch6.md"). Every seed-vs-flag claim (what ch6/ch9/ch3 actually say) rests on executor characterization. The briefing's byte-verify duty is unfulfillable by construction.
6. **Worker-proof caveat (`worker-proof.txt`)** — the document itself admits extraction runs in-process in the Next dev server, not the proved worker; the single-measurement guarantee is partially self-attested ("sequencing discipline"). Not voiding, but it weakens the D5 numbers' rigor.

## 3. "Suspiciously clean" analysis

On *failures*, this bundle is the opposite of curated — it self-files 8 defects including two S1s, records FAIL verdicts in its own `_results.json`, and preserves failing bytes. What IS suspiciously absent: (a) **all manuscript prose except ch7** — the one artifact that would let a judge independently verify seeds, extraction fidelity, and entity naming; (b) **any UI evidence whatsoever** — Selena's journey happened entirely in curl; whether the sidebar, flag chips, jumpChapter navigation, or [Intentional] button actually render/behave for a human is unevidenced; (c) **`threads:[]` and `toneDrift:null` in every single series-context payload** — the plot-thread and tone-drift halves of the flagship sidebar were never exercised and quietly vanish from all claims; (d) timeline_violation stopped at 2-of-3 attempts; (e) auto-clear-on-fix code-verified only, never exercised; (f) the 3–5min-vs-90s extraction latency variance between sessions is never explained. The positives that survive scrutiny (alias merge, cross-book match, flag fire, sticky suppression) are all raw-trace-verified and I confirm them; the curation risk is concentrated in what was never attempted, not in what was reported.

## 4. One-line overall impression

Exceptionally honest, forensically strong evidence proving the flagship series-continuity moat is currently half-alive: two of four advertised checks dead, and the live machinery writes false canon into the author's *other* books — a trust wound precisely where this persona's willingness to pay lives.
