# Consolidated Implementation Plan — Agent Subsystem Wiring (wmb-pub)

Repo: `D:\Projects\wmb-pub` · All paths absolute below. Verify after each phase with `npx tsc --noEmit`.

---

## 1. VERIFIED FACTS

### Confirmed true (re-checked against the working tree)

- **Dead code confirmed.** No `writer_memory` or `craft_skills` section exists anywhere in `src\lib\agents\prompt-assembler.ts` (grep: zero matches). `formatWriterMemoryForPrompt`, `inferPreferenceFromDismissals`, and every export of `src\lib\agents\skills\{writing-craft,genre-guides,advanced-craft}.ts` have zero call sites in `src/`.
- **Assembler architecture.** `assembleAgentPrompt(definition, contextInput: Readonly<AgentContext>, documentService)` at `prompt-assembler.ts:1396` clones context at 1402, builds `PromptSection { name, content, priority }` (1229-1233). `smartTrim` (1239-1262) drops whole lowest-priority sections first; priority >= 98 never trimmed; output sorted priority DESC (1863), `BASE_INSTRUCTIONS` appended last (1875-1897), joined `"\n\n"` (1899); per-section token logging at 1903-1912. Budgets: `TOKEN_BUDGETS` 60k-150k, default 100k, `estimateTokens = ceil(chars/4)` (1209-1227).
- **Anchors verified by direct read:** book-meta load gate `if (profile.bookMeta && !context.bookDescription)` at 1409; SECTION 5 book_meta block closes at 1525, SECTION 6 comment at 1527; SECTION 8b (calibration/voice) try/catch closes at 1623, SECTION 9 comment at 1625; SECTION 12 knowledge_graph try/catch pattern at 1673-1697; SECTION 15 relevant_memory at 1777-1799 with silent `catch {}`.
- **AgentContext** (`types.ts:97-123`): `userId` and `bookId` required; `chapterBrief?: string` exists at line 107, `targetWorkflowId` 116, `userMessage` 120. Both orchestrator call sites (`orchestrator.ts:132, 243`) pass full context — no caller changes needed for any new section.
- **Feedback route is a 29-line console.log stub** (`src\app\api\books\[id]\feedback\route.ts`) — no zod, no ownership check, no persistence; no `SuggestionFeedback`/feedback model in `prisma\schema.prisma`.
- **getWriterMemories** (`writer-memory.ts:53-69`) — `findMany` with `orderBy: { createdAt: "desc" }`, **no `take` limit** (unbounded section growth risk confirmed).
- **DB workflow is `prisma db push`** (`package.json` → `db:push:prod`), no `prisma/migrations` dir.
- **Tests are Playwright e2e only** (`tests\e2e\*.spec.ts`, `npm run test:e2e`); no vitest/jest. `tests\e2e\vector-memory.spec.ts` already tests `/api/memory/stats` shape incl. `qdrantHealthy` and graceful Qdrant-down behavior; `fixtures.ts` provides `createBookViaApi(request, …)`.
- **Vector pipeline is mechanically intact but practically inert** for three independent reasons: (1) `initVectorCollections()` is never called → `wmb_memory` collection never created on fresh deploys, all upserts/searches fail silently; (2) SECTION 15 queries with static `definition.description` at a 0.75 cosine threshold → ~always empty; (3) passing `chapterNumber` to `getRelevantMemory` hard-filters results to **only the current chapter's chunks** — the one thing already fully in the prompt at priority 100.

### Corrections to earlier survey claims (resolved conflicts between readers)

| Wrong / conflicting claim | Correction |
|---|---|
| "The memory→prompt pipe is broken" | The pipe is wired; it is **conditionally empty** (query/threshold/filter/missing-collection), not disconnected. Fix retrieval, not plumbing. |
| Spec 1 keeps `chapterNumber` in the `getRelevantMemory` call | **Drop it.** Spec 4 is right: the filter is a `must` match restricting to the current chapter only — counterproductive. Search book-wide and *exclude* current-chapter chunks instead. |
| Spec 1 widens genre load with `\|\| !context.bookGenre` | Rejected — that fires a `db.book.findUnique` for **every** agent on every assembly, including agents that never use genre. Use the targeted `GENRE_SKILL_AGENTS` set (Spec 2). |
| Spec 1 injects the full genre guide for any agent with `bookGenre` | Rejected — Spec 2's redundancy analysis stands: ghostwriter's BASE_INSTRUCTIONS already embed the AI-tell list; prose agents need only the proseStyle/pitfalls slice (~1.1k chars), not the full 3.3k guide. |
| writer_memory priority: 95 (Spec 1) vs 90 (Spec 3) | **Use 90.** Above book_meta(85)/story_bible(80) so writer directives outrank reference docs, below the 98 never-trim band, and not colliding with any existing value. |
| `SENSITIVITY_GUIDELINES` is safe to inject as-is | It instructs filing findings with category `"sensitivity"`, which is **not** in any allowed CreateFinding category list (`tools.ts:~322`) — must be fixed before injection. |
| Dismissals feed `<finding_history>` | Pre-existing bug: PATCH dismiss sets `status="dismissed"` but never `rejectedAt`; `loadFindingHistory` (1354-1388) derives status from `appliedAt/rejectedAt`, so dismissed findings render as `[pending]`. |

---

## 2. CHANGE PLAN (ordered, dependency-safe)

### Phase A — Vector memory reliability (do first; A1 is a blocker for everything vector)

**A1. Lazy collection bootstrap.** `src\lib\vector\qdrant-client.ts` — below `initVectorCollections()` add a memoized initializer (same globalThis-singleton/graceful-degradation pattern used throughout `src\lib\vector`):

```ts
let ensurePromise: Promise<boolean> | null = null;
let lastFailureAt = 0;
const FAILURE_RETRY_MS = 60_000;
export async function ensureMemoryCollection(): Promise<boolean> {
  if (ensurePromise) return ensurePromise;
  if (Date.now() - lastFailureAt < FAILURE_RETRY_MS) return false;
  ensurePromise = initVectorCollections()
    .then(() => true)
    .catch((err) => {
      console.error("[qdrant] ensureMemoryCollection failed:", err instanceof Error ? err.message : err);
      lastFailureAt = Date.now();
      ensurePromise = null;
      return false;
    });
  return ensurePromise;
}
```
**Guard first:** `initVectorCollections()` deletes legacy collections (`manuscript_chunks`, `session_summaries`, `style_patterns`) as a migration step. Before wiring this in, confirm no deployment still reads those; if uncertain, split collection-creation out of the legacy-deletion code and have `ensureMemoryCollection` call only the creation path.

**A2. Call it in both hot paths.**
- `src\lib\vector\indexer.ts` — top of `indexDocument`, after the `isEmbeddingAvailable()` check (~line 44): `if (!(await ensureMemoryCollection())) return { chunksIndexed: 0, skipped: true };` (match the function's existing return shape).
- `src\lib\vector\retriever.ts` — in `searchMemory`, after the availability guard (~line 45): `if (!(await ensureMemoryCollection())) return [];`

**A3. Realistic threshold + redundancy filter.** `src\lib\vector\memory-manager.ts` `getRelevantMemory` (170-188):
- Pass `scoreThreshold: 0.35` explicitly (`searchMemory` already accepts it — no signature change).
- Stop forwarding `chapterNumber` as a filter; instead accept `{ limit, excludeChapterNumber? }` and post-filter: `results.filter(r => !(r.payload.docType === "chapter" && r.payload.chapterNumber === excludeChapterNumber))`. Prefer docTypes `conversation`, `finding`, `research`, other-chapter `chapter` chunks.
- Add `console.warn` inside the existing `.catch(() => [])` so failures are diagnosable (keep returning `[]`).
- Leave the SearchMemory **tool** default at 0.75 unless product wants recall there too (separate decision).

**A4. Rewrite SECTION 15.** `src\lib\agents\prompt-assembler.ts:1777-1799` — keep gate (`fingerprint==="full" || storyBible==="full" || architecture==="full"`) and priority 20 unchanged; replace body:

```ts
  try {
    const queryParts: string[] = [];
    if (context.userMessage) queryParts.push(context.userMessage.slice(0, 500));
    if (context.chapterBrief) queryParts.push(context.chapterBrief.slice(0, 1000)); // only if already populated — do NOT add a doc load here
    if (context.targetWorkflowId) queryParts.push(`Workflow: ${context.targetWorkflowId}`);
    if (context.bookName) queryParts.push(`Book: ${context.bookName}`);
    if (context.chapterNumber) queryParts.push(`Chapter ${context.chapterNumber}`);
    if (queryParts.length === 0 && context.bookDescription) queryParts.push(context.bookDescription);
    if (queryParts.length === 0) queryParts.push(definition.description); // last resort only
    const memoryQuery = queryParts.join("\n").slice(0, 2000);

    const memoryContext = await Promise.race([
      getRelevantMemory(context.bookId, memoryQuery, {
        limit: 5,
        excludeChapterNumber: context.chapterNumber,
      }),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), 3000)),
    ]);
    if (memoryContext) {
      sections.push({
        name: "relevant_memory",
        priority: 20,
        content: `\n<relevant_memory>\nIMPORTANT: When using information from memory, cite the source (e.g., "Based on chapter 3 where...").\n\n${memoryContext}\n</relevant_memory>`,
      });
    }
  } catch (error) {
    console.warn(`[Prompt Assembly] relevant_memory skipped for ${definition.type}:`, error instanceof Error ? error.message : error);
  }
```
Note: `definition.description` is demoted to last-resort fallback (Spec 4's ordering), not always-first (Spec 1).

### Phase B — Writer memory injection

**B1. Cap memory volume.** `src\lib\agents\writer-memory.ts` `getWriterMemories` (53-69): add `take: 100` (orderBy is already `createdAt: "desc"`, so this keeps the newest 100).

**B2. New SECTION 5b.** `prompt-assembler.ts`:
- Import after line 5: `import { formatWriterMemoryForPrompt } from "./writer-memory";`
- Insert immediately after SECTION 5's closing `}` (line 1525), before the SECTION 6 comment (1527), copying the SECTION 12 try/catch+push convention:

```ts
  // ─── SECTION 5b: Writer Memory (priority 90) ──────────────────
  try {
    const writerMemory = await formatWriterMemoryForPrompt(context.userId, context.bookId);
    if (writerMemory) {
      sections.push({ name: "writer_memory", priority: 90, content: `\n${writerMemory}` });
    }
  } catch {
    // Writer memory unavailable — proceed without
  }
```
`formatWriterMemoryForPrompt` returns a complete `<writer_memory>…</writer_memory>` block or `""` — **do not re-wrap**. No agent gating (module doc: "goes into every agent's system prompt"). Priority 90: outranks book_meta(85)/story_bible(80), stays trimmable (<98).
- Optional polish: add `- <writer_memory> — the writer's standing preferences and corrections` to the "CONTEXT YOU HAVE BEEN GIVEN" lists in dev-editor/line-editor BASE_INSTRUCTIONS (~256-264, ~359-364).

### Phase C — Craft skills with genre matching

**C1. Fix the category bug first.** `src\lib\agents\skills\writing-craft.ts` (~line 167): change `SENSITIVITY_GUIDELINES` instruction from `category "sensitivity"` to an allowed CreateFinding category (one-line fix; alternative — extending the enum in `tools.ts:~322` + beta-reader category lists — is more invasive, skip).

**C2. New selector file** `src\lib\agents\skills\index.ts` — see §3 NEW FILES.

**C3. Wire into assembler.** `prompt-assembler.ts`:
- Import: `import { selectSkillsForAgent } from "./skills";`
- Module scope (next to `TOKEN_BUDGETS`): `const GENRE_SKILL_AGENTS = new Set(["dev-editor", "beta-reader", "story-architect", "ghostwriter", "line-editor"]);`
- Widen line 1409 to: `if ((profile.bookMeta || GENRE_SKILL_AGENTS.has(definition.type)) && !context.bookDescription) {` — safe: the book_meta section push at 1510 stays gated on `profile.bookMeta`, so line-editor/story-architect get `context.bookGenre` without the metadata section.
- Insert SECTION 8c after line 1623 (`}` closing SECTION 8b's try/catch), before SECTION 9 comment at 1625:

```ts
  // ─── SECTION 8c: Craft Skills (priority 25) ───────────────────
  {
    const craftSkills = selectSkillsForAgent(definition.type, context.bookGenre ?? null);
    if (craftSkills) {
      sections.push({
        name: "craft_skills",
        priority: 25,
        content: `\n<craft_skills>\nReference craft knowledge for your role. Book-specific context above always takes precedence over these general guidelines.\n${craftSkills}\n</craft_skills>`,
      });
    }
  }
```
Tag is `<craft_skills>` to match section name (file convention: snake_case tag == section name). Priority 25 slots between adjacent_chapters(30) and relevant_memory(20): generic instruction is sacrificed before book-specific documents. Do **not** use `getAllCraftSkills()`/`getAdvancedCraftSkills()` (dump-everything + BASE_INSTRUCTIONS duplication).

### Phase D — Feedback loop closure

**D1. Schema.** `prisma\schema.prisma` — add (DismissedPattern conventions: uuid id, `@map` snake_case, `@@map`, Cascade):

```prisma
model SuggestionFeedback {
  id             String   @id @default(uuid())
  bookId         String   @map("book_id")
  userId         String   @map("user_id")
  suggestionId   String   @map("suggestion_id")   // EditFinding.id in current usage
  suggestionType String   @map("suggestion_type") // finding category
  positive       Boolean
  suggestionText String?  @map("suggestion_text") @db.Text
  createdAt      DateTime @default(now()) @map("created_at")
  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)
  @@unique([userId, suggestionId])
  @@index([bookId, suggestionType, positive])
  @@map("suggestion_feedback")
}
```
Add `suggestionFeedback SuggestionFeedback[]` to Book's relation list (~149-170, next to `writerMemories`). Then `npx prisma generate` and `npx prisma db push` (this repo uses db push, **not** migrate).

**D2. New inference function.** `src\lib\agents\writer-memory.ts` — add `inferPreferenceFromNegativeFeedback(userId, bookId, suggestionType)` mirroring `inferPreferenceFromDismissals` (135-172): count `db.suggestionFeedback` where `{ bookId, suggestionType, positive: false }`; at **>= 3** (active signal, lower than the passive-dismissal threshold of 5), dedup via `db.writerMemory.findFirst({ userId, bookId, category: "learned", content: { contains: suggestionType }, source: "system" })`, then `addWriterMemory(userId, "learned", \`Writer rated "${suggestionType}" suggestions unhelpful multiple times. Adjust approach for this category.\`, { bookId, source: "system" })`. The wording **must contain the raw category string verbatim** (both inference functions' dedup relies on `contains`).

**D3. Rewrite feedback route.** `src\app\api\books\[id]\feedback\route.ts`:
1. zod (inline-schema style of `src\app\api\memory\route.ts`): `z.object({ suggestionId: z.string().min(1).max(100), suggestionType: z.string().min(1).max(100), positive: z.boolean(), suggestionText: z.string().max(500).optional() })` — matches the client contract in `suggestion-feedback.tsx:49-54`.
2. Ownership guard (copy findings-PATCH pattern): `db.book.findFirst({ where: { id: bookId, userId: user.id } })`, 404 if null.
3. `db.suggestionFeedback.upsert({ where: { userId_suggestionId: { userId: user.id, suggestionId: data.suggestionId } }, create: { bookId, userId: user.id, ...data }, update: { positive: data.positive } })` — direction toggles update, never duplicate.
4. If `!data.positive`, call `inferPreferenceFromNegativeFeedback` in try/catch (inference failure must never fail the POST).
5. Error shape mirroring `/api/memory/route.ts` incl. ZodError→400; keep `export const dynamic = "force-dynamic";`.

**D4. Dismissal hook + history fix.** `src\app\api\books\[id]\editorial\findings\[findingId]\route.ts`, PATCH non-auto-apply branch (199-223):
- Add `rejectedAt: new Date()` to the dismiss `updateData` (~203) — fixes dismissed findings rendering as `[pending]` in `<finding_history>`.
- After `db.editFinding.update` (205) and `db.editAction.create` (210), only when `data.action === "dismiss"`:

```ts
if (data.action === "dismiss") {
  try {
    await inferPreferenceFromDismissals(user.id, bookId, finding.category, finding.description);
  } catch (e) { console.error("[Feedback] dismissal inference failed:", e); }
}
```
Import from `@/lib/agents/writer-memory`. Place **after** the update so the dismissed-count includes this finding. The auto-apply branch never dismisses — no hook there.

### Deferred (explicitly out of scope, documented decisions)

- **BYOK embeddings** (threading `embeddingApiKey` through AgentContext/ToolContext/embeddings.ts): defer — graceful no-op means installs without server `OPENAI_API_KEY` just have memory off. Instead: document in `DEPLOYMENT.md` and surface `embeddingsConfigured` in `/api/memory/stats` (one-field addition; `qdrantHealthy` already exists there).
- **Explicit `memory: boolean` on AgentContextProfile**: nice-to-have decoupling; keep current indirect gate to avoid touching all 14 definitions in this pass.
- **`src\instrumentation.ts` register()**: optional; the lazy `ensureMemoryCollection` path must exist regardless.

---

## 3. NEW FILES

**`D:\Projects\wmb-pub\src\lib\agents\skills\index.ts`** (only new source file):

```ts
import { NARRATIVE_TECHNIQUES, AI_TELL_DETECTION, PUBLISHING_STANDARDS, SENSITIVITY_GUIDELINES } from "./writing-craft";
import { getSkillsForAgent } from "./advanced-craft";
import { getGenreGuide, formatGenreGuideForPrompt, type GenreGuide } from "./genre-guides";

/** writing-craft extras layered on top of the advanced-craft per-agent mapping */
const CRAFT_EXTRAS: Record<string, string[]> = {
  "writing-coach": [NARRATIVE_TECHNIQUES],
  "line-editor": [AI_TELL_DETECTION],          // Tier 2/3 + Voice Preservation; NOT ghostwriter (BASE_INSTRUCTIONS already embed the tell list)
  "beta-reader": [SENSITIVITY_GUIDELINES],     // requires C1 category fix first
  "world-researcher": [SENSITIVITY_GUIDELINES],
  "market-reader": [PUBLISHING_STANDARDS],
  "publishing-editor": [PUBLISHING_STANDARDS],
};

const FULL_GENRE_AGENTS = new Set(["dev-editor", "beta-reader", "story-architect"]); // full 7-section guide (~3.1-3.6k chars)
const PROSE_GENRE_AGENTS = new Set(["ghostwriter", "line-editor"]);                  // proseStyle+pitfalls slice (~1.1k chars)

function formatGenreProseStyle(guide: GenreGuide): string {
  return `<genre_guide genre="${guide.genre}">\n## Prose Style for This Genre\n${guide.proseStyle}\n\n## Common Pitfalls to Avoid\n${guide.commonPitfalls}\n</genre_guide>`;
}

export function selectSkillsForAgent(agentType: string, genre?: string | null): string {
  const parts: string[] = [...getSkillsForAgent(agentType), ...(CRAFT_EXTRAS[agentType] ?? [])];
  const guide = getGenreGuide(genre);
  if (guide) {
    if (FULL_GENRE_AGENTS.has(agentType)) parts.push(formatGenreGuideForPrompt(guide));
    else if (PROSE_GENRE_AGENTS.has(agentType)) parts.push(formatGenreProseStyle(guide));
  }
  return parts.join("\n\n");
}
```

Resulting payloads stay 0-8.7k chars (~0.8-2.2k tokens) per agent vs 60-150k budgets; style-analyst/manuscript-analyst get nothing (correct — `getSkillsForAgent` returns `[]`).

No other new source files. Schema model (D1) and the e2e specs (§5) are additions to existing files/dirs.

---

## 4. RISKS & GUARDS

| Risk | Guard |
|---|---|
| `initVectorCollections()` deletes legacy Qdrant collections; lazy auto-invoke is destructive on deployments still carrying old data | Confirm legacy collections unused before A1; if uncertain, have `ensureMemoryCollection` call only the creation path |
| Token budget pressure: 3 new/changed sections at priorities 90/25/20 | writer_memory capped via `take: 100` (B1) and kept <98 so smartTrim can drop it; craft_skills at 25 trims before all book documents; verify cost via existing `[Prompt Assembly]` per-section logging (1903-1912) |
| Never-trim band (>=98 + chapter_content 100) can already exceed budget; nothing new may enter it | No new section gets priority >= 98 — enforced by this plan (90 max) |
| Qdrant down / `OPENAI_API_KEY` absent | All paths remain graceful no-ops: `isEmbeddingAvailable()` guards, `ensureMemoryCollection` failure-cache (60s backoff), 3s `Promise.race` timeout in SECTION 15, `console.warn` instead of silent catch. Embeddings use the **server** key only — BYOK users silently lose memory (deferred; document + surface in `/api/memory/stats`) |
| Retrieval behavior shift: new query composition + 0.35 threshold changes results for all existing books; lower threshold surfaces marginal chunks | Keep `limit: 5`; redundancy post-filter (A3) excludes current-chapter chunks; `userMessage` is often undefined for workflow-launched sessions → query degrades to brief/workflow/book/chapter, still task-grounded |
| Per-turn latency: SECTION 15 + writer_memory + (widened) genre load each add a query per `continueConversation` turn | Embedding+search ~100-400ms bounded by 3s timeout; genre load gated to a 5-agent set, not all agents; acceptable — cache per (bookId, queryHash) only if measured to matter |
| Feedback gaming / cross-tenant writes | `@@unique([userId, suggestionId])` + upsert (toggles update, no row inflation); book-ownership `findFirst` guard; zod length caps on free-string `suggestionType`. Rate limiting on the endpoint is still absent — flag as follow-up per global security rules |
| Learned-memory dedup is `content contains category`, case-sensitive; the two inference functions share it and users can edit learned entries via PATCH `/api/memory/[id]` | Both inference messages embed the raw category verbatim (D2); collision (one learned note per category) is accepted by design — note in code comment |
| Prompt injection via WriterMemory content (user-typed, interpolated raw into every system prompt) | Same exposure class as documents; mitigated by `take: 100` cap; full sanitization is a separate workstream — flag, don't block |
| `"sensitivity"` finding category produces rejected tool calls | C1 fixes the skill text **before** C2 maps it to beta-reader/world-researcher |
| Genre fuzzy match misfires on free-text genres (e.g. "fiction" → romance via alias substring); only 5 genres covered | Accepted for now; `getGenreGuide` returns null for uncovered genres (graceful). Follow-up: exact-match-first in `getGenreGuide` |
| Backward compat | No section removed, no priority of an existing section changed, no caller signature changed, schema change is purely additive; `relevant_memory` keeps name/priority/gate so trim behavior and output position for existing sections are unchanged |
| Mutation hazards | Read from `context` (the clone), never `contextInput`; `prompt-assembler.ts` is already 1,916 lines — keep in-file additions to ~40 lines, selection logic lives in `skills/index.ts` |

---

## 5. TEST PLAN

The repo has **Playwright e2e only** (`npm run test:e2e`, `tests\e2e\*.spec.ts`, shared `fixtures.ts` with `createBookViaApi`); no unit framework. Plan accordingly:

**Per-phase static gate:** `npx tsc --noEmit` after each phase; `npm run lint` before commit.

**Phase A (vector):**
- Existing `tests\e2e\vector-memory.spec.ts` must still pass both with Qdrant up and down (it already asserts graceful degradation and `qdrantHealthy`).
- Fresh-volume check (manual or script): wipe/point at empty Qdrant, run a write-chapter then dev-edit session, confirm collection auto-created and console shows `[Prompt Assembly]` breakdown listing `relevant_memory` with nonzero tokens; with Qdrant stopped, sessions still run and the `relevant_memory skipped` warn appears.
- Add a `tsx` verification script `scripts\verify-memory-retrieval.ts` (repo already uses `tsx scripts/*` pattern): call `getRelevantMemory` against a seeded book and assert (a) non-empty at threshold 0.35, (b) no current-chapter `chapter`-docType chunks in results.

**Phase B (writer memory):**
- New e2e `tests\e2e\writer-memory.spec.ts` (serial mode, fixtures pattern): POST `/api/memory` with a distinctive preference string → trigger an agent session (or call a prompt-assembly-exercising endpoint) → assert behavior; minimally, API-level: GET `/api/memory` round-trip, then verify via a `tsx` script that `assembleAgentPrompt` output contains `<writer_memory>` and the preference text for a book-scoped and a global (bookId null) memory, and that an empty-memory user yields no section.
- Unit-ish check in the same script: 150 seeded memories → section reflects only the 100 newest (`take` cap).

**Phase C (craft skills):** `tsx` script asserting on `assembleAgentPrompt` output:
- ghostwriter + genre "fantasy" → contains `<craft_skills>`, the prose-slice `<genre_guide genre="fantasy">`, and **not** `AI_TELL_DETECTION` text;
- line-editor → contains AI_TELL_DETECTION Tier 2/3 markers; dev-editor → full genre guide;
- style-analyst / manuscript-analyst → no `<craft_skills>` section;
- unknown genre ("memoir") → skills present, no genre_guide;
- grep skill texts for `category "sensitivity"` → zero matches (C1 verified).

**Phase D (feedback loop):** new e2e `tests\e2e\feedback.spec.ts` following `vector-memory.spec.ts`'s API style:
- POST `/api/books/{id}/feedback` valid body → `{ ok: true }`; invalid body → 400; other user's bookId → 404 (ownership guard).
- Same user+suggestionId posted up then down → exactly one `suggestion_feedback` row with `positive=false` (assert via repeat-POST idempotency or a stats endpoint if added).
- 3 negative feedbacks on the same `suggestionType` (3 distinct suggestionIds) → GET `/api/memory` contains a `category: "learned"`, `source: "system"` entry mentioning the category; a 4th negative does not create a duplicate (dedup).
- Findings: dismiss a finding 5 times across findings of one category via PATCH → learned memory appears; verify dismissed finding now carries `rejectedAt` and renders as dismissed (not `[pending]`) in `<finding_history>` (assert via the `tsx` prompt-assembly script).
- Run the full existing suite (`npm run test:e2e`) — especially `editorial.spec.ts` (dismiss-flow regression from the `rejectedAt` change) and `vector-memory.spec.ts`.

**End-to-end loop verification (manual, once):** thumbs-down a finding 3x → confirm learned WriterMemory row → start any agent session → confirm `[Prompt Assembly]` log lists `writer_memory`, `craft_skills`, and `relevant_memory` with token counts.