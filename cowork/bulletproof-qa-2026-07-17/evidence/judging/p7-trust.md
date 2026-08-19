# P7 Bao — Judge verdict: TRUST + MANUSCRIPT INTELLIGENCE lens (disqualifier hunter) (blind, 2026-07-18)

> Verbatim final report of blind judge (bundle: p7-bao + competitive-teardown). Saved unedited by team-lead. (Judge model: Opus 4.8 — re-dispatched after Fable spend limit. Harness note: safety classifier claude-sonnet-5 was unavailable during this subagent's run.)

I now have the complete evidence bundle. I've cross-verified the internal consistency of the traces (the full-reversal reorder, the cross-format word-count identity between docx and epub, the word-count conservation, and the self-corrected harness bugs). Let me deliver the verdict.

---

# PANEL P7 (Bao) — BLIND JUDGE VERDICT

**Lens: TRUST + MANUSCRIPT INTELLIGENCE (disqualifier hunter).** Bundle scope is self-restricted to a **Phase A non-LLM subset** (import, export, organize, delete, edge cases) — so the two surfaces my lens targets deepest (D7 trust-gates and D8 manuscript-intelligence) are largely **untested by construction**. That fact dominates my read.

## 1. Per-dimension scores

**D1 Functionality — 7/10.**
Tested journeys complete correctly: import (67/67, `p7-phase1...txt`), live rename+revert (`p7-phase3...txt` p7-30..33), delete (`p7-phase4...txt` 14/14), oversized-paste boundary and autosave race (`p7-phase5...txt`), and 20-chapter full-reversal reorder→export (`p7-reorder-export-verify.txt`/`-reanalyze.txt`). Merge/split confirmed absent (feature gap, not failure); find & replace never even probed though the persona's job is "reorganize." Two real export FAILs remain. The reorganize toolkit is thin for a migrator, and the actual **import wizard was bypassed** (raw chapter-create + content-PUT used instead), so the migrator's real entry path is unproven.

**D2 Reliability & data safety — 8/10.** *(strongest dimension; my lens-adjacent)*
Genuinely strong and the crown jewel of this bundle: byte-exact 20-chapter round-trip incl. diacritics; **cross-format per-chapter word-count identity** — I independently confirmed docx (`p7ro-08`) and epub (`p7ro2-02`) report the *same* word count for all 20 chapters (e.g. Dead Reckoning 4170/4170, Façade 4237/4237), which corroborates zero content loss across formats; word-count conservation across reorder (`p7ro-22`: 84,556 == 84,556, which I re-summed from the 20 per-chapter counts); reorder preserves each chapter's *own* body (no D-03 body-swap); autosave race is last-write-wins with no interleaved bytes (`x4-06`: single marker); 2M-char boundary is a clean 400 not 500. Held below 8.5 by real caveats: **phase-1 raw trace is a self-admitted reconstruction** ("not preserved verbatim"), the **delete orphan check is API-observable only** (no Neo4j/Qdrant/DB purge proof — see defect below), the export can capture a **stale mid-autosave version** (`x4-03` settled on D, `x4-06` export captured A), and GDPR full-account delete was deferred.

**D3 Usability — 6/10 (thin evidence).**
Only API-level error quality is evidenced: clean 400 vs 500 (`p7-72`), plain "Book not found" 404s (`p7-phase4`). No state-visibility, undo/cancel, or in-UI error evidence exists (all verified "via API only, not visually"). Scored at internal-tool level on the narrow error-handling slice only.

**D3b Ergonomy & efficiency — NO-EVIDENCE.**
No keyboard/click-path evidence. The one relevant signal is negative: the "leave with everything" path requires N separate raw API calls (no export-everything bundle) — a dead-end for a non-technical migrator. Insufficient to score the dimension.

**D4 Onboarding / time-to-first-word — NO-EVIDENCE.**
Migrator onboarding = the import wizard, which was not exercised (raw API used instead).

**D5 Performance feel — 7/10.**
Sub-200ms CRUD at 80K words (chapter-list GET p50 47/p95 47; content PUT p50 172/p95 188, `_results.json` d5 block). Caveats: **environment not labeled dev vs prod** (rubric wants dev-server labeled), n=10 small sample, GET min/max null, and no stream-cadence/queue-honesty evidence (no LLM path exercised).

**D6 Look & feel — NO-EVIDENCE.**
No theme/contrast/locale-UI/empty-state evidence. Unicode integrity (façade/Zürich/Łódź/Kőszeg preserved) is a data-layer positive, not look-and-feel.

**D7 Trust & safety — 6/10.** *(my lens; mostly NO-EVIDENCE within the dimension)*
Positive tested slice: **data portability** (every non-chapter class — story bible, wiki, memory, findings — round-trips through its own GET route, `p7-phase3` p7-35..42) and **deletion returns clean 404s** (`p7-phase4`). But the classic trust surface is entirely **NO-EVIDENCE for this persona**: no cross-tenant/ownership test (all requests are the same `user_qa_p7`), no tier-gate enforcement despite "professional subscription," no key confidentiality, no injection containment, no billing-state test. Worse, my own bundle's `competitive-teardown.md` (lines 25, 150, 203, 213) documents **live, unresolved trust defects P7 never clears** — Coach force-run on `${provider}/sonnet` regardless of the user's chosen model, discuss threads hardcoded to Haiku, **billing Claude-Sonnet prices under a qwen label**, and fake widgets (AuthorshipTracker always "100% human"; Story Radar/Daily Plan heuristic placeholders labeled "AI monitoring"). Score reflects the working narrow slice minus low confidence and documented-but-uncleared wounds.

**D8 Manuscript intelligence quality — NO-EVIDENCE.** *(my lens)*
Zero LLM/editorial evidence — no line-edit (voice preservation), no LLM-anchored findings (the one "finding" at `p7-41` is a plain CRUD POST returning `{"created":1}`, no quote/anchor to verify), no continuity flags, no discuss, no memory-constraint test. **No D8 hard-rule cap triggers** because there are no findings/flags to misquote — but equally nothing to credit. The teardown *claims* this loop is "the best-engineered part," but a claim is not testable evidence.

**D9 Retention / habit — NO-EVIDENCE.** Radar/health/streaks explicitly deferred.

**D10 Delight — NO-EVIDENCE.** No exceed-expectation product moment (the rigor lives in the QA harness, not the product surface).

**D11 Competitive edge — 5/10.** *(my lens; grounded in `competitive-teardown.md`)*
For Bao's actual job (migrate in → organize → finish/leave), the incumbent is Scrivener/Vellum/Docs. wmb-pub **safely receives and keeps** the manuscript (real advantage vs chatbots), but loses the persona's core stages: no find & replace (teardown gap #2), reorder **UI** broken (corkboard 404 / canvas P2002, gap #1 — note P7 only proved the raw *API* reorder works, never the broken UI paths), thin/unexercised export with a 40%-off page estimate + missing PDF title, and still needing a $147–250 formatter (teardown §5). The product's genuine moats (series continuity, editorial loop) are **irrelevant to a pure migrator/finisher**. Would Bao switch and pay for finishing? Not yet — he keeps his incumbent. The teardown itself is high-quality, well-cited, and honest.

## 2. Defects I found (executor missed or under-weighted)

- **[TRUST, S3] Delete drill proves API-hiding, not purge.** `p7-phase4` confirms 404s but the executor's own note limits it to "the API-observable layer." Given Neo4j + Qdrant hold entity/vector data (teardown §continuity), a book DELETE may orphan graph nodes / vectors / version-history / memory rows. For a migrator's "delete means delete / right-to-be-forgotten" trust, this is unverified. Executor flagged the scope honestly but did not rate it a risk.
- **[RELIABILITY, S4] Concurrent export captures a stale, non-final version.** `x4-03` shows the DB settled on version D while `x4-06` shows the exported docx captured version A. The executor frames this as "correct behavior"; for a *finisher* exporting a final manuscript while autosave is in flight, the export can silently lag the latest edit. Real edge case, under-weighted.
- **[COVERAGE] Migrator's real entry path (import wizard) untested.** "Safely receive it" is proven only via raw chapter-create/content-PUT, not the actual import feature a real migrator would use.
- **[COVERAGE] Find & replace never probed** despite being the table-stakes reorganize tool for this persona (teardown gap #2). Merge/split were probed; the more important one was not.
- **[EVIDENCE HYGIENE] No phase-2 raw trace in the bundle.** The two headline export FAILs (Z15/B3 page-estimate; **D-05 PDF-metadata**) live only in `_results.json`/`defects.md` narrative + unprovided state JSONs. I could corroborate **estimatedPages=232** (appears in `p7ro-05/10/15`; 232/165 = 40.6% arithmetic checks out) but **cannot byte-verify "165 actual pages" or "pdf metadata.title == None"** from any provided payload. Phase-1's trace is likewise a self-admitted reconstruction.
- **[EVIDENCE HYGIENE] Word-count totals disagree across scripts** (phase-1 81,095 vs reorder local 84,556 vs API export 81,180). Not a product defect — per-chapter integrity holds and it's a tokenizer difference between harness scripts — but a careful reader notices and the executor never reconciles it.

## 3. "Suspiciously clean" analysis

**Verdict: NOT fabricated-clean, but scope-selected toward the product's strongest surface.** The raw traces actively show mess — the first-pass reorder run has ~40 FAILs on PDF/EPUB (`p7-reorder-export-verify.txt`), and the executor discloses its *own* harness bugs (a self-match check that "could never report FAIL," a wrong ≥0.30 threshold, a front-matter offset, a `<title>`-tag bleed). I independently validated the EPUB self-correction: the corrected real-chapter word counts (`p7ro2-02`) exactly equal the docx counts (`p7ro-08`) for all 20 chapters, so the first-pass EPUB failure was a genuine front-matter/offset harness artifact, not hidden content loss. That transparency *raises* credibility.

The cleanliness (125/128) is real for what was tested, but the 97.7% covers the product's **best-engineered surface** (CRUD/autosave/export data-safety) while its **documented-weakest surfaces were deferred**: all LLM/editorial manuscript-intelligence (D8), the broken reorder **UI**, model-identity/billing honesty, all tier/ownership/injection trust gates (D7), GDPR delete, and all visual/UX. **Failure evidence I expected and did not find:** any negative result on the surfaces where this product's own teardown says it bleeds. The disqualifier hunt for this persona comes up empty *only because the surfaces where disqualifiers live were not exercised* — the bundle should not be read as evidence that those surfaces are clean.

## 4. One-line overall impression

Rigorous, self-critical, transparently-messy QA that convincingly proves this product's data-safety crown jewel (import/reorder/export integrity at 80K words) — but it exercises the product's strongest slice while deferring exactly the trust-gate and manuscript-intelligence surfaces my lens exists to scrutinize, so D7 is a narrow 6, D8 is NO-EVIDENCE, and the in-bundle teardown's documented model-billing-honesty defects stand entirely uncleared.
