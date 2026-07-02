# Conversational Findings (Tier 4.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn each editorial finding from an apply/dismiss binary into a short in-place dialogue where the writer explains intent, the agent adapts its suggestion, and the conversation feeds the writer-memory learning loop.

**Architecture:** A new lightweight `POST/GET …/findings/[findingId]/discuss` endpoint runs a single cheap (haiku) agent turn per message — no orchestrator, no session. The thread persists as role-tagged `FindingReply` rows (raw model text, parsed on read). A shared `FindingConversation` client component renders its own plaintext thread + reuses `ConversationInput` and the now-exposed `AIRewriteComparison` for in-place revisions. On keep-as-is, the agent's emitted constraint is written to `WriterMemory` server-scoped to the finding's book.

**Tech Stack:** Next.js App Router (route handlers), Prisma (`db push`, not migrate), Zustand, TanStack Query, Sonner, Vitest (node env), Tailwind.

## Global Constraints

- **Migrations use `npx prisma generate && npx prisma db push`** — this repo has **no `prisma/migrations/` dir**; never run `migrate dev`.
- **Auth:** every route handler calls `const user = await requireUser()` from `@/lib/auth`; ownership via `db.book.findFirst({ where: { id: bookId, userId: user.id } })`.
- **DB import:** `import { db } from "@/lib/db"` (Prisma client generated to `@/generated/prisma/client`).
- **Route param folder is `[id]` (not `[bookId]`)** — the book id param is named `id`. New route lives at `src/app/api/books/[id]/editorial/findings/[findingId]/discuss/route.ts`.
- **Soft turn cap = 3 user turns** per finding; enforced atomically server-side.
- **Per-user rate limit = 200 `role="user"` replies / 24h** → 429.
- **Model:** haiku registry id `"anthropic/haiku"` (`claude-haiku-4-5-20251001`), role `"coach"`, `max_tokens ≤ 700`, no tools.
- **Constraint scope:** `WriterMemory.bookId` is ALWAYS `finding.bookId` (server-derived); the agent never supplies scope. Category coerced to `{style,name,preference,constraint,correction}` (default `constraint`).
- **Security:** all reply content is plaintext; never `dangerouslySetInnerHTML`. Block-delimiter parsing is line-boundary-only.
- **Vitest:** `import { describe, it, expect } from "vitest"`; tests in `tests/unit/**/*.test.ts`; `environment: "node"` (no DOM — component tasks are verified by `tsc`/build/e2e, not Vitest).
- **Never touch the autosave editor core**; the apply path is extended additively.
- Spec: `docs/superpowers/specs/2026-07-02-conversational-findings-design.md`. Baseline commit `31e9fe7`.

---

## File map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | `FindingReply.role`+index; `WriterMemory.findingId`+relation+unique; `EditFinding` back-relation |
| `src/lib/editorial/discuss-prompt.ts` | Create | Pure `buildDiscussPrompt` + `parseDiscussResponse` |
| `src/lib/editorial/finding-conversation.ts` | Create | Pure `computeConversationView` (crash-safe) |
| `src/lib/agents/writer-memory.ts` | Modify | Add `upsertConversationConstraint` helper |
| `src/lib/validation.ts` | Modify | Add `overrideText` to `updateFindingSchema` |
| `src/app/api/books/[id]/editorial/findings/[findingId]/route.ts` | Modify | `overrideText` apply + dismiss→constraint resolution |
| `src/app/api/books/[id]/editorial/findings/[findingId]/discuss/route.ts` | Create | GET (hydrate) + POST (one turn, atomic cap, rate limit) |
| `src/hooks/use-finding-discussion.ts` | Create | TanStack Query GET + POST (optimistic + rollback) |
| `src/components/editor/ai-rewrite-comparison.tsx` | Modify | Editable mode + mobile stack + `onAccept(newText, wasEdited)` |
| `src/components/editorial/finding-conversation.tsx` | Create | Shared thread UI (own plaintext render + input + comparison) |
| `src/stores/editorial-store.ts` | Modify | `conversationFindingId` + setter |
| `src/components/editor/annotation-tooltip.tsx` | Modify | "Let's talk about this" → `onDiscuss` prop |
| `src/components/editor/manuscript-editor.tsx` | Modify | Wire tooltip `onDiscuss` → open sheet in conversation mode |
| `src/components/editor/editor-findings-panel.tsx` | Modify | Render `FindingConversation` when in conversation mode |
| `src/components/editorial/finding-card.tsx` | Modify | "Discuss" → expand into `FindingConversation` |
| `tests/unit/discuss-prompt.test.ts` | Create | Prompt + parser tests (a–f) |
| `tests/unit/finding-conversation.test.ts` | Create | View-state + crash-safety tests |
| `tests/unit/finding-discuss-route.test.ts` | Create | Handler contract tests (mocked db + llm) |
| `vitest.config.ts` | Modify | Add new modules to coverage include |

---

## Task 1: Additive schema migration

**Files:**
- Modify: `prisma/schema.prisma` (FindingReply `396-406`, WriterMemory `617-633`, EditFinding relations `389-390`)

**Interfaces:**
- Produces: `FindingReply.role: string` (default `"user"`); `WriterMemory.findingId: string | null` with `@@unique([userId, findingId, source])`; `EditFinding.conversationMemories: WriterMemory[]`.

- [ ] **Step 1: Edit `FindingReply`** — replace the model block with:

```prisma
model FindingReply {
  id        String   @id @default(uuid())
  findingId String   @map("finding_id")
  userId    String   @map("user_id")
  role      String   @default("user") // "user" | "assistant"
  content   String   @db.Text
  createdAt DateTime @default(now()) @map("created_at")

  finding EditFinding @relation(fields: [findingId], references: [id], onDelete: Cascade)

  @@index([findingId, createdAt])
  @@map("finding_replies")
}
```

- [ ] **Step 2: Edit `WriterMemory`** — add `findingId`, the relation, and the unique key:

```prisma
model WriterMemory {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  bookId    String?  @map("book_id") // null = global preference, set = book-specific
  findingId String?  @map("finding_id") // set only for source="conversation"
  category  String   // style, name, preference, constraint, correction
  content   String   @db.Text // The actual preference text
  source    String   @default("user") // user, agent, system, conversation
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user    User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  book    Book?        @relation(fields: [bookId], references: [id], onDelete: SetNull)
  finding EditFinding? @relation(fields: [findingId], references: [id], onDelete: SetNull)

  @@index([userId, bookId, active])
  @@unique([userId, findingId, source])
  @@map("writer_memories")
}
```

- [ ] **Step 3: Add the back-relation to `EditFinding`** — inside `model EditFinding { … }`, next to the existing `replies FindingReply[]` line (schema.prisma:390), add:

```prisma
  conversationMemories WriterMemory[]
```

- [ ] **Step 4: Validate + push + regenerate the client**

Run: `npx prisma validate && npx prisma generate && npx prisma db push`
Expected: `The schema is valid`, then `Your database is now in sync with your Prisma schema`, and the client regenerates (so `db.findingReply.role` and `db.writerMemory.findingId` become typed).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: schema for conversational findings — FindingReply.role, WriterMemory.findingId (Tier 4.2)"
```

---

## Task 2: Pure discuss prompt + parser (`discuss-prompt.ts`)

**Files:**
- Create: `src/lib/editorial/discuss-prompt.ts`
- Test: `tests/unit/discuss-prompt.test.ts`

**Interfaces:**
- Produces:
  - `buildDiscussPrompt(input: DiscussPromptInput): { system: string; user: string }`
  - `parseDiscussResponse(text: string): ParsedDiscussTurn`
  - types `DiscussPromptInput`, `ParsedDiscussTurn`, `ThreadTurn`, `MEMORY_CATEGORIES`.
- Consumes (Task 6/5): both functions.

- [ ] **Step 1: Write the failing test** — `tests/unit/discuss-prompt.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildDiscussPrompt, parseDiscussResponse } from "@/lib/editorial/discuss-prompt";

const finding = {
  category: "dialogue",
  severity: "important",
  description: "Milan's line reads as evasive/unclear.",
  rationale: "Readers may miss the stakes.",
  anchorQuote: "\"Maybe,\" Milan said.",
  alternatives: [{ label: "Clarify", originalText: "\"Maybe,\" Milan said.", newText: "\"I won't say,\" Milan said." }],
};

describe("buildDiscussPrompt", () => {
  it("embeds finding, prior turns, and writer memory into the prompt", () => {
    const { system, user } = buildDiscussPrompt({
      finding,
      priorTurns: [{ role: "user", content: "He's evasive on purpose." }],
      writerMessage: "Keep it ambiguous.",
      writerMemoryBlock: "<writer_memory>prefers terse dialogue</writer_memory>",
    });
    expect(system).toContain("dialogue");
    expect(system).toContain("prefers terse dialogue");
    expect(user).toContain("Keep it ambiguous.");
    expect(user).toContain("He's evasive on purpose.");
  });
});

describe("parseDiscussResponse", () => {
  it("(a) plain reply → whole text is assistantMessage, no blocks", () => {
    const r = parseDiscussResponse("You're right, keep it.");
    expect(r.assistantMessage).toBe("You're right, keep it.");
    expect(r.revisedSuggestion).toBeUndefined();
    expect(r.suggestedConstraint).toBeUndefined();
  });

  it("(b) reply + REVISION block", () => {
    const r = parseDiscussResponse(
      ["Try this instead.", "<<<REVISION>>>", "suggestion: \"I won't say,\" Milan said.", "why: keeps intent, adds clarity", "<<<END>>>"].join("\n")
    );
    expect(r.assistantMessage).toBe("Try this instead.");
    expect(r.revisedSuggestion).toBe("\"I won't say,\" Milan said.");
    expect(r.revisedReasoning).toBe("keeps intent, adds clarity");
  });

  it("(c) reply + REVISION + REMEMBER", () => {
    const r = parseDiscussResponse(
      ["Understood.", "<<<REMEMBER category=\"preference\">>>", "Keep Milan's dialogue terse and evasive.", "<<<END>>>"].join("\n")
    );
    expect(r.suggestedConstraint).toEqual({ category: "preference", content: "Keep Milan's dialogue terse and evasive." });
  });

  it("(d) malformed/unclosed block → safe fallback, fields undefined, text preserved", () => {
    const raw = "Here is a thought.\n<<<REVISION>>>\nsuggestion: partial";
    const r = parseDiscussResponse(raw);
    expect(r.revisedSuggestion).toBeUndefined();
    expect(r.assistantMessage).toContain("Here is a thought.");
  });

  it("(e) inline delimiter in prose is preserved, not parsed as a block", () => {
    const r = parseDiscussResponse("I could add a <<<REVISION>>> marker but won't.");
    expect(r.assistantMessage).toBe("I could add a <<<REVISION>>> marker but won't.");
    expect(r.revisedSuggestion).toBeUndefined();
  });

  it("(f) invalid category coerces to constraint", () => {
    const r = parseDiscussResponse(
      ["ok", "<<<REMEMBER category=\"executable_code\">>>", "no dialogue tags", "<<<END>>>"].join("\n")
    );
    expect(r.suggestedConstraint?.category).toBe("constraint");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/discuss-prompt.test.ts`
Expected: FAIL — `Cannot find module '@/lib/editorial/discuss-prompt'`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/editorial/discuss-prompt.ts`:

```typescript
export const MEMORY_CATEGORIES = ["style", "name", "preference", "constraint", "correction"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DiscussFinding {
  category: string;
  severity: string;
  description: string;
  rationale?: string | null;
  anchorQuote?: string | null;
  alternatives?: Array<{ label?: string; originalText?: string; newText?: string }>;
}

export interface DiscussPromptInput {
  finding: DiscussFinding;
  priorTurns: ThreadTurn[];
  writerMessage: string;
  writerMemoryBlock: string; // output of formatWriterMemoryForPrompt (may be "")
  agentType?: string;
}

export interface ParsedDiscussTurn {
  assistantMessage: string;
  revisedSuggestion?: string;
  revisedReasoning?: string;
  suggestedConstraint?: { category: MemoryCategory; content: string };
}

export function buildDiscussPrompt(input: DiscussPromptInput): { system: string; user: string } {
  const { finding, priorTurns, writerMessage, writerMemoryBlock, agentType } = input;
  const current = finding.alternatives?.[0]?.newText ?? "";
  const system =
    `You are the ${agentType ?? "editor"} collaborating with the writer on ONE finding you flagged:\n` +
    `"${finding.description}"${finding.rationale ? ` (why it matters: ${finding.rationale})` : ""}.\n` +
    `Category: ${finding.category}. Severity: ${finding.severity}.\n` +
    `The writer is explaining their intent. Adapt: propose a revised suggestion, or agree to keep their text. ` +
    `Be brief and concrete. Never lecture.\n\n` +
    `If you propose a revision, append a block on its own lines:\n` +
    `<<<REVISION>>>\nsuggestion: <the revised replacement text>\nwhy: <one line>\n<<<END>>>\n\n` +
    `If (and only if) the writer defends an intentional choice you accept, append:\n` +
    `<<<REMEMBER category="preference">>>\n<one concise preference, imperative voice>\n<<<END>>>\n` +
    `Use a category from: ${MEMORY_CATEGORIES.join(", ")}. Do NOT specify a book or scope.\n` +
    writerMemoryBlock;

  const anchor = finding.anchorQuote ? `\nAnchor text: ${finding.anchorQuote}` : "";
  const currentSuggestion = current ? `\nYour current suggestion: ${current}` : "";
  const thread = priorTurns.map((t) => `${t.role === "user" ? "Writer" : "You"}: ${t.content}`).join("\n");
  const user =
    `Finding under discussion.${anchor}${currentSuggestion}\n\n` +
    (thread ? `Conversation so far:\n${thread}\n\n` : "") +
    `Writer: ${writerMessage}`;

  return { system, user };
}

/** Matches a delimiter only when it is the sole content of a line (optional surrounding whitespace). */
function blockLineIndex(lines: string[], re: RegExp, from = 0): number {
  for (let i = from; i < lines.length; i++) if (re.test(lines[i].trim())) return i;
  return -1;
}

export function parseDiscussResponse(text: string): ParsedDiscussTurn {
  const lines = text.split(/\r?\n/);
  const isEnd = (l: string) => l.trim() === "<<<END>>>";

  let revisedSuggestion: string | undefined;
  let revisedReasoning: string | undefined;
  let suggestedConstraint: { category: MemoryCategory; content: string } | undefined;
  const consumed = new Set<number>();

  // REVISION block
  const revStart = blockLineIndex(lines, /^<<<REVISION>>>$/);
  if (revStart !== -1) {
    const revEnd = blockLineIndex(lines, /^<<<END>>>$/, revStart + 1);
    if (revEnd !== -1) {
      const body = lines.slice(revStart + 1, revEnd);
      for (const raw of body) {
        const m = raw.match(/^\s*(suggestion|why):\s*(.*)$/i);
        if (m && m[1].toLowerCase() === "suggestion") revisedSuggestion = m[2].trim();
        if (m && m[1].toLowerCase() === "why") revisedReasoning = m[2].trim();
      }
      if (revisedSuggestion) for (let i = revStart; i <= revEnd; i++) consumed.add(i);
      else revisedSuggestion = revisedReasoning = undefined; // malformed → drop, keep prose
    }
  }

  // REMEMBER block
  const remStart = blockLineIndex(lines, /^<<<REMEMBER(\s+category="[^"]*")?>>>$/);
  if (remStart !== -1) {
    const remEnd = blockLineIndex(lines, /^<<<END>>>$/, remStart + 1);
    if (remEnd !== -1) {
      const header = lines[remStart].trim();
      const catMatch = header.match(/category="([^"]*)"/);
      const rawCat = (catMatch?.[1] ?? "constraint").toLowerCase();
      const category = (MEMORY_CATEGORIES as readonly string[]).includes(rawCat)
        ? (rawCat as MemoryCategory)
        : "constraint";
      if (!(MEMORY_CATEGORIES as readonly string[]).includes(rawCat)) {
        console.warn("[discuss] coerced invalid memory category:", rawCat);
      }
      const content = lines.slice(remStart + 1, remEnd).join("\n").trim();
      if (content) {
        suggestedConstraint = { category, content };
        for (let i = remStart; i <= remEnd; i++) consumed.add(i);
      }
    }
  }

  const assistantMessage = lines.filter((_, i) => !consumed.has(i)).join("\n").trim();
  return { assistantMessage, revisedSuggestion, revisedReasoning, suggestedConstraint };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/discuss-prompt.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editorial/discuss-prompt.ts tests/unit/discuss-prompt.test.ts
git commit -m "feat: pure discuss prompt builder + line-safe response parser (Tier 4.2)"
```

---

## Task 3: Pure conversation view-state (`finding-conversation.ts`)

**Files:**
- Create: `src/lib/editorial/finding-conversation.ts`
- Test: `tests/unit/finding-conversation.test.ts`

**Interfaces:**
- Consumes: `parseDiscussResponse` (Task 2).
- Produces: `computeConversationView(input): ConversationView`; types `StoredReply`, `ConversationView`, `Resolution`.

- [ ] **Step 1: Write the failing test** — `tests/unit/finding-conversation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeConversationView } from "@/lib/editorial/finding-conversation";

const u = (content: string) => ({ role: "user" as const, content });
const a = (content: string) => ({ role: "assistant" as const, content });

describe("computeConversationView", () => {
  it("counts user turns and allows discussion under cap for pending finding", () => {
    const v = computeConversationView({ replies: [u("a"), a("b")], findingStatus: "pending" });
    expect(v.userTurns).toBe(1);
    expect(v.canDiscuss).toBe(true);
    expect(v.resolution).toBe("pending");
  });

  it("caps at 3 user turns", () => {
    const v = computeConversationView({ replies: [u("1"), a("x"), u("2"), a("y"), u("3")], findingStatus: "pending" });
    expect(v.userTurns).toBe(3);
    expect(v.canDiscuss).toBe(false);
    expect(v.resolution).toBe("capped");
  });

  it("latestRevision is the newest assistant turn that HAS a revision (later plain turn hides it)", () => {
    const withRev = a(["ok", "<<<REVISION>>>", "suggestion: new text", "why: better", "<<<END>>>"].join("\n"));
    const plain = a("I agree, keep it.");
    const v = computeConversationView({ replies: [u("i"), withRev, u("ii"), plain], findingStatus: "pending" });
    expect(v.latestRevision).toBeUndefined();
    const v2 = computeConversationView({ replies: [u("i"), plain, u("ii"), withRev], findingStatus: "pending" });
    expect(v2.latestRevision).toBe("new text");
  });

  it("applied/dismissed are read-only resolutions", () => {
    expect(computeConversationView({ replies: [], findingStatus: "applied" }).resolution).toBe("applied");
    expect(computeConversationView({ replies: [], findingStatus: "dismissed" }).canDiscuss).toBe(false);
  });

  it("is crash-safe on a corrupted assistant row", () => {
    const bad = a("prose\n<<<REVISION>>>\nsuggestion:"); // unclosed
    expect(() => computeConversationView({ replies: [u("x"), bad], findingStatus: "pending" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/finding-conversation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** — `src/lib/editorial/finding-conversation.ts`:

```typescript
import { parseDiscussResponse } from "./discuss-prompt";

export type Resolution = "pending" | "capped" | "applied" | "dismissed";

export interface StoredReply {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationViewInput {
  replies: StoredReply[];
  findingStatus: string; // "pending" | "applied" | "dismissed" | ...
}

export interface ConversationView {
  userTurns: number;
  canDiscuss: boolean;
  latestRevision?: string;
  latestReasoning?: string;
  latestConstraint?: { category: string; content: string };
  resolution: Resolution;
}

export const MAX_USER_TURNS = 3;

export function computeConversationView(input: ConversationViewInput): ConversationView {
  const { replies, findingStatus } = input;
  const userTurns = replies.filter((r) => r.role === "user").length;

  let latestRevision: string | undefined;
  let latestReasoning: string | undefined;
  let latestConstraint: { category: string; content: string } | undefined;
  for (const r of replies) {
    if (r.role !== "assistant") continue;
    const parsed = parseDiscussResponse(r.content); // pure + total: never throws
    if (parsed.revisedSuggestion !== undefined) {
      latestRevision = parsed.revisedSuggestion;
      latestReasoning = parsed.revisedReasoning;
    }
    if (parsed.suggestedConstraint) latestConstraint = parsed.suggestedConstraint;
  }

  let resolution: Resolution;
  if (findingStatus === "applied") resolution = "applied";
  else if (findingStatus === "dismissed") resolution = "dismissed";
  else if (userTurns >= MAX_USER_TURNS) resolution = "capped";
  else resolution = "pending";

  const canDiscuss = resolution === "pending";
  return { userTurns, canDiscuss, latestRevision, latestReasoning, latestConstraint, resolution };
}
```

Note: the "latest revision hides when a later plain turn exists" test passes because we only overwrite `latestRevision` when a turn *has* a revision — so ordering matters: the last assistant turn with a revision wins, and a trailing plain turn does not clear it. To satisfy test case 3 (trailing plain turn hides the comparison), change the loop to reset on every assistant turn:

```typescript
  for (const r of replies) {
    if (r.role !== "assistant") continue;
    const parsed = parseDiscussResponse(r.content);
    latestRevision = parsed.revisedSuggestion;      // reset each assistant turn
    latestReasoning = parsed.revisedReasoning;
    if (parsed.suggestedConstraint) latestConstraint = parsed.suggestedConstraint;
  }
```
Use this second form — `latestRevision` reflects the **most recent assistant turn**, which is `undefined` when that turn is plain (matches spec §6.5 and test case 3).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/finding-conversation.test.ts`
Expected: PASS (all 5).

- [ ] **Step 5: Commit**

```bash
git add src/lib/editorial/finding-conversation.ts tests/unit/finding-conversation.test.ts
git commit -m "feat: pure conversation view-state (turn cap, latest revision, resolution) (Tier 4.2)"
```

---

## Task 4: Idempotent conversation-constraint helper

**Files:**
- Modify: `src/lib/agents/writer-memory.ts` (add export near `inferPreferenceFromNegativeFeedback`, ~line 217)
- Test: `tests/unit/writer-memory-constraint.test.ts`

**Interfaces:**
- Consumes: `db.writerMemory.upsert`.
- Produces: `upsertConversationConstraint({ userId, bookId, findingId, category, content }): Promise<void>`.

- [ ] **Step 1: Write the failing test** — `tests/unit/writer-memory-constraint.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ db: { writerMemory: { upsert: vi.fn() } } }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { upsertConversationConstraint } from "@/lib/agents/writer-memory";

beforeEach(() => vi.clearAllMocks());

describe("upsertConversationConstraint", () => {
  it("upserts keyed by (userId, findingId, source) with server bookId scope", async () => {
    h.db.writerMemory.upsert.mockResolvedValue({});
    await upsertConversationConstraint({
      userId: "u1", bookId: "b1", findingId: "f1", category: "preference", content: "Keep it terse.",
    });
    const arg = h.db.writerMemory.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId_findingId_source: { userId: "u1", findingId: "f1", source: "conversation" } });
    expect(arg.create.bookId).toBe("b1");
    expect(arg.create.source).toBe("conversation");
    expect(arg.create.category).toBe("preference");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/writer-memory-constraint.test.ts`
Expected: FAIL — `upsertConversationConstraint` is not exported.

- [ ] **Step 3: Write minimal implementation** — append to `src/lib/agents/writer-memory.ts`:

```typescript
export async function upsertConversationConstraint(params: {
  userId: string;
  bookId: string; // ALWAYS the finding's book — server-derived, never agent-supplied
  findingId: string;
  category: string;
  content: string;
}): Promise<void> {
  const { userId, bookId, findingId, category, content } = params;
  await db.writerMemory.upsert({
    where: { userId_findingId_source: { userId, findingId, source: "conversation" } },
    create: { userId, bookId, findingId, source: "conversation", category, content, active: true },
    update: { content, category, active: true },
  });
}
```

(`db` is already imported at `writer-memory.ts:16`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/writer-memory-constraint.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/writer-memory.ts tests/unit/writer-memory-constraint.test.ts
git commit -m "feat: idempotent conversation-constraint upsert helper (Tier 4.2)"
```

---

## Task 5: Extend PATCH apply — `overrideText` + dismiss→constraint resolution

**Files:**
- Modify: `src/lib/validation.ts:90-94`
- Modify: `src/app/api/books/[id]/editorial/findings/[findingId]/route.ts` (apply branch + dismiss branch)
- Test: `tests/unit/update-finding-schema.test.ts`

**Interfaces:**
- Consumes: `parseDiscussResponse` (Task 2), `upsertConversationConstraint` (Task 4).
- Produces: `overrideText` field accepted by `updateFindingSchema`; dismiss writes a conversation constraint when the latest assistant reply carried one.

- [ ] **Step 1: Write the failing test** — `tests/unit/update-finding-schema.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { updateFindingSchema } from "@/lib/validation";

describe("updateFindingSchema", () => {
  it("accepts overrideText on apply", () => {
    const p = updateFindingSchema.parse({ action: "apply", overrideText: "edited replacement" });
    expect(p.overrideText).toBe("edited replacement");
  });
  it("still parses without overrideText", () => {
    expect(updateFindingSchema.parse({ action: "dismiss", reason: "mine" }).overrideText).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/update-finding-schema.test.ts`
Expected: FAIL — `overrideText` is stripped/undefined on the apply case.

- [ ] **Step 3a: Add the field** — `src/lib/validation.ts:90-94`:

```typescript
export const updateFindingSchema = z.object({
  action: z.enum(["apply", "dismiss"]),
  reason: z.string().max(1000).optional(),
  alternativeIndex: z.number().int().min(0).max(20).optional(),
  overrideText: z.string().max(5000).optional(),
});
```

- [ ] **Step 3b: Use `overrideText` in the apply branch** — in `route.ts`, after the line `const newText = selectedAlternative?.newText ?? finding.newText;` add:

```typescript
    const finalNewText = data.overrideText ?? newText;
```

Then in the auto-apply branch, change the guard and the replacement to use `finalNewText`:
- `if (data.action === "apply" && originalText && finalNewText) {`
- the replacement line becomes:
```typescript
      const updatedContent =
        result.content.substring(0, match.index) +
        finalNewText +
        result.content.substring(match.index + match.matchedText.length);
```
(The existing `if (!match) return 409 …` already handles the drifted-anchor case per spec §5.3 — leave it; the client preserves the edit, Task 6/9.)

- [ ] **Step 3c: Resolve a conversation constraint on dismiss** — in the dismiss path (the `if (data.action === "dismiss")` block that calls `inferPreferenceFromDismissals`), add, right after that call:

```typescript
      // Conversational learning: if the thread's latest assistant turn emitted a constraint, persist it (book-scoped).
      try {
        const lastAssistant = await db.findingReply.findFirst({
          where: { findingId, role: "assistant" },
          orderBy: { createdAt: "desc" },
        });
        if (lastAssistant) {
          const { suggestedConstraint } = parseDiscussResponse(lastAssistant.content);
          if (suggestedConstraint) {
            await upsertConversationConstraint({
              userId: user.id,
              bookId, // finding's book — server-derived
              findingId,
              category: suggestedConstraint.category,
              content: suggestedConstraint.content,
            });
            await db.suggestionFeedback.upsert({
              where: { userId_suggestionId: { userId: user.id, suggestionId: findingId } },
              create: {
                bookId, userId: user.id, suggestionId: findingId,
                suggestionType: finding.category, positive: false, suggestionText: finding.description,
              },
              update: { positive: false },
            });
          }
        }
      } catch (e) {
        console.error("[Discuss] constraint resolution failed:", e);
      }
```

Add the imports at the top of `route.ts`:
```typescript
import { parseDiscussResponse } from "@/lib/editorial/discuss-prompt";
import { upsertConversationConstraint } from "@/lib/agents/writer-memory";
```

- [ ] **Step 4: Run the schema test + full unit suite + typecheck**

Run: `npx vitest run tests/unit/update-finding-schema.test.ts && npx tsc --noEmit`
Expected: schema test PASS; `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/app/api/books/[id]/editorial/findings/[findingId]/route.ts tests/unit/update-finding-schema.test.ts
git commit -m "feat: overrideText apply + dismiss→conversation-constraint resolution (Tier 4.2)"
```

---

## Task 6: `/discuss` route (GET hydrate + POST one atomic turn)

**Files:**
- Create: `src/app/api/books/[id]/editorial/findings/[findingId]/discuss/route.ts`
- Test: `tests/unit/finding-discuss-route.test.ts`

**Interfaces:**
- Consumes: `buildDiscussPrompt`, `parseDiscussResponse` (Task 2), `formatWriterMemoryForPrompt` (`@/lib/agents/writer-memory`), `createLLMClient`/`resolveModelForRole` (`@/lib/llm`), `db`.
- Produces: `POST` → `{ assistantMessage, revisedSuggestion?, revisedReasoning?, suggestedConstraint?, userTurns, capped }`; `GET` → `{ replies, userTurns, canDiscuss }`.

- [ ] **Step 1: Write the failing test** — `tests/unit/finding-discuss-route.test.ts` (mirrors the `vi.hoisted` + `vi.mock` pattern from `version-manager.test.ts`):

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findFirst: vi.fn() },
    findingReply: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  runTurn: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/agents/writer-memory", () => ({ formatWriterMemoryForPrompt: () => Promise.resolve("") }));
vi.mock("@/lib/editorial/discuss-llm", () => ({ runDiscussTurn: h.runTurn }));

import { POST } from "@/app/api/books/[id]/editorial/findings/[findingId]/discuss/route";

function req(body: unknown) {
  return new Request("http://t/discuss", { method: "POST", body: JSON.stringify(body) });
}
const ctx = { params: Promise.resolve({ id: "b1", findingId: "f1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.editFinding.findFirst.mockResolvedValue({ id: "f1", bookId: "b1", category: "dialogue", severity: "important", description: "d", alternatives: null, agentType: "line-editor" });
  h.db.findingReply.count.mockResolvedValue(0); // rate-limit count
  // $transaction runs the callback with a tx that mirrors db
  h.db.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({ ...h.db, $queryRaw: h.db.$queryRaw })
  );
  h.db.$queryRaw.mockResolvedValue([{ id: "f1" }]); // FOR UPDATE lock row
});

describe("POST /discuss", () => {
  it("persists one user + one assistant reply and returns parsed fields", async () => {
    h.db.findingReply.findMany.mockResolvedValue([]); // 0 prior user turns
    h.runTurn.mockResolvedValue("Sure.\n<<<REVISION>>>\nsuggestion: new line\nwhy: clearer\n<<<END>>>");
    const res = await POST(req({ writerMessage: "keep it terse" }), ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.revisedSuggestion).toBe("new line");
    const roles = h.db.findingReply.create.mock.calls.map((c) => c[0].data.role);
    expect(roles).toEqual(["user", "assistant"]);
  });

  it("short-circuits at 3 user turns with no model call", async () => {
    h.db.findingReply.findMany.mockResolvedValue([{ role: "user" }, { role: "user" }, { role: "user" }]);
    const res = await POST(req({ writerMessage: "again" }), ctx as never);
    expect((await res.json()).capped).toBe(true);
    expect(h.runTurn).not.toHaveBeenCalled();
  });

  it("rate-limits beyond 200 user replies / 24h", async () => {
    h.db.findingReply.count.mockResolvedValue(201);
    const res = await POST(req({ writerMessage: "x" }), ctx as never);
    expect(res.status).toBe(429);
    expect(h.runTurn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/finding-discuss-route.test.ts`
Expected: FAIL — route + `@/lib/editorial/discuss-llm` modules not found.

- [ ] **Step 3a: Create the LLM shell** — `src/lib/editorial/discuss-llm.ts` (kept separate so the route test can mock it; mirrors the model resolution + `client.messages` usage in `src/app/api/books/[id]/agent/[sessionId]/message/route.ts:140-175` — open that file and match its `createLLMClient({ modelId, anthropicApiKey, … })` + `client.messages(...)` call exactly):

```typescript
import { createLLMClient } from "@/lib/llm";

const HAIKU = "anthropic/haiku"; // registry id → claude-haiku-4-5-20251001 (model-registry.ts:77)

/** One cheap, tool-less turn. Returns the raw model text. Mirror the key-decryption used by the
 *  agent message route (BYOK): resolve the user's anthropic key the same way and pass it here. */
export async function runDiscussTurn(args: {
  system: string;
  user: string;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
}): Promise<string> {
  const { client } = createLLMClient({
    modelId: HAIKU,
    anthropicApiKey: args.anthropicApiKey,
    openrouterApiKey: args.openrouterApiKey,
  });
  // Match the message-route call shape (system + single user message, no tools, bounded tokens):
  const res = await client.messages({
    system: args.system,
    messages: [{ role: "user", content: args.user }],
    maxTokens: 700,
  });
  // Extract text the same way the message route does (concatenate text blocks).
  return typeof res === "string" ? res : (res.text ?? "");
}
```

> Implementer note: if `client.messages` in this codebase returns content blocks, adapt the last line to match `message/route.ts` (e.g. `res.content.map(b => b.text).join("")`). Keep this the ONLY place that touches the model so the pure modules stay testable.

- [ ] **Step 3b: Create the route** — `src/app/api/books/[id]/editorial/findings/[findingId]/discuss/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildDiscussPrompt, parseDiscussResponse, type ThreadTurn } from "@/lib/editorial/discuss-prompt";
import { formatWriterMemoryForPrompt } from "@/lib/agents/writer-memory";
import { runDiscussTurn } from "@/lib/editorial/discuss-llm";

export const dynamic = "force-dynamic";

const MAX_USER_TURNS = 3;
const RATE_LIMIT_24H = 200;
type RouteParams = { params: Promise<{ id: string; findingId: string }> };
const bodySchema = z.object({ writerMessage: z.string().min(1).max(2000) });

async function loadOwnedFinding(userId: string, bookId: string, findingId: string) {
  const book = await db.book.findFirst({ where: { id: bookId, userId }, select: { id: true } });
  if (!book) return { error: NextResponse.json({ error: "Book not found" }, { status: 404 }) };
  const finding = await db.editFinding.findFirst({ where: { id: findingId, bookId } });
  if (!finding) return { error: NextResponse.json({ error: "Finding not found" }, { status: 404 }) };
  return { finding };
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;
    const owned = await loadOwnedFinding(user.id, bookId, findingId);
    if (owned.error) return owned.error;

    const replies = await db.findingReply.findMany({
      where: { findingId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });
    const userTurns = replies.filter((r) => r.role === "user").length;
    const canDiscuss = owned.finding.status === "pending" && userTurns < MAX_USER_TURNS;
    const view = replies.map((r) => ({
      role: r.role,
      content: r.content,
      createdAt: r.createdAt,
      ...(r.role === "assistant" ? parseDiscussResponse(r.content) : {}),
    }));
    return NextResponse.json({ replies: view, userTurns, canDiscuss });
  } catch (e) {
    if ((e as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;
    const { writerMessage } = bodySchema.parse(await req.json());

    const owned = await loadOwnedFinding(user.id, bookId, findingId);
    if (owned.error) return owned.error;
    const finding = owned.finding;

    // Rate limit: total user replies across all books in the last 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db.findingReply.count({ where: { userId: user.id, role: "user", createdAt: { gte: since } } });
    if (recent >= RATE_LIMIT_24H) {
      return NextResponse.json({ capped: true, reason: "rate_limited", retryAfterSec: 3600 }, { status: 429 });
    }

    const writerMemoryBlock = await formatWriterMemoryForPrompt(user.id, bookId);

    // Atomic: lock the finding row, count user turns, run the turn, persist — all in one txn.
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM edit_findings WHERE id = ${findingId} FOR UPDATE`;
      const prior = await tx.findingReply.findMany({
        where: { findingId }, orderBy: { createdAt: "asc" }, select: { role: true, content: true },
      });
      const userTurns = prior.filter((r) => r.role === "user").length;
      if (userTurns >= MAX_USER_TURNS) {
        return { capped: true as const, assistantMessage: "You've discussed this finding thoroughly (3 exchanges). Ready to make a decision?", userTurns };
      }

      const { system, user: userPrompt } = buildDiscussPrompt({
        finding: {
          category: finding.category, severity: finding.severity, description: finding.description,
          rationale: finding.rationale, anchorQuote: finding.anchorQuote,
          alternatives: safeAlternatives(finding.alternatives),
        },
        priorTurns: prior as ThreadTurn[],
        writerMessage,
        writerMemoryBlock,
        agentType: finding.agentType,
      });

      const raw = await runDiscussTurn({ system, user: userPrompt /* + resolved BYOK keys, see discuss-llm note */ });

      await tx.findingReply.create({ data: { findingId, userId: user.id, role: "user", content: writerMessage } });
      await tx.findingReply.create({ data: { findingId, userId: user.id, role: "assistant", content: raw } });

      return { capped: false as const, raw, userTurns: userTurns + 1 };
    });

    if (result.capped) {
      return NextResponse.json({ capped: true, assistantMessage: result.assistantMessage, userTurns: result.userTurns }, { status: 409 });
    }
    const parsed = parseDiscussResponse(result.raw);
    return NextResponse.json({ ...parsed, userTurns: result.userTurns, capped: false });
  } catch (e) {
    if ((e as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((e as Error).name === "ZodError") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    console.error("POST /discuss error:", e);
    return NextResponse.json({ error: "Failed to discuss finding" }, { status: 500 });
  }
}

function safeAlternatives(raw: unknown): Array<{ label?: string; originalText?: string; newText?: string }> {
  if (typeof raw !== "string") return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}
```

> Implementer note: pass the resolved BYOK anthropic key into `runDiscussTurn` the same way `message/route.ts` decrypts and forwards it. The test mocks `runDiscussTurn`, so the route stays unit-testable regardless.

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/unit/finding-discuss-route.test.ts && npx tsc --noEmit`
Expected: all 3 PASS; `tsc` exit 0.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/books/[id]/editorial/findings/[findingId]/discuss/route.ts" src/lib/editorial/discuss-llm.ts tests/unit/finding-discuss-route.test.ts
git commit -m "feat: /discuss endpoint — atomic turn cap, rate limit, thread persistence (Tier 4.2)"
```

---

## Task 7: `useFindingDiscussion` hook

**Files:**
- Create: `src/hooks/use-finding-discussion.ts`

**Interfaces:**
- Consumes: `/discuss` GET+POST (Task 6). TanStack Query (`@tanstack/react-query`).
- Produces: `useFindingDiscussion(bookId, findingId)` → `{ replies, userTurns, canDiscuss, isLoading, send(message), isSending }`.
- **Verification:** `tsc --noEmit` + build (no Vitest — node env can't render hooks; covered by e2e in Task 11 follow-up).

- [ ] **Step 1: Implement** — `src/hooks/use-finding-discussion.ts`:

```typescript
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface DiscussionReply {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  assistantMessage?: string;
  revisedSuggestion?: string;
  revisedReasoning?: string;
  suggestedConstraint?: { category: string; content: string };
}

interface DiscussionData { replies: DiscussionReply[]; userTurns: number; canDiscuss: boolean; }

export function useFindingDiscussion(bookId: string, findingId: string) {
  const qc = useQueryClient();
  const key = ["finding-discussion", bookId, findingId] as const;

  const query = useQuery<DiscussionData>({
    queryKey: key,
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/editorial/findings/${findingId}/discuss`);
      if (!res.ok) throw new Error("Failed to load conversation");
      return (await res.json()) as DiscussionData;
    },
    staleTime: 10_000,
  });

  const mutation = useMutation({
    mutationFn: async (writerMessage: string) => {
      const res = await fetch(`/api/books/${bookId}/editorial/findings/${findingId}/discuss`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writerMessage }),
      });
      if (res.status === 429) throw new Error("rate_limited");
      if (!res.ok && res.status !== 409) throw new Error("Failed to send");
      return (await res.json()) as { assistantMessage?: string; revisedSuggestion?: string; revisedReasoning?: string; suggestedConstraint?: { category: string; content: string }; userTurns: number; capped: boolean };
    },
    // Optimistic append of the writer's message.
    onMutate: async (writerMessage) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<DiscussionData>(key);
      qc.setQueryData<DiscussionData>(key, (d) => {
        const base = d ?? { replies: [], userTurns: 0, canDiscuss: true };
        return { ...base, replies: [...base.replies, { role: "user", content: writerMessage }] };
      });
      return { prev };
    },
    // Roll back on failure, then re-hydrate from the server so counts never diverge (spec §6.1).
    onError: (_e, _v, ctxData) => {
      if (ctxData?.prev) qc.setQueryData(key, ctxData.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    replies: query.data?.replies ?? [],
    userTurns: query.data?.userTurns ?? 0,
    canDiscuss: query.data?.canDiscuss ?? true,
    isLoading: query.isLoading,
    send: mutation.mutateAsync,
    isSending: mutation.isPending,
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-finding-discussion.ts
git commit -m "feat: useFindingDiscussion hook — hydrate + optimistic send + rollback (Tier 4.2)"
```

---

## Task 8: `AIRewriteComparison` — editable mode + mobile stack

**Files:**
- Modify: `src/components/editor/ai-rewrite-comparison.tsx`

**Interfaces:**
- Produces: extended props `editable?: boolean` (internal edit toggle) + `onAccept(newText: string, wasEdited: boolean)`.
- **Verification:** `tsc --noEmit` + build.

- [ ] **Step 1: Extend the props + accept signature** — change the interface:

```typescript
interface AIRewriteComparisonProps {
  original: string;
  rewrite: string;
  rewriteLabel?: string;
  /** Accept — second arg flags whether the writer edited the suggestion first. */
  onAccept: (newText: string, wasEdited: boolean) => void;
  onReject: () => void;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  /** When true, show an "Edit" affordance that turns the rewrite pane into a textarea. */
  allowEdit?: boolean;
}
```

- [ ] **Step 2: Add edit state + editable textarea** — inside the component, add state and seed it from `rewrite`:

```typescript
  const [showDiff, setShowDiff] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rewrite);
```

Render the rewrite pane so that, when `editing`, it is a full-width textarea (diff hidden); otherwise the existing diff view:

```tsx
          {editing ? (
            <textarea
              className="h-48 w-full rounded-md border p-3 text-sm leading-relaxed font-serif bg-green-500/5"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          ) : (
            <ScrollArea className="h-48 rounded-md border p-3 bg-green-500/5">
              {/* existing rewrite word-diff rendering */}
            </ScrollArea>
          )}
```

- [ ] **Step 3: Make the layout mobile-friendly + wire accept/edit** — change the two-column wrapper class and the accept button:

```tsx
        {/* was: grid grid-cols-2 gap-3 */}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
```

```tsx
          <div className="flex gap-2">
            {allowEdit && !editing && (
              <Button variant="ghost" size="sm" onClick={() => { setDraft(rewrite); setEditing(true); }}>
                Edit
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onReject}>
              <XIcon className="size-3 mr-1" /> Reject
            </Button>
            <Button size="sm" onClick={() => onAccept(editing ? draft : rewrite, editing)}>
              <CheckIcon className="size-3 mr-1" /> {editing ? "Use edited" : "Accept Rewrite"}
            </Button>
          </div>
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: exit 0 (no existing callers to break — the component was unexposed).

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ai-rewrite-comparison.tsx
git commit -m "feat: expose AIRewriteComparison with edit mode + mobile stack (Tier 4.2 / roadmap 1.6)"
```

---

## Task 9: `FindingConversation` shared component

**Files:**
- Create: `src/components/editorial/finding-conversation.tsx`

**Interfaces:**
- Consumes: `useFindingDiscussion` (Task 7), `computeConversationView` (Task 3), `AIRewriteComparison` (Task 8), `ConversationInput` (`@/components/agent/conversation-input`).
- Produces: `<FindingConversation bookId finding onApply onDismiss onClose />`.
- **Verification:** `tsc --noEmit` + build.

- [ ] **Step 1: Implement** — `src/components/editorial/finding-conversation.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ConversationInput } from "@/components/agent/conversation-input";
import { AIRewriteComparison } from "@/components/editor/ai-rewrite-comparison";
import { useFindingDiscussion } from "@/hooks/use-finding-discussion";
import { computeConversationView } from "@/lib/editorial/finding-conversation";

interface FindingLite {
  id: string;
  status: string;
  category: string;
  description: string;
  rationale?: string | null;
  anchorQuote?: string | null;
  alternatives?: Array<{ label?: string; originalText?: string; newText?: string }>;
}

interface FindingConversationProps {
  bookId: string;
  finding: FindingLite;
  onApply: (overrideText?: string) => void;
  onDismiss: (reason?: string) => void;
  onClose?: () => void;
}

export function FindingConversation({ bookId, finding, onApply, onDismiss }: FindingConversationProps) {
  const { replies, canDiscuss, isLoading, send, isSending } = useFindingDiscussion(bookId, finding.id);

  const view = useMemo(
    () => computeConversationView({ replies: replies.map((r) => ({ role: r.role, content: r.content })), findingStatus: finding.status }),
    [replies, finding.status]
  );

  const original = finding.anchorQuote ?? finding.alternatives?.[0]?.originalText ?? "";
  const opening = `I flagged: ${finding.description}${finding.rationale ? ` (${finding.rationale})` : ""}. What are you going for here?`;

  return (
    <div className="flex flex-col gap-3 p-2">
      {/* Thread — our own plaintext render (no MessageStream); never dangerouslySetInnerHTML */}
      <div className="space-y-2">
        {replies.length === 0 && !isLoading && (
          <p className="rounded-md bg-muted/40 p-2 text-sm">{opening}</p>
        )}
        {replies.map((r, i) => (
          <p
            key={i}
            className={
              "rounded-md p-2 text-sm whitespace-pre-wrap " +
              (r.role === "user" ? "bg-primary/10 ml-6" : "bg-muted/40 mr-6")
            }
          >
            {r.role === "assistant" ? r.assistantMessage ?? r.content : r.content}
          </p>
        ))}
      </div>

      {/* In-place revision when the latest agent turn proposed one */}
      {view.latestRevision !== undefined && (
        <AIRewriteComparison
          original={original}
          rewrite={view.latestRevision}
          rewriteLabel={finding.category}
          allowEdit
          onAccept={(newText) => onApply(newText)}
          onReject={() => onDismiss()}
        />
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        {view.latestRevision !== undefined ? (
          <>
            <Button size="sm" onClick={() => onApply(view.latestRevision)}>Use it</Button>
            <Button variant="outline" size="sm" onClick={() => onDismiss()}>Keep as-is</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => onDismiss()}>Keep as-is</Button>
        )}
      </div>

      {/* Input or cap notice */}
      {canDiscuss ? (
        <ConversationInput
          onSend={(m) => send(m)}
          disabled={isSending}
          placeholder="Explain your intent or why you disagree…"
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          3-exchange cap reached — decide above, or undo to revise.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/editorial/finding-conversation.tsx
git commit -m "feat: FindingConversation shared component (thread + in-place revision + actions) (Tier 4.2)"
```

---

## Task 10: Mount points (editor tooltip → sheet, editorial card)

**Files:**
- Modify: `src/stores/editorial-store.ts`
- Modify: `src/components/editor/annotation-tooltip.tsx`
- Modify: `src/components/editor/manuscript-editor.tsx`
- Modify: `src/components/editor/editor-findings-panel.tsx`
- Modify: `src/components/editorial/finding-card.tsx`

**Interfaces:**
- Consumes: `FindingConversation` (Task 9).
- Produces: `editorialStore.conversationFindingId` + `setConversationFinding`; a "Let's talk about this" button; a "Discuss" affordance on the editorial card.
- **Verification:** `tsc --noEmit` + build.

- [ ] **Step 1: Add conversation state to the store** — in `src/stores/editorial-store.ts`, add to the interface + implementation:

```typescript
  conversationFindingId: string | null;                 // in EditorialState
  setConversationFinding: (id: string | null) => void;  // in EditorialState
```
```typescript
  conversationFindingId: null,                                   // in create()
  setConversationFinding: (id) => set({ conversationFindingId: id }),
```
Also add `conversationFindingId: null` to the `reset()` payload.

- [ ] **Step 2: Add the button to the tooltip** — in `annotation-tooltip.tsx`, extend props with `onDiscuss?: () => void` and insert a button between the diff block and the Actions `<div>` (after ~line 200):

```tsx
        {onDiscuss && (
          <Button variant="ghost" size="sm" className="h-7 text-xs justify-start px-1" onClick={onDiscuss}>
            Let&apos;s talk about this
          </Button>
        )}
```

- [ ] **Step 3: Wire the tooltip in the editor** — in `manuscript-editor.tsx`, where `<AnnotationTooltip … />` is rendered, pass:

```tsx
            onDiscuss={() => {
              setSelectedFinding(tooltipState.annotationId);
              setConversationFinding(tooltipState.annotationId);
              setTooltipState(null); // close tooltip; the panel/sheet takes over
            }}
```
(Import `setConversationFinding` from `useEditorialStore`; `setSelectedFinding` is already used per the map.)

- [ ] **Step 4: Render conversation in the findings panel** — in `editor-findings-panel.tsx`, read the store and, when a `conversationFindingId` matches a finding in view, render `FindingConversation` above/instead of the card list:

```tsx
  const conversationFindingId = useEditorialStore((s) => s.conversationFindingId);
  const setConversationFinding = useEditorialStore((s) => s.setConversationFinding);
  const applyFinding = useApplyFinding(bookId);
  const dismissFinding = useDismissFinding(bookId);
  const convoFinding = findings.find((f) => f.id === conversationFindingId);
```
```tsx
      {convoFinding && (
        <FindingConversation
          key={convoFinding.id}
          bookId={bookId}
          finding={convoFinding}
          onApply={(overrideText) => {
            applyFinding.mutate({ findingId: convoFinding.id, overrideText });
            setConversationFinding(null);
          }}
          onDismiss={(reason) => {
            dismissFinding.mutate({ findingId: convoFinding.id, reason });
            setConversationFinding(null);
          }}
          onClose={() => setConversationFinding(null)}
        />
      )}
```

> Implementer note: confirm `useApplyFinding`/`useDismissFinding` (`@/hooks/use-editorial`) mutation-arg shapes. If `useApplyFinding` currently takes only `findingId` (string), extend its `mutationFn` to accept `{ findingId, overrideText? }` and forward `overrideText` in the PATCH body — the endpoint already accepts it (Task 5). Keep the existing string-arg call sites working (accept `string | { findingId; overrideText? }`).

- [ ] **Step 5: Add "Discuss" to the editorial page card** — in `finding-card.tsx`, add a local `expanded` state and a "Discuss" button; when expanded, render `FindingConversation` inside the card:

```tsx
  const [discussing, setDiscussing] = useState(false);
```
```tsx
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setDiscussing((v) => !v); }}>
          {discussing ? "Hide" : "Discuss"}
        </Button>
```
```tsx
      {discussing && (
        <FindingConversation
          bookId={bookId}
          finding={finding}
          onApply={(overrideText) => { applyMutation.mutate(overrideText ? { findingId: finding.id, overrideText } : finding.id); setDiscussing(false); }}
          onDismiss={(reason) => { dismissMutation.mutate({ findingId: finding.id, reason }); setDiscussing(false); }}
          onClose={() => setDiscussing(false)}
        />
      )}
```

- [ ] **Step 6: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: exit 0. Resolve any mutation-arg type mismatches per the Step 4 note.

- [ ] **Step 7: Commit**

```bash
git add src/stores/editorial-store.ts src/components/editor/annotation-tooltip.tsx src/components/editor/manuscript-editor.tsx src/components/editor/editor-findings-panel.tsx src/components/editorial/finding-card.tsx
git commit -m "feat: mount FindingConversation in editor tooltip/sheet and editorial card (Tier 4.2)"
```

---

## Task 11: Coverage wiring + full green gate

**Files:**
- Modify: `vitest.config.ts` (coverage include)

- [ ] **Step 1: Add the new pure modules to coverage include** — in `vitest.config.ts`, extend the `coverage.include` array:

```typescript
      include: [
        "src/lib/agents/budget.ts",
        "src/lib/llm/model-registry.ts",
        "src/lib/billing/plan-gating.ts",
        "src/lib/documents/version-manager.ts",
        "src/lib/editorial/discuss-prompt.ts",
        "src/lib/editorial/finding-conversation.ts",
      ],
```

- [ ] **Step 2: Run the full unit suite**

Run: `npx vitest run`
Expected: PASS — all prior tests + the new `discuss-prompt`, `finding-conversation`, `writer-memory-constraint`, `update-finding-schema`, `finding-discuss-route` suites.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Production build gate**

Run (export CI placeholder env first, per the repo note — the env block lives in `.github/workflows/ci.yml`): `npm run build`
Expected: build completes (compile + type pass). Local `.env` placeholder assertion failure is expected without the CI env block.

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts
git commit -m "chore: add conversational-findings modules to unit coverage (Tier 4.2)"
```

---

## Self-review notes (spec coverage)

- Spec §4 migrations → Task 1. §5.1/5.2 discuss endpoint (atomic cap, rate limit, raw-store/parse-on-read) → Task 6. §5.3 `overrideText`+drift → Task 5. §5.4 constraint resolution (server-scoped, idempotent) → Tasks 4 + 5. §6.1 FindingConversation (own thread, no-revision path, cap state, empty state) → Task 9. §6.2/6.3 mounts → Task 10. §6.4 AIRewriteComparison edit+mobile → Task 8. §6.5 pure view-state → Task 3. §7 prompt+parser (line-safe, category coercion) → Task 2. §8 tests → Tasks 2,3,4,5,6,11. §10 security (plaintext, no innerHTML, server scope) → Tasks 6,9 + global constraints.
- Deferred (§11): unread badge/toast, transcript-mining, cross-device sync, streaming — not in this plan, by design.
- **Known implementer follow-ups (flagged inline, not placeholders):** (a) match `client.messages` extraction to `message/route.ts` in `discuss-llm.ts`; (b) forward BYOK anthropic key into `runDiscussTurn`; (c) confirm/extend `useApplyFinding`/`useDismissFinding` mutation arg shapes for `overrideText`. Each names the exact reference site.
