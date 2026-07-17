# ENVIRONMENT & HONEST LIMITS — what QA can and cannot prove (wmb-pub)

> Read before Phase 0. Classifies every scope item as RUNNABLE / BLOCKED-ENV / N-A-STRUCTURAL, and states the honest limits so a 9.5 cannot be mistaken for "best AI writing companion" it hasn't earned. Ground-truth from repo + mission memory 2026-07-17; RE-VERIFY the "Verified facts" block in Phase 0 before relying on it.

## Verified environment facts (re-verify in Phase 0)
- Dev stack: Next.js on **:3002** (`PORT=3002 npm run dev`), BullMQ worker (`npm run worker:dev`), Postgres **:5432** (`wmb-pub-postgres-1`) + Neo4j **:7687** (wmb compose), Redis/MinIO/Qdrant **borrowed from the old `platform-new-*` compose stack** (same repo, same creds; zombie jobs in shared Redis fail harmlessly but pollute queue metrics — flush or namespace-check before queue measurements).
- Auth: Clerk; dev uses `DEV_AUTH_BYPASS` (a single dev user). **Per-persona isolation therefore requires seeding distinct users** (see ORCHESTRATOR isolation section) — WriterMemory, BYOK keys, budget ledger, streaks, books are all user-scoped; personas sharing one user poison each other's D8/D9 measurements.
- LLM: BYOK via OpenRouter, key in `ork.txt` (gitignored); registry model `openrouter-qwen36/*` (qwen3.6-27b, 262K ctx). Real-model grading premise HOLDS for qwen; stronger-model comparisons need an Anthropic/other key if present in `.env` — verify, don't assume.
- Export toolchain: pandoc + typst installed (docx/epub/pdf verified real binaries 2026-07-05).
- Stripe: test-mode keys expected (`npm run billing:check` validates static contract); webhook flip needs `stripe listen --forward-to` or signed synthetic events.
- CI: unit suite (411 tests as of 478359c) + lint + build run as merge gate. Playwright e2e exists (`tests/e2e`) against live infra — confirm which suites CI actually executes.
- ⚠ **Known open OPS gates (pre-launch truth):** C0 prod schema push pending (`npm run db:push:prod` — batch + 4.8/4.4/4.2 tables), C2 backup restore drill never run, C3 live Stripe/Clerk round-trip unverified. `/api/health/dependencies` includes a schema-DRIFT probe that self-detects C0.
- ⚠ **Worker hygiene (measurement-integrity #1):** stale `tsx` worker OS processes survive TaskStop and process jobs on OLD code — this already produced one false "fix ineffective" verdict (line-editor gate). Exactly ONE worker, proven by process list, before any agent-output measurement.

## Classification

### RUNNABLE in-session (grade normally)
Full local stack; write-first onboarding; editor (typing, autosave+409, offline buffer, immersive/focus incl. the shipped sync-scheduler, find/replace, reorder, versions); CAS chat + ConversationTurn persistence; all 4 safe editorial passes (dev-edit / line-edit / beta-read / analyze); findings lifecycle (apply/dismiss/discuss 3-turn + rate limit); WriterMemory loop; story bible / architecture / fingerprint generation; continuity net (seeded contradictions); series sidebar (seeded 2-book series); Neo4j entity extraction (tool-use path + jsonrepair fallback); batch/overnight (Now preset live; Tonight-2am via short synthetic delay); budget ledger + circuit breaker + cap-skip; cost tracking accuracy vs OpenRouter dashboard; export docx/epub/pdf fidelity; Shelf + Story Health + radar + daily plan honesty; locale ×7 sweeps; mobile/a11y via Playwright emulation; Stripe test-mode checkout + synthetic signed webhooks; tier-gate DENY paths; ownership-bypass attempts; prompt-injection payloads embedded in manuscript prose; health/DRIFT/worker probes; all §NF capture.

### BLOCKED-ENV (test what's testable, mark the rest, NEVER claim a pass)
| Item | Why | What IS testable now |
|---|---|---|
| Live Stripe (real card, live webhooks, dunning) | test keys only | test-mode checkout + `stripe listen`/synthetic signed events; live = C3 founder op |
| Live Clerk prod instance (signup emails, OAuth providers) | dev instance + DEV_AUTH_BYPASS | dev-instance signup/login; prod = C3 |
| Prod DB push + restore drill (C0/C2) | founder-run ops with prod creds + backup | DRIFT probe self-check; a full dress-rehearsal on a THROWAWAY db (backup→push→smoke→restore) is RUNNABLE and REQUIRED |
| Real incumbent head-to-heads (Sudowrite/NovelAI/Novelcrafter paid accounts) | no logged-in accounts assumed | Phase −1 enumerates reachable (free trials count); unreachable = EVIDENCE-LIMITED(qualitative), CANNOT count as measured WIN. ChatGPT/Claude raw ARE reachable via API keys |
| Real mobile hardware (iOS Safari quirks, keyboard overlap) | no device farm | Playwright device emulation + honest caveat; real-device pass = founder follow-up |
| Multi-day real-time gates (streak continuity, Tonight-2am wall-clock, 24-child overnight at real scale) | session length | seed backdated word-count/version rows; schedule with short synthetic delay; run ONE real 24-child batch as a background job with interval checks — do NOT extrapolate from a 1-child smoke |
| Email/notification delivery | no provider configured (verify) | in-app surfaces only |
| Human-subject usability (W19) | no real users in an agent session | bot journeys grade functional/ergonomy; usability scores carry "unvalidated-by-human" caveat; ≥3 real writers per persona-class = founder follow-up |
| Long-horizon model-cost drift (provider price changes) | external | pin prices at run date in evidence |

### N-A-STRUCTURAL — capabilities the product does NOT have (Missing-Capabilities Register)
Not test failures; scope truths. Each gets a gap-persona probe (W13) run honestly against the incumbent that owns it.
| Missing capability | Incumbent that owns it | Consequence for switch |
|---|---|---|
| Managed no-key tier (zero-config AI, free tier) | Sudowrite/NovelAI (bundled inference) | the BYOK cliff — Sam-class users bounce at key setup; #1 GTM blocker per 2026-07-05 eval |
| Real-time collaboration / shared docs / comments | Google Docs, Novelcrafter | co-author + beta-reader workflows leave |
| Native mobile app / offline-first mobile | iA Writer, Scrivener iOS | phone-first writers can't make it primary |
| Voice dictation | ChatGPT mobile, Dragon | commuter drafting absent |
| Image generation (covers, character art) | Midjourney/ChatGPT | adjacent creative loop absent |
| Grammar/mechanics depth | ProWritingAid/Grammarly | copyedit-stage writers keep a second tool |
| Publishing pipeline (KDP/IngramSpark formatting presets, ARC distribution) | Atticus/Vellum | the "last mile" to publish happens elsewhere |
| Share/publish links (chapter preview for beta readers) | Google Docs/Notion | no viral loop, no beta-reader funnel |
| Plot-visualization boards (corkboard/timeline canvas) | Scrivener/Plottr | visual planners keep their planning tool |

## HONEST LIMITS MANIFEST (goes verbatim into FINAL-REPORT)
Even at 8×9.5 + all workstreams green, this campaign proves **"complete, correct, polished, data-safe, honestly-billed, and voice-preserving on the corpora we constructed — evidence-rich and founder-verifiable."** It does NOT by itself prove "best AI writing companion," because:
1. **Editorial quality is judged by LLMs on constructed corpora** — not by working novelists on their own manuscripts over months. Blind pairwise + pre-registration narrows but does not close this. The Salt Letters validation (a real novella written IN the product) is the strongest craft evidence we own — cite it, extend it, but label single-book scope.
2. **Self-run, self-judged, agent-executed** — no real user, no real buyer, simulated time. Human-usability and month-scale trust are QA-uncloseable; named as founder follow-ups, never scored as covered.
3. **qwen3.6 is the validation model, not the ceiling or the floor** — quality verdicts are model-conditional; report qwen + one stronger model where the gate depends on model capability (voice, structured contracts), and label which.
4. **Coverage proves what's built** — the Missing-Capabilities Register lists deliberate gaps; gap personas grade the losses so the report shows why a writer might still keep Sudowrite/Docs/Scrivener.
5. **Competitive WINs count only where a real incumbent was reachable**; EVIDENCE-LIMITED comparisons are labeled and excluded from the verdict tally.
6. **Launch ≠ 9.5:** the C0/C2/C3 ops gates are founder actions; QA can dress-rehearse them on throwaway infra but cannot clear them. A 9.5 with C0 open is still not launched — the FINAL-REPORT must carry the ops-gate status box unmissably.

Ship the result AS what it proves. Let "best AI writing companion" attach only after gap-persona losses are closed or consciously accepted, and a real-writer + real-incumbent + real-duration pass is run.
