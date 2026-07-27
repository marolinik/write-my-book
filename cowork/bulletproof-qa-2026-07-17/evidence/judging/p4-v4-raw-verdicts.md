# P4 re-judge v4 — raw blind verdicts (3-judge Fable panel, 2026-07-27)

## Judge B — Overall 6.0 UNCHANGED, floor D8/D3b/D9/D10 @6.0
Dims: D1 7.0 / D2 6.5 / D3 6.5 / D3b 6.0 / D4 NO-EVIDENCE / D5 6.5 / D6 6.5 / D7 7.0 / D8 6.0 / D9 6.0 / D10 6.0 / D11 6.5.
- Both fixes verified source-precise (live-batch-view.ts terminal-verbatim + Math.max spend floor + Redis under-claim degrade; digest visible-split + "(N discarded as invalid)" incl. 0-visible; locks at batch-route.test.ts:298-380, batch-digest-aggregate.test.ts:72,102, batch-lifecycle.test.ts:567). No drift since.
- Floor logic: v3 driver (D10 count contradiction) credibly closed at source, but floor doesn't move — common driver now the UNPROBED silent-zero trust family: D-123 S3 + D-126 (dedupe hypothesis externally corroborated via D-159/D-107) + D-121 Apply never clicked; D-125 min=1 confirmed still live (batch-editorial-dialog.tsx:281) keeps halt path UI-unreachable.
- Key: LIST route the D-120 fix perfected has NO UI consumer at all — writer-visible impact this cycle zero.
- NEW **D-186 (S4):** list still serves stale completedCount/failedCount mid-run (columns written only by fan-in digest; D-120 derived only status/spend/halted/startedAt) — first UI consumer inherits it. S5 fold-in: all-failed pre-digest children derive status "queued" with non-zero spend (inherited from D-96 logic).
- Scope caveat: "discarded not silently dropped" true only for gate-rejected; dedupe suppressions early-return before create — suppressed structurally cannot explain D-126 near-zero. Honest-zero story half-built.
- Next action: ONE live batch session on fixed build — D-123 halt probe (dump EditFinding by halt child ids vs digest totals), Apply click on hard-wrapped finding (D-121), poll LIST mid-run (D-120 live + D-186 check). Attacks all four 6.0 dims.
