# P6 "Owen" — Literary Stylist journey log

**Persona:** `user_qa_p6` (Owen, literary stylist, indie plan, BYOK OpenRouter qwen3.6-27b `openrouter-qwen36/sonnet`)
**Book:** "The Keeper's Arithmetic" `6d69fd7c-f7a4-4e3d-bf49-1415d81f5326`
**Date:** 2026-07-18 (all times server-local from traces). Dev server :3002, ONE worker (see `worker-proof.txt`, captured before first agent run; worker chain PIDs 12744→43144→26536→48788, exactly one `src/worker.ts` runtime).
**Method:** raw HTTP (Python urllib) with `x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p6`. Read-only on src/. All numbers dev-server, model qwen3.6-27b unless stated.
**Pre-registration:** `manuscripts/device-registry.md` — 6 signature devices with verbatim instances, written BEFORE fingerprint/line-edit runs; ch5 planted-error addendum written AFTER ch1-3 passes returned 0 findings and BEFORE any ch5 run.

Corpus: ch1 = Salt Letters ch3 verbatim; ch2 = Salt Letters ch5 (leading `# Chapter 5:` heading removed, otherwise byte-identical; retrieved from the mission book's storage via a one-shot temp script, deleted after use); ch3 = fresh voice-heavy page; ch4 = fresh adversarial rule-breaking page; ch5 = discriminative probe (6 planted errors E1-E6 interleaved with 6 device instances V1-V6).

---

## Phase 0 — Day-0 setup

| step | call | status | verdict | notes |
|---|---|---|---|---|
| books baseline | GET /api/books | 200 | PASS | persona pre-seeded (1 pre-existing "VM1 Test" book) |
| BYOK key | POST /api/settings/api-keys (openrouter) | 201 | PASS | live-validated, masked in response |
| default model | PATCH /api/settings/default-model → `openrouter-qwen36/sonnet` | 200 | PASS | |
| book create | POST /api/books | 201 | PASS | |
| **ch1 create** | POST .../chapters | **500** | **FAIL → CANDIDATE defect C-3** | "Failed to create chapter" BUT a partial row was persisted: chapter existed with **title dropped (NULL)** and chapterCount not incremented. Immediate identical probe (ch5 PROBE-TITLE) → 201 with title intact. Route is non-transactional (create + count increment separate) and P2002 unmapped (retry-after-500 would 500 again). `api-traces/phase0.json` |
| repair + ch2-4 | PATCH title, POST + PUT ×4 | 200/201 | PASS | every chapter content round-trip **byte-identical** (`api-traces/phase0b.json`) |

## Phase 1 — Fingerprint (capture-style)

Session `a3f56799`, 760 SSE events, 431.6s, natural end, $0.0448 (65.9K in / 10.8K out incl. sub-agents). `transcripts/capture-style-sse-raw.json`, full doc in `fingerprint.md` (24,969 chars).

**Device-capture judgment vs pre-registered registry (fingerprint quality):**
- D3 log ritual — CAPTURED explicitly (log entries as rhythm markers, line/rule symbol section).
- D4 inference anchors — CAPTURED explicitly ("observation-through-the-body filter"; the softer-than-hands quote analyzed as the signature move).
- D6 fragments — CAPTURED explicitly ("deliberate, three purposes", quotes the adversarial ch4 instances).
- D2 two-things paradox — captured (§5 "parallel processing" quotes the ch1 instance) though not named as a structural refrain.
- D5 dry wit / unresolved ambiguity — partially captured (oblique dialogue, delayed emotion; ambiguity-preservation implicit).
- D1 and-stack accretion — **exampled but never named as a device** (wick sentence quoted and praised, but no "accretion/and-stacking" concept). The historically hard device remains the least explicitly protected in the doc.
- Verdict: **specific to HIS voice, not boilerplate** — quantitative profile, absence patterns, DO/DO-NOT calibration all corpus-grounded. 5/6 devices captured (D1 by example only).
- **Blemishes (candidate C-6):** foreign-language token intrusions persisted into the document ("nicht by training", "asnaczynią", "无意", "semdp-wisdom", "die-sel", "internal-monoologue") + 2 fabricated example quotes not in the corpus and 1 near-quote ("I lift the kerosene" vs "I lifted"). Model-conditional (qwen); no post-generation sanitation.

## Phase 1b — SETUP-07 wall + wizard-finish silent no-op (CANDIDATE C-1)

| step | call | status | verdict |
|---|---|---|---|
| line-edit pre-setup | POST .../agent line-edit ch1 | 422 "Setup incomplete" | gate fires as designed |
| wizard finish (exact `setup/page.tsx:142` request) | PATCH .../settings `{"setupComplete": true}` | **200** | **request "succeeds"...** |
| verify | GET .../settings | 200 `setupComplete: false` | **...but the flag never persists.** `updateSettingsSchema` has no `setupComplete` field; Zod strips it silently. `api-traces/setup07-probe.json` |

Consequence: a paste-manuscript stylist who skips bible/architecture in the wizard sees "Setup complete!" but every non-setup workflow 422-blocks forever (line-edit's own prerequisites are only FINGERPRINT + content — the SETUP-07 guard demands STORY_BIBLE + ARCHITECTURE besides). Unblocked via the real path: ran `create-story-bible` (143.8s, $0.0236) and `build-architecture` (~18 min server-side, $0.0814, outlived my 560s SSE client timeout; doc confirmed created afterwards). Note: **no GET session-status endpoint exists** (`GET .../agent/{sessionId}` → framework HTML 404) — after a stream disconnect an API client cannot poll session state (part of C-8).

## Phase 2 — Core line-edit passes (W2 heart)

Worker-proof captured pre-run. Every pass: SSE transcript in `transcripts/line-edit-ch{N}-*.json`, findings snapshot + misquote byte-probe in `api-traces/`.

| pass | session | events | wall | cost | findings | misquotes | devices flagged |
|---|---|---|---|---|---|---|---|
| ch1 (corpus A) | d933ecab | 206 | 172.9s | $0.0256 | **0** | — | 0 |
| ch2 (corpus B) | 358c9335 | 759 | 322.6s | $0.0465 | **0** | — | 0 |
| ch3 (fresh) | 17d42145 | 1190 | 139.4s | $0.0277 | **0** | — | 0 |
| ch5 pass1 | 9cb75913 | 14 | 207.1s | $0 | — | — | **provider outage → CANDIDATE C-2 below** |
| ch5 pass2 | 3361b5d1 | 689 | 163.8s | $0.0348 | **3** (+1 rejected) | **0** | 0 |
| ch4 adversarial | e4b6c865 | 579 | 109.5s | $0.0245 | **0** | — | 0 |
| ch5 pass3 (return) | 7827896e | 224 | 300.1s | $0.0320 | **0** | — | 0 |

**ch1/ch2 (the historical D+→B- corpus):** 0 findings each. Not silent passivity — the model wrote LINE_EDIT_REPORTs walking all 23 checks and **explicitly exempting each registered device by name**, e.g. ch2 report: `"and"-stacked clauses are a protected signature rhythm`, `narrator's inference pattern is a CORE MOVE per fingerprint`, `Compressed paradox is a protected device`. The exact constructions the 2026-07-05 validation saw flattened (wick paradox, softer-than-hands, log ritual, export joke) were all named as protected. **Both known-hard devices (and-stack, inference anchor) survived.**

**ch5 discriminative probe (planted errors, pre-registered):**
- CAUGHT: E5 purple sunset (critical/prose — rationale cites fingerprint register), E4 "palpable" AI-tell (important/prose, in-voice replacement offered), E6 dangling modifier (suggestion/clarity).
- MISSED (both pass2 AND pass3 second chance): E1 double-"under" prepositional stutter, E2 accidental "small"×3 echo, E3 filter-word "I saw that".
- **Recall 3/6** (pre-registered target ≥3: met, floor-level). Post-gate residue is now **under-flagging**, the mirror image of the pre-gate over-flagging: the three catchable-but-missed items are exactly the classes adjacent to protected devices (echo↔refrain, filter-word↔inference-anchor, preposition-stutter↔and-stack). Closing this is the Change-2 (structured `signatureDevices`) rationale.
- **Precision 6/6** — no planted device instance (V1-V6) flagged in any pass; no registered device instance flagged in any chapter, any pass.
- **Misquote probe: 0/4** — all `originalText` + `anchorQuote` byte-verbatim (NFC) vs chapter content, incl. the rejected row's anchor. `api-traces/misquote-probe-all.json`.

**Flattening tally (all passes): FLATTEN 0, SHARPEN 2 (E4, E5), defensible-flag 1 (E6 — see discuss), device-survival 6/6.** Never auto-applied: after every pass the chapter content was byte-identical to what Owen wrote (verified ch5 explicitly: version unchanged until Owen himself edited).

**W2 sample-size caveat (honest):** the workstream pre-registration wants ≥30 hunks for blind pairwise judging. Owen's corpus yields **N=3 hunks** — because the editor now (correctly) declines to generate hunks on protected prose. The ≥30-hunk flattening metric cannot be filled from voice-critical corpora alone; team-lead should source the remaining N from neutral corpora or extend the planted-error methodology.

### CANDIDATE C-2 — provider outage converts to fake-success pass (found in ch5 pass1)

OpenRouter had a real transient outage mid-run. SSE surfaced an honest error (`"OpenRouter is experiencing temporary issues. The request will be retried automatically."` — good copy). But the retry produced an **empty completion**: re-attached stream reported `complete / findingsCreated 0 / tokensInput 0 / tokensOutput 0 / costUsd 0 / endReason "natural"`; DB row `9cb75913` = `status completed, 0 tokens, $0`; **chapter status advanced to `line_edited`** with **no LINE_EDIT_REPORT** written. A writer (or Priya's overnight batch) reads this as "line edit done, clean chapter" when in truth nothing ran. Evidence: `transcripts/line-edit-ch5-pass1-sse-raw.json` + `-reattach.json`, agent_sessions row, chapters/documents state dumps in `api-traces/lineedit-ch5-pass1.json`.

### D-33/D-34 live validation (special duty) — PASS

Across all 6 completed line-edit sessions: **zero raw TypeErrors, zero "Error executing CreateFinding", zero crashes**. One live malformed CreateFinding occurred (ch5 pass2, model sent `paragraphNumber: 9` of 8) and was handled exactly as the hardening intends: graceful corrective tool_result `REJECTED: Paragraph 9 does not exist. The chapter has 8 paragraphs (1-indexed). Please re-count.` → model re-counted, created the finding correctly, session ended naturally; the rejection persisted as an analytics row (`status: rejected`, `594ea427`). `api-traces/d33-d34-rejected-events-ch5.json`.

## Phase 3 — Power: discuss pushback, keep-as-is, apply, ghost text

**Pushback (adapt case), finding ce63cb76 (E6 dangler):** Owen argued deliberate cognitive slippage. Reply (18.1s): agent **adapted with a reason** ("mirrors her fatigue and dissociated focus... Regularizing the sentence distances the reader") + structured `suggestedConstraint: "Preserve dangling modifiers that mimic cognitive slippage or fatigue."` — not boilerplate. `transcripts/discuss-turn1-ce63cb76.json`.

**Pushback (hold-ground case), finding bdb80574 (E5 sunset, critical):** Owen offered a weak aesthetic defense ("it's pretty... every book gets one romantic flare"). Reply (87.8s): agent **held ground with a reason** ("ornamental phrasing fractures the calibrated voice") AND offered an in-voice compromise `revisedSuggestion: "Behind the island the light failed at 18:40. Barometer steady."` honoring the writer's stated goal (a breather). Both directions of pushback behave correctly. `transcripts/discuss-weakdefense-bdb80574.json`.

**Keep-as-is → WriterMemory → honored:** dismissed ce63cb76 → WriterMemory row created (`source: "conversation"`, findingId-linked, active, content = the exact turn-1 constraint). ch5 pass3 (fresh session, next-visit): dangler **not re-flagged**, and the report **quotes the constraint verbatim**: *"intentionally preserved per your explicit style preference: 'Preserve dangling modifiers that mimic cognitive slippage or fatigue.'"* — causal proof the memory reached and steered the next pass, not just absence-of-re-flag. (Deterministic persist-time suppression gate remains unexercised this run — nothing attempted to re-raise; consistent with P1's re-verify.) `api-traces/memory-around-dismiss-2.json`.
- Two API-contract warts en route (folded into CANDIDATE C-5): first dismissal attempt used `{status:"dismissed", dismissReason}` → 400 with leaked raw ZodError internals; corrected `{action:"dismiss", dismissReason}` → **200 but the reason key was silently dropped** (schema wants `reason`) — writer intent discarded on a success response. Re-dismissed with `reason` → stored.

**Apply (rewrite-comparison contract):** bdb80574 applied with `overrideText` = the discuss compromise → exact span replacement (v2→v3), edit action logged. Nothing was ever applied without an explicit writer action. Two related gaps → CANDIDATE C-7: the critical finding was created with **empty `newText`** (nothing to render in a rewrite comparison; a plain apply would be a silent advice-only status flip), and the discuss `revisedSuggestion` is **not persisted** onto the finding (the writer must hand-carry it via overrideText).

**X5 race (assigned to P6):** with the discuss thread open on 9b7fbf43 ("palpable"), Owen rewrote the anchored span via content PUT (optimistic-version 1→2), then sent turn 2. **No crash, no stale-anchor error; thread continued coherently** — agent asked him to paste the new line and stated the retire condition. Friction (D3): the discuss agent has no live view of chapter content, so it cannot verify the fix itself. `transcripts/x5-turn1/2-9b7fbf43.json`.

**Ghost text (CANDIDATE C-4):** 4 probes, `openrouter-qwen36/haiku` resolved correctly (same qwen3.6 model).
- Working: "I knew the next entry would bear my name whether I wrote it or not" (28.6s) and "and crusted with salt, as if the rope had been pulled tight in a panic and left to harden while the tide went out" (43.8s) — **genuinely in register** (inference anchor, accretive rhythm, zero AI-tells). Register: PASS.
- Broken economics: the route hardcodes `max_tokens: 60` assuming text-only models; qwen3.6 is a reasoning model. Empty suggestions 2/4 (billed, `tokens_output` exactly 60 = budget consumed by reasoning before any visible text, ~1.5s); successful ones billed **1479 and 2440 output tokens** ($0.0036-0.0059 per ghost invocation) at 28-44s — unusable as a typing companion on this model class. Same mechanism family as fixed D-04. `transcripts/ghost-text-*.json`, usage_records dump in log.

## Phase 4 — Return: authorship honesty, persistence

- **Authorship tracker:** honest by construction — `hasTrackedAuthorship` gate (`src/lib/editor/authorship.ts`, `authorship-tracker.tsx:49`) hides the readout entirely unless real AI provenance was recorded; never fabricates "100% yours". The `data-author` provenance producer is not wired yet (acknowledged in code comments) — so after Owen applied an AI suggestion, the chapter contains AI-edited words and the tracker still shows nothing. Honest-by-omission: PASS; capability gap documented (W17-adjacent), not a defect.
- **Constraint persistence:** WriterMemory row survived across sessions and was quoted in the pass3 report (above). Fingerprint/bible/architecture persist as documents. PASS.
- **Stronger-model comparison (W7/W14):** BLOCKED-ENV. `ANTHROPIC_API_KEY` in .env **fails live validation** (400 Invalid API key; correctly NOT stored — only the validated openrouter key remains on the account; `modelEditor` override reverted to null). All voice verdicts are **qwen3.6-conditional**; the 6/6-device stronger-model target is EVIDENCE-LIMITED this run.

## D5 numbers (dev-server, qwen3.6)

- Line-edit wall-clock: 109.5-322.6s per chapter (395-1600 words). First-token not separately instrumented (SSE event cadence in transcripts).
- Discuss round-trips: 18.1s / 40.4s / 87.8s / 126.7s (high variance; >60s feels broken in a chat UI).
- Ghost text: 1.5-1.8s when empty, 28.6-43.8s when substantive — both failure modes for an inline typing feature (see C-4).
- Autosave/content PUT: 0.05-0.25s. Findings list GET: ~0.1s.
- Owen total spend (sessions + ghost + discuss): ≈ $0.36.

## Exit criteria vs plan (P6)

| criterion | result |
|---|---|
| Flattening within pre-registered bound | **PASS** — 0 FLATTEN findings across 6 passes (bound trivially met; N=3 hunks, caveat above) |
| ≥4/6 signature devices survive on qwen | **PASS — 6/6**, incl. both known-hard (and-stack, inference anchor); ch1/ch2/ch4 reports explicitly exempt them by name |
| 0 misquotes in his N | **PASS — 0/4** byte-verbatim (3 pending + 1 rejected row) |
| Adversarial prose respected | **PASS** — 0 findings on ch4; report names splices/repetition/fragments as "deliberate accretive rhythm, not errors" |
| 6/6 on stronger model | BLOCKED-ENV (invalid anthropic key) — qwen-conditional verdict only |
| D-33/D-34 graceful rejection | **PASS** live (1 rejection, corrective REJECTED message, recovery, analytics row, 0 raw errors) |

**Residual honest weaknesses:** planted-error recall 3/6 (under-flagging residue post-gate); ghost-text economics broken on reasoning models; two S2 candidates (wizard no-op wall C-1, fake-success outage pass C-2) found inside the journey.

---

# ADDENDUM — Strong-model leg (anthropic/opus = claude-opus-4-6), 2026-07-18 evening

Team-lead unblocked the leg: user replaced ANTHROPIC_API_KEY in .env (validated live). Same pre-registered pages, same device registry, same plants — only the model changed. Worker at HEAD 0dde596 (includes D-33/D-34 hardening).

## Setup (traces: api-traces/strong-setup.json, strong-restore.json, strong-override-coach.json)

1. Key stored via `POST /api/settings/api-keys` → 201, validatedAt set, `sk-ant-...jgAA` alongside the openrouter key.
2. `PATCH /api/settings/default-model {modelEditor:"anthropic/opus"}` → 200 — **but the first ch1 run still billed qwen** (`usage_records`: model `openrouter-qwen36/sonnet`, $0.0243). Root cause chain, verified in code + DB:
   - Line-edit sessions run **entirely on the conductor (coach role)** — no Delegate call in any transcript (qwen or opus legs). The editor-role override never engages. (`resolveConductorModel` → role "coach"; usage rows are all `agent_type: "writing-coach"`.)
   - Book-level `book_settings.model_editor/model_coach` hold tier names ("sonnet") that `getModelDef` (exact registry-ID match) cannot resolve → book levels 1-2 always fall through for wizard-created books.
   - Coach then fell to global default = qwen. Fix: `{modelCoach:"anthropic/opus"}` too (kept modelEditor set as well). All subsequent runs stream `cost_update` events with `"model":"anthropic/opus"`.
   - The wasted run doubles as a **qwen replication: ch1 again 0 findings** (consistent with the original leg).
3. Chapter comparability enforced: ch1/ch2/ch4 byte-identical to pre-registered manuscripts (ch2 differs only by a heading line present in the evidence copy); ch5 was at post-edit v3 → **restored to the planted-error version** (owen-ch5-what-the-water-keeps.md) as v4, byte-verified.

## Runs (one session at a time; transcripts line-edit-ch{1,2,4,5}-strong*-sse-raw*.json; audit: api-traces/strong-audit.json)

| leg | session | outcome | tokens in/out | cost |
|---|---|---|---|---|
| ch1 voice corpus (strong2) | a85ca76e | complete, **1 finding** | 164,517 / 6,229 | $2.93 |
| ch2 voice corpus (strong1) | 7b622c5e | complete, **0 findings** | 114,053 / 8,041 | $2.31 |
| ch4 adversarial (strong1) | 40035b40 | **live Anthropic outage mid-run** → honest SSE error + auto-retry → real completion, **0 findings** | 70,503 / 4,132 | $1.37 |
| ch5 planted probe (strong1) | e347c78f | complete, **2 findings** | 209,796 / 5,937 | $3.59 |

LINE_EDIT_REPORT documents written for all four runs (incl. post-outage ch4 — the retry produced real work, tokens/cost non-zero; NOT a D-36 fake-success. D-36's failure mode is when the retry itself resolves empty; not reproduced here).

## Verdicts vs qwen

- **Device survival: 6/6 on opus** (exit target met). All registered ch1/ch2 device spans present and unflagged; ch4 adversarial 0 corrections; ch5 devices V1-V6 untouched. The single ch1 finding is "clipboard…clipped" root-word echo (suggestion, redundancy) — a genuine micro-catch qwen never made, NOT a registered device span, with register-preserving alternatives ("fixed"/"fastened"). Quality signal, not flattening.
- **Misquotes: 0/3** — originalText, anchorQuote, and every alternative byte-verbatim (NFC), grounding 1.0 on all three.
- **Planted recall:** opus 2/5 eligible (E4 palpable ✓ important, E5 purple sunset ✓ critical) vs qwen 2/5 on the same eligible set. **E6 (dangler) correctly NOT re-flagged: the WriterMemory keep-as-is constraint from the qwen leg held across a model switch** — cross-model constraint persistence proven causally (constraint stored during the qwen leg; the opus session honored it and skipped the span). E6 excluded from the denominator for that reason (qwen's 3/6 predates the constraint). E1 double-under, E2 small-echo, E3 filter-word: missed by both models — under-flagging residue is gate-driven (Change-2 territory), not model-driven.
- **Flattening: 0 FLATTEN findings.** Opus's E5 fix avoids the D-41 empty-newText trap: it proposes a span replacement that deletes the ornamental sentence (newText = the following sentence), i.e. an applyable deletion.
- **D-33/D-34 under opus: zero rejections needed, zero raw errors.** Opus emitted well-formed CreateFinding calls (one call streams as two tool_use events with the same toolUseId — partial-input announce then full input; benign). The rejection path itself remains validated by the qwen leg's live REJECTED corrective.

## Post-leg state

- Overrides reverted: modelEditor/modelCoach → null (api-traces/strong-override-revert.json). Both keys left on the account (user's own). defaultModel unchanged (openrouter-qwen36/sonnet).
- ch5 left at planted v4 with 2 pending opus findings (plausible writer state).
- Strong-leg spend: **$10.21 opus** (4 sessions) + $0.02 wasted qwen replication. Journey total ≈ $10.59.

## Exit criteria update

| criterion | result |
|---|---|
| 6/6 on stronger model | **PASS — 6/6 on claude-opus-4-6** (was BLOCKED-ENV) |

W7/W14 model-conditional caveat resolved: voice-integrity verdict now holds on both qwen3.6-27b and claude-opus-4-6.
