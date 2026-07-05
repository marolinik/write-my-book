# Write My Book — Product Map & Priority Frame

**Mission:** Best AI writing companion for serious authors. **Validation:** write a 50-page book end-to-end with `qwen/qwen3.6-27b` via OpenRouter (registry ids `openrouter-qwen36/{opus,sonnet,haiku}`).

**Sources synthesized:** agents/LLM pipeline report + editor/workspace report (the two deep domain explorations; findings cross-checked between them).

---

# Product Map (how the system actually fits together)

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    AUTHOR SURFACES                   │
                    │  Shelf (/books) → Book overview → Chapter editor     │
                    │  Editorial page · Library (bible/plans) · Dashboard  │
                    └───────────────┬─────────────────────────────────────┘
                                    │
        ┌────── direct AI calls ────┤────── agent sessions ──────────────┐
        │  ghost-text / inline-edit │  POST /api/books/[id]/agent        │
        │  continuity scan (4.4)    │  (31 workflows, workflows.ts)      │
        │  finding discuss (4.2)    │            │                        │
        └───────────────────────────┘            ▼
                                    ┌────────────────────────────────┐
                                    │ writing-coach CONDUCTOR         │
                                    │ (orchestrator.ts — every book   │
                                    │  workflow starts here)          │
                                    │ ⚠ model FORCED to               │
                                    │   ${provider}/sonnet, not the   │
                                    │   user's coach model            │
                                    └──────┬─────────────────────────┘
                    DelegateToSpecialist   │     dispatch rule (route.ts:374):
                    ($5 / 20-min sub-cap)  │     conversational OR ≤5min → INLINE (in-process,
                                           ▼       dies on restart)
                    ┌──────────────────────────────┐  else → BullMQ worker (src/worker.ts,
                    │ 13 SPECIALISTS               │    SEPARATE PROCESS — hard dependency)
                    │ ghostwriter, dev/line-editor,│
                    │ beta-reader, architect, …    │  Redis: pub/sub streaming, approval
                    │ model resolved HONESTLY via  │  polling, cancel flags, 24h catch-up
                    │ model-resolver 4-level chain │
                    └──────┬───────────────────────┘
                           │ every prompt built by
                           ▼
        ┌───────────────────────────────────────────────────────────┐
        │ PROMPT ASSEMBLER (prompt-assembler.ts) — Tier-1 is REAL    │
        │ 17 prioritized sections, trimmed to 60k–150k token budget  │
        │ writer_memory(90) > bible(80) > arch(70) > voice(58) >     │
        │ plan(55) > findings(50) > Neo4j graph(45) > adjacent(30) > │
        │ craft skills(25) > Qdrant vector memory(20, needs platform │
        │ OPENAI_API_KEY) > blackboard(15) > session briefs(14)      │
        └──────┬────────────────────────────────────────────────────┘
               │ output becomes artifacts via tools
               ▼
        ┌───────────────────────────────────────────────────────────┐
        │ ARTIFACTS + POST-SESSION (post-session.ts)                 │
        │ WriteChapter → doc version + word count                    │
        │ CreateFinding → quote-anchored EditFinding (fuzzy ≥0.8,    │
        │   dedup, grounding score) → editor annotations →           │
        │   apply/dismiss → WriterMemory learning loop               │
        │ BETA_READ_REPORT markdown → parsed → betaGate/betaScore    │
        │ chapter status pipeline: undiscussed→discussed→planned→    │
        │   drafted→dev_edited→line_edited→beta_read→beta_passed     │
        │ + Neo4j graph update, Qdrant indexing, blackboard promote  │
        └───────────────────────────────────────────────────────────┘
```

**The core loop that actually works today:** open chapter → write in TipTap editor (production-grade autosave: 2s debounce, optimistic locking, 409 conflict machinery, IndexedDB crash buffer) → F2 inline rewrite / Tab ghost text → run edit workflow → findings appear as inline annotations → accept/dismiss/discuss → WriterMemory learns preferences → next session's prompts carry it all forward.

**The three structural fault lines:**
1. **Model identity is dishonest** — Coach, discuss threads, and roster prompts run Claude regardless of the user's model choice.
2. **Conversation persistence is dead** — `ConversationTurn` rows are never written; multi-turn coaching is amnesiac and can't delegate after turn 1.
3. **Two shipped tiers are deploy-gated** — continuity net (4.4) and conversational findings (4.2) will fail at runtime until `prisma db push` runs.

---

# The Author's Journey Today

### 1. Start a book — ✅ mostly solid
- **Works:** `/books/new` is a 30-second form; "Start writing" drops you straight into chapter 1 (Tier 4.1 write-first); milestone toasts offer workflows as word counts cross thresholds. Guided setup wizard (6 steps, auto-resume) is solid. The Shelf (4.8) gives grouped books with continue-deep-links.
- **Rough:** Account onboarding wizard untested in exploration; import wizard reused in setup step 2 but not exercised.

### 2. Plan (style, bible, architecture, chapter plans) — ⚠ works but scattered
- **Works:** capture-style / create-story-bible / build-architecture workflows produce real documents; the "next workflow" heuristic routes sensibly; journeys give advisory paths.
- **Rough:** Chapter plans/briefs live as documents buried in the Library — never surfaced beside the editor. No outline view showing chapter summaries in sequence. Corkboard cards have no synopsis (no field exists). The non-chapter document editor **has no optimistic locking** — an agent rewriting the story bible mid-edit silently clobbers manual edits (the chapter editor solved this exact problem).

### 3. Draft — ✅ the strongest stage
- **Works:** Autosave/conflict/offline machinery is genuinely production-grade. Ghost text, F2 inline edit (3 suggestions), right-click AI menu, focus/typewriter modes, split view, version history with diff/restore, ambient series panel (4.3). Writing heatmap/streaks are backed by real per-day word deltas.
- **Rough:** Immersive mode is a raw contenteditable with a ~30s content-loss window. Read-aloud can't start from cursor. No in-editor sprints (dashboard-only). AuthorshipTracker is a stub showing 100% human always.
- **Broken for the mission:** `write-chapter` goes to BullMQ — **without the worker process running it queues forever with no diagnosis**. At budget exhaustion, the wrap-up turn excludes `WriteChapter`, so a ghostwriter's final draft save is silently dropped.

### 4. Revise / restructure — ❌ the weakest stage
- **Broken:** Chapter reordering is impossible — corkboard PATCHes a nonexistent `/chapters/reorder` route (404 always); canvas fires parallel `chapterNumber` PATCHes that race `@@unique([bookId, chapterNumber])` (P2002 on most moves). No find & replace anywhere (renaming a character across 20 chapters = manual). No scene management beyond an HR "scene break." No author annotations/TODOs. Word targets displayed in four places, settable in zero.
- **Dead code that would fix this:** finding-review-mode (batch keyboard triage), version-branching UI (its API route exists!), entity mentions — a whole planned power-user layer, unwired.

### 5. Edit (dev/line/beta findings loop) — ✅ solid core, ⚠ fragile with qwen
- **Works:** CreateFinding validation (fuzzy anchors, NFC-normalized for Serbian, dedup, grounding scores) is the best-engineered part of the system. Apply/dismiss/undo/discuss lifecycle is complete; dismissals feed WriterMemory (5-dismissal inference). Editorial page triage is good. Tier 4.2 discuss threads work end-to-end in code.
- **Rough:** The strict finding contract (verbatim quotes ≥0.8, 2-3 alternatives, 23 enum categories) will burn qwen3.6 turns on rejections. Beta gate depends on parsing a `BETA_READ_REPORT` markdown format — parse failure means `betaGate` silently never sets and the revise loop stalls. Discuss-thread LLM is hardcoded to Claude Haiku.

### 6. Continuity — ⚠ shipped but gated
- **Works (in code):** Tier 4.4 live continuity net — scan on chapter switch + 20s idle, inline flags, go-to-chapter, mark-intentional. Neo4j graph + Qdrant memory feed agent prompts.
- **Blocked:** `ContinuityFlag` table doesn't exist in the live DB (`prisma db push` pending). Vector memory silently absent without platform `OPENAI_API_KEY`. Story Radar / Daily Plan present word-count heuristics as "proactive AI monitoring" — they catch nothing real.

### 7. Export — ❓ thinnest coverage
- Transfer page (import wizard + export config) exists and is rated works-but-rough, but was not exercised in either exploration. Treat export as an unknown that the 50-page validation must smoke-test early, not last.

---

# Landmines for the acceptance test (50-page book with qwen3.6-27b)

**Deploy gates — trip before anything else:**
1. **`prisma db push` never ran for 4.2 and 4.4.** `ContinuityFlag` table (schema.prisma:401) and `FindingReply.role` + `WriterMemory.findingId` are missing from the live DB. Continuity scans will fail at runtime; finding-discussion persistence and the WriterMemory upsert (keyed `userId_findingId_source`) will throw. Run both pushes first.
2. **BullMQ worker must be running** (`npm run worker:dev` / Dockerfile.worker). write-chapter, dev-edit, line-edit, beta-read, revise, and onboard-imported-book all queue to it; without it they sit "queued" forever with no user-facing error.

**Model-identity traps:**
3. **The Coach is never qwen.** `src/app/api/books/[id]/agent/route.ts:196-201` collapses the resolved provider to `${provider}/sonnet` — every conductor session runs Claude Sonnet 4.5 via OpenRouter at Claude prices, ignoring `modelCoach`. The SPECIALIST_ROSTER prompt also claims "(Opus)/(Sonnet)" labels that are false. Specialists resolve honestly; the conductor does not.
4. **Finding-discuss threads are hardcoded Claude Haiku** (`src/lib/editorial/discuss-llm.ts`) — user model preference ignored.
5. **Turn 2 silently switches models.** The `/message` continuation route resolves the role model (qwen) instead of the forced coach model (Claude) used on turn 1.

**Orchestrator vs qwen3.6:**
6. **`max_tokens` hardcoded 64000** (`src/lib/agents/orchestrator.ts:394`) for every call. If OpenRouter caps qwen3.6-27b completions below 64000, every request 400s → non-retryable ProviderError (`retry-handler.ts` treats 400 as fatal) → session dies with a generic message.
7. **Thinking blocks are dropped from SSE** — no `thinking` branch exists anywhere in `src/lib` (grep-confirmed). UI shows dead air during long reasoning; thinking tokens eat the 64k budget (repeated max_tokens-recovery loops burn cost); raw thinking blocks are replayed verbatim into history each turn.
8. **Budget-stop prose loss:** `WRAP_UP_TOOLS = {CreateFinding, WriteDocument}` (orchestrator.ts:609) excludes `WriteChapter` — a ghostwriter saving its draft at 100% budget has the save silently skipped. Hours of chapter text can vanish exactly when the author wants it saved.

**Conversational amnesia:**
9. **`ConversationTurn` is never written** — `addUserMessage`/`addAssistantMessage` (`src/lib/agents/session-manager.ts:142,162`) have zero callers; `loadConversationHistory` always returns `[]`. The Coach forgets its own first turn on every follow-up.
10. **Follow-up turns cannot delegate:** the `/message` route builds the orchestrator with no `delegationContext` — `DelegateToSpecialist` errors on every turn after turn 1, breaking free-drive's whole premise. It also omits `sharedCostTracker`/budget/`providerKey`, and increments tokens but never `actualCostUsd`, so cost dashboards drift on exactly the chatty sessions used most.

**Weaker-model contract fragility:**
11. **CreateFinding strictness** (verbatim anchor ≥0.8 fuzzy, 1-based paragraphs, 2-3 alternatives, 23-category enum — `src/lib/agents/tools.ts:79,1161`) → expect high REJECTED rates and thin editorial output from qwen.
12. **Beta gate = markdown parsing.** If qwen drifts from the BETA_READ_REPORT format, `parseAgentOutput` fails silently, `betaGate` never sets, revise→beta loop stalls, and the circuit breaker (3 failed beta reads) may never even see a "failed" result.
13. **Registry aliasing hack:** picking the `/haiku` alias of qwen (same model) blocks sonnet-minimum workflows via the tier gate. Use `openrouter-qwen36/sonnet` or `/opus` for everything.

**Editor/workspace traps during the book:**
14. **Chapter reorder is broken both ways** — corkboard → nonexistent `PATCH /chapters/reorder` (404); canvas → parallel PATCHes racing `@@unique([bookId, chapterNumber])` (schema.prisma:200). Plan chapter order up front or renumber manually.
15. **No session briefs on natural completion:** briefs are only created in `agent-worker.ts` on budget/timeout endings; `post-session.ts` never calls the brief path despite its docstring. Normal sessions leave no "what we did last time" for the next one.
16. **Approval gates auto-reject at 10 minutes** — walk away mid write-chapter and the agent proceeds on a rejection; combined with the hardcoded $5/20-min specialist sub-cap, long chapters end half-finished.
17. **Non-English token estimation:** `chars/4` undercounts Serbian; 60k–150k prompt budgets can overshoot the real context window. For the qwen validation, write in English or expect trims/overruns.
18. **Doc editor last-write-wins:** editing the story bible while an agent rewrites it silently clobbers one side (no `expectedVersion` on the documents PATCH).
19. **Misleading widgets:** Story Radar/Daily Plan are heuristic placeholders; AuthorshipTracker always says 100% human. Don't use them as signals during validation.
20. **Series routes are inline-only and un-budgeted** (`src/app/api/series/[id]/agent/route.ts`): 8-10 min estimates run in-process (server restart kills them), no providerKey (errors mistranslated as Anthropic).

---

# Ranked improvement candidates

Ranked by (a) blocks the 50-page qwen validation, (b) value to a serious author, (c) effort.

| # | What | Why it matters | Effort | Files |
|---|------|----------------|--------|-------|
| 1 | **Run both pending `prisma db push` gates** (ContinuityFlag; FindingReply.role + WriterMemory.findingId) | Two shipped tiers (4.2, 4.4) are runtime-dead without it; the validation book silently misses both | S | prisma/schema.prisma (deploy op, not code) |
| 2 | **Honor the user's coach model** (remove `${provider}/sonnet` forcing; fix roster labels) | Model honesty is table stakes — authors chose qwen and get billed for Claude; the conductor IS the product voice | S | src/app/api/books/[id]/agent/route.ts:195-201; src/lib/agents/orchestrator.ts (SPECIALIST_ROSTER) |
| 3 | **Per-model `max_tokens` + thinking-block handling** (cap from registry; forward thinking deltas as SSE status; strip thinking from replayed history) | Without it every qwen session risks instant 400 death, dead-air UI, and budget burn | M | src/lib/agents/orchestrator.ts:394 + stream loop; src/lib/llm/model-registry.ts |
| 4 | **Fix conversational continuity**: wire ConversationTurn persistence; pass delegationContext, cost tracker, providerKey, and the turn-1 model into `/message` | Multi-turn coaching is the flagship interaction and it's structurally amnesiac; free-drive can't delegate after turn 1 | M | src/lib/agents/session-manager.ts:142,162; src/app/api/books/[id]/agent/[sessionId]/message/route.ts |
| 5 | **Add WriteChapter to WRAP_UP_TOOLS** | Prevents silent loss of a full chapter draft at budget exhaustion — worst possible data-loss moment | S | src/lib/agents/orchestrator.ts:609 |
| 6 | **Transactional chapter-reorder endpoint** + point corkboard/canvas at it | Restructuring is a core act of serious authorship; today it's 404s and P2002 races | M | new src/app/api/books/[id]/chapters/reorder/route.ts; src/components/book/corkboard-view.tsx, book-canvas.tsx |
| 7 | **Structured beta-read gate** (tool-based report submission instead of markdown parsing) | With non-Claude models the revise loop silently stalls; a tool contract is model-agnostic | M | src/lib/agents/post-session.ts (parseAgentOutput); src/lib/agents/tools.ts (new SubmitBetaReport tool) |
| 8 | **Finding-contract resilience for weaker models** (richer rejection feedback in tool result, quote-locating assist, optional relaxed mode) | qwen's editorial output will otherwise be thin + turn-wasteful; findings are the product's best feature | M | src/lib/agents/tools.ts:46,79,1161 |
| 9 | **Find & replace** (chapter + book-wide) | Hard blocker for revision passes on long-form work (rename a character across 20 chapters) | M | src/components/editor/manuscript-editor.tsx + new dialog; TipTap search extension |
| 10 | **Session briefs on natural completion** (wire post-session → createSessionBrief) | "What we did last time" continuity currently only exists for crashed/budget sessions — backwards | S | src/lib/agents/post-session.ts; src/lib/agents/session-brief.ts |
| 11 | **Worker-health surfacing** (detect no-worker, show "queued — worker offline" instead of infinite queue) | Silent infinite hang on the six most important workflows is the worst failure mode | S | src/app/api/books/[id]/agent/route.ts; queue health check; agent UI |
| 12 | **Settable word targets** (book target in settings; `targetWordCount` in updateChapterSchema; pass it to ChapterContextHeader) | Targets render in four places and are settable in zero — pure theater; goals drive serious drafting | S | src/lib/validation.ts:57; src/app/(app)/books/[bookId]/settings/page.tsx; manuscript-editor.tsx → chapter-context-header.tsx |
| 13 | **Respect model choice in discuss-llm + inline surfaces** | Same honesty issue as #2, smaller blast radius | S | src/lib/editorial/discuss-llm.ts |
| 14 | **Optimistic locking for the document editor** (story bible/architecture) | Agent-vs-author clobbering on the book's most important documents; the pattern already exists in the chapter editor | M | src/app/(app)/books/[bookId]/documents/[documentId]/page.tsx; documents PATCH route |
| 15 | **Command-palette chapter jump** (+ fuzzy title search) | Chapter switching is the highest-frequency navigation; today it's sidebar scroll or prev/next | S | src/components/layout/command-palette.tsx |
| 16 | **Wire finding-review-mode** (batch keyboard triage — component already built, 316 ln) | Dev-edit on a 20-chapter book yields dozens of findings; card-by-card triage doesn't scale | S | src/components/editor/finding-review-mode.tsx → manuscript-editor.tsx / editorial-page.tsx |
| 17 | **Fix `/message` cost accounting** (actualCostUsd + keySource) | Cost dashboards drift exactly on the sessions authors use most; trust in budgets requires accurate meters | S | src/app/api/books/[id]/agent/[sessionId]/message/route.ts |
| 18 | **Honest widgets: fix or remove AuthorshipTracker + relabel Story Radar/Daily Plan** | Fake "AI monitoring" and a permanent 100%-human badge erode trust in the real AI features | S | src/components/editor/authorship-tracker.tsx (feed real changeSource data); story-radar.tsx copy; src/app/api/books/[id]/radar/route.ts |
| 19 | **Vector memory without platform key** (BYOK OpenAI key path, or local embedding fallback + explicit "memory off" indicator) | "The AI remembers your whole book" is silently false for BYOK users | M | src/lib/vector/embeddings.ts, memory-manager.ts; prompt-assembler.ts |
| 20 | **Outline/synopsis layer** (chapter synopsis field; surface plans/briefs beside the editor; corkboard shows synopses) | The single biggest missing planning affordance for serious authors; unblocks corkboard's purpose | L | prisma schema (Chapter.synopsis); corkboard-view.tsx; editor side panel; chapter PATCH schema |

Near-misses worth queueing after these: in-editor sprints (S, writing-sprints.tsx → editor), approval-gate pause-instead-of-reject (S, orchestrator.ts:760-835), non-English token estimator (S, prompt-assembler.ts), series-route hardening (M), version-branching UI wiring (M — API already exists), author annotations/TODOs (M), delete dead code (getModelId, word-sprint.tsx, six unwired widgets — S hygiene).

---

# Key API contracts cheat-sheet (driving the writing loop programmatically)

### Chapter content (the drafting loop)
```
GET  /api/books/[id]/chapters/[chapterId]/content
     → { markdown, wordCount, documentId?, version? }

PUT  /api/books/[id]/chapters/[chapterId]/content
     body: { markdown, expectedVersion?, changeSource? }
     → 200 { wordCount, version, bookWordCount }
     → 409 { currentVersion, serverContent }        // conflict; client no-op-adopts identical content
     // sanitizeUnicode both sides (U+FFFD → em-dash) before comparing
```

### Chapter metadata
```
PATCH /api/books/[id]/chapters/[chapterId]
     body: { title?, status?, actNumber?, chapterNumber?, betaGate?, betaScore? }
     // NO targetWordCount (schema rejects it); chapterNumber changes race @@unique([bookId, chapterNumber])
     // status pipeline: undiscussed→discussed→planned→drafted→dev_edited→line_edited→beta_read→beta_passed
PATCH /api/books/[id]/chapters/reorder   // DOES NOT EXIST — corkboard calls it, always 404
```

### Agent sessions
```
POST /api/books/[id]/agent
     // launches workflow (ids: write-chapter, dev-edit, line-edit, beta-read, revise, plan-chapter,
     //  discuss-chapter, coach, free-drive, create-story-bible, build-architecture, capture-style, …)
     // dispatch: !conversational && estimatedMaxMinutes>5 → BullMQ (worker REQUIRED); else inline SSE
     // conductor model forced to ${provider}/sonnet (route.ts:196-201) — NOT user's coach model

POST /api/books/[id]/agent/[sessionId]/message      // follow-up turn — BROKEN: no delegationContext,
                                                    // empty history, different model than turn 1
POST /api/books/[id]/agent/[sessionId]/approve      // answers RequestApproval; 10-min auto-reject
     // SSE events: text deltas + tool_use starts ONLY (thinking blocks dropped);
     // tool_result previews truncated at 500 chars
     // Redis: session:{id} pub/sub, session:{id}:messages (24h catch-up), session:{id}:cancel
```

### Findings (the edit loop)
```
PATCH /api/books/[id]/editorial/findings/[findingId]
     apply:   { alternativeIndex? | overrideText? } → whitespace/smart-quote-tolerant replacement
              into NEW doc version; 409 if anchor text drifted
     dismiss: { reason? } → sets rejectedAt; feeds WriterMemory (5-dismissal inference)
POST  .../findings/[findingId]/undo
POST  .../findings/[findingId]/discuss    // Tier 4.2 thread, 3-exchange cap; LLM hardcoded Claude Haiku
     // hooks accept string | {findingId, alternativeIndex?/reason?} — both shapes valid
```

### Direct AI assists
```
POST /api/books/[id]/ghost-text    { context: <last 500 chars>, chapterNumber, maxTokens: 60 }
POST /api/books/[id]/inline-edit   { selectedText, surroundingContext (±500 chars w/ [SELECTED TEXT]
                                     marker), instruction?, count: 3 } → { suggestions: [{label, text}] }
```

### Continuity (Tier 4.4 — needs ContinuityFlag table pushed)
```
POST /api/books/[id]/continuity/scan?chapterNumber=N  → { flags: ScanFlag[], degraded? }
     // degraded=true → client keeps prior flags; triggered on chapter switch + 20s edit-idle
POST /api/books/[id]/continuity/intentional  { flagId }
```

### Model selection (for the qwen run)
```
Registry: openrouter-qwen36/{opus|sonnet|haiku} → all "qwen/qwen3.6-27b", $0.285/$2.4 per 1M
Use the /sonnet or /opus alias — the /haiku alias fails sonnet-minimum workflow tier gates.
Resolution: book-role → book-default → global-role → global-default (model-resolver.ts).
7 of 14 agent types share the 'analyst' role override.
OpenRouter path: Anthropic SDK, baseURL https://openrouter.ai/api (SDK appends /v1/messages).
Retry: 3× backoff 10/30/60s on 429/5xx/529; 400/401/403 fail immediately (max_tokens 400 = instant death).
```

### Preconditions checklist for the acceptance run
```
1. prisma db push          (ContinuityFlag + FindingReply.role + WriterMemory.findingId)
2. npm run worker:dev      (BullMQ worker process — write-chapter/dev-edit/beta-read hang without it)
3. Redis up                (streaming, approvals, cancel)
4. OPENAI_API_KEY (platform env) if vector memory recall is in scope; else expect silent absence
5. Set openrouter-qwen36/sonnet on all roles; know that Coach + discuss threads will STILL be Claude
   until candidates #2/#13 land
6. Stay near the keyboard during write-chapter (10-min approval auto-reject)
```