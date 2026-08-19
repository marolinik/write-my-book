# P4 re-judge v4 — raw blind verdicts (3-judge Fable panel, 2026-07-27)

## Judge B — Overall 6.0 UNCHANGED, floor D8/D3b/D9/D10 @6.0
Dims: D1 7.0 / D2 6.5 / D3 6.5 / D3b 6.0 / D4 NO-EVIDENCE / D5 6.5 / D6 6.5 / D7 7.0 / D8 6.0 / D9 6.0 / D10 6.0 / D11 6.5.
- Both fixes verified source-precise (live-batch-view.ts terminal-verbatim + Math.max spend floor + Redis under-claim degrade; digest visible-split + "(N discarded as invalid)" incl. 0-visible; locks at batch-route.test.ts:298-380, batch-digest-aggregate.test.ts:72,102, batch-lifecycle.test.ts:567). No drift since.
- Floor logic: v3 driver (D10 count contradiction) credibly closed at source, but floor doesn't move — common driver now the UNPROBED silent-zero trust family: D-123 S3 + D-126 (dedupe hypothesis externally corroborated via D-159/D-107) + D-121 Apply never clicked; D-125 min=1 confirmed still live (batch-editorial-dialog.tsx:281) keeps halt path UI-unreachable.
- Key: LIST route the D-120 fix perfected has NO UI consumer at all — writer-visible impact this cycle zero.
- NEW **D-186 (S4):** list still serves stale completedCount/failedCount mid-run (columns written only by fan-in digest; D-120 derived only status/spend/halted/startedAt) — first UI consumer inherits it. S5 fold-in: all-failed pre-digest children derive status "queued" with non-zero spend (inherited from D-96 logic).
- Scope caveat: "discarded not silently dropped" true only for gate-rejected; dedupe suppressions early-return before create — suppressed structurally cannot explain D-126 near-zero. Honest-zero story half-built.
- Next action: ONE live batch session on fixed build — D-123 halt probe (dump EditFinding by halt child ids vs digest totals), Apply click on hard-wrapped finding (D-121), poll LIST mid-run (D-120 live + D-186 check). Attacks all four 6.0 dims.

## Judge C — Overall 6.0 UNCHANGED, floor D3b/D9/D10 @6.0
Dims: D1 7.0 / D2 7.0 (UP .5) / D3 6.5 / D3b 6.0 / D4 NO-EVIDENCE / D5 6.5 / D6 6.5 / D7 7.0 / D8 6.5 (UP .5) / D9 6.0 / D10 6.0 / D11 6.5.
- RAN the 3 touched test files himself: 51/51 incl. end-to-end digest 5/2-suppressed "never 7 findings". Product-wide commits don't touch batch money path.
- Floor logic: "experience-and-probe plateau" — improved digest never seen in pixels, cap path not drivable, silent-zero family unprobed. "Same lesson as P5 v4: code-only closure moves trust dims (+0.5 D2/D8) but cannot move experience dims."
- Missed by docs: (1) LIST endpoint has ZERO UI consumers (only fetch is the POST) — no batch-history surface at all, bounds D3/D9/D11; (2) D-122 half-covers silent-zero: dedupe suppressions early-return before create, dedupe-to-zero rerun still unexplained 0 (doc over-credits relevance to D-123/D-126); (3) D-125 nuance: min=1 advisory only, submit gate is cap<=0||cap>25 (dialog:138) — typed 0.005 likely submits = MISLEADING AFFORDANCE not unreachable, one probe settles; (4) S5: live spend sums actualCostUsd written at child completion — minutes-long under-report during long child (accepted D-96 semantics, unregistered).
- Next action: live overnight drill, 3-in-1: render "(M discarded as invalid)" notification in pixels (D10); sub-cent halt + dump EditFinding by halt child ids vs digest (D-123); byte-identical rerun near-zero check (D-126); land min={0.01} D-125 rider FIRST so drivable on camera.

## Judge A — Overall 6.0 UNCHANGED, floor D8 @6.0 primary (D3b/D9 co-floor)
Dims: D1 7.0 / D2 6.5 / D3 6.5 / D3b 6.0 / D4 NO-EVIDENCE / D5 6.5 / D6 6.5 / D7 7.0 / D8 6.0 FLOOR / D9 6.0 / D10 6.5 (UP .5) / D11 6.5.
- Both fixes CONFIRMED at source+test, shape endorsed ("routes structurally cannot diverge again"). suspiciouslyClean: No.
- D8 floor driver: unprobed intelligence-quality cluster D-121 (Apply never exercised — "top missing probe" all 3 v3 judges) + D-123 S3 + D-126 (now corroborated cross-persona AND explicitly outside suppressed counter); D-125 keeps halt UI-unreachable.
- NEW: **cancel-mid-run $0.00 lie** — cancel/route.ts:63 flips status:"cancelled" WITHOUT writing spentUsd/completedAt; isBatchTerminal treats cancelled as terminal so BOTH routes serve stored row verbatim = $0.00 from cancel until fan-in reconciles. D-96/D-120 lie class re-opened on the one path v3 never drilled. PLUS terminal-set divergence: cancel route keeps own TERMINAL_STATUSES excluding "halted" vs shared TERMINAL_BATCH_STATUSES including it — two definitions right after a one-definition fix (drift-bait, possibly intentional, undocumented).
- False-comfort risk: "(N discarded as invalid)" reader will assume zeros always explained — dedupe zeros are not.
- Next action: same live session consensus + fold mid-run cancel poll.

# PANEL RESULT: 6.0 UNANIMOUS UNCHANGED — floor is a live-probe plateau, not a code gap
