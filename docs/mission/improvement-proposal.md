# Write My Book — Improvement Proposal

_What to do next to move the grade from B− (80) toward B+/A. Synthesizes three research spikes (freellmapi, overnight/batch, hive-mind) against the 5-persona evaluation. Date: 2026-07-05._

> **Read the persona eval first** (`product-persona-evaluation.md`). The one-line thesis it lands on: **B+ craft, C− productization.** The craft moats are real and verified. The grade is held down by a small number of _productization_ walls — chiefly the BYOK cliff — plus a couple of open trust holes. This proposal is a plan to close the productization gap without eroding the craft moats that earned the B+.

---

## 1. TL;DR — the moves that most raise the grade

In priority order. Each is scoped to what actually moves grades, not what is merely interesting.

| # | Move | Lifts | Effort | Risk | Why now |
|---|------|-------|--------|------|---------|
| **1** | **Managed no-key tier: owner-funded gateway (OpenRouter/Anthropic) with a hard per-user token cap.** The compliant version of "pay yearly → free capped models." | **Maya B(83)→low-A** (removes her sole dealbreaker), **Sam D(40)→C+/B**, lowers **Priya's** ops burden | **L** | Med | The single most universal complaint (all 5 personas) and the only dealbreaker for the two lowest grades. Nothing else closes the "built for serious authors" → "product anyone can start" distance. |
| **2** | **Close the focus/immersive-mode ~30s loss window (S10) — route it through the hardened CAS autosave path.** | Trust for **Gerald, Owen, Maya, Sam** | **S** | Low | Four personas named it; two call it relationship-ending. It's a trapdoor with zero upside in the exact mode writers reach for to disappear. Cheapest high-trust win on the board. |
| **3** | **Prove editorial/line-edit quality on one real literary page — publish a before/after voice-preservation demo.** | **Owen B+(85)→A** (his explicit condition), **Maya** trust, **Priya** editorial confidence | **S–M** | Low | The machinery is A-work and verified-wired; the _proof_ is the one missing artifact. Converts architecture into trust for the three craft personas. No new code, mostly. |
| **4** | **Overnight/batch processing on BullMQ Flows + walk-away approval policy + aggregate budget cap.** | **Priya B−(75)→B+/A** — the persona whose whole business is bulk throughput | **M** | Low | Best grade-unlocked-per-effort item in the whole eval: it is _composition_ over an already-mature async core (worker, queue, dual-path enqueue, per-session budget degradation all ship today), not new engine work. |
| **5** | **Finish the launch gates: prod DB push, a proven backup-restore drill, live Stripe/Clerk.** | **Gerald, Priya** (both withholding live manuscripts/subscriptions until this closes) | **S–M** | Med | These are gates, not craft. They are the difference between "a tool I'd use once it launches" and "a tool I use." Move #1 (paid managed tier) also can't ship without live Stripe anyway. |

**Deliberately NOT in the top 5:** hive-mind. It is orthogonal to every persona's #1 gap and ~75% duplicates memory wmb-pub already runs. It's a Phase-2 craft multiplier at best (see §4).

---

## 2. The BYOK cliff — freellmapi & the recommended no-key path

This is improvement #1 in the eval and the headline of this proposal. The owner asked two specific questions; both are answered below with a concrete design.

### 2.1 freellmapi verdict: **ADAPT the pattern, do NOT adopt it as the backend**

freellmapi (tashfeenahmed/freellmapi — 15k stars, MIT, actively maintained) is a **self-hosted, single-user proxy** that stacks _your own_ free-tier provider keys (Google/Groq/Cerebras/Mistral/OpenRouter/GitHub Models/Cohere/NVIDIA…) behind **one Anthropic-Messages-compatible `/v1` endpoint**. At the wire level it drops straight into wmb-pub's existing `client-factory.ts` (it's exactly how the OpenRouter route already works — one more branch in `resolveProviderRoute()`, ~a day of work).

It is tempting and it is **the wrong backend for a managed tier**, for three structural reasons the code makes unavoidable:

- **ToS violation (decisive).** freellmapi's _own README_ documents that the free consumer tiers it stacks forbid exactly wmb-pub's use: Gemini (Mar 2026 ToS) "not for consumer use," GitHub Models "experimentation/prototyping only," NVIDIA NIM "evaluation only, not production," Cohere "forbids personal/family/household purposes." Serving paying SaaS users off those tiers is a mass-scale, multi-vendor ToS breach → account bans + legal exposure. Its honesty is precisely why it tells you not to use it this way.
- **Single-user by design = shared pool.** The README's "Not yet supported" list literally says: "Per-user billing / multi-tenant auth — single-user by design." One owner-hosted instance pools _all_ users into shared free-tier quotas. One exhausted daily cap starves everyone, and you'd have to build per-user metering yourself anyway. The only way to get per-user quota out of it is per-user provider keys — **which is BYOK again**, the exact wall you're removing.
- **Reliability / brand erosion.** "No SLA by definition," quality "degrades as quotas deplete through the day," no frontier models, highly variable latency, and a router that silently swaps models. That directly betrays wmb-pub's named moats — **honest model identity** ("billed for the qwen you chose, not Claude behind your back") and **voice-preserving editing**. A degraded random-free-model editing pass is _worse_ than no free tier for a voice-first product.

**Where freellmapi DOES fit (adopt, narrowly):** as a documented **self-host BYO-endpoint for power users like Priya**. She already tolerates a sysadmin stack and wants near-free unattended volume — she runs her own freellmapi and pastes its unified key into wmb-pub's existing custom-endpoint path. **All ToS liability stays with her** (her keys, her machine). Effort **S** (reuses the OpenRouter-style route almost verbatim), risk **low**. Frame it as an advanced/self-host option, **never** default onboarding — it's _more_ setup, so it does nothing for Sam/Maya.

### 2.2 The recommended no-key path — owner-funded metered allowance with hard per-user caps

Answering the owner's two questions directly:

**(a) Per-user keys vs. everything-on-owner's-account?** → **Everything on an owner-held key, with per-user metering YOU own.** Per-user keys _is_ BYOK — it doesn't solve the cliff. The whole point is that the user reaches AI without pasting anything. The catch freellmapi can't solve — per-user allotment — is trivial when _you_ own the metering.

**(b) "Pay yearly → all models free but token-capped"?** → **Yes, and this is the honest, enforceable way to build it.** Ride it on an owner-funded OpenRouter (or Anthropic) key + wmb-pub's _own_ usage ledger — not on free-tier arbitrage.

**Concrete design:**

1. **`UsageLedger` table** (userId, period, tokensIn, tokensOut, costUsd, tier, capTokens). Reuse the existing `cost.ts` tracking that already computes per-session cost.
2. **A `managed` route in `resolveProviderRoute()`** used when the user has no BYOK key. It targets a server-held key + fixed model set. Wire-level identical to the OpenRouter branch.
3. **Preflight cap check** before each managed call: read the ledger, reject with a graceful, non-scary cap message ("You've used this month's included writing — add your own key for unlimited, or your allowance resets in N days") when `tokensUsed >= capTokens`. Never a stack trace, never a hard 500.
4. **Tiered caps:**
   - **Free trial allowance** (e.g. "your first ~N chapters on us") — clears Sam/Maya's cliff _before_ any payment. This alone may be enough to move both grades (see open question).
   - **Yearly/subscription tier** → a generous monthly token cap across all offered models. This is the owner's Q2 model, implemented ToS-clean.
   - **BYOK** stays as the unlimited/power path (unchanged).

**Cost-control mechanics** (why this is safe to fund):
- The cap is enforced because **you own the metering** — the exact primitive freellmapi explicitly lacks.
- Use a **cheap model floor** for managed drafting (the qwen-class economics are already ~$0.16–0.42/chapter) so the owner's real per-user cost at the cap is small and _known_.
- **Aggregate the managed spend** into the same ledger the batch feature (§3) will use — one metering substrate, two consumers.
- Set the yearly price so cost-per-user-at-cap < price. Because managed traffic rides a cheap model floor and is hard-capped, worst-case exposure is bounded per user — no runaway.

**Why this and not freellmapi:** it preserves the honesty + reliability moats (real model identity, real SLA), it's ToS-clean (reselling metered access on a commercial provider key is a normal, supported arrangement — unlike free-tier arbitrage), and it drops into the existing routing. **Effort L, risk Med.** This is the change that actually moves grades: Maya reaches AI without pasting a key (B→low-A), Sam stops hitting the double wall (D→C+/B), Priya's ops burden drops.

**Open items to confirm before building:** (i) the monthly token budget the owner will fund — that number _is_ the cap and the unit-economics input; (ii) OpenRouter/Anthropic commercial terms permit metered resale under subscription (normal, but confirm); (iii) whether a small free trial allowance alone clears Sam/Maya before requiring the full paid tier.

---

## 3. Overnight / batch processing (roadmap 4.6, Priya's gap)

### 3.1 Verdict: **ADOPT — build on BullMQ Flows (Option A)**

The spike found the audit note stale and the feature far cheaper than assumed: **the engine already exists.** wmb-pub ships a standalone 24/7 BullMQ worker (`src/worker.ts`, concurrency 2), a serializable agent-session queue (`agent-queue.ts` — `AgentJobData` carries no keys/clients/callbacks; the worker re-fetches keys per job), a **dual-path route that already enqueues long non-conversational workflows** (`agent/route.ts` L383–424 — dev-edit and line-edit _already_ take the background path today, one chapter at a time), graceful per-session budget degradation in the orchestrator, and — **contrary to the audit** — a **working Redis background approval resolver** (`agent-worker.ts` L352–393 + approve route L41–74). A batch is **composition, not new engine work**: it's just N of today's proven background jobs, fanned out and fanned in.

**Design (BullMQ Flows fan-out/fan-in):**
1. **`BatchRun` table** (userId, bookId, workflowIds[], chapterRange, status, budgetCapUsd, spentUsd, scheduledFor, digest).
2. **`POST /api/books/[id]/batch`** validates ownership + quota, expands (workflows × chapters) into N `AgentJobData` payloads (reusing the exact serialization already in `route.ts`), and uses **`FlowProducer`** to add a parent `batch-digest` job whose children are those N agent-session jobs. Each child runs through the **unchanged `processAgentJob`**.
3. **Scheduling:** one-off "tonight at 2am" = BullMQ `delay`; recurring "every night" = a **Job Scheduler** (cron + timezone) — both native to the installed BullMQ ^5.70, so **no new infra**. (Reject Option B's hand-rolled node-cron daemon — BullMQ already does cron+tz and the codebase already fights worker-liveness. Reject Option C's external/Vercel/Claude-Code-cron — self-hosted stack, no serverless cron, and CronCreate schedules dev-harness agents, not product actions.)
4. **Digest job** runs on children completion (`ignoreDependencyOnFailure` so a failed chapter doesn't block it), aggregates each child's findings/status/cost/`SessionBrief` into `BatchRun.digest`, writes a `BookNotification`. All these per-session artifacts (`processPostSession` findings, `createSessionBrief`, `UsageRecord`) **already exist** — the digest is aggregation, not new capture.

### 3.2 Walk-away approval — the actual babysit fix

The real problem is **policy, not plumbing**: the background resolver works but **auto-REJECTS after a 10-min timeout** (`APPROVAL_TIMEOUT_MS`), which derails a unit when Priya's asleep. Replace with **auto-approve-within-policy-or-DEFER**:
- **Auto-approve only** read/analyze/finding-filing (safe, non-mutating).
- **DEFER** anything mutating (persist a pending approval, skip that unit, surface it in the morning digest) instead of blocking-then-rejecting.
- Note: the batch-candidate editors (**dev-editor/line-editor/beta-reader) don't even carry `RequestApproval`** — only writing-coach/ghostwriter/story-architect do. So editing batches already run to completion unattended; findings just accumulate. **Scope v1 to non-prose-mutating passes** (dev-edit, line-edit, beta-read, analyze) and **reject batch creation for gated/mutating workflows** (write-chapter, revise, architecture) — so "walk away" can never mean "silently rewrote my book."

### 3.3 Budget guardrails (the one genuinely new money-path invariant)

Per-session caps exist; a 24-unit batch with no cross-session ceiling is a real runaway risk. Add an **aggregate budget ledger**: a Redis counter `batch:{id}:spent` incremented on each child's completion via the shared cost tracker, plus a **pre-child guard** in `processAgentJob` that cancels remaining pending children once `spentUsd >= budgetCapUsd`. Add a **batch-level circuit breaker** (halt on repeated 429/auth/quota failures, distinct from per-job retry) so a mid-batch quota exhaustion doesn't burn 3 retries × N children. **Unit-test this on the existing money-path Vitest harness** — it's the one new invariant that can overspend real money. Share the ledger substrate with the managed-tier ledger (§2.2).

### 3.4 Grade lift
Directly lifts **Priya B−(75)→B+/A** — her standout line is literally "until it can batch-edit twelve chapters overnight without me babysitting a worker process." Ships "dev-edit + line-edit chapters 1–12 overnight → morning delta report" as a first-class action. **Effort M, risk Low.** Caveat to be honest about in UI: worker concurrency is 2, so a 24-unit batch serializes — make concurrency configurable and/or cap batch size, and state expected completion time.

---

## 4. hive-mind — does it belong in the product?

### Verdict: **PROTOTYPE the one additive pattern; do NOT adopt the runtime; do NOT ship the plugin to end users.**

hive-mind (Egzakta Group — **same owner** as wmb-pub, Apache-2.0, so licensing/IP risk is ~nil) is a local-first AI memory system: I/P/B "frames" in per-workspace SQLite, FTS5+vector hybrid search, a bitemporal knowledge graph, a single-row IdentityLayer, a harvest pipeline, and an LLM wiki-compiler. It's well-built (312 tests, real CI, prompt-injection scanner). But for a SaaS:

- **It is orthogonal to the #1 persona gap.** Every persona ranked the BYOK cliff / managed tier / batch as #1. hive-mind does **nothing** for any of that — it's purely a memory layer. It only touches the _secondary_ "knows me and my work" theme (Owen/Maya/Gerald craft axis). **It must not be mistaken for the fix every persona actually asked for.**
- **~75% duplicates memory wmb-pub already runs.** HybridSearch ≈ the Qdrant retriever; KnowledgeGraph ≈ the Neo4j continuity graph; FrameStore+IdentityLayer ≈ WriterMemory; wiki-compiler ≈ story-bible/fingerprint docs. Adopting the substrate means running a **fourth, differently-shaped memory store** (SQLite) beside Postgres/Qdrant/Neo4j.
- **Multi-tenancy mismatch.** Single-file SQLite per workspace, IdentityLayer `id=1` (one identity per DB), CWD-derived workspaces, `~/.hive-mind`, better-sqlite3 (synchronous single-writer). A SaaS would need one `.mind` per author on **persistent disk** (incompatible with serverless) + per-user backup/GDPR-delete. The **plugin/MCP/`/hive` surfaces are dev-facing** — wmb-pub's end users aren't running Claude Code. Shipping those to users is the wrong tool (AVOID).

**The genuinely net-new bits** are exactly two: (a) **cross-book / cross-project author identity** ("by the way, you solved this in another book earlier" — wmb-pub's memory is per-book), and (b) **harvest-bootstrapping** a writer's identity from their existing ChatGPT/Claude exports + manuscripts ("knows me from day one," attacking cold-start).

**Recommended path:** **lift the patterns, not the runtime.** Build a cross-book `WriterProfile` on wmb-pub's existing **Postgres (WriterMemory) + a per-author Qdrant collection**, borrowing hive-mind's IdentityLayer shape, I/P/B frames with importance decay + correction, and the cross-project-recall UX. Effort **L**, risk **low**, no 4th store. Optionally seed it via a **consent-gated, one-shot harvest** job (privacy-sensitive — needs explicit consent + scoping + a deletion story). Gate behind a spike before any runtime adoption.

**Sequencing:** this is a **Phase-2 craft multiplier** — it nudges Owen/Maya/Gerald on the "knows my work" axis but does **not** move Sam or Priya. It belongs _after_ the cliff/batch work. (Separately: the team may install hive-mind's plugin as a **dev tool** for retaining codebase knowledge — legitimate, easy, but out of scope for the persona lift.)

---

## 5. Sequenced roadmap — the complete "raise the grade" plan

Folds in the three researched topics **and** the still-open persona gaps so this is a full plan, not three disconnected spikes.

### Phase 1 — Productization & trust (the grade movers) — target: B− → B/B+
Ship in roughly this order:

1. **Managed no-key tier** (§2.2) — owner-funded gateway + `UsageLedger` + per-user hard cap + free trial allowance. **[Maya, Sam, Priya]** _(L, Med)_. Depends on live Stripe (item 5).
2. **Close focus/immersive S10 loss window** — route through hardened CAS. **[Gerald, Owen, Maya, Sam]** _(S, Low)_. Cheapest trust win — do it first.
3. **Prove line-edit quality** — publish one real before/after voice-preservation page. **[Owen→A, Maya, Priya]** _(S–M, Low)_. Mostly a demo artifact over existing machinery.
4. **Overnight/batch on BullMQ Flows** + walk-away approval policy + aggregate budget ledger (§3). **[Priya→B+/A]** _(M, Low)_. Shares the metering substrate with item 1.
5. **Finish launch gates** — prod DB push, backup-restore drill, live Stripe/Clerk. **[Gerald, Priya]** _(S–M, Med)_. Unblocks item 1's payment path.
6. **Harden qwen structured-output path** — reduce CreateFinding rejection churn, make entity-extraction JSON robust, surface when the continuity graph is partial. **[Priya, Owen, Gerald]** _(M, Med)_. Compounds badly under unattended batches (§3 risk) — do it alongside/just after item 4.

_Low-cost polish to fold in opportunistically:_ export chapter-titling + page-estimate fix **[Gerald]**; the "2.026 words" locale leak **[Sam]** (also touches batch timezone handling); surface the structure/outline map beside the editor **[Maya]**.

### Phase 2 — Craft depth & moat widening — target: B+ → A−
7. **Cross-book author identity** — lift hive-mind's IdentityLayer + cross-project-recall patterns onto Postgres/Qdrant (§4), optionally consent-gated harvest bootstrap. **[Owen, Maya, Gerald]** _(L, Low)_.
8. **Attribute-level series drift tracking** — graph-track rank/title/status creep ("became a Major in Ch 15"), the flagship continuity example the net can't currently catch. **[Priya, Gerald]** _(M, Med)_.
9. **Self-host freellmapi as a documented custom BYO-endpoint** for power users (§2.1, Option B). **[Priya only]** _(S, Low)_. ToS liability stays with the user; advanced option, never default.
10. **Recurring batch schedules + push/email digest delivery** (BullMQ Job Schedulers; may need SMTP/push infra) so Priya truly never babysits. **[Priya]** _(M, Med)_.

### Sequencing rationale
- **Phase 1 attacks productization (the C− half of the split verdict)** — every item there moves at least one of the two lowest grades or closes a named trust hole. Item 2 (S10) goes first because it's the cheapest trust win; items 1+5 are coupled through Stripe; item 4 rides infrastructure that already exists.
- **Phase 2 attacks craft depth (widening the B+ half toward A)** — it's deliberately _after_ the cliff/batch work because none of it moves Sam or unblocks a launch gate.
- **hive-mind is correctly demoted to Phase-2, pattern-only** — a craft multiplier, not the productization fix, and never the full-runtime adoption its overlap with existing stores can't justify.

---

## Bottom line

The grade is held down by **productization, not craft.** The three researched topics resolve cleanly: **build the managed no-key tier ToS-clean on your own metered gateway (adapt freellmapi's pattern, don't adopt its backend); build overnight batch as composition over the BullMQ core you already run; prototype hive-mind's cross-book-identity pattern only, later, on your existing stores.** Do Phase 1 and the split verdict collapses — B+ craft finally sits behind a product anyone can start.
