# P6 Owen — UI capture wave 2026-07-27 (45-series)

## 45-series: setup-surface + funnel re-capture (2026-07-27)

**Build:** HEAD `adcb808` (fixes under test: `6233c44` D-160/D-161/D-163 setup surface, `e75996e` D-172 discuss billing) · Dev `:3001` (started 01:08 local, hot-reloaded the 02:26 sources — verified by `2/5` counters and `setup-surface.ts` behaviour being live) · identity via e2e headers (`x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p6`, no `.env` flips) · desktop 1280×900 @2 DSR · capture protocol v8 (`nextjs-portal` hidden) · ENV-01 route-warm before every timed leg.

**Books:** `VM1 Test` `8632ba0c` (0-word scratch, setup surfaces + funnel) and `The Keeper's Arithmetic` `6d69fd7c` (5 chapters, fingerprint present — the only book where `line-edit` prerequisites are satisfied). The pre-registered **ch5 device probe was NOT touched**; the editorial leg used Ch 4 and Ch 1.

**Scripts:** `scripts/shot45a.ts` … `shot45f.ts` (each writes its own `45*-assertions.json` next to the PNGs).

| Shot | Proves | Verdict vs claim |
|---|---|---|
| `45a-p6-setup-complete-chrome.png` | Post-setup chrome: sidebar `Getting Started ✓ 2/5`, Setup item checked, no "Next Step" on Setup or Style, "Next Step" moved to **Chapters** (chapter pipeline), no "Start Setup" banner. | **PASS** for the sidebar half of D-160 · **FAIL** for the solicitation half (see D-173) |
| `45b1-wizard-entry.png` · `45b2-import-step-plural.png` · `45b3-done-summary.png` | Wizard re-walked on camera: header `2/5 steps done` (was `2/6`), Import banner **"Manuscript imported — 1 chapter"**, Done summary row **"Chapters 1"**. | **PASS** — D-163 closed at both sites; one counter accounting across wizard/banner/sidebar |
| `45b4-editor-first-words.png` | **D-161 closed on camera**: "Start Writing!" lands in the Ch 1 editor with a live caret, 9 typed words, "Saved 03:12 AM". | **PASS** |
| `45c1/45c2/45c4-settled.png` | One live **Anthropic Opus** line-edit (BYOK) driven through the real panel; session completes, tool-by-tool progress, "Session Complete / Status: Refined". | **PASS** for D-43 live · per-frame cadence instrumentation **FAILED** (harness, disclosed below) |
| `45d1/45d2-discuss-turn.png` | One live discuss turn: clean thread + "I'll remember" constraint chip; **D-172** row now exists in `usage_records`. | **PASS** |
| `45e1/45e2/45e3` | **Stream cadence on camera** (P6's D5 evidence gap): ghost-text SSE token-by-token into the editor, with the point-of-use model disclosure on the toggle. | **PASS** |
| `45f1/45f2-usage-by-agent-model.png` | BYOK usage surface re-shot after this wave's real spend: Opus $12.03 by model, new **Discuss** agent row. | **PASS** · one new reporting defect (D-175) |

---

### 45a — D-160: is completion visible? (half yes, half no)

Sidebar, verbatim from the render (`45a-assertions.json`):

```
VM1 Test / Overview
Getting Started        ✓ 2/5      <- check + truthful fraction (was "0/2", pixel-identical pre/post)
  Setup                ✓          <- item check (was never marked)
  Transfer
  Style                           <- NO "Next Step" badge (was soliciting Style forever)
Writing                0/1
  Chapters   [Next Step]          <- recommendation fell through to the chapter pipeline
```

`setupComplete=true` at capture time (`GET /settings`), 2 of 5 steps genuinely resolved (basics + import; style/bible/architecture skipped). Counters agree on both numerator **and** denominator everywhere they appear.

**But the same overview still solicits the skipped step:**

```
VM1 Test  [Concept]  literary
┌───────────────────────────────────────────────────────────────┐
│ ▷  Recommended: Capture Style                        [ Start ] │
│    Capture your writing style fingerprint to guide all AI agents│
└───────────────────────────────────────────────────────────────┘
```

This is the exact card the v2 panel called the "Start Setup CTA". The D-160 fix reviewed the *banner* (gated on `setupComplete`) and the *ProactiveGuide* ladder (now gated), but `src/app/(app)/books/[bookId]/page.tsx:160-211` computes a **fourth, server-rendered recommendation** with its own ladder — `if (!hasFingerprint) nextWorkflowId = "capture-style"` — and never reads `setupComplete`. Registered as **D-173**.

Recurrence, no new number: the FAB still occludes the chapters table **Action** column ("Ed…" instead of "Edit") — D-139 family, visible again in `45a`.

### 45b — D-161 and the timed Done→first-words funnel

**Reset lever (documented as instructed):** `PATCH /api/books/8632ba0c-f05b-4fd5-9581-3790a0f2c675/settings` with body `{"setupComplete": false}` → **200**, response body `setupComplete: false`. That is the *same* D-35 PATCH the wizard itself issues on "Start Writing!" — no DB surgery, no `.env` change.

**ENV-01 warm (disclosed, dev-only):** `GET /books/{id}/setup` 1359 ms, `GET /books/{id}/chapters/{ch1}` 1253 ms — both routes were already compiled from earlier shots, so no cold-compile cost is hiding inside the funnel numbers below. Next-dev JIT compile is not a product property; a production build has none.

**Walk on camera:** entry at `2/5 steps done` → Back to Import (banner "Manuscript imported — 1 chapter") → `Continue` → `Skip` → `Skip` → `Skip` → Done summary:

```
Book name          VM1 Test
Chapters           1                 <- D-163: no "1 chapters"
Style Fingerprint  Not captured
Story Bible        Not created
Architecture       Not created
[ Start Writing! ]
```

**The funnel, one click, wall-clock (`45b-assertions.json`):**

| Milestone | ms from "Start Writing!" click |
|---|---|
| `PATCH /settings` 200 (setupComplete=true) | 290 |
| URL is `/books/{id}/chapters/{chapterId}` | **1 203** |
| ProseMirror mounted and `contenteditable` | **2 701** |
| caret landed (click accepted) | 2 763 |
| first typed word rendered | **3 081** |
| full 9-word sentence rendered | 6 003 (includes deliberate 22–40 ms/char typing ≈ 1.1 s) |
| autosave `PUT …/content` 200 | 5 610 and 10 277 (status bar shows "Saved 03:12 AM") |

So the D4 promise "typing within 60 s" is met with ~57 s of headroom **from the wizard's last click**: 3.1 s to first word.

**Duplicate-chapter check (the D-161 create-or-open risk):** chapters before = 1, after = 1, identical id `1ca23e35-…` — and **no `POST /chapters` was issued at all** (network log in the assertions file); the cached lowest-numbered chapter was opened directly. `setupComplete` after the leg = `true`.

**Honest finding in the very same frame (`45b4`):** the post-wizard sidebar still reads `Getting Started 2/5` **without** the check and still shows `Style [Next Step]`. The wizard PATCHes settings with raw `fetchJson` (`setup/page.tsx:158`) and never invalidates the `["book-settings", bookId]` query that `use-book-state` reads (`use-settings.ts:52` has the invalidation the wizard bypasses), so the "finishing the wizard visibly changes the chrome" claim only lands **after a reload** — which is precisely what `45a` is. Registered as **D-174**.

### 45c — one live Opus line-edit (D-43 at point of use)

`modelEditor` was set to `anthropic/opus` for the run and **restored to `sonnet` afterwards** (both by `PATCH /api/books/6d69fd7c…/settings`, 200 each; final DB state re-verified: `model_editor = sonnet`).

Pre-flight, straight from the product (`GET /api/books/6d69fd7c…/cost-estimate?workflowId=line-edit`):

```json
{"blocked":false,
 "costEstimate":{"min":1.2,"max":3.675,"formatted":"$1.20 - $3.67"},
 "resolvedModel":{"registryId":"anthropic/opus","displayName":"Claude Opus 4.6 (Direct)",
                  "tier":"opus","resolvedFrom":"book-role"}}
```

Driven through the real UI: FAB → mini panel → "All workflows…" → **Line Edit** → "Ch 4: The Gull Road" → **Start**.
`POST /agent` 200 at +4.9 s (queued; BullMQ worker started for this wave), `GET /agent/{id}/stream` 200 at +12.4 s.

Ground truth after the run:

```
agent_sessions  fa1bad0b-3cec-463b-b7d2-7edf72afc094
  workflow_id line-edit · chapter 4 · status completed
  started 2026-07-27 01:31:14.729Z → completed 01:32:48.331Z  =  93.6 s
  actual_cost_usd  1.821945

usage_records
  agent_type=writing-coach · model=anthropic/opus · 99 063 in / 4 480 out
  cost 1.821945 · key_source=user   (recorded 01:32:48.354Z)
```

**D-43 honored live:** the book-role override resolved to `anthropic/opus`, the run actually billed Anthropic Opus on Owen's own key, the billed amount equals the session's `actual_cost_usd`, and it lands inside the pre-flight range the product quoted before the click.

Panel on camera (`45c4-settled.png`): `Writing Agent [Background]`, stepwise tool progress (Reading chapter… · Reading blackboard insights… · Checking existing documents… · Reading Chapter 4… · Reading document… · Searching memory… · Reading Line Edit Report…), the editor's own narration, then `✓ Session Complete / Status: Refined`, `Review Findings →`, `Recommended next: Beta Read`.

Run outcome, stated against interest:
* **0 new findings**; the existing `LINE_EDIT_REPORT — Chapter 4` (`8eb42624`) was **rewritten** (`updated_at 01:32:36`); chapter stays `line_edited`, 240 words.
* Disclosure: every chapter of this book is already `line_edited`, so this was a re-pass, and the agent's own transcript argues the repetitions are fingerprint-protected devices ("anaphoric… Protected", "five-grey stack… literally a calibration sample"). 0 findings is therefore a defensible outcome, not evidence of a bug.
* Observation (unnumbered): the completion CTA says `Review Findings →` and the Editorial badge says `5`, but those 5 are the pre-existing 07-18 pending findings. The run never says "0 new findings from this pass", so a writer who just spent $1.82 cannot tell from the panel that this pass produced none.
* **Harness failure, disclosed, not retried:** the `EventSource` wrapper installed for this shot recorded 0 frames, so **per-frame panel cadence for the Opus run is missing**. Wall-clock (93.6 s), cost, model, and outcome are real and independently verified in the DB. A second Opus run would have cost another ~$1.8 of the owner's key, so cadence was instead captured on the in-editor stream (45e) at ~1/25 000 the cost. Judges should read 45c as *latency + routing + outcome*, and 45e as *cadence*.

### 45d — D-172: the discuss turn that used to be free

Finding `0002c9e1` (Ch 1, `redundancy`, `pending`, 0 prior user turns — ch5 probe untouched). One writer turn sent through the editorial UI.

* `POST …/discuss` request at +38 ms → **200 at +61 645 ms**. One blocking minute, no streaming, no partial text; the spinner is the only feedback. (Judge B's D5 floor cited a 157.2 s baseline: same shape, faster today, still a minute-long dead wait — see D5 note below.)
* Thread renders clean (`45d2`): writer bubble, assistant reply ("It reads as patterned, not sloppy…"), the italic constraint chip *On "Keep as-is", I'll remember: "Preserve deliberate root-word echoes that link character action to thematic vocabulary."*, and a `Keep as-is` button. Zero raw control syntax in any bubble.
* **Billing, the thing the fix was about:**

```
usage_records  agent_type=discuss · model=openrouter-qwen36/haiku
               922 in / 4 100 out · $0.010103 · key_source=user
               book_id=6d69fd7c… · recorded_at 01:48:05.038Z

finding_replies user      01:48:05.134Z
                assistant 01:48:05.146Z
```

The usage row is written **96 ms before** the replies persist — billed at settle, then persisted, exactly as `e75996e` claims. Pre-fix this turn produced **zero** usage rows.
* Side note that matters for D-162: 4 100 output tokens for a two-sentence reply, on the qwen3.6 reasoning model. Fresh, same-day control for the verdict below.

### 45e — stream cadence on camera (P6 D5 evidence gap)

* Toolbar toggle `aria-label` flips `AI Ghost Text (off)` → `AI Ghost Text (on)`; its tooltip carries the point-of-use disclosure **"Quick suggestions may use a faster model than your default."** (`45e1`, D-127 family).
* Typed `" The tide was"` and paused. Measured by teeing the response body, so every arrival time is observed rather than asserted:

```
+2 835 ms  POST /ghost-text                     (1.5 s pause trigger + debounce)
+6 275 ms  200, content-type: text/event-stream (first byte through the first-text gate)
+6 279 ms  data {"type":"token","text":"out"}
+6 314 ms  " when"          gap  35 ms
+6 354 ms  " I came"        gap  40 ms
+6 501 ms  " down, already turning with"      gap 147 ms
+6 642 ms  " the new moon I couldn"           gap 141 ms
+6 835 ms  "'t see yet, and"                  gap 193 ms
+7 024 ms  " the air in the house"            gap 189 ms
+7 176 ms  " smelled of copper and old"       gap 152 ms
+7 267 ms  " wax."                            gap  91 ms
+7 285 ms  data {"type":"done", …}            gap  18 ms
+7 293 ms  stream end
```

9 token frames + done; **median inter-token gap 141 ms**, whole stream 1.01 s, first visible text 3.44 s after the request. Rendered as grey inline italic in the manuscript (`45e2`) and never accepted (no Tab), so no AI prose entered the book.
* `usage_records`: `ghost-text · openrouter-deepseek/haiku · 233 in / 31 out · $0.000071 · key_source=user` — the D-116/D-117 substitution running live, with output **below** input.
* Harness notes: the first attempt broke on the product's own D5 warmup ping (`?warmup=1`, JSON not SSE) and exited early; retried once with warmup filtered (one retry, per protocol). The two attempts each appended `" The tide was"` to Ch 4; the chapter was **reverted to its exact pre-capture text** afterwards (`PUT …/content`, 240 words, book back to 3 857 words).

### 45f — the BYOK surface after this wave

```
Token Usage (30 days)   41 sessions · 1.4M in · 127.9K out · $12.48

Usage by Agent          Ghost Text     5 sessions  $0.01   897 in / 4.1K out
                        Embeddings    17 sessions  $0.00   4.6K in / 0 out
                        Discuss        1 session   $0.01   922 in / 4.1K out   <- new, D-172
                        Writing Coach 18 sessions  $12.46  1.4M in / 119.7K out

Usage by Model          DeepSeek V3.2 (OpenRouter) (deepseek/deepseek-v3.2)  $0.00   264 tok
                        text-embedding-3-small                               $0.00   4.6K
                        Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)         $0.02   9.7K
                        Claude Opus 4.6 (Direct) (claude-opus-4-6)           $12.03  686.8K
                        Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)         $0.43   821.4K

Usage by Book           The Keeper's Arithmetic  39 sessions $12.48 · VM1 Test 2 sessions $0.00
```

Registry-true model names with provider ids, real non-zero per-key spend, and today's Opus line-edit visible in both the agent and model rollups. `45f2-usage-by-agent-model.png` is the in-viewport frame for **Usage by Agent** (the new `Discuss` row); the **Usage by Model** rows are in `45f1-usage-panel-full.png` (below the fold at 1280×900) and in `45f-assertions.json`. Two model rows render the **same** display name and the **same** provider model id with different numbers → **D-175**.

Observation (unnumbered): the $1.82 Opus line-edit lands under **Writing Coach**, because for a per-role workflow the conductor itself runs on the editor-role model (the D-43 mechanism). There is no Line Editor / Editor row anywhere, so "what did my line edits cost?" is unanswerable from this panel even though the money is correctly totalled.

---

## D-162 verdict (S4, judges B+C, D-44 family) — NOT a swap, NOT an input under-count

The panel row the judges flagged was `Ghost Text · 664 in / 4.0K out`. One DB read plus four cross-checks settle it.

**1. The four rows behind the aggregate (P6, `agent_type='ghost-text'`):**

```
 model                    | in  | out  | cost       | recorded_at
 openrouter-qwen36/haiku  | 190 | 1479 | 0.00360375 | 2026-07-18 16:09:52
 openrouter-qwen36/haiku  | 158 |   60 | 0.00018903 | 2026-07-18 16:09:53
 openrouter-qwen36/haiku  | 158 | 2440 | 0.00590103 | 2026-07-18 16:10:59
 openrouter-qwen36/haiku  | 158 |   60 | 0.00018903 | 2026-07-18 16:11:00
 sums                       664   4039   ← exactly the panel's "664 in / 4.0K out"
```

Two rows are the honest shape (60 out = the route's `max_tokens: 60`); two exceed that same 60-token budget by 25–40×. The aggregate is dominated by those two.

**2. No transposition anywhere.** `/api/usage` sums `tokensInput → "in"` and `tokensOutput → "out"`; the billing page renders them under those labels. Row values, API sums, and pixels agree.

**3. ~166 input tokens/session is the design, not truncation.** `src/app/api/books/[id]/ghost-text/route.ts:124-142` sends a ~120-token system prompt plus **only the pre-cursor context window**, with `max_tokens: 60`. Ghost text deliberately does not feed the chapter. Today's live row (45e) is 233 in — same order.

**4. Cross-model controls on the same route:**

```
 openrouter-deepseek/haiku  19 rows  avg 194 in /  28 out   (out << in)
 openrouter-qwen-max/haiku   1 row       217 in /  13 out
 openrouter-qwen36/haiku      5 rows  avg 166 in / 1449 out  <- only this family inflates
```

**5. Cause:** `qwen/qwen3.6-27b` is a reasoning model and OpenRouter counts provider reasoning tokens inside `completion_tokens`, which `max_tokens` does not bound. This is the already-registered D-100 / D-116 / D-117 family, not a new accounting bug.

**6. Timeline:** all four rows are 2026-07-18 16:09–16:11 — *before* `26c57c9` (07-20, reasoning disabled on quick assist) and `d51514c` (07-21, quick assist routes around `unfitForQuickAssist` models).

**7. Live control captured today (45e):** same route, same book, post-fix → `openrouter-deepseek/haiku`, 233 in / 31 out, $0.000071. The inflated shape cannot recur on ghost text. The 45d discuss row (922 in / 4 100 out on qwen3.6) reproduces the same reasoning-token signature on a *different* route, which is the mechanism, not a swap.

**Verdict: D-162 is not a billing-pipeline defect — it is historic reasoning-token accounting from a model quick assist no longer uses.** Residual, S4, unnumbered: the panel presents a lifetime aggregate with no per-model or per-date breakdown inside an agent row, so a pre-fix artifact still reads as a present-day implausibility. A per-model split (or a "since" filter) inside the agent row would remove the confusion without touching billing.

---

## NEW defects (register of record; next free was D-173)

**D-173 — S3 — post-setup overview still solicits the skipped setup step (D-160 incomplete).**
`GET /books/{id}` with `setupComplete=true` and 2/5 steps resolved renders `Recommended: Capture Style — Capture your writing style fingerprint to guide all AI agents [Start]` (`45a`). Root cause: `src/app/(app)/books/[bookId]/page.tsx:160-211` holds a **fourth** recommendation accounting — server-rendered, gated on `!hasFingerprint` only, never consulting `setupComplete` — while the sidebar and ProactiveGuide now route through `nextSetupWorkflow()`. Same file the D-160 counter fix edited (the banner at :467-499), different block. Fix shape: feed this ladder from `nextSetupWorkflow()`/`use-book-state`'s priority chain so all four surfaces share one source. Evidence: `45a-p6-setup-complete-chrome.png`, `45a-assertions.json` (`noCaptureStyleRecommendation: false`).

**D-174 — S4 — finishing the wizard does not update the chrome until a reload.**
In the frame immediately after "Start Writing!" the sidebar still shows `Getting Started 2/5` unchecked and `Style [Next Step]` (`45b4`), i.e. the pixel-identical pre/post symptom D-160 was raised for, still visible for the rest of the SPA session. Root cause: the wizard PATCHes settings with raw `fetchJson` (`setup/page.tsx:134` and `:158`) and never invalidates `["book-settings", bookId]`, the key `use-book-state.ts:112` reads; the invalidation exists but only inside `useUpdateBookSettings` (`use-settings.ts:52`), which the wizard bypasses. Fix shape: route both wizard PATCHes through the mutation hook, or `queryClient.invalidateQueries({queryKey:["book-settings",bookId]})` before `router.push`. Evidence: `45b4-editor-first-words.png` vs `45a` (same state, one reload apart).

**D-175 — S4 — Usage by Model lists the same model twice, indistinguishably.**
`Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b) $0.02 / 9.7K` and `Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b) $0.43 / 821.4K` appear as two separate rows (`45f1-usage-panel-full.png`, `45f-assertions.json`). The rollup keys on registry id (`openrouter-qwen36/haiku` vs `openrouter-qwen36/sonnet`) but renders only `displayName (modelId)`, which are identical for slots that share one underlying provider model. A writer auditing spend sees one model twice and cannot tell which is which. Fix shape: render the registry id (or the slot) alongside the display name when two rows collide.

**Observations (no number, per protocol):**
* Line-edit spend is attributed to the **Writing Coach** agent row; no editor/line-editor row exists, so per-role cost is unanswerable from the panel even though the D-43 routing is correct (45c + 45f).
* A completed line-edit pass that produced 0 findings still offers `Review Findings →` with no "0 new findings" statement (45c4).
* D-139 recurrence: FAB occludes the chapters table Action column (45a).
* Two session counts on one billing screen with no explanation: `LLM Agent Costs … 24 agent sessions` and `Total Sessions 41` (45f2). The arithmetic is coherent (41 = 24 LLM + 17 embedding), but the labels do not say so — D-152 family.
* D5 texture for P6: in-editor quick assist streams (median 141 ms/token, first text 3.4 s), but the finding-**discuss** turn is still a single blocking 61.6 s POST with only a spinner — the two surfaces have opposite felt latency in the same product.

---

## Doc hygiene — correction to `UI-CAPTURE-2026-07-26.md`

The v2 panel's evidence-integrity note is accepted and the row is corrected in that file: **`41e` proves "post-setup overview clean", not `41c`.** `41c` shows the Start-Setup banner, which only renders when `setupComplete === false`, plus a generic breadcrumb and a Memory skeleton — it is a **pre-setup / mid-hydration frame** and must not be cited as post-setup evidence. This wave's `45a` supersedes both as the post-setup overview frame (and shows the residual D-173 solicitation `41c`/`41e` were never read for).

## Staging / harness disclosures

* BullMQ worker (`npm run worker:dev`) was started for this wave because `line-edit` is a background workflow; Redis was already up (`platform-new-redis-1`). It is left running.
* `.env` untouched (identity via headers only). `DEV_CLERK_ID` remains `user_qa_p5`.
* `modelEditor` on `6d69fd7c` was `sonnet` → `anthropic/opus` → **restored to `sonnet`** (verified in DB).
* Ch 4 prose was reverted to its exact pre-capture text after the ghost-text runs (240 words; book 3 857 words).
* `VM1 Test` keeps this wave's 9-word first sentence and `setupComplete=true` — that is the funnel's own output, left as-is.
* Costs incurred on Owen's real BYOK keys this wave: $1.821945 (Opus line-edit) + $0.010103 (discuss) + $0.000071 (ghost text) = **$1.832119**.

---

# 45g / 45h / 45i — D-173, D-174, D-175 in pixels (2026-07-27, later same day)

**Build:** HEAD `eeb1fd8` (fixes under test: `921cb90` D-173/D-174/D-175) · Dev `:3001`, hot-reloaded
(verified before any shot: the server-rendered overview already emits `discuss-chapter` and no
`capture-style`) · identity via e2e headers (`x-e2e-test-secret` + `x-e2e-clerk-id: user_qa_p6`),
`.env` untouched · desktop 1280×900 @2 DSR · capture protocol v8 (`nextjs-portal` hidden) ·
ENV-01 route-warm before every timed leg · **no LLM call and no spend in this leg.**

Book: `VM1 Test` `8632ba0c-f05b-4fd5-9581-3790a0f2c675` (the same book 45a/45b used).
Scripts: `scripts/shot45g.ts`, `shot45h.ts`, `shot45i.ts`; each writes its own `45*-assertions.json`.

| Shot | Supersedes | Proves | Verdict |
|---|---|---|---|
| `45g-p6-overview-no-solicitation.png` | `45a` | D-173: post-setup overview recommends the **chapter pipeline**, not the skipped Capture Style | **PASS 8/8** |
| `45h1-done-step-chrome-before.png` → `45h2-editor-chrome-after-noreload.png` | `45b4` (defect frame) | D-174: the chrome flips **inside one SPA session, zero document reloads** | **PASS 9/9** |
| `45i-usage-by-model-folded.png` | `45f1` (defect frame) | D-175: one folded Qwen row + the slot disclosure | **PASS 5/5** |

## 45g — D-173 closed

`GET /api/books/{id}/settings` at capture time: `setupComplete: true`, `setupImportSkipped: false`.
Verbatim from the render (`45g-assertions.json`):

```
Recommended: Discuss Chapter
Ch. 1 is ready to be discussed with the AI                        [ Start ]
```

The `Recommended: Capture Style — Capture your writing style fingerprint…` card that 45a caught is
**gone**, and the fall-through the D-173 review hardened is what actually shows: the chapter-pipeline
step. Chrome unchanged from 45a and still truthful: `Getting Started ✓ 2/5`, `Setup ✓`,
**no** `Next Step` on Setup or Style, `Chapters [Next Step]`.

Assertions, all true: `setupCompleteTrue`, `noCaptureStyleRecommendation`, `noStartSetupCta`,
`recommendsChapterPipeline`, `gettingStartedTwoOfFive`, `noStyleNextStepBadge`,
`noSetupNextStepBadge`, `chaptersCarriesNextStep`. ENV-01: warm 1 187 ms, captured frame 1 482 ms.

Recurrence, no new number: the FAB still clips the chapters table **Action** column ("Edi…") — D-139 family, same as 45a.

## 45h — D-174 closed, and "no reload" is measured rather than asserted

Lever, exactly as documented: `PATCH /api/books/{id}/settings {"setupComplete": false}` → **200**.
Then the wizard was walked in the browser (`Skip` · `Skip` · `Skip`) to the Done summary, and
"Start Writing!" clicked once. **Nothing was reloaded after that click.**

Two independent no-reload proofs, both in `45h-assertions.json`:

* a `window.__noReloadSentinel` stamped immediately before the click is **still present** at capture
  time (`1785122004306`) — a document reload would have wiped the JS context;
* Playwright's page-level `load` counter: **1 before the click, 1 after the capture → 0 extra loads.**

The flip, same session, same JS context:

| Tell | 45h1 (Done step, before the click) | 45h2 (editor, after the click, no reload) |
|---|---|---|
| Setup nav item | no check | **green check** |
| Style nav item | **`Next Step`** | no badge |
| Chapters nav item | count `1` | **`Next Step`** |
| Getting Started | `2/5` | `✓ 2/5` |

Timings from the click (`45h-assertions.json`): `PATCH /settings` **+104 ms** → `GET /settings`
(the invalidation refetch the wizard used to skip) **+147 ms** → URL is
`/books/{id}/chapters/1ca23e35…` **+2 446 ms** → chrome captured **+8 448 ms**.
So the visible flip is driven by a **147 ms** refetch: `useUpdateBookSettings` invalidates
`["book-settings", bookId]` and `use-book-state` repaints long before the navigation even lands.
`GET /settings` after the leg: `setupComplete: true`.

**Bonus in the same JS context (sentinel still intact), `45h3-overview-spa-nav-no-reload.png`:**
an SPA click on the sidebar `Overview` link shows the flipped chrome **and** the D-173 card together
— `Recommended: Discuss Chapter`, `noCaptureStyleSolicitation: true`.

**Stated against interest:** in `45h2` the editor pane still reads `Loading chapter…`, because the
client's `GET …/chapters/{ch}/content` did not answer until **+9 436 ms** — the dev server had to
JIT-compile that API route (only the *page* route was ENV-01 warmed). 45b measured a mounted,
editable ProseMirror at **2 701 ms** with the route warm, and that number stands. The D-174 flip is
independent of it (it lands at +147 ms) and is fully legible in the frame; but the frame is not a
clean funnel-latency shot and must not be read as one.

Harness note, disclosed: the sidebar group check next to `2/5` renders as a `CheckIcon` whose colour
lives on the parent `<span>`, so the DOM probe's `svg[class*="text-green"]` test reports
`gettingStartedGroupChecked: false` for the **group** badge even though it is plainly green in the
pixels (`45g`/`45h2`). The **item** check on Setup does carry the class and is asserted true. Probe
limitation, not a product finding.

## 45i — D-175 closed

`/api/usage` still returns **two aliasing registry ids** — `openrouter-qwen36/haiku` and
`openrouter-qwen36/sonnet` — i.e. the raw data did not change, only the rendering. The panel now
shows **one** row (`45i-usage-by-model-folded.png`):

```
Claude Opus 4.6 (Direct) (claude-opus-4-6)                                    $12.03   686.8K total tokens
Qwen 3.6 27B (OpenRouter) (qwen/qwen3.6-27b)                                   $0.45   831.2K total tokens
  Combined across 2 configured slots: openrouter-qwen36/haiku, openrouter-qwen36/sonnet
text-embedding-3-small                                                          $0.00     4.9K total tokens
DeepSeek V3.2 (OpenRouter) (deepseek/deepseek-v3.2)                             $0.00      264 total tokens
```

Money is summed, not recomputed: raw slot sum `$0.446340` → panel `$0.45` (the panel's own
cents rounding). Rows are now ordered by spend descending, deterministically. The disclosure is a
**rendered line**, not a `title` tooltip, so it survives touch (D-151 family).

Assertions all true: `dataStillAliases`, `exactlyOneQwenRow`, `disclosureRendered`,
`disclosureNamesSlots`, `moneyPreserved`.

## Persona state changed by this leg

* `VM1 Test`: `setupComplete` cycled `true → false → true` by the two documented PATCHes; ends at
  **`true`**, i.e. where it started. `setupImportSkipped` stayed `false`. Chapter count unchanged (1,
  id `1ca23e35…`), chapter text untouched.
* **No LLM call, no BYOK spend, no worker job** in the 45g/45h/45i leg. Owen's running total from the
  earlier 45-series legs is unchanged at **$1.832119**.
* The pre-registered ch5 device probe on `The Keeper's Arithmetic` remains **untouched**.
