# D-157 / D-158 / D-159 — new defects from P1 Maya UI re-capture (2026-07-26)

Source: `evidence/p1-maya-rejudge/UI-CAPTURE-2026-07-26.md` (42-series shots, opus capture agent).
Register continues from D-156. Next free after this file: **D-160**.

## D-157 (S2) — discuss reply leaks raw REMEMBER control block + silently drops the constraint on malformed delimiter
- **Symptom:** when the discuss model emits the memory delimiter with TWO closing brackets instead of three, the parseDiscussResponse start-delimiter regex (exact ">>>") fails to match. Three consequences: (a) the raw control block renders **verbatim in the assistant bubble** (internal agent syntax shown to the writer); (b) the intended "I'll remember: ..." constraint chip never appears; (c) the constraint is **never persisted to WriterMemory** — the REMEMBER mechanism silently no-ops.
- **Evidence:** 42a-discuss-thread.png + 42b-discuss-capped-full.png (leak, 2 of 3 live turns on finding 036a088d); 42a-discuss-constraint-chip.png (correct delimiter on b92055ea renders the chip cleanly, 0 leaks) — intermittent model-format drift against a brittle exact-delimiter parser, not a total break.
- **Family:** live-moment honesty + silent-loss (same family as D-104/D-129). Adjacent to D-104 (same parser), distinct mode: over-full leaked bubble, not blank.
- **Fix sketch:** tolerant delimiter (2-3 closing brackets), plus belt-and-braces post-parse sweep that strips any unparsed control-shaped block from display prose and, when it matches a known control verb, still persists it.

## D-158 (S4) — D-113 residual: metadata stamp is header-scoped; wrong word count survives in report prose
- Fresh dev-edit report (run 2, doc 81f4d171) states "Chapter length (~570 words)" while the chapter is 704; report was written header-less, so stampReportMetadata (by design, header lines only) corrected nothing. Pre-fix "Edit Date: 2025" header defect is gone; prose-level wrong numbers remain uncorrectable by the stamp. Evidence: 42d-report-fresh.png vs 42d-report-stale-prefix.png.

## D-159 (S3) — anchor-exact dedup admits semantic near-duplicates
- Dev-edit run 2 created prose finding e8418788 ("has changed" tense clash, anchor "She let them sit...") semantically identical to existing b92055ea (same issue, anchor "She never read them..."). anchor+category normalization treats them as distinct — two near-identical pending findings side-by-side. Not a D-107 regression (D-107 = identical normalized anchor); a scope limitation. Evidence: 42c-findings-after.png top two cards.

## Also confirmed in this capture (no new numbers)
- D-104 fix holds live: 3 discuss turns, 0 blank bubbles; structured-only REVISION renders as AI Rewrite Comparison card; 3-exchange cap honest. Fallback-text path still unit-test-only (disclosed).
- D-107 fix holds live: show-tell cluster stays exactly 3 across a full dev-edit rerun; run-2 report has an explicit "Findings Respectfully Suppressed" section. Legacy duplicates not retro-removed (matches commit scope).
