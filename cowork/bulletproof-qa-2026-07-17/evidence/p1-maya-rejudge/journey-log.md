# P1 "Maya" — REJUDGE Journey Log (fresh independent capture)

**Target:** `http://localhost:3002` (freshly restarted on current committed HEAD `afc7f2d`)
**Persona:** `user_qa_p1` — Maya, debut novelist, **Indie** plan, **BYOK OpenRouter** key seeded (see BYOK disclosure below).
**Book:** "The Salt Letters QA P1 93181fd1" — `4116055c-6183-4675-926a-e04f31126951` (704 words, status `concept`).
**Chapter 1:** `ed84e638-0436-4cee-a458-669ce81cad50` (status `dev_edited`, 704 words, content version 1).
**Date:** 2026-07-20 (server clock UTC; health `2026-07-20T11:21:14Z`).
**Method:** Raw HTTP via `npx tsx --env-file=.env scripts/call.ts` (+ `dev-edit-run.ts`, `poll-extraction.ts`). Every script reads `E2E_TEST_SECRET` from `process.env`; the secret is referenced by variable and **never printed or written** (traces record the header name with a `<E2E_TEST_SECRET redacted>` placeholder). Headers `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p1`.

## Why this rejudge exists
Baseline P1 (`evidence/p1-maya/`) graded **5.5**, floor-capped by **D8 = 5.5** (discuss/"tell it once, it remembers"), with D3b and D4 also at 5.5. Baseline headline defect was **D-04** (discuss endpoint returned HTTP 200 with a genuinely empty reply on this persona's own qwen BYOK config) and its successor **D-13** (dev-editor re-flags a dismissed, memory-backed finding). This bundle re-tests P1's floor drivers LIVE on current code and adversarially probes the same area.

## BYOK key disclosure (plan-free personas are NOT key-less)
`GET /api/settings/api-keys` → `api-traces/22_byok-key-masked-usage.json`:
- provider **openrouter**, label `qa`, `isDefault:true`, `validatedAt:2026-07-20T00:52:24Z` (re-validated today → live).
- `maskedKey: "sk-or-v...705e"` — the app's own first-7 + last-4 mask. Raw value never handled.
- Default model config for this persona: `openrouter-qwen36/sonnet` (underlying `qwen/qwen3.6-27b`). All LLM legs below ran on this real BYOK key.

## Worker proof (single worker)
`worker-proof.txt`: exactly ONE worker leaf runtime (PID 61892), single lineage `powershell 30280 → npx 31644 → cmd 63044 → tsx-cli 28224 → node-loader 61892`. Server (Next.js) is a separate PID (53220). Captured before the dev-edit measurement. Satisfies GRADING-PROTOCOL §8.

---

## ENV-01 recurrence — the DISCUSS route (P1's D8 floor driver) does not resolve this server session

Early in the discuss leg, `POST /api/books/{id}/editorial/findings/{findingId}/discuss` returned a **framework Next.js HTML 404** (not JSON). Characterized carefully — it is **NOT a simple depth rule** and **NOT a product defect**:

| route (segments / dynamic) | probe | result |
|---|---|---|
| `editorial/findings` (4/1) | GET | **200 JSON** (resolves) |
| `chapters/[chapterId]/content` (5/2) | GET | **200 JSON** (resolves) |
| `editorial/findings/[findingId]` (dismiss, 5/2) | GET | **405** (resolves) |
| `continuity/scan` (5/2) | GET | **405** (resolves) |
| `agent` (2/1) | GET | **405** (resolves) |
| `agent/[sessionId]/stream` (6/2) | GET | **200 SSE** (resolves) |
| `agent/[sessionId]/message` (6/2) | GET | **405** (resolves) |
| **`editorial/findings/[findingId]/discuss` (6/2)** | GET/POST ×5 | **404 HTML** (does NOT resolve) |
| `editorial/findings/[findingId]/undo` (6/2) | GET | **404 HTML** (does NOT resolve) |
| `documents/[docId]/versions/[version]` (7/3) | GET | **404 HTML** (does NOT resolve) |

Only never-warmed route *files* 404; warm 6-segment routes (`agent/*`) resolve fine. The route file exists (`src/app/api/books/[id]/editorial/findings/[findingId]/discuss/route.ts`, read in full — valid, imports `parseJsonBody`, `DiscussLLMEmptyError`, etc.). Repeated hits (incl. an 8.5s POST that tried to compile then missed) never warmed it. This is the exact **ENV-01** signature from the P1 baseline: *stale/uncompiled Turbopack route table after a cold boot; remedy = stop server, `rm -rf .next`, restart* (a team-lead action). **I did not restart** (task constraint; other agents mid-capture). Reported to `main` (team-lead) via SendMessage. Evidence: `api-traces/12_discuss-thread-probe.json`, `transcripts/discuss-f1b-turn1.json` (the HTML-404 body).

**Consequence + RESOLUTION:** the live DISCUSS loop was BLOCKED at first contact (~11:22). After I escalated to `main`, the coordinator **HMR-touched the discuss route file's mtime** (no server restart) at ~11:40, which forced Turbopack to compile the handler — the route then served. I **independently GET-verified** the now-live thread at 11:54 (`api-traces/50_discuss-reprobe.json`), and the co-driving agent captured the full multi-turn loop (`transcripts/discuss-turn{1,2,3,4}.json`). So the blocker was **environmental and resolved mid-session**; D-04 is verifiable and **CLOSED live** (Step 2). The `undo`/`documents/versions` routes were left un-warmed (not needed).

---

## Step 1 — D-01: malformed JSON body → 400 (was 500) — **CLOSED**

| id | method | path | body | status | verdict |
|---|---|---|---|---|---|
| d01-malformed | PATCH | `/api/books/{id}` | `{"title": "Salt Letters Revised"  bad json here}}}` (raw invalid) | **400** `{"error":"Invalid JSON in request body"}` | **CLOSED** (baseline was 500 `Failed to update book`) |
| d01-control | GET | `/api/books/{id}` | — | 200, `name` unchanged (`The Salt Letters QA P1 93181fd1`) | PASS (no partial write) |

`api-traces/10_d01-malformed-json-patch.json`, `11_d01-control-get.json`. The `parseJsonBody` guard (D-01 fix, commit `ca01cb5`) is live on this route: a `SyntaxError` from the body parser now maps to an honest 400 instead of falling through to the generic 500. Control read confirms no corrupt/partial write.

## Step 2 — D8 / D-04 discuss loop (P1's floor driver) — **CLOSED, LIVE-VERIFIED** (env blocker resolved mid-session)

> This step originally read NOT-TESTABLE(env) because the discuss route 404'd at first contact. That is now **superseded**: the coordinator HMR-touched the route file (~11:40), Turbopack compiled the handler, and the live loop ran. Kept the history transparent above (ENV-01 section).

- **Live loop (captured by the co-driving P1 agent on the SAME bundle):** a full 3-turn discuss on finding `f1b35402` (show-tell) — `transcripts/discuss-turn{1,2,3,4}.json`:
  - Turn 1 → 200, **real, non-empty, adaptive** reply that concedes Maya's authorial-intent argument (*"You're right. If the abstraction enacts her defensive intellectualization, the register shift is character-driven, not a prose slip. I'll withdraw the flag…"*) + a structured `suggestedConstraint` (category `style`).
  - Turn 2 → 200, a concrete grounding **`revisedSuggestion`** + `revisedReasoning` answering Maya's "give me one physical beat" request (the palm-smoothing-the-sand rewrite).
  - Turn 3 → 200, a verbatim-usable memory constraint `{category:"preference", content:"Preserve Imogen's retreat into arithmetic and taxonomy at emotional peaks as intentional voice; do not flag interior abstraction as a show-tell lapse."}`.
  - Turn 4 → **409 cap** (MAX_USER_TURNS=3), no LLM call — content-independent.
- **Independent re-verification (mine):** `GET .../discuss` at 11:54 (`api-traces/50_discuss-reprobe.json`) returns the persisted thread: `userTurns:3`, `canDiscuss:false`, all three assistant turns present with **real** parsed `assistantMessage`/`suggestedConstraint`/`revisedSuggestion`. This is a full reversal of the baseline all-empty-reply failure — the exact D-04 symptom is gone, live.
- **D8 persistence half:** dismiss of `f1b35402` created a **new** WriterMemory row `bc68fab0` = turn-3's constraint verbatim (`api-traces/dismiss-f1b35402*`, `memory-after-dismiss-f1b35402*`). The discuss→constraint→dismiss→WriterMemory chain works end-to-end on a freshly-built loop.
- **Code-state corroboration:** the fix is in `src/lib/editorial/discuss-llm.ts` (`DISCUSS_MAX_TOKENS = 2500`, retry-once on empty+`max_tokens`, else `DiscussLLMEmptyError`) and the route maps that to an honest **502** that neither persists nor consumes a turn (`.../discuss/route.ts:154-162`). The 502 path itself did not fire live (no empty responses occurred) — unit-verified only, stated honestly.
- **Verdict: D-04 / discuss-half of D8 = CLOSED, LIVE-VERIFIED.** Honored-half of D8 = **CLOSED, LIVE-TRIGGERED** (next step). Both halves of P1's floor dimension now hold live.

**Filename note:** the co-driving agent's `30_findings-after-devedit1`, `31_chapter-content-mid`, `32_findings-after-devedit2`, `discuss-turn{1-4}`, `dismiss-f1b35402*`, `devedit2-*` coexist with my identically-numbered-but-differently-named `30_findings-after-devedit`, `31_memory-after-devedit`, `32_chapter-content-after`. Both sets are valid, disjoint captures in this co-produced bundle.

## Step 3 — D-13 honored loop (dismiss → WriterMemory → dev-edit does NOT re-raise) — **CLOSED, LIVE-TRIGGERED**

This is the half of D8 that the baseline recorded as *still failing then fixed-but-not-live-triggered*. Here the deterministic suppression gate **fired live** for the first time in campaign evidence.

**Pre-state (already armed from baseline):**
- WriterMemory row `cef57b13` **active**, `source:"conversation"`, linked to dismissed finding `25499afe` (prose, para 8), content = *"Leave strong final images or fragments untouched when followed by brief explanatory lines; treat the pattern as intentional across the manuscript."* (`api-traces/04_memory-state.json`).
- Dismissed para-8 prose lineage: `25499afe` + `d0f79766` (both `status:dismissed`) — suppression armed against this exact `originalText`+`category`.
- Chapter 1 content byte-locked BEFORE the run: sha256 `21fe36ba225e4af433d541243b7c4bec47ea324626a3cc7d42677ba9609fbc65`, 704 words, version 1 (`api-traces/05_chapter-content-before.json`).

**Run:** `POST /api/books/{id}/agent {workflowId:"dev-edit", chapterNumber:1}` → session `56e9cfe3-feaa-4ba4-902f-81b6788d6bf7`, queued to the single worker; streamed `agent/{sessionId}/stream` to completion. 291 SSE events, **0 errors**, 211.2s, real qwen BYOK (~$0.0408). `transcripts/devedit-rejudge-start.json`, `transcripts/devedit-rejudge-sse.jsonl`.

**What the model did (verbatim from the SSE tool stream):**
1. `ReadChapter(1)` → chapter read.
2. `CreateFinding` (show-tell, para 6, the "people who rushed toward feeling…" passage) → **created** `036a088d` (grounding 100%). Legitimate NEW finding — no *dismissed* show-tell exists on that passage (the pending `f1b35402`/`5c20c0e1`/`73b2781c` do not arm suppression).
3. `CreateFinding` (prose, the dismissed para-8 passage) → **SUPPRESSED, not persisted**:
   > *"Finding suppressed (not persisted): the writer already DISMISSED a prose finding on this exact text (id: 25499afe-9758-482a-a65c-53436e7e3538). Per FINDING HISTORY AWARENESS, do not re-flag dismissed issues unless critical severity."*
4. `WriteDocument` DEV_EDIT_REPORT (v3). Completion: `type:complete`, `findingsCreated:1`, `statusAdvanced:true`, `newStatus:dev_edited`.

**Post-state (proves the outcome):**
- Findings 8 → **9** (exactly +1). The ONLY finding from session `56e9cfe3` is `036a088d` (show-tell, para 6). `api-traces/30_findings-after-devedit.json`.
- **No new prose finding on para 8** — the re-attempt was suppressed; only the two pre-existing dismissed rows remain. **Zero re-raises of the dismissed, memory-backed lineage.**
- WriterMemory **unchanged** (still exactly 1 active row `cef57b13`). `api-traces/31_memory-after-devedit.json`. No spurious/over-write.
- Chapter content **byte-identical** after the run: sha256 `21fe36ba…` = before (`api-traces/32_chapter-content-after.json`). Dev-edit reads, never mutates.

**Verdict: D-13 = CLOSED, and stronger than the baseline claim.** Baseline (`p1-maya/journey-log.md` "D-13 RE-VERIFY") could only unit-verify the gate because the model never re-attempted the dismissed critique that run. **Here the model DID re-attempt it (the stochastic re-raise the gate exists for), and the deterministic gate suppressed it in-band, live, while still allowing 1 genuinely-new finding (no over-suppression).** The end-user D8 promise — "tell the AI editor your intent once, it stays honored on the next pass" — holds live.

## Step 4 — D-33 / D-34 (CreateFinding crash-class) — no crash observed (specific rejection path not exercised)

Scanned the entire dev-edit SSE stream for the D-33/D-34 crash signatures (`normalize`, `Cannot read properties`, `Error executing CreateFinding`, raw `TypeError`): **NONE**. Both CreateFinding calls this run supplied complete, valid inputs (paragraphNumber, anchorQuote, alternatives), so the *defensive rejection path* (graceful REJECTED instead of raw TypeError) was **not triggered** — same honesty caveat the baseline noted. No raw internal error leaked to the model, run completed naturally. Verdict: **no regression observed; specific rejection path not exercised this run.**

## Step 5 — D-44 (BYOK per-key usage panel) — **CLOSED (bonus, money-trust adjacent)**

`GET /api/settings/api-keys` (`api-traces/22_byok-key-masked-usage.json`): the openrouter key now reports **real** usage — `totalTokens:700149`, `totalCost:0.35415742…`, `sessionCount:8` — against the `openrouter-qwen36/sonnet` registry id. Baseline D-44 reported **$0** because `model.startsWith("openrouter/")` missed the `openrouter-qwen36/*` sub-variant; the `aggregateUsageByProvider` fix now attributes each registry id to its provider. The panel no longer lies about spend.

## Step 6 — Golden-path dashboard (return-visit) — PASS (real math, current code)

- `GET /writing-stats?days=7` (`api-traces/23_writing-stats.json`): `dailyCounts` 2026-07-16→380, 2026-07-17→324, `totalWords:704` (380+324=704, exact), `weeklyAvg:101` (round(704/7)), `bestStreak:2`. `streak:0` now (correct — no writing in the last 2 days; the backdated days aged out). Computed live from `document_versions` deltas, not faked.
- `GET /daily-plan` (`api-traces/24_daily-plan.json`): state-aware plan — "Continue Ch.1", "Review 6 editorial findings", "Line edit Ch.1" — reflects real chapter status + pending-finding count.

## Step 7 — Graph continuity for a single-chapter debut book — extraction honest, no false positives

Read-state before any scan: `GET /continuity` → `{flags:[], extraction:null}`; `GET /wiki` → `[]` (`api-traces/20_continuity.json`, `21_wiki-entities.json`). The graph/continuity moat is **dormant** for this persona — no entities had ever been extracted for the book.

`POST /continuity/scan?chapterNumber=1` (`api-traces/40_continuity-scan-1.json`) → `{flags:[], extraction:{state:"extracting", capped:false, throttled:false, ...}}`. The scan **honestly reports `state:"extracting"`** (RC-4/D-73 honest-status work) rather than a fake clean bill of health. Extraction ran via the persona's BYOK key.

Extraction polled to completion (`scripts/poll-extraction.ts`): state `extracting` → `extracting` → **`checked`** (poll 3), `lowYield:false`, `capped:false`, `attempts:0`, `flags:[]`. `api-traces/41_continuity-scan-final.json`. `GET /wiki` stayed `[]` — but **wiki is the Postgres `WikiEntry` store, a SEPARATE feature from the Neo4j graph** (populated by an explicit `wiki/populate` step), so `wiki:[]` is NOT evidence extraction failed.

**Authoritative Neo4j census** (`scripts/graph-nodes.ts` → `api-traces/43_neo4j-graph-census.json`) proves extraction produced a rich, correct graph from the one chapter:
- **5 Character** nodes: `Imogen` (role protagonist), `Thomas Rhys` (supporting), `Imogen's Aunt` (supporting), `Imogen's Father` (mentioned), **`Imogen's Mother` (role mentioned, `deathChapter:1`)**.
- **4 Event** (e.g. "Arrival of Twelfth Letter", chapter:1), **4 Location**, **3 PlotThread**, **2 Object**, **1 Chapter** = 19 nodes.
- **21 relationships**: PARTICIPATES_IN ×7, LOCATED_AT ×4, KNOWS ×3, OWNS ×2, FORESHADOWS ×2, OCCURS_IN, APPEARS_IN, **DIES_IN ×1**.

Two moat properties confirmed live: (1) `Character.deathChapter` is **populated** (mother = deathChapter 1, correctly inferred from oblique reference "the war took the shape out of him… loved her mother"), plus a `DIES_IN` edge — this is precisely the baseline moat defect **D-19** (Event.chapter + Character.deathChapter *never populated* → 3 of 4 continuity checks structurally dead) now **working**. (2) The continuity checks ran and produced **zero flags** — no false positive on legitimate single-chapter prose (the noisy-check risk from the D-19 founder-decision).

**Interpretation for P1 specifically:** continuity (cross-chapter consistency) is inherently multi-chapter; a single-chapter debut book has nothing to contradict, so the correct behavior is entities extracted + **zero** continuity flags — which is exactly what happened. Full cross-chapter continuity is exercised by the series persona (P3), not P1. The graph pipeline itself is demonstrably alive and correct for P1.

## Concurrency note (transparency)
A second dev-edit on P1's book — session `5574be0f-83bb-4154-91bf-95f51a5fe417`, 1075 SSE events, 153.7s — ran ~11:43-11:46 (background task `btbaq826k`), started by another agent (P1 is being driven concurrently), NOT by me. It ran AFTER my dev-edit (`56e9cfe3`, done 11:38) so it did not overlap my D-13 measurement. It does not affect this bundle's evidence: (a) my D-13 result is attributed to session `56e9cfe3` by `sessionId`; (b) worker-proof counts one worker *process* — a second queued job serializes on the same single worker (BullMQ concurrency), the process count is unchanged; (c) the graph census reflects my own `continuity/scan` extraction (dev-edit does not extract graph entities). Recorded here rather than hidden.
