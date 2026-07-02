# Tier 4.2 — Conversational Findings (Design Spec) — v2

*Date: 2026-07-02. Baseline commit: `1ae8f18`. Author: brainstorming session (approved).*
*v2: hardened by a 6-lens adversarial spec review (19 confirmed defects folded in — see §12).*

> **Strategic frame (roadmap §4.2):** the moment a writer feels the editor is a *collaborator*
> rather than a *judge*, we've won. Today a finding is an apply/dismiss binary. This makes each
> finding a short dialogue — the writer can explain intent, the agent adapts its suggestion in
> place, and the *conversation itself* becomes the highest-quality training signal, feeding the
> already-wired feedback loop (Tier 1.4). Never auto-apply.

---

## 1. Scope & decisions (locked)

1. **Conversation depth — bounded exchange.** The writer explains intent; the agent returns a
   *revised* suggestion + one-line reasoning, rendered in place. The writer may send a couple more
   messages (**soft cap = 3 user turns**), then chooses. Each turn is a single cheap model call.
   *Rationale for 3:* turn 1 = writer explains intent, turn 2 = agent proposes a revision with
   reasoning, turn 3 = writer clarifies / pushes back. That preserves real back-and-forth while
   keeping each turn cheap (~$0.0001 haiku, <1 s) and bounded; the cap is communicated gently to
   keep the collaborator frame.
2. **Surface — both, one shared component.** A single `FindingConversation` component renders the
   thread, surfaced in (a) the in-editor findings **sheet** (reached from the annotation tooltip's
   "Let's talk about this") and (b) the editorial review page's finding card (expands into the thread).
3. **Learning — capture + specific-learn now.** The full transcript persists (no signal lost) AND,
   when the writer keeps-as-is/dismisses after defending their choice, the agent emits **one specific
   constraint** (`source:"conversation"`, visible + undoable), **always server-scoped to the finding's
   own book**. Today's generic 3×-dismissal inference stays untouched alongside it.

### Out of scope (YAGNI)
- No streaming — plain JSON request/response.
- No orchestrator reuse — no DB `AgentSession`, budget gate, approval gate, or tools for a 1–3 turn revise.
- No auto-apply — every text change remains an explicit user action against the hardened apply path.
- No new model configuration UI — the discuss turn uses the cheapest tier (haiku) via a `coach`-role
  resolver override on the existing 4-level chain.
- No multi-finding batch discussion.
- **No edits to the autosave editor core** — the apply path is *extended additively*, not rewritten.
- Unread-reply **badge** reuses the onboarding localStorage pattern; a full toast/pill is a
  stretch-if-cheap, not a requirement (see §11).

---

## 2. Current-state anchors (verified by codebase read)

| Concern | Location | Note |
|---|---|---|
| Finding model | `prisma/schema.prisma:360-394` (`EditFinding`) | status pending/applied/dismissed/rejected; `alternatives` JSON `[{label,originalText,newText}]`; `anchorQuote` (verbatim, fuzzy ≥80%) |
| **Reply model (exists, unused)** | `prisma/schema.prisma:396-406` (`FindingReply`) | `id, findingId, userId, content, createdAt` + `EditFinding.replies FindingReply[]`. **Lacks only `role`.** |
| Findings API | `src/app/api/books/[bookId]/editorial/findings/route.ts` | GET `:22`, POST `:83`, PATCH `:98` (`action`, `reason?`, `alternativeIndex?`); auto-apply `:129-198` (fuzzy-match at ~`:154`) |
| Update schema | `src/lib/validation.ts:90-94` (`updateFindingSchema`) | **lacks `overrideText`** — must be added (§5.3) |
| Undo | `.../findings/[findingId]/undo/route.ts:10` | reverts to pending |
| Annotation tooltip (decision UI) | `src/components/editor/annotation-tooltip.tsx:89-226` | description + diff + Accept/Reject; mount point for "Let's talk about this" ~`:176` |
| Editor findings panel/sheet | `src/components/editor/editor-findings-panel.tsx:27-226` | sidebar (lg+) / sheet (<lg) of `FindingCard`s |
| Finding review mode | `src/components/editor/finding-review-mode.tsx:44-100` | applies w/ `alternativeIndex` |
| Editorial page finding card | `src/components/editorial/finding-card.tsx` | apply/dismiss card on the review page |
| Selected-finding state | `src/stores/editorial-store.ts` | `selectedFindingId`, `highlightedFindingId` |
| **Rewrite comparison (unexposed)** | `src/components/editor/ai-rewrite-comparison.tsx:23-38` | props `original, rewrite, rewriteLabel?, onAccept(newText), onReject, onRegenerate?, isRegenerating?`; two-column word-diff; **read-only, zero usages** |
| Conversation input (reusable) | `src/components/agent/conversation-input.tsx` | text input + `onSend`; has a `disabled` path |
| Feedback model | `prisma/schema.prisma:639-654` (`SuggestionFeedback`) | `suggestionId, suggestionType, positive, suggestionText`; unique `userId_suggestionId` |
| Feedback API | `src/app/api/books/[bookId]/feedback/route.ts:17-85` | Zod-validated; upsert; negative → inference; **auth/ownership pattern to mirror** |
| WriterMemory | `prisma/schema.prisma:617-633` | `source String @default("user")` (free-form), `category` free-form {style,name,preference,constraint,correction}, `bookId String?` (null = global) |
| Learning rule | `src/lib/agents/writer-memory.ts:184-217` (`inferPreferenceFromNegativeFeedback`) | 3× negative same type → generic `WriterMemory` |
| Memory → prompt | `src/lib/agents/writer-memory.ts:101-128` (`formatWriterMemoryForPrompt`) | fetches book-scoped **and** global (bookId=null) memories into every agent prompt |
| LLM client + model resolve | `createLLMClient` (client-factory), `src/lib/llm/model-resolver.ts:146-198` (4-level chain), `model-registry.ts:77-84` (haiku); single-shot pattern at agent route `:158-172` | |
| Onboarding patterns to reuse | `src/lib/onboarding/offers.ts`, `local-state.ts`, `src/hooks/use-onboarding-offers.ts` | pure module + SSR-safe localStorage + watcher + Sonner/pill |

---

## 3. Architecture

```
Writer clicks "Let's talk about this" on a finding
        │
        ▼
FindingConversation (shared component; renders its OWN plaintext thread + reuses ConversationInput)
  • hydrates thread: GET  /findings/:id/discuss   → replies[] (role-tagged, parsed at read-time)
  • sends a turn:    POST /findings/:id/discuss {writerMessage}   (optimistic append + onError rollback)
        │                         │
        │                         ▼
        │             discuss handler (single cheap turn)
        │               1. auth + ownership (finding.bookId === url bookId; user owns book)
        │               2. per-user rate limit (§5.1)
        │               3. TRANSACTION: SELECT … FOR UPDATE on finding's replies →
        │                    count user turns; if ≥3 → 409 {capped} (NO model call)
        │               4. one haiku "coach" client.messages() call (no tools)
        │               5. store assistant reply = FULL raw LLM text (unmodified)
        │               6. commit both rows (user + assistant) inside the same locked txn
        │               7. parse raw text at read-time → {assistantMessage, revisedSuggestion?, revisedReasoning?, suggestedConstraint?}
        ▼
  • latest revision → AIRewriteComparison (in place; single-column stack on mobile; editable for "Use it but edit")
  • action bar (conditional on whether a revision exists — §6.1)
        │
        ├─ Use it / Use it but edit → PATCH /findings/:id {action:"apply", overrideText}
        │        (hardened auto-apply; on anchor drift → 409 anchor_drifted, edit preserved client-side)
        │
        └─ Keep as-is → PATCH /findings/:id {action:"dismiss", reason}
                 + if suggestedConstraint present:
                     · WriterMemory.upsert(bookId = finding.bookId [server-derived], source:"conversation", …)  ← idempotent
                     · SuggestionFeedback (positive:false)  ← existing loop
```

**Isolation boundaries (each independently testable):**
- `src/lib/editorial/finding-conversation.ts` — **pure, crash-safe** view-state + turn-cap logic.
- `src/lib/editorial/discuss-prompt.ts` — **pure** prompt assembly + **pure, total** response parser.
- `discuss/route.ts` — thin IO shell: auth, rate-limit, locked txn, call the two pure modules, persist.
- `FindingConversation.tsx` — presentation; renders its own thread + `ConversationInput` + `AIRewriteComparison`.
- `AIRewriteComparison.tsx` — extended additively (edit mode, mobile stack); existing props unchanged.

---

## 4. Data model changes

### 4.1 `FindingReply` — add `role` (additive)
```prisma
model FindingReply {
  id        String   @id @default(uuid())
  findingId String   @map("finding_id")
  userId    String   @map("user_id")
  role      String   @default("user")   // "user" | "assistant"   ← NEW
  content   String   @db.Text           // for assistant rows: the FULL raw LLM response, unmodified
  createdAt DateTime @default(now()) @map("created_at")

  finding EditFinding @relation(fields: [findingId], references: [id], onDelete: Cascade)

  @@index([findingId, createdAt])       // ← NEW: ordered thread reads
  @@map("finding_replies")
}
```

### 4.2 `WriterMemory` — add `findingId` for idempotent conversation constraints (additive)
The idempotency guard in §5.4 requires a stable key. Add a nullable `findingId` + unique constraint:
```prisma
model WriterMemory {
  // …existing fields unchanged…
  findingId String? @map("finding_id")               // ← NEW: set only for source="conversation"
  // …
  finding EditFinding? @relation(fields: [findingId], references: [id], onDelete: SetNull)  // ← NEW

  @@index([userId, bookId, active])
  @@unique([userId, findingId, source])              // ← NEW: one conversation-constraint per (user,finding)
  @@map("writer_memories")
}
```
- `source:"conversation"` needs no schema change (`source` is already free-form).
- Existing rows get `findingId=null`; the unique key does not collide for the many `findingId=null`
  system/user rows **only if** the DB treats `NULL` as distinct in composite uniques. **Postgres does
  treat `NULL` as distinct** (two rows with `findingId=null` do not violate the unique) — verified
  assumption; the guard therefore only constrains non-null `findingId` conversation rows, which is exactly
  the intent.

### 4.3 Migration
One additive Prisma migration `add_conversation_findings` — `FindingReply.role` (+index), `WriterMemory.findingId`
(+relation, +unique). Non-destructive; all new columns nullable / defaulted. No data backfill.

---

## 5. Endpoints

### 5.1 `POST /api/books/[bookId]/editorial/findings/[findingId]/discuss`
**Request** (Zod): `{ writerMessage: string().min(1).max(2000) }`.

**Handler steps:**
1. **Auth + ownership** (mirror `feedback/route.ts`): user authenticated; load `EditFinding`; **404** if
   missing or `finding.bookId !== params.bookId`; verify the user owns the book (IDOR guard).
2. **Rate limit:** count `FindingReply` rows with `role="user"` for this user across all books where
   `createdAt > now()-24h`. If `> 200`, return **429** `{ capped:true, reason:"rate_limited", retryAfterSec:3600 }`
   (no model call). (Lightweight; also satisfies the previously-deferred feedback-endpoint rate-limit note.)
3. **Turn cap (atomic):** open a **transaction** and `SELECT … FOR UPDATE` the finding's replies. Count
   `role="user"` rows. If `≥ 3`, return **409** `{ capped:true, assistantMessage:"You've discussed this
   finding thoroughly (3 exchanges). Ready to make a decision?" }` — **no model call**, but still commit the
   txn releasing the lock. The lock is held from here through step 6 so concurrent POSTs cannot both pass.
4. **Model turn:** assemble the prompt via pure `buildDiscussPrompt({ finding, priorReplies, writerMessage,
   writerMemory })`; resolve model via the 4-level chain with `role:"coach"` (fallback haiku); one
   `client.messages()` call, **no tools**, `max_tokens ≤ 700`.
5. **Persist (same txn):** insert `FindingReply(role:"user", content:writerMessage)` then
   `FindingReply(role:"assistant", content:<FULL raw LLM response text, unmodified>)`. **No envelope
   surgery on write** — the raw text is the source of truth; parsing happens only at read-time (§5.2).
6. Commit; release lock.
7. **Return:** `{ assistantMessage, revisedSuggestion?, revisedReasoning?, suggestedConstraint?, userTurns, capped:false }`
   where the parsed fields come from `parseDiscussResponse(rawText)` (§7).

### 5.2 `GET /api/books/[bookId]/editorial/findings/[findingId]/discuss`
- Auth/ownership as §5.1 step 1.
- Returns `{ replies: FindingReplyView[], userTurns, canDiscuss }`.
- **Storage & retrieval contract (idempotent round-trip):** assistant `content` is the full unmodified LLM
  response. On read, `parseDiscussResponse(content)` derives `revisedSuggestion?/revisedReasoning?/
  suggestedConstraint?` — parsing the same stored text always yields the same fields. `FindingReplyView`
  = `{ role, content, createdAt, revisedSuggestion?, revisedReasoning?, suggestedConstraint? }`.
- **Security:** all `content` is plaintext. The client renders it as text only (§6.1) — never
  `dangerouslySetInnerHTML`.

### 5.3 `PATCH …/findings/[findingId]` — extend apply path (additive)
- Add `overrideText: z.string().max(5000).optional()` to `updateFindingSchema` (`validation.ts:90-94`).
- In the apply branch (`route.ts:129-198`): `const finalNewText = data.overrideText ?? newText;` and use
  `finalNewText` as the replacement everywhere downstream. Matching/versioning logic itself is unchanged.
- **Stale-anchor handling:** if the fuzzy-match on `originalText`/`anchorQuote` fails (drifted since the
  conversation opened), return **409** `{ error:"anchor_drifted", userMessage:"This finding's text has
  changed since you started. Review the chapter and re-apply." }` and **do not** flip status to applied.
  The client keeps the writer's edited `overrideText` in component state so **the edit is never lost**
  (§6.1) — trust-critical per the roadmap's "losing a writer's words once is fatal."

### 5.4 Resolution → learning (dismiss branch)
On `dismiss` where the latest assistant turn carried a `suggestedConstraint`:
- `WriterMemory.upsert({ where:{ userId_findingId_source:{ userId, findingId, source:"conversation" } },
  create:{ userId, bookId: finding.bookId, findingId, source:"conversation",
  category: suggestedConstraint.category, content: suggestedConstraint.content },
  update:{ content: suggestedConstraint.content, category: suggestedConstraint.category, active:true } })`.
  **`bookId` is always `finding.bookId` (server-derived) — never null, never agent-supplied.** This makes
  undo→re-dismiss idempotent (one row per user+finding) and makes cross-book poisoning impossible.
- Post `SuggestionFeedback({ suggestionId:findingId, suggestionType:finding.category, positive:false,
  suggestionText:finding.description })` (reuse existing helper; its `userId_suggestionId` unique already
  makes it idempotent) so the generic 3×-rule analytics still see it.

---

## 6. UI components

### 6.1 `FindingConversation` (new, shared) — `src/components/editorial/finding-conversation.tsx`
- **Props:** `{ bookId, finding, onApply(overrideText?), onDismiss(reason), onClose }`.
- **Own thread renderer (no MessageStream):** renders the role-tagged `replies` as a simple vertical list
  of plaintext bubbles (writer right / agent left). We deliberately **do not** reuse `MessageStream`
  (it requires `AgentStreamMessage.type` and rich session rendering; a 2–6 message plaintext thread doesn't
  fit and coupling to its internals is fragile). All text rendered as plaintext / via a sanitizing markdown
  renderer — **never `dangerouslySetInnerHTML`** (XSS guard).
- Uses `useFindingDiscussion(bookId, findingId)` (TanStack Query): `GET` hydration; `POST` mutation per turn
  with **optimistic append** of the writer message. **On POST error:** roll back the optimistic append AND
  re-hydrate via `GET` (or rely on server idempotency); keep the Send button disabled until state is
  consistent, so the client turn count can never diverge from the server.
- Input: reuse **`ConversationInput`** for the next writer message, `disabled` when `canDiscuss` is false
  (cap hit or finding resolved). Placeholder guides intent: *"Explain your intent or why you disagree…"*.
- **Revision rendering:** when `latestRevision` (§6.5) is present, render **`AIRewriteComparison`**
  (`original` = `alternatives[0].originalText` / `anchorQuote`, `rewrite` = `latestRevision`,
  `rewriteLabel` = finding category). Action bar: `[Use it]`→`onApply(latestRevision)`;
  `[Use it but edit]`→edit mode→`onApply(editedText)`; `[Keep as-is]`→`onDismiss(reason)`.
- **When there is NO current revision** (agent agreed, or plain chat): do **not** render
  `AIRewriteComparison`. Show the agent's message; render a condensed action bar with `[Keep as-is]`
  (→dismiss) and, if `canDiscuss`, `[Ask again]` (continue). Do not show `[Use it]`/`[Use it but edit]`.
- **Cap state:** when `canDiscuss` is false, `ConversationInput` is disabled with inline text
  *"3-exchange cap reached — decide above, or undo to revise."*; the final assistant message stays visible.
- **First-open empty state:** synthesize an opening assistant bubble from the finding —
  *"I flagged: {description} ({rationale}). What are you going for here?"* — using the plaintext renderer.

### 6.2 In-editor mount
- `annotation-tooltip.tsx`: add a **"Let's talk about this"** button after the description (~`:176`),
  before Accept/Reject. Click → `editorial-store.setSelectedFinding(id)` + open the **findings sheet** in a
  "conversation" view hosting `FindingConversation` (the 320px tooltip only routes; it does not host chat).
- `editor-findings-panel.tsx`: in conversation view for the selected finding, render `FindingConversation`;
  `onApply`/`onDismiss` reuse the panel's existing `useApplyFinding`/`useDismissFinding` mutations
  (`overrideText` threaded through as an optional arg).
- **Keying:** `FindingConversation` is keyed by `findingId` so an in-flight `POST` can never land in a
  different thread if the global `selectedFindingId` changes.

### 6.3 Editorial page mount
- `finding-card.tsx`: add a "Discuss" affordance that expands the card in place into `FindingConversation`
  (same component, same handlers).

### 6.4 `AIRewriteComparison` — additive edit affordance + mobile stack
- Add controlled `editable` mode: the rewrite pane becomes a `<textarea>` seeded with `rewrite`; diff hidden
  while editing. Extend `onAccept` to `onAccept(newText, wasEdited)` (no existing callers to break).
- **Mobile (<md):** switch the two-column grid to a single-column stack (original full-width, rewrite below),
  preserving word-diff highlighting; edit mode = full-width textarea. Fixes unreadable side-by-side on the
  phone sheet (roadmap 2.4).

### 6.5 Pure view-state — `src/lib/editorial/finding-conversation.ts`
`computeConversationView({ replies, findingStatus }) → { userTurns, canDiscuss, latestRevision?, latestConstraint?, resolution }`.
Deterministic, no IO, **crash-safe**: it calls the pure `parseDiscussResponse` on stored rows and, on any
malformed/truncated envelope, degrades to `{revisedSuggestion:undefined,…}` with the raw content preserved
as the message — it never throws.
- `userTurns` = count of `role="user"` rows.
- `canDiscuss` = `findingStatus==="pending" && userTurns < 3`.
- `latestRevision` = the `revisedSuggestion` of the **most-recent assistant turn that has one** (ordered by
  `createdAt`), else `undefined`. (So a later plain-agreement turn correctly hides the comparison.)
- `resolution` ∈ **`"pending" | "capped" | "applied" | "dismissed"`**:
  `applied`/`dismissed` when `findingStatus` is that; `capped` when pending & `userTurns>=3`; else `pending`.
  `applied`/`dismissed` render read-only.

---

## 7. The discuss agent (prompt contract + parser)

`buildDiscussPrompt` (pure) produces a compact single-shot prompt:
- **System:** "You are the {agentType} collaborating with the writer on ONE finding you flagged:
  {description} ({rationale}). The writer is explaining intent. Adapt — propose a revised suggestion, or
  agree to keep their text. Be brief and concrete. Never lecture." + `formatWriterMemoryForPrompt(...)`.
- **Context:** finding category/severity, `anchorQuote`, current `alternatives`, prior thread.
- **Output contract:** reply in prose. If proposing a revision, include a block **on its own lines**:
  ```
  <<<REVISION>>>
  suggestion: <the revised replacement text>
  why: <one line>
  <<<END>>>
  ```
  If (and only if) the writer is defending an intentional choice you accept, include:
  ```
  <<<REMEMBER category="preference">>>
  <one concise preference, imperative voice>
  <<<END>>>
  ```
  The agent **does not** specify a book or scope — the server always scopes the memory to this finding's book.

**`parseDiscussResponse(text)` (pure, total) contract:**
- **Line-boundary matching only.** A delimiter (`<<<REVISION>>>`, `<<<REMEMBER category="…">>>`, `<<<END>>>`)
  is recognized **only** when it is the sole content of a line (optional surrounding whitespace). Delimiter
  strings appearing inline in prose are preserved as literal text in `assistantMessage`. (Closes delimiter
  injection.)
- **Total / crash-safe:** missing, unclosed, or malformed blocks → the corresponding field is `undefined`
  and the block text falls back into `assistantMessage`. Never throws.
- **Category coercion + audit:** the parsed `category` is validated against
  **{style, name, preference, constraint, correction}**; anything else is coerced to `"constraint"` and a
  `console.warn("[discuss] coerced invalid memory category:", raw)` is logged. `suggestedConstraint` (when
  present) = `{ category, content }` — **never a bookId** (scope is server-only).
- Returns `{ assistantMessage, revisedSuggestion?, revisedReasoning?, suggestedConstraint? }`.

**Cap behavior:** at 3 user turns the model is not called (§5.1 step 3); the UI shows the "Ready to decide?"
state with the action bar only.

---

## 8. Testing (Vitest, existing harness)

**Pure unit (no IO):**
- `finding-conversation.test.ts`: `userTurns`; `canDiscuss` flips false at 3 and when status≠pending;
  `latestRevision` = newest assistant turn *that has* a revision (later plain turn hides comparison);
  `resolution` enumerates pending/capped/applied/dismissed; **crash-safe** on a corrupted stored row.
- `discuss-prompt.test.ts`: prompt includes writer memory + prior turns; `parseDiscussResponse` handles
  (a) plain reply, (b) reply+REVISION, (c) reply+REVISION+REMEMBER, (d) malformed/unclosed block → safe
  fallback, (e) **inline delimiter in prose** → preserved, no block extracted, (f) **invalid category** →
  coerced to `constraint` + warn.

**Endpoint contract (mocked Prisma + LLM client):**
- POST persists exactly one user + one assistant reply, in order; assistant `content` is the raw model text.
- POST at 3 user turns short-circuits (`capped:true`, **no** model call).
- POST beyond 200 user replies/24h → **429** rate-limited (no model call).
- Two concurrent POSTs at 2 user turns → the `FOR UPDATE` lock serializes them; total user turns never
  exceeds 3 (TOCTOU guard).
- PATCH apply with `overrideText` routes the override into the replacement and versions the doc.
- PATCH apply with a **drifted anchor** → 409 `anchor_drifted`, status stays pending.
- Dismiss with a `suggestedConstraint` writes exactly one `WriterMemory{source:"conversation",
  bookId=finding.bookId}` + one negative `SuggestionFeedback`; **undo→re-dismiss is idempotent** (upsert, no
  duplicate).
- GET returns plaintext `content`; parsed fields reconstruct identically across repeated reads.

**Regression guard:** existing money/data-path tests (autosave CAS, apply→version) stay green; the apply
extension is additive. No component uses `dangerouslySetInnerHTML`.

---

## 9. Rollout / safety

- All changes additive: one non-destructive migration (nullable/defaulted columns + indexes), new endpoints,
  new component, additive `overrideText` field, additive `AIRewriteComparison` edit/mobile modes. No behavior
  change to existing apply/dismiss unless the new fields are used.
- Conversation constraints are **server-scoped to the finding's book**, visible, and undoable; they never
  delete or override user text — only inform future prompts.
- Feature is inert until a writer opens a conversation — zero impact on writers who ignore it.
- Cost bounded three ways: 3-turn soft cap per finding, 200 user-turns/24h per-user rate limit, haiku tier.

---

## 10. Security summary (folded from adversarial review §12)

- **Prompt injection / cross-book poisoning:** the agent never controls scope; the server always writes
  `bookId = finding.bookId`. Category is whitelist-coerced. Worst case a malicious writer can only nudge a
  constraint on **their own** book — which they can already do by dismissing with a reason.
- **Delimiter injection:** line-boundary-only block parsing; inline delimiters are literal prose.
- **XSS:** all reply content is plaintext, rendered without `dangerouslySetInnerHTML`.
- **IDOR:** ownership + `finding.bookId === url bookId` checked on both discuss endpoints.
- **Abuse/cost:** per-user 24h rate limit + per-finding turn cap.

---

## 11. Deferred (explicitly not in this build)
- Full unread-reply toast/pill (badge-only if cheap; onboarding pattern ready to extend later).
- Transcript-mining beyond the single agent-emitted constraint.
- Cross-device sync of read/unread state (localStorage per-browser, by design).
- Streaming the assistant turn (bounded `max_tokens` keeps turns short).

---

## 12. Adversarial review — confirmed defects folded into v2

A 6-lens adversarial review (34 agents, find→verify) surfaced 28 raw findings; **19 CONFIRMED** after
independent verification are all addressed above. Summary by severity:

**Critical (4):** delimiter injection (§7); `overrideText` missing from request schema (§5.3); prompt-injection
cross-book poisoning (§5.4/§7/§10 — solved by server-only scoping); MessageStream `.type` mismatch (§6.1 —
solved by rendering our own plaintext thread).

**High (13):** resolution state machine (§6.5); `computeConversationView` crash-safety (§6.5); idempotency
needs `findingId`+unique (§4.2/§5.4); envelope round-trip = store raw / parse-on-read (§5.1/§5.2); TOCTOU
turn-cap race → `FOR UPDATE` (§5.1); stale-anchor on `overrideText` apply (§5.3); optimistic-append rollback
(§6.1); rate limiting (§5.1); category coercion + audit (§7); no-revision UI path (§6.1); first-open copy
(§6.1); mobile two-column stack (§6.4); soft-cap message + rationale (§1/§5.1/§6.1).

**Medium (2):** `latestRevision` = newest assistant turn with a revision (§6.5); XSS plaintext guard
(§5.2/§6.1/§8).

**Correctly filtered (not folded):** turn-cap rollback dup of the append fix (REFUTED); FindingReply index
already present (REFUTED); `selectedFindingId` swap solved by keying (REFUTED); IDOR already covered by
mirrored guards (REFUTED, but made explicit anyway); `wasEdited`/`editable`/`overrideText`-mutation already in
the v1 plan (ALREADY_HANDLED); fuzzy-match-failure error path (ALREADY_HANDLED via §5.3).
