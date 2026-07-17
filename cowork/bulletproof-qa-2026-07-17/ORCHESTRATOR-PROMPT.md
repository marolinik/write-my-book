# GOAL PROMPT — Bulletproof Full-Platform QA: 8 Writer Personas to 9.5/10 (wmb-pub)

> Paste this entire file as the goal for a **Fable 5** session in `D:\Projects\wmb-pub`.
> Companion files (same directory, read ALL before starting):
> - `TEST-PLAN.md` — the 8 personas, journeys, per-persona exit criteria, race matrix, gap personas
> - `COVERAGE-MATRIX.md` — exhaustive feature inventory (UI/API/capability); every row must end COVERED
> - `GRADING-PROTOCOL.md` — rubric (12 dims), calibration anchors, evidence rules, anti-inflation rules, the WRITER-TRUST VERDICT gate, metric pre-registration
> - `FLAGSHIP-ADDENDUM.md` — workstreams W1–W20: competitive head-to-head, voice integrity, longitudinal, data safety, confidentiality, money-path, parity, craft, WCAG, i18n, funnel, regression-lock, gap personas, honest-limits
> - `ENVIRONMENT-AND-LIMITS.md` — RUNNABLE / BLOCKED-ENV / N-A-STRUCTURAL classification + honest-limits manifest
> - `inventory/{UI,API,CAPABILITY}-SURFACE.md` — the verified surface the matrix is built from
> **Branch:** run off `origin/main` (478359c+). Cut `qa/bulletproof-<date>` from it. Check `git worktree list` first; never mutate a branch another session has checked out.

---

## Mission

wmb-pub ("Write My Book") claims to be production-ready as the best AI writing companion for serious authors. Prove it — or make it so. Execute a complete, evidence-based QA campaign across **8 writer personas** (TEST-PLAN.md) covering **every feature, every capability, every journey, usability, and retention pull**. Find defects, fix them, re-test, and iterate until **every persona grades ≥ 9.5/10** under the honest rubric — or until you hit a proven, evidence-documented ceiling that requires a founder decision.

**Definition of done (all six required):**
1. Every row of `COVERAGE-MATRIX.md` marked PASS / FIXED+PASS / N-A-with-reason / BLOCKED-ENV-with-reason. No blanks.
2. All 8 personas ≥ 9.5/10 by the judge protocol (12 dims), linked evidence (screenshots, manuscripts before/after, transcripts, API traces).
3. The **WRITER-TRUST VERDICT** passes: zero words lost, voice-integrity within bounds, 0 misquotes, 0 continuity false positives, money caps hold, switch-test ≥ 6/8, golden paths green in CI.
4. All defects fixed (committed, tested, regression-locked) or triaged to a founder-decision list with severity + repro.
5. Golden-path regression suite (one journey per persona) added + green in CI (W12).
6. Final report `cowork/bulletproof-qa-<date>/FINAL-REPORT.md` (+ `competitive-teardown.md`, `egress-ledger.md`, funnel scorecard, ops-gate status box) + handoff via the handoff skill.

## Your role and model routing

You are the **lead orchestrator**. Do not execute every test yourself — delegate and verify.

| Work | Route to |
|---|---|
| Orchestration, defect root-cause, fix design, final judgment calls | **You (Fable 5)** |
| Blind editorial-quality judging (voice, coaching tone, flattening), adversarial grade verification, subtle-defect hunts | **Opus** subagents (+ ≥1 cross-family judge) |
| Mechanical journey execution (Playwright), API sweeps, matrix row verification, corpus seeding, test writing | **Sonnet** subagents |
| Massive fan-out (per matrix section / per persona leg / per probe batch) | Workflow tool — this goal is your explicit multi-agent opt-in |

Parallelize aggressively: personas are independent ONCE isolated (own user, own books); matrix sections are independent. Adversarially verify every claimed defect AND every claimed pass (a false PASS is worse than a false FAIL).

## Environment boot (verified recipe) — read ENVIRONMENT-AND-LIMITS.md first

1. **Stack:** Docker up (`wmb-pub-postgres-1` :5432, neo4j :7687, borrowed `platform-new-*` redis/minio/qdrant). Web: `PORT=3002 npm run dev`. Worker: `npm run worker:dev`. Gate on `/api/health/dependencies` = READY (includes schema-DRIFT + worker-liveness probes).
2. **PER-PERSONA ISOLATION (non-negotiable — the #1 integrity rule):** WriterMemory, BYOK keys, budget ledger, streaks, and books are **user-scoped in a shared Postgres**. The dev setup has ONE `DEV_AUTH_BYPASS` user — running 8 personas through it poisons every D8/D9 measurement with each other's memory writes and budget spend. Seed **one user row per persona** (distinct clerkId; follow the pattern in existing seed/e2e utilities — verify mechanism in Phase 0) and bind each executor's session to its own user. **Phase 0 asserts a positive cross-contamination test:** write a WriterMemory constraint as persona A, prove it is ABSENT from persona B's prompt assembly and API, before ANY grading. If that assertion fails, all D8/D9 grades are void.
3. **WORKER HYGIENE (the #3-confound rule):** exactly ONE worker process. Stale `tsx` workers survive TaskStop, process jobs on OLD code, and have already produced one false verdict. Before every agent-output measurement: PowerShell process sweep (cmdline match `Projects\wmb-pub` + `tsx`/`node`), kill strays, capture the proof into the evidence bundle (GRADING §8). Check BullMQ `processedOn`/`finishedOn` before declaring a job wedged.
4. **Real model only:** BYOK OpenRouter key (`ork.txt`) → `openrouter-qwen36/*`. Voice/quality gates report qwen + one stronger model where available (model-conditional verdicts). No echo/mock grading.
5. Drive the UI via **Playwright MCP** — never ask the user to click. Capture is automated + exhaustive and OFF the executor (auto-screenshot every step, full console/network wholesale, video/trace on judged flows). A separate adversarial agent re-captures the risky-row sample (data-loss/voice/billing/ownership) from its OWN fresh persona user.
6. **Confidentiality capture (W5) is server-layer:** route the app's outbound through a logging proxy (HTTPS_PROXY→mitmproxy+CA) or instrument fetch — browser logs cannot see server→provider traffic. No server-layer capture → W5 = BLOCKED-ENV, never "0 defects."
7. **Fault injection (W4):** deterministic env/test fault flags (throw-before-persist, kill-9 worker mid-job, network-kill via Playwright route abort, byte-flip on throwaway DB) — no "sometimes reproduces" gates. Each defect found ships a regression test RED on pre-fix commit.
8. **Time-gated surfaces:** streaks/daily-plan (seed backdated word-count + version rows), Tonight-2am batch (short synthetic delay — children must not spend before schedule), 24-child overnight batch (real run, background job with interval checks).
9. **Stripe:** test-mode checkout runnable; webhook flips via `stripe listen --forward-to` or signed synthetic events. Live Stripe/Clerk = BLOCKED-ENV (C3 founder op).
10. **BLOCKED-ENV honesty:** real incumbent paid accounts, real mobile hardware, human usability, live billing, prod DB — test what's testable, mark the rest with exact reason + what WAS covered. Never claim a pass on a blocked item.

## Campaign phases

**Phase −1 — Competitive teardown.** Research agent produces `evidence/competitive-teardown.md` (FLAGSHIP-ADDENDUM): Sudowrite, NovelAI, Novelcrafter, Scrivener/Plottr, Atticus/Vellum, ProWritingAid, ChatGPT/Claude raw, Google Docs — per gap: MATCH / DELIBERATELY-DIFFERENT / REAL-GAP. Also **pre-register** (commit) the W2 corpora + probe sets and W1 task suites, half authored by a red-team agent incentivized to make wmb-pub lose (W15).

**Phase 0 — Boot + smoke + isolation proof.** Stack up, health READY, one end-to-end chapter-write with the real model, autosave round-trip, findings pipeline smoke, per-persona users seeded, **cross-contamination assertion passed**, ONE-worker proof captured, judge-panel planted-defect calibration run (GRADING §5). Fix anything broken here before fan-out.

**Phase 1 — Coverage-matrix sweep.** Fan out Sonnet agents per matrix section (editor, onboarding, editorial, continuity/series, batch, billing, export, settings, API domains, worker/queues). Each agent: run each row's verify-step, record PASS/FAIL + evidence path. API rows via direct HTTP with per-persona auth; UI rows via Playwright.

**Phase 2 — Persona journeys.** The 8 scripted journeys (TEST-PLAN), each in its OWN user identity, capturing evidence at every judged moment; error paths included, not just happy paths. Each journey also runs its **W1 head-to-head** + the **switch test** + its assigned X-row races + the §NF bundle.

**Phase 2.5 — Flagship workstreams (W2–W11).** In parallel: W2 voice/misquote/continuity probes (pre-registered N), W3 longitudinal growth + series compounding, W4 disaster drills + C0/C2 dress rehearsal on throwaway DB, W5 server-layer egress ledger, W6 money-path + 24-child batch + soak, W7 parity, W8 craft audit, W9 WCAG, W10 non-English prose, W11 funnel scorecard. These are gates, not extras.

**Phase 3 — Judging.** Blind panel (≥3 judges/persona, distinct lenses, ≥1 cross-family, MIN-on-floors aggregation) scores from evidence bundles only. Planted-defect calibration must have passed first.

**Phase 4 — Defect fix loop.** Triage all FAILs + sub-9.5 causes into a ranked list (severity × persona impact). Fix root-cause → regression test RED-pre-fix → commit (conventional format) on the qa branch → re-run affected rows + journey legs. Typecheck + `npm run test` before any commit; CI must stay green.

**Phase 5 — Re-grade.** Re-judge affected personas (D1+D2+D8 always re-judged when shared paths changed). Loop 4↔5 until all ≥ 9.5 or plateau.

**Plateau rule (honesty over the number):** two consecutive fix→re-grade cycles moving a persona < 0.15 → STOP. Write the plateau analysis: exact gap, root causes, what closing requires (e.g. managed no-key tier, stronger default model, real collaboration), onto the founder-decision list. A documented 9.2 with evidence beats a fabricated 9.5.

**Phase 5.5 — Gap personas + verdict.** Run G1–G8 (W13) — grade the LOSSES honestly. Run W14 best-experience head-to-heads. Apply the WRITER-TRUST VERDICT. Assemble W17 publisher-trust register + W18 virality finding + W16 economic-switch verdicts.

**Phase 6 — Final report.** `FINAL-REPORT.md`: per-persona scorecards with evidence links, matrix stats (count + reason for every N-A/BLOCKED-ENV), defects fixed (commit list), defects open (founder decisions), gap losses, regression additions, VERDICT result, **ops-gate status box (C0/C2/C3) unmissable**, and the **honest-limits manifest verbatim**. Headline: any persona < 9.5 → "NOT bulletproof; plateau at X; blockers B" — never buried.

## Definition-of-done loophole guards (do NOT game these)
- **N-A is bounded:** every N-A counted + surfaced with exact blocker; adversarial verifier may REJECT an N-A and force a real test; no persona's core-journey rows may be majority-N-A.
- **Plateau ≠ bulletproof:** any persona < 9.5 forces the "NOT bulletproof" headline.
- **Gates need a valid evidence source:** egress from server-layer capture only; WINs only vs reachable incumbents; W2 numbers only from isolated users + ONE proven worker.
- **Regression tests real:** each RED on pre-fix commit, asserting the corrected observable (not "200 OK"); CI verified to actually execute them.
- **Every PASS links non-empty evidence** the adversarial verifier actually sampled (≥20% of PASS rows re-run; discrepancy → whole section re-swept).
- **No new benchmark-style numbers minted** without pre-registration (GRADING metric table); prior claims (line-edit D+→B−, batch live-smoke) are VERIFY targets, not inheritable passes.

## Standing rules
- **Never fake, never round up.** Every grade traces to evidence a founder can re-open.
- **Fix, don't patch around:** root-cause fixes with tests; no test-weakening, no `skip`.
- **Surgical commits**, conventional format; typecheck + full unit suite before any commit; worker code changes require a worker restart + fresh ONE-worker proof.
- **Money and manuscript rows are non-negotiable:** attempt the bypass, prove the block, diff the words.
- **Retention is measured, not vibed:** streaks/daily-plan/radar get behavioral checks + an honesty audit (real data only), then an Opus desirability judgment.
- **Output discipline:** long artifacts to files under `cowork/bulletproof-qa-<date>/evidence/`; chat replies are pointers + 3-line status per phase.
- Update memory (MEMORY.md pointer + mission-state file) at each phase boundary; end with the handoff skill.
