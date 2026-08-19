# P4 "Priya" — RE-JUDGE defects (raw, evidence-only)

Severity S-scale: S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output > S3 friction/observability > S4 cosmetic. No fixes applied (evidence-gathering only). Raw traces in api-traces/.

---

## CONFIRMED-OPEN — D-20 (task calls it "D-18"): chapter-number collision returns a raw 500, not a clean 4xx

- Class: S3 (friction / poor error contract). Registry ID is D-20 (filed by p3-selena, commit 52ce465). NOTE the task labels it "D-18", but campaign registry D-18 is a different, fixed defect (OS-command-injection in export, d2d33f0). No fix commit exists for the chapter-collision.
- Repro (LIVE, 02_d18_chapter1_collision.json): book-create auto-creates placeholder chapter 1; then POST /api/books/{id}/chapters {actNumber:1, chapterNumber:1} -> HTTP 500 {"error":"Failed to create chapter"}.
- Root cause (source, no edit): src/app/api/books/[id]/chapters/route.ts POST catch handles invalidJson / Unauthorized / Zod, then a generic 500 fallback. Prisma unique-constraint P2002 is not mapped to a 409/4xx. (Contrast: the chapter-CONTENT PUT route DOES handle P2002 gracefully — the create path there converges; the chapters CREATE route does not.)
- Impact for Priya: any client/script that re-creates chapter 1 (a common shape) gets an opaque 500 that looks like a server fault rather than a clear "chapter already exists" 409. Journey-workaroundable (PUT content onto the existing placeholder), so not blocking, but the error contract is wrong.
- Suggested (not applied): map P2002 to 409 {error:"Chapter number already exists"} in the POST catch, mirroring the content route's P2002 handling.

---

## NEW-1 (S3, queue/progress honesty) — batch children never surface as "running"; an executing, spending child shows as "queued"

- Discovered live during the Gate-4 cap batch: child ch1 completed with actualCostUsd $0.109 (a multi-turn dev-edit, ~30-90s of real work) yet was observed as status "queued" across 18 consecutive polls (~140s) and then jumped straight to "completed" — it was demonstrably RUNNING while the poll API reported it "queued". Same pattern in the healthy batch (a child queued ~270s then completed).
- Root cause (source, no edit): in src/lib/queue/agent-worker.ts, batch children are created status "queued" (enqueueBatchFlow) and are only ever updated to "skipped" / "completed" / "failed" — there is NO transition to "running". The poll route GET /api/books/:id/batch/:batchId derives counts.running from AgentSession.status, so counts.running is effectively always 0 for batch children.
- Impact for Priya: while polling an overnight run she cannot distinguish "child not started" from "child running right now and spending". Live progress under-reports in-flight work; a long-running child looks stuck in the queue. IMPORTANT: money accounting is unaffected and exact — this is observability only, not a spend/data-safety bug.
- Not a spend fabrication: terminal counts (completed/failed/skipped) and all spend figures are honest. Severity S3.
- Suggested (not applied): set AgentSession.status = "running" at the start of processAgentJob for batch children (after the skip-guard passes), so the poll API reflects genuine in-flight state.

## NEW-2 (S4, cosmetic) — sub-cent budget cap renders as "$0.00 cap" in the digest notification

- Live evidence (24_batch_cap_final_analysis.json): with budgetCapUsd = 0.002, the "Overnight batch complete" notification message reads "2/3 passes · 1 skipped · 43 findings · $0.16 / $0.00 cap". The spend ($0.16) is honest, but the cap prints as $0.00 because the message uses batch.budgetCapUsd.toFixed(2) (src/lib/queue/batch-digest.ts ~line 199), which floors any cap below $0.005 to "$0.00".
- Impact: only reachable with an unrealistic <$0.005 cap (the route's normal floor and Priya's realistic caps are $5-$25, and MAX is $25). The digest DATA (digest.budgetCapUsd) shows the true 0.002 — only the human-readable message string loses precision. Surfaced here purely because the test cap was deliberately sub-cent to drive the halt. Severity S4.

---

## Observation (NOT a defect) — transient provider failure honestly reported
Healthy-batch child ch3 failed with 0 conversation turns and $0 cost (15_failed_child_probe.json) — a provider failure at spawn/first-call, honestly resolved to "failed" (D-36) with zero charge; the digest truthfully reported 2/3 passes and did not count the failed child's (zero) spend. This is positive D2/D7 honesty evidence, likely amplified by concurrent-agent load on the shared single worker. No silent-green, no fabricated spend.
