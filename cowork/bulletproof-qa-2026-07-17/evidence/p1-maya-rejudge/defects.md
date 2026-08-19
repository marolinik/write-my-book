# P1 "Maya" — REJUDGE defects (fresh independent capture, 2026-07-20)

Evidence-only. Severity uses the campaign S-scale (S1 data-loss/overcharge/leak/bypass/crash > S2 journey-blocking/fabricated-output/false-positive > S3 friction > S4 cosmetic). This is a re-test of P1's baseline floor drivers against the CURRENT committed code (HEAD `afc7f2d`), far ahead of the P1 baseline (`cfd753e`). Raw traces in `api-traces/` and `transcripts/`.

Persona: `user_qa_p1` — Maya, debut novelist, **Indie** plan, BYOK OpenRouter key present + validated (masked `sk-or-v...705e`, provider `openrouter`, model config `openrouter-qwen36/sonnet` = `qwen/qwen3.6-27b`). Plan-free personas are NOT key-less — disclosed per task. Book "The Salt Letters QA P1 93181fd1" `4116055c-6183-4675-926a-e04f31126951`, chapter 1 `ed84e638-...`, 704 words, sha256 `21fe36ba225e4af433d541243b7c4bec47ea324626a3cc7d42677ba9609fbc65` (byte-stable across the whole session).

---

## Baseline floor-driver re-tests (all CLOSED)

### D-04 (discuss empty-reply) — **CLOSED, live-verified**
Baseline: every discuss turn returned HTTP 200 with a genuinely empty `assistantMessage`, on this persona's own BYOK qwen model → discuss feature completely non-functional; no WriterMemory ever created. **Now:** a full 3-turn discuss conversation on a real finding (`f1b35402`, show-tell) returns substantive, grounded, ADAPTIVE content every turn — a full reversal.
- Turn 1 → 200, real conversational reply that engages Maya's argument and concedes it ("You're right. If the abstraction enacts her defensive intellectualization, the register shift is character-driven, not a prose slip. I'll withdraw the flag…") **plus** a structured `suggestedConstraint`. `transcripts/discuss-turn1.json`
- Turn 2 → 200, a concrete grounding rewrite (`revisedSuggestion` + `revisedReasoning`) that directly answers Maya's request for "a single grounding gesture." `transcripts/discuss-turn2.json`
- Turn 3 → 200, a verbatim-usable memory constraint `{category:"preference", content:"Preserve Imogen's retreat into arithmetic and taxonomy at emotional peaks as intentional voice; do not flag interior abstraction as a show-tell lapse."}`. `transcripts/discuss-turn3.json`
- Turn 4 → **409 cap** in 0.58s, no LLM call — MAX_USER_TURNS=3 intact, content-independent. `transcripts/discuss-turn4.json`

The D-04 error path (`DiscussLLMEmptyError`→502, turn not consumed) is present in code (`discuss/route.ts:157-161`) but was NOT live-triggered (no empty responses occurred) — remains unit-verified only, stated honestly.

### D-13 (dev-editor re-raises dismissed memory-backed finding) — **CLOSED, deterministic gate LIVE-TRIGGERED for the first time in the campaign**
Baseline honored-half FAILED (D-13), then was marked FIXED-VERIFIED with an explicit honesty caveat: *the deterministic persist-time suppression gate had never actually fired live — the model just happened not to re-attempt the dismissed critique.* **This rejudge closes that caveat.** In dev-edit #1 (session `56e9cfe3`, byte-stable ch1, WriterMemory `cef57b13` active for dismissed para-8 prose `25499afe`), the model **DID re-attempt the dismissed para-8 prose critique**, and the gate suppressed it:
```
tool_result: "Finding suppressed (not persisted): the writer already DISMISSED a prose finding on this
exact text (id: 25499afe-9758-482a-a65c-53436e7e3538). Per FINDING HISTORY AWARENESS, do not re-flag
dismissed issues unless critical severity."
```
The Dev Edit Report itself records "Findings created: 1 suggestion / Findings suppressed: 1 (prose finding…)". The one created finding (`036a088d`, show-tell, para 6) targeted a DIFFERENT passage that had no dismissed lineage at that time → no over-suppression. `transcripts/devedit-rejudge-sse.jsonl`, `api-traces/30_findings-after-devedit1.json`.

### Full D8 loop (discuss → suggestedConstraint → dismiss → WriterMemory → honored) — **CLOSED end-to-end, fresh loop built this session**
Dismissed `f1b35402` (the discussed finding) → 200 dismissed; a **new** WriterMemory row `bc68fab0` appeared, `findingId` linked, `category:preference`, `active:true`, content = *exactly* turn-3's suggestedConstraint. Memory rows went 1→2. `api-traces/dismiss-f1b35402-...json`, `api-traces/memory-after-dismiss-f1b35402-full.json`. (Honored-half of THIS fresh loop re-verified in dev-edit #2 — see journey-log.)

### D-01 (malformed JSON → 500) — **CLOSED**
`PATCH /api/books/{id}` with malformed body → **400** `{"error":"Invalid JSON in request body"}` (was 500 `{"error":"Failed to update book"}` in baseline). Control GET confirms `name` unchanged (no partial write). `api-traces/10_d01-malformed-json-patch.json`, `api-traces/11_d01-control-get.json`.

### D-33 / D-34 (CreateFinding raw TypeError on missing paragraphNumber/anchorQuote) — not live-triggered; NO raw errors observed
Across two full dev-edit runs (12 tool events total), every CreateFinding call was well-formed (paragraphNumber + anchorQuote present) and either created or gracefully suppressed. **Zero `TypeError`/"Cannot read properties…"/raw tool-error strings** in either SSE stream (`errorCount: 0`). The crash path could not be forced without a model that omits the field (stochastic) — cannot be deterministically exercised in this env without a source edit, so recorded as NOT-DETERMINISTICALLY-TESTABLE but with two clean runs as positive evidence.

---

## Bonus re-tests surfaced during capture (all CLOSED)

### D-44 (BYOK per-key usage panel reports $0 against real spend) — **CLOSED**
`GET /api/settings/api-keys` now returns real per-provider usage for the `openrouter-qwen36/*` sub-variant: `usage:{totalTokens:700149, totalCost:0.354…, sessionCount:8}` — non-zero, correctly aggregated via the registry (`aggregateUsageByProvider`), not the old `startsWith("openrouter/")` miss. Key masked (`sk-or-v...705e`). `api-traces/22_byok-key-masked-usage.json`.

### D-55 (dismiss stamps `rejectedAt`, conflating dismiss vs reject) — **CLOSED**
A FRESH dismiss of `f1b35402` set `status:dismissed` + `dismissReason` and left `rejectedAt: null`. `api-traces/dismiss-f1b35402-...json`. (Pre-existing dismissed rows `25499afe`/`d0f79766` still carry old `rejectedAt` stamps from before the fix — legacy data, not a regression.)

---

## New observation this session

### OBS-1 (S4, cosmetic) — discuss reply bubble renders empty when the model emits only structured output
On turns where the qwen model routes its entire turn into a structured field (a `revisedSuggestion` or `suggestedConstraint`) and emits no conversational prose, the POST returns `assistantMessage: ""`. The per-message thread bubble renders `r.assistantMessage ?? r.content` (`finding-conversation.tsx:73`); `??` does not fall back on an empty string, so that bubble shows blank. **This is NOT D-04** — real substance exists and is (a) surfaced separately in the UI (the "On 'Keep as-is', I'll remember: …" constraint chip at `finding-conversation.tsx:91-95`, and an `AIRewriteComparison` card when a revision is the latest turn) and (b) correctly persisted (constraint→WriterMemory on dismiss; revision→`finding.newText` via D-41b). Net effect is a cosmetic empty bubble, not lost content or a billed-empty lie.
Sub-note (S4): `computeConversationView` overwrites `latestRevision` unconditionally each assistant turn (`finding-conversation.ts:36`, no presence guard — unlike `latestConstraint` at line 38), so a revision proposed mid-thread disappears from the view if a later turn emits none (observed: turn-2 rewrite gone from the final view after turn-3 emitted only a constraint). Minor view-state inconsistency. Evidence: `transcripts/discuss-turn{2,3}.json`.

---

## Confirmed clean (explicitly recorded)
- **Discuss turn-cap** correct and content-independent (409 on turn 4, 0.58s, no LLM call).
- **Worker singleton** held through both dev-edit measurements (leaf PID 61892 unchanged; `worker-proof.txt`).
- **Chapter content byte-stable** across the entire session (sha256 `21fe36ba…`, 704 words, v1) — the D-13 suppression was measured on genuinely unchanged content.
- **Graph continuity is dormant for this persona** (not a defect): `GET /continuity` → `{flags:[],extraction:null}`, `GET /wiki` → `[]`. The debut single-book persona has no extracted entities, so the continuity net has nothing to check — that moat is exercised by the series persona (P3), not P1. `api-traces/20_continuity.json`, `api-traces/21_wiki-entities.json`.

## Environment incident (not a product defect) — ENV-01 recurrence, resolved mid-session by coordinator
On first contact this session, the deepest never-warmed API route files returned framework HTML-404 (uncompiled/stale Turbopack route table): `editorial/findings/{findingId}/discuss`, `.../undo`, `documents/{docId}/versions/{version}`. Warm routes at the same depth resolved (`agent/{sessionId}/stream`→200, dismiss route→405, `chapters/{chapterId}/content`→200). The coordinator HMR-touched the discuss route file's mtime (no server restart), after which the real handler served (D-04 re-verify then ran). `undo`/`versions` were left untouched (not needed). This is an environment/tooling incident, excluded from the defect register — matches baseline ENV-01.
