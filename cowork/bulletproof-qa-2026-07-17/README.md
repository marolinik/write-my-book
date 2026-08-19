# Bulletproof QA — wmb-pub — 2026-07-17

Production-readiness test goal for "Write My Book". Mirror of the waggle-os `bulletproof-qa` model, retargeted to this product (Next.js/Tiptap/Clerk/Stripe/BullMQ/Prisma/Qdrant/Neo4j; BYOK writing companion).

## How to use
Paste **`ORCHESTRATOR-PROMPT.md`** as the goal into a fresh Fable-5 session in `D:\Projects\wmb-pub`. It instructs the session to read every companion file below before starting.

## Files
| File | Role |
|---|---|
| `ORCHESTRATOR-PROMPT.md` | THE goal — mission, model routing, boot recipe, 7 phases, loophole guards |
| `TEST-PLAN.md` | 8 writer personas (Maya/Gerald/Selena/Priya/Sam/Owen/Bao/Rita), scripted journeys, exit criteria, race matrix, gap personas |
| `COVERAGE-MATRIX.md` | Every UI/API/capability row → owner persona + NF tags; §MC missing-caps; §Z pre-known-defect register (19 entries) |
| `GRADING-PROTOCOL.md` | 12-dim rubric, hard floors, WRITER-TRUST VERDICT, metric pre-registration, blind judge mechanics, stale-worker rule |
| `FLAGSHIP-ADDENDUM.md` | W1–W20: competitive H2H, voice integrity, longitudinal, data-safety, confidentiality, money-path, parity, craft, WCAG, i18n, funnel, regression-lock, gap losses, honest-limits |
| `ENVIRONMENT-AND-LIMITS.md` | RUNNABLE / BLOCKED-ENV / N-A-STRUCTURAL classification + honest-limits manifest |
| `inventory/UI-SURFACE.md` | 31 pages · ~135 components · gating map · 11 unmounted flagged |
| `inventory/API-SURFACE.md` | 89 route files / 130 handlers · 7 ⚠ security findings |
| `inventory/CAPABILITY-SURFACE.md` | 2 queues · 12 LLM capabilities · 32 Prisma models · risk register (10) |

## What is retargeted vs the waggle-os original
- **Moat reframed:** waggle's memory-anti-confabulation → wmb's **voice-integrity + never-lose-words + editorial-truthfulness** (W2/W4).
- **Personas** are writer archetypes drawn from the existing 5-persona product eval (B−/80), expanded to 8 with a series author, a migrator, and a security/ops skeptic.
- **Incumbents:** Sudowrite/NovelAI/Novelcrafter/Scrivener/Atticus/ProWritingAid/Docs (not ChatGPT/Notion/Rewind).
- **Isolation** unit is a seeded **user row** (user-scoped Postgres), not a per-process data-dir sidecar.
- **§Z seeds 19 real defects** already found in the inventory + mission memory (2 IDOR, batch double-spend, immersive loss window, ops gates C0/C2/C3) — the campaign must resolve or triage each, not rediscover them.

## Ground truth baked in (verify in Phase 0, do not inherit)
main@478359c · 411/411 unit green · CI green · dev DB pushed, **PROD schema push (C0) still pending** · prior claims (line-edit D+→B−, batch live-smoke, immersive fix) are VERIFY targets.
