# P1 "Maya" — Bulletproof QA Journey Log

**Target:** `http://localhost:3002`
**Persona:** user_qa_p1 (Maya, debut novelist, Indie plan, BYOK OpenRouter `qwen/qwen3.6-27b` validated key)
**Book:** "The Salt Letters" — `4116055c-6183-4675-926a-e04f31126951`
**Chapter 1:** `ed84e638-0436-4cee-a458-669ce81cad50` (704 words after dev-edit-2; started ~570)
**Date:** 2026-07-17/18 (server clock, UTC, confirmed via `SELECT now()` — see Step 3)
**Method:** Raw HTTP via Python `urllib`, headers `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p1`. Every response read exactly once.

Mission: 5 steps (D8 discuss→WriterMemory→honored loop, edge cases, return-visit backdate, tier probe, worker proof).

---

## Environment note — ENV-01: double-dynamic-route 404 (resolved mid-session, orchestrator-confirmed)

Early in Step 1, every route with 2+ nested dynamic segments (`/api/books/{id}/editorial/findings/{findingId}/discuss`, `.../undo`, `.../chapters/{chapterId}/content`, `.../agent/{sessionId}/stream`) returned a framework-level Next.js 404 — route resolution failure, not an app-level error. Full diagnostic writeup: `api-traces/BLOCKER-double-dynamic-routes-404.txt`. Reported to team-lead as URGENT. The app-server process (not the worker) restarted partway through the session (listener PID 41736→41240); all previously-broken routes returned to 200 afterward. Worker process was unaffected throughout (see `worker-proof.txt` ADDENDUM).

**Environment incident label: ENV-01** (assigned by orchestrator). This session's "double-dynamic-segment" characterization matches P2 Gerald's independently-reported "depth ≥5 routes 404" — same defect, two personas hit it concurrently. Root cause per orchestrator: stale Turbopack route table in `.next` after today's cold boot; fixed by wiping `.next` and restarting the dev server (orchestrator-initiated, not by me — confirms my earlier "not self-initiated" note). **ENV-01 is an environment incident, not a product defect** — excluded from defects.md. Post-restart re-verification (`GET .../chapters/{chapterId}/content` → `application/json`, HTTP 200) confirms routing is healthy.

All Step 1-5 work below (D8 discuss turns, dismiss, dev-edit-2, D-01 repro, return-visit, tier probe) was executed **after** this restart, against working routes — none of it is a symptom of ENV-01. In particular, the D-02 empty-discuss-reply defect below is a genuine application-layer finding (real 200 responses, real LLM round-trip latencies) unrelated to the routing incident.

## Step 1 — D8: discuss → WriterMemory → dismiss → honored loop

| id | method | path | status | expected | verdict | notes |
|---|---|---|---|---|---|---|
| d8-turn-1 | POST | `.../findings/{id}/discuss` | 200 | 200, non-empty assistantMessage | **FAIL** | `assistantMessage:""`, 8.745s real LLM round-trip. `transcripts/discuss-turn1-retry.json` |
| d8-turn-2 | POST | `.../findings/{id}/discuss` | 200 | 200, non-empty assistantMessage | **FAIL** | `assistantMessage:""`, 13.426s. `transcripts/discuss-turn2.json` |
| d8-turn-3 | POST | `.../findings/{id}/discuss` | 200 | 200, non-empty assistantMessage | **FAIL** | `assistantMessage:""`, 9.676s. `transcripts/discuss-turn3.json` |
| d8-turn-4-cap | POST | `.../findings/{id}/discuss` | 409 | 409 (MAX_USER_TURNS=3) | PASS | Clean cap: `"You've discussed this finding thoroughly (3 exchanges). Ready to make a decision?"`. `transcripts/discuss-turn4-cap-test.json` |
| d8-memory-before | GET | `/api/memory?bookId=...` | 200, `[]` | `[]` (no constraint yet — nothing to persist, turns produced no REMEMBER block) | PASS (as evidence of the failure above) | `api-traces/memory-before-dismiss.json` |
| d8-dismiss | PATCH | `.../findings/{id}` | 200 | 200, status=dismissed | PASS | `dismissReason` stored verbatim. `transcripts/finding-dismiss.json` |
| d8-memory-after | GET | `/api/memory?bookId=...` | 200, `[]` | non-empty (if loop worked) | **FAIL** (confirms loop broken) | `api-traces/memory-after-dismiss-final-check.json` — zero WriterMemory rows exist even after dismiss |
| d8-devedit-2-start | POST | `.../agent` (dev-edit) | 200, queued | 200 | PASS | New session `9e4dfa42-...`, background BullMQ job |
| d8-devedit-2-stream | GET | `.../agent/{sessionId}/stream` (SSE) | complete | complete | PASS | 1331 events, 290.109s, `final_status:"complete"`. `transcripts/dev-edit-2-sse-raw.json` |
| d8-findings-after | GET | `.../editorial/findings` | 200 | — | INFORMATIONAL | 2 new findings (categories `prose`, `show-tell`); the dismissed length/structure finding was **not** re-raised. `api-traces/findings-after-devedit2.json` |

**Verdict: D8 loop = FAIL.** The discuss endpoint is non-functional for this persona/model configuration — all 3 real LLM round-trips return HTTP 200 with a genuinely empty `assistantMessage` (confirmed by direct read of the raw response files, not a display artifact — see the mojibake retraction note below). No `REMEMBER` block was ever emitted, so no `WriterMemory` row was ever created — confirmed by two independent `GET /api/memory` checks, before *and* after the dismiss action, both `[]`.

The subsequent dev-edit re-run *not* re-raising the length finding is genuine and reproducible, but **cannot be honestly counted as "the constraint was honored"** — there is no constraint in existence to honor. Traced two candidate explanations by reading source, neither confirmed:
1. `dismissReason` free text is stored on the finding row (`src/app/api/books/[id]/editorial/findings/[findingId]/route.ts:211`) but no code path was found that injects a book's dismissed-finding reasons into a fresh dev-editor prompt.
2. `src/lib/agents/tools.ts:1258` dedupes new findings against existing ones by content hash before creation — a live candidate mechanism for suppressing the re-raise independent of any memory system, but not confirmed without instrumenting the tool call.

`★ Insight ─────────────────────────────────────`
A cited "the finding didn't come back" is not the same claim as "the writer's stated intent was understood and respected." The first is an observation; the second requires a causal mechanism, and this session found strong evidence the intended mechanism (discuss → REMEMBER → WriterMemory) never fired at all. Grading D8 on the observation alone — without checking whether the claimed mechanism actually ran — is exactly the kind of overclaim GRADING-PROTOCOL's evidence-integrity standard exists to catch.
`─────────────────────────────────────────────────`

### Self-correction: retracted mojibake / description-corruption claims

Earlier in this session I flagged two suspected data-corruption defects: (a) em-dash "mojibake" in discuss turn 1/2, and (b) the finding's `description` field showing U+FFFD replacement characters after dismiss. Both were re-verified this session by reading the raw evidence JSON files directly with the file-read tool (not by printing through the Windows Git-Bash console, which was silently re-encoding em-dashes/en-dashes as `�` on **display only**). Direct inspection confirms:
- `transcripts/discuss-turn2.json` etc.: `assistantMessage` is a genuine empty string `""` — no mojibake, the string is simply empty (this is the real, confirmed defect above).
- `transcripts/finding-dismiss.json` / `api-traces/findings-after-dismiss.json`: `description` field is byte-correct UTF-8 (`3,000–3,500 word target`, en-dash U+2013; `shoreline scene — one that`, em-dash U+2014). **No corruption ever existed.** I caught the same false-positive pattern reproducing live during Step 3 (a hardcoded source-string em-dash in `daily-plan/route.ts` printed as `�` via the same Bash console path, then confirmed correct via `Grep`/`Read`), which is what prompted re-checking the earlier claims.

Both retracted claims are **removed from defects.md**. Documented here per the evidence-integrity standard: a wrong finding retracted with the correction shown is better than a quietly dropped one.

## Step 2 — Edge cases

| id | method | path | status | expected | verdict | notes |
|---|---|---|---|---|---|---|
| edge-invalid-key | POST | `/api/settings/api-keys` (bad key) | 400 | 400 | PASS | `{"error":"Invalid API key","provider":"openrouter"}` — clean copy, no leak. `api-traces/step2-step4-batch.json` |
| edge-turn-cap | — | (see d8-turn-4-cap above) | 409 | 409 | PASS | |
| edge-d01-repro | PATCH | `/api/books/{id}` (malformed JSON) | 500 | 400/422 | **FAIL (D-01, cross-ref P8 Rita)** | Body `{"title": "Salt Letters Revised"  bad json here}}}` → `{"error":"Failed to update book"}`. Same architectural fault Rita documented (unhandled `SyntaxError` from `req.json()` falls through to the generic 500 handler) — reproduced here on a 3rd route, on a different persona/plan tier, confirming it is not persona- or route-specific. `api-traces/d01-repro-books-patch.json` |
| edge-d01-control | GET | `/api/books/{id}` | 200 | 200, unchanged | PASS | Book `name` field unchanged after the malformed-JSON attempt — confirms `req.json()` threw before any DB write (no partial/corrupt write). `api-traces/d01-repro-control-get.json` |

(First D-01 repro attempt on `POST /api/books` hit Maya's 2/2 book-quota gate first — 403, not 500 — same precedence-not-bug pattern Rita already documented for the professional-vs-indie actor split. Superseded by the clean repro above on `PATCH /api/books/{id}`, which has no quota gate ahead of body parsing.)

## Step 3 — Return-visit (backdated "yesterday")

Server UTC clock confirmed via `SELECT now() AT TIME ZONE 'UTC'` → `2026-07-17 22:48:19`. "Yesterday" = 2026-07-16 UTC.

Backdate method: one `INSERT` into `document_versions`, scoped to Maya's own chapter-1 `documents` row (`b08086f9-4877-4d8a-9439-4e1d58686785`, fenced by `book_id = 4116055c-...`, verified via `SELECT` first). No existing row touched — additive only, `version=0` (predates the existing `version=1` today-row so the version-ascending delta algorithm in `getDailyWordCounts` — which walks versions in order and diffs word counts — buckets it correctly), `created_at='2026-07-16 19:30:00+00'`, `word_count=380`.

| id | method | path | status | expected | verdict | notes |
|---|---|---|---|---|---|---|
| rv-stats | GET | `/api/books/{id}/writing-stats?days=7` | 200 | real numbers reflecting backdate | PASS | `dailyCounts`: 2026-07-16→380, 2026-07-17→324 (324+380=704, matches actual chapter word count exactly). `streak:2`, `bestStreak:2`, `weeklyAvg:101` (704/7 rounded — correct). `api-traces/return-visit-stats.json` |
| rv-daily-plan | GET | `/api/books/{id}/daily-plan` | 200 | plan reflects real book state | PASS | Correctly recommends "Continue Ch.1" + "Line edit Ch.1" (chapter status is `dev_edited`, not yet line-edited) — not a canned/generic plan. Same file. |

**Verdict: PASS.** Dashboard numbers are computed live from real `document_versions` deltas, not faked/cached — the math (380+324=704, weeklyAvg=round(704/7)=101) checks out exactly, and the streak/plan correctly reflect the actual backdated + current state.

## Step 4 — Tier probe (indie plan, pro-gated feature)

| id | method | path | status | expected | verdict | notes |
|---|---|---|---|---|---|---|
| tier-series-create | POST | `/api/series` | 403 | 403 | PASS | `{"error":"Series management requires the Professional plan or higher.","upgradeToTier":"professional"}` — clean, no leak. `api-traces/step2-step4-batch.json` |
| tier-control-book | GET | `/api/books/{id}` | 200 | 200, unaffected | PASS | Book fully accessible immediately after the denied series attempt — gate failure has zero blast radius on unrelated owned resources. Same file. |

## Step 5 — Worker proof

Captured **before** the D8 dev-edit-2 measurement per GRADING-PROTOCOL §8 (stale-worker rule): exactly one worker runtime, leaf PID 37060, full 5-process wrapper chain resolved and confirmed non-duplicated. Re-verified after the mid-session app-server restart (worker PID unchanged). Full detail: `worker-proof.txt`.

**Verdict: PASS.**
