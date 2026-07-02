# Live In-Book Continuity Net (Tier 4.4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a writer pauses, detect deterministic graph-consistency contradictions in the book and surface the current chapter's as non-blocking inline flags with `[Go to Ch N]` / `[Intentional]` actions — no LLM in the detector, idempotent, cost-bounded.

**Architecture:** Live flags live in a **dedicated `ContinuityFlag` table** (NOT the shared `EditFinding` table — that leaks into ~8 existing editorial consumers). Two pure modules (flag shaping + sync diff) + a thin best-effort `POST /continuity/scan` route (throttled haiku extraction → cheap Cypher `runConsistencyChecks` → **book-wide symmetric** idempotent upsert/delete) + a tiny `POST /continuity/intentional` route + a client idle-trigger and a new `"continuity"` annotation type. Reuses the graph, the annotation/tooltip pipeline, and chapter navigation.

**Tech Stack:** Next.js App Router, Prisma (`db`, `db push` — no migrations dir), Neo4j (`src/lib/graph`), Zod, React state, TipTap/ProseMirror decorations, `node:crypto`, Vitest (node env), TypeScript strict.

## Global Constraints

- **TypeScript strict, no `any`** — `unknown` + narrowing; explicit types on exports.
- **Immutability** — never mutate inputs.
- **Zod at the boundary** — validate `chapterNumber` (query) and the intentional body.
- **Unit tests in `tests/unit/**/*.test.ts`**, `environment: "node"`. **No component/RTL tests** (no jsdom); UI gated by `tsc` + `next build`. Route-test style: `vi.hoisted` + `vi.mock("@/lib/auth"|"@/lib/db"|...)` (see `tests/unit/series-context-route.test.ts`).
- **Read-mostly / cost-bounded:** the detector is pure Cypher (no LLM); the only LLM is the throttled `updateFromChapter` (haiku). No agent session. `console.error` only in a catch.
- **Isolation via a dedicated table:** live flags are `ContinuityFlag` rows — they do NOT touch `EditFinding`, so no editorial consumer (agent prompt, counts, panel, reports, book-health) is affected. This replaces the leaky "persist as EditFinding" approach the review rejected.
- **Symmetric reconciliation:** detection and sync are BOTH book-wide (`runConsistencyChecks` returns all chapters; `toContinuityFlags` produces flags for all chapters; the sync reconciles all active rows). The current chapter is used ONLY to decide what renders inline (a display concern), never to scope the sync.
- **`ConsistencyIssue`** imports from `@/lib/graph/types`; `DocumentType` from `@/generated/prisma/enums`.
- **Resilience:** graph calls wrapped in `withTimeout(5000)` (mirrors `series-context/route.ts`); a stalled Neo4j degrades to `{flags:[]}` in ~5s.
- Run commands from `D:\Projects\wmb-pub` (Windows / Git Bash). Test: `npx vitest run <file>`. Types: `npx tsc --noEmit`. Prisma client: `npx prisma generate`.
- **DEPLOY GATE:** this adds a `ContinuityFlag` model → the real dev/prod DB needs `npx prisma db push` before the feature works there (documented in Task 8). Local unit/type gates do not require a DB.

---

### Task 1: Prisma model + client generate

**Files:**
- Modify: `prisma/schema.prisma` (add `ContinuityFlag` model + `Book.continuityFlags` relation)

**Interfaces:**
- Produces: the `ContinuityFlag` Prisma delegate (`db.continuityFlag`) + generated types, with compound unique `bookId_signature`.

- [ ] **Step 1: Add the model**

In `prisma/schema.prisma`, add after the `EditFinding` model block:

```prisma
// ─── LIVE CONTINUITY NET (Tier 4.4) ─────────────────────────────
model ContinuityFlag {
  id            String   @id @default(uuid())
  bookId        String   @map("book_id")
  chapterNumber Int      @map("chapter_number") // primary site (0 = book-level)
  signature     String                          // sha1(type + sorted entities + sorted chapters)
  type          String                          // dead_character_reappears | location_conflict | timeline_violation | relationship_contradiction
  severity      String                          // critical | major | minor (graph vocabulary)
  description   String   @db.Text
  entities      String   @db.Text               // JSON array of entity names
  anchor        String?                         // entity name to anchor inline; null for book-level
  jumpChapter   Int?     @map("jump_chapter")   // [Go to Ch N] target; null if none
  status        String   @default("active")     // active | intentional  (resolve = row deleted)
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  book Book @relation(fields: [bookId], references: [id], onDelete: Cascade)

  @@unique([bookId, signature])
  @@index([bookId, status])
  @@map("continuity_flags")
}
```

In the `Book` model, add to the relations block (next to the other `[]` relations):

```prisma
  continuityFlags ContinuityFlag[]
```

- [ ] **Step 2: Generate the client + type-check**

Run: `npx prisma generate`
Expected: regenerates `@/generated/prisma` with `ContinuityFlag`.

Run: `npx tsc --noEmit`
Expected: exit 0. *(No DB push locally — unit tests mock `db`. `prisma db push` is a deploy-time step, Task 8.)*

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: ContinuityFlag model for live continuity net (Tier 4.4)"
```

---

### Task 2: Pure continuity-flags module (signature, flag shaping, throttle)

**Files:**
- Create: `src/lib/continuity/continuity-flags.ts`
- Test: `tests/unit/continuity-flags.test.ts`

**Interfaces:**
- Consumes: `ConsistencyIssue` from `@/lib/graph/types` — `{ type: "character_undocumented"|"location_conflict"|"timeline_violation"|"dead_character_reappears"|"orphan_plot_thread"|"relationship_contradiction"; severity: "critical"|"major"|"minor"; description: string; entities: string[]; chapters: number[] }`.
- Produces (all exported):
  - `interface ContinuityFlagInput { signature: string; type: ConsistencyIssue["type"]; severity: "critical"|"major"|"minor"; description: string; entities: string[]; chapterNumber: number; jumpChapter: number | null; anchor: string | null }`
  - `function continuityIssueSignature(issue: ConsistencyIssue): string`
  - `function toContinuityFlags(input: { issues: ConsistencyIssue[]; intentionalSignatures: Set<string> }): ContinuityFlagInput[]`
  - `function shouldExtract(lastExtractedAt: Date | null, now: Date, minIntervalMs: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/continuity-flags.test.ts
import { describe, it, expect } from "vitest";
import { continuityIssueSignature, toContinuityFlags, shouldExtract } from "@/lib/continuity/continuity-flags";
import type { ConsistencyIssue } from "@/lib/graph/types";

function issue(over: Partial<ConsistencyIssue> = {}): ConsistencyIssue {
  return {
    type: "dead_character_reappears",
    severity: "critical",
    description: 'Character "Ana" dies in chapter 12 but participates in events in chapters 18, 20.',
    entities: ["Ana"],
    chapters: [12, 18, 20],
    ...over,
  };
}

describe("continuityIssueSignature", () => {
  it("is deterministic and stable for the same issue", () => {
    expect(continuityIssueSignature(issue())).toBe(continuityIssueSignature(issue()));
  });
  it("is invariant to entity/chapter ORDER (fixes collect()/id() nondeterminism)", () => {
    const a = continuityIssueSignature(issue({ entities: ["Ana"], chapters: [20, 12, 18] }));
    const b = continuityIssueSignature(issue({ entities: ["Ana"], chapters: [12, 18, 20] }));
    expect(a).toBe(b);
  });
  it("is invariant to description wording (signature ignores description text)", () => {
    const a = continuityIssueSignature(issue({ description: "phrased one way" }));
    const b = continuityIssueSignature(issue({ description: "phrased another way" }));
    expect(a).toBe(b); // same type + entities + chapters
  });
  it("differs by type, entities, and chapters", () => {
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ type: "timeline_violation" })));
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ entities: ["Bob"] })));
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ chapters: [12, 19, 20] })));
  });
});

describe("toContinuityFlags", () => {
  const NONE = new Set<string>();

  it("produces flags for ALL chapters (book-wide, not filtered)", () => {
    const flags = toContinuityFlags({
      issues: [issue({ chapters: [12, 18] }), issue({ entities: ["Bob"], chapters: [3, 5] })],
      intentionalSignatures: NONE,
    });
    expect(flags).toHaveLength(2);
  });

  it("dead_character_reappears: chapterNumber = earliest reappearance, jumpChapter = death chapter, anchor = character", () => {
    const [f] = toContinuityFlags({ issues: [issue({ chapters: [12, 18, 20] })], intentionalSignatures: NONE });
    expect(f.chapterNumber).toBe(18); // earliest post-death reappearance (second-smallest)
    expect(f.jumpChapter).toBe(12);   // death chapter (smallest)
    expect(f.anchor).toBe("Ana");
  });

  it("timeline_violation: chapterNumber = later chapter (anchor lives there), jumpChapter = earlier", () => {
    const [f] = toContinuityFlags({
      issues: [issue({ type: "timeline_violation", severity: "critical", entities: ["Later Event", "Earlier Event"], chapters: [4, 9], description: "d" })],
      intentionalSignatures: NONE,
    });
    expect(f.chapterNumber).toBe(9);
    expect(f.jumpChapter).toBe(4);
    expect(f.anchor).toBe("Later Event");
  });

  it("location_conflict: single chapter, no jump target", () => {
    const [f] = toContinuityFlags({
      issues: [issue({ type: "location_conflict", severity: "major", entities: ["Milan"], chapters: [7], description: "d" })],
      intentionalSignatures: NONE,
    });
    expect(f.chapterNumber).toBe(7);
    expect(f.jumpChapter).toBeNull();
    expect(f.anchor).toBe("Milan");
  });

  it("relationship_contradiction: book-level (chapterNumber 0, no anchor, no jump)", () => {
    const [f] = toContinuityFlags({
      issues: [issue({ type: "relationship_contradiction", severity: "major", entities: ["A", "B"], chapters: [], description: "d" })],
      intentionalSignatures: NONE,
    });
    expect(f.chapterNumber).toBe(0);
    expect(f.anchor).toBeNull();
    expect(f.jumpChapter).toBeNull();
  });

  it("excludes orphan_plot_thread and character_undocumented", () => {
    const flags = toContinuityFlags({
      issues: [
        issue({ type: "orphan_plot_thread", severity: "major", chapters: [7], description: "d" }),
        issue({ type: "character_undocumented", severity: "minor", chapters: [7], description: "d" }),
      ],
      intentionalSignatures: NONE,
    });
    expect(flags).toEqual([]);
  });

  it("drops flags whose signature is marked intentional", () => {
    const sig = continuityIssueSignature(issue());
    const flags = toContinuityFlags({ issues: [issue()], intentionalSignatures: new Set([sig]) });
    expect(flags).toEqual([]);
  });
});

describe("shouldExtract", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  it("extracts when never extracted", () => { expect(shouldExtract(null, now, 90_000)).toBe(true); });
  it("skips within the min interval", () => { expect(shouldExtract(new Date(now.getTime() - 30_000), now, 90_000)).toBe(false); });
  it("extracts at exactly the min interval (boundary)", () => { expect(shouldExtract(new Date(now.getTime() - 90_000), now, 90_000)).toBe(true); });
  it("extracts after the min interval", () => { expect(shouldExtract(new Date(now.getTime() - 120_000), now, 90_000)).toBe(true); });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/continuity-flags.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/continuity/continuity-flags.ts
import { createHash } from "node:crypto";
import type { ConsistencyIssue } from "@/lib/graph/types";

const INLINE_TYPES = new Set<ConsistencyIssue["type"]>([
  "dead_character_reappears",
  "location_conflict",
  "timeline_violation",
]);
const BOOK_LEVEL_TYPES = new Set<ConsistencyIssue["type"]>(["relationship_contradiction"]);

export interface ContinuityFlagInput {
  signature: string;
  type: ConsistencyIssue["type"];
  severity: "critical" | "major" | "minor";
  description: string;
  entities: string[];
  chapterNumber: number; // primary site (0 = book-level)
  jumpChapter: number | null;
  anchor: string | null;
}

/**
 * Stable idempotency key derived from the STRUCTURED issue (type + sorted
 * entities + sorted chapters) — deliberately NOT the description text, whose
 * token order is nondeterministic (Neo4j collect()/id() ordering). This keeps
 * the signature — and therefore dedup + [Intentional] suppression — stable.
 */
export function continuityIssueSignature(issue: ConsistencyIssue): string {
  const ents = [...(issue.entities ?? [])].sort().join(",");
  const chs = [...(issue.chapters ?? [])].sort((a, b) => a - b).join(",");
  return createHash("sha1").update(`${issue.type}|${ents}|${chs}`).digest("hex");
}

/** Primary chapter (where the flag anchors inline) + the [Go to Ch N] target. */
function siteFor(issue: ConsistencyIssue): { chapterNumber: number; jumpChapter: number | null } {
  const sorted = [...(issue.chapters ?? [])].sort((a, b) => a - b);
  switch (issue.type) {
    case "dead_character_reappears":
      // chapters = [deathChapter, ...reappearanceChapters]; anchor on the earliest reappearance.
      return { chapterNumber: sorted[1] ?? sorted[0] ?? 0, jumpChapter: sorted[0] ?? null };
    case "timeline_violation":
      // chapters = [earlier, later]; the later event's name is the anchor and lives in the later chapter.
      return { chapterNumber: sorted[sorted.length - 1] ?? 0, jumpChapter: sorted[0] ?? null };
    case "location_conflict":
      return { chapterNumber: sorted[0] ?? 0, jumpChapter: null };
    default:
      return { chapterNumber: 0, jumpChapter: null }; // book-level
  }
}

export function toContinuityFlags(input: {
  issues: ConsistencyIssue[];
  intentionalSignatures: Set<string>;
}): ContinuityFlagInput[] {
  const out: ContinuityFlagInput[] = [];
  for (const issue of input.issues ?? []) {
    const isInline = INLINE_TYPES.has(issue.type);
    const isBookLevel = BOOK_LEVEL_TYPES.has(issue.type);
    if (!isInline && !isBookLevel) continue;

    const signature = continuityIssueSignature(issue);
    if (input.intentionalSignatures.has(signature)) continue;

    const { chapterNumber, jumpChapter } = siteFor(issue);
    out.push({
      signature,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      entities: Array.isArray(issue.entities) ? issue.entities : [],
      chapterNumber,
      jumpChapter,
      anchor: isInline ? (issue.entities?.[0] ?? null) : null,
    });
  }
  return out;
}

/** Time-throttle extraction: extract only if never done or older than minIntervalMs. */
export function shouldExtract(lastExtractedAt: Date | null, now: Date, minIntervalMs: number): boolean {
  if (lastExtractedAt === null) return true;
  return now.getTime() - lastExtractedAt.getTime() >= minIntervalMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/continuity-flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/continuity/continuity-flags.ts tests/unit/continuity-flags.test.ts
git commit -m "feat: pure continuity-flags — order-invariant signature + book-wide shaping (Tier 4.4)"
```

---

### Task 3: Pure flag-sync module (create/delete diff)

**Files:**
- Create: `src/lib/continuity/flag-sync.ts`
- Test: `tests/unit/flag-sync.test.ts`

**Interfaces:**
- Consumes: `ContinuityFlagInput` from `@/lib/continuity/continuity-flags` (Task 2).
- Produces:
  - `interface ExistingFlag { id: string; signature: string }`
  - `function planFlagSync(input: { detected: ContinuityFlagInput[]; existing: ExistingFlag[] }): { toCreate: ContinuityFlagInput[]; toDelete: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/flag-sync.test.ts
import { describe, it, expect } from "vitest";
import { planFlagSync } from "@/lib/continuity/flag-sync";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

function flag(sig: string): ContinuityFlagInput {
  return { signature: sig, type: "dead_character_reappears", severity: "critical", description: "d", entities: ["Ana"], chapterNumber: 18, jumpChapter: 12, anchor: "Ana" };
}

describe("planFlagSync", () => {
  it("creates newly detected flags", () => {
    const r = planFlagSync({ detected: [flag("s1")], existing: [] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s1"]);
    expect(r.toDelete).toEqual([]);
  });
  it("deletes existing flags no longer detected (resolve = delete)", () => {
    const r = planFlagSync({ detected: [], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
    expect(r.toDelete).toEqual(["f1"]);
  });
  it("no-ops a still-detected flag", () => {
    const r = planFlagSync({ detected: [flag("s1")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
    expect(r.toDelete).toEqual([]);
  });
  it("handles mixed create + delete", () => {
    const r = planFlagSync({ detected: [flag("s2")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s2"]);
    expect(r.toDelete).toEqual(["f1"]);
  });
  it("does not duplicate on an identical re-scan", () => {
    const r = planFlagSync({ detected: [flag("s1"), flag("s1")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
  });
  it("re-creates a previously-deleted (re-introduced) contradiction — no tombstone", () => {
    // existing is empty (the row was deleted when the writer fixed it); re-detecting → create again
    const r = planFlagSync({ detected: [flag("s1")], existing: [] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s1"]);
  });
  it("is a no-op on empty/empty", () => {
    expect(planFlagSync({ detected: [], existing: [] })).toEqual({ toCreate: [], toDelete: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/flag-sync.test.ts` → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/continuity/flag-sync.ts
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

export interface ExistingFlag {
  id: string;
  signature: string;
}

/**
 * Diff detected flags against existing ACTIVE flags by signature. New → create;
 * existing-but-gone → delete (resolve = delete the row, so a re-introduced
 * contradiction is created fresh — no tombstone). Book-wide symmetric: both
 * detected and existing span the whole book, so there is no cross-chapter
 * asymmetry. Idempotent: an unchanged re-scan yields empty create/delete.
 */
export function planFlagSync(input: {
  detected: ContinuityFlagInput[];
  existing: ExistingFlag[];
}): { toCreate: ContinuityFlagInput[]; toDelete: string[] } {
  const detectedSigs = new Set(input.detected.map((f) => f.signature));
  const existingSigs = new Set(input.existing.map((e) => e.signature));

  const seen = new Set<string>();
  const toCreate: ContinuityFlagInput[] = [];
  for (const f of input.detected) {
    if (existingSigs.has(f.signature)) continue;
    if (seen.has(f.signature)) continue;
    seen.add(f.signature);
    toCreate.push(f);
  }

  const toDelete = input.existing.filter((e) => !detectedSigs.has(e.signature)).map((e) => e.id);

  return { toCreate, toDelete };
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/continuity/flag-sync.ts tests/unit/flag-sync.test.ts
git commit -m "feat: pure flag-sync diff (create/delete, no tombstone) for live continuity (Tier 4.4)"
```

---

### Task 4: Graph query — chapter node last-extraction timestamp

**Files:**
- Modify: `src/lib/graph/graph-queries.ts` (append near the other query fns)

**Interfaces:**
- Produces: `function getChapterNodeUpdatedAt(bookId: string, chapterNumber: number): Promise<Date | null>`

- [ ] **Step 1: Add the query** (append after `getBookCharacterStates`, before `runConsistencyChecks`):

```ts
/**
 * When the Chapter node was last (re)extracted into the graph — used to
 * time-throttle re-extraction on the live continuity scan. Null if never
 * extracted. Note: c.updatedAt is written via Cypher datetime(), so the driver
 * returns a temporal object, not a string — coerce via toString() before Date.
 */
export async function getChapterNodeUpdatedAt(
  bookId: string,
  chapterNumber: number
): Promise<Date | null> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Chapter {bookId: $bookId, chapterNumber: $chapterNumber})
       RETURN c.updatedAt AS updatedAt`,
      { bookId, chapterNumber }
    );
    const raw: unknown = result.records[0]?.get("updatedAt");
    if (raw === null || raw === undefined) return null;
    const d = new Date(String(raw));
    return isNaN(d.getTime()) ? null : d;
  });
}
```

- [ ] **Step 2: Type-check** → `npx tsc --noEmit` exit 0. *(No unit test — integration-verified graph query; exercised via the route mock in Task 5 + deferred live smoke.)*

- [ ] **Step 3: Commit**

```bash
git add src/lib/graph/graph-queries.ts
git commit -m "feat: getChapterNodeUpdatedAt (temporal-safe) for live-scan throttle (Tier 4.4)"
```

---

### Task 5: continuity scan route

**Files:**
- Create: `src/app/api/books/[id]/continuity/scan/route.ts`
- Test: `tests/unit/continuity-scan-route.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `db` (`db.book`, `db.continuityFlag`), `updateFromChapter`, `runConsistencyChecks` + `getChapterNodeUpdatedAt`, `DocumentService`, `toContinuityFlags`/`shouldExtract` (Task 2), `planFlagSync` (Task 3).
- Produces: `POST` handler returning `{ flags: ScanFlag[] }` where `ScanFlag = ContinuityFlagInput & { id: string }`. 200 on all non-auth/ownership/validation errors (best-effort).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/continuity-scan-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    continuityFlag: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  },
  updateFromChapter: vi.fn(),
  runConsistencyChecks: vi.fn(),
  getChapterNodeUpdatedAt: vi.fn(),
  findByType: vi.fn(),
  readPinned: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/graph/graph-maintenance", () => ({ updateFromChapter: h.updateFromChapter }));
vi.mock("@/lib/graph/graph-queries", () => ({
  runConsistencyChecks: h.runConsistencyChecks,
  getChapterNodeUpdatedAt: h.getChapterNodeUpdatedAt,
}));
vi.mock("@/lib/documents/document-service", () => ({
  DocumentService: class {
    findByType = h.findByType;
    readPinned = h.readPinned;
  },
}));
vi.mock("@/generated/prisma/enums", () => ({ DocumentType: { CHAPTER_CONTENT: "CHAPTER_CONTENT" } }));

import { POST } from "@/app/api/books/[id]/continuity/scan/route";

const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(qs: string) {
  return new Request(`http://t/api/books/b1/continuity/scan${qs}`, { method: "POST" });
}
const deadIssue = {
  type: "dead_character_reappears", severity: "critical",
  description: 'Character "Ana" dies in chapter 12 but participates in events in chapters 18.',
  entities: ["Ana"], chapters: [12, 18],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.continuityFlag.findMany.mockResolvedValue([]);       // no existing/intentional
  h.db.continuityFlag.upsert.mockResolvedValue({ id: "new1" });
  h.db.continuityFlag.deleteMany.mockResolvedValue({ count: 0 });
  h.updateFromChapter.mockResolvedValue({ updated: true, entitiesFound: 3 });
  h.getChapterNodeUpdatedAt.mockResolvedValue(null);
  h.findByType.mockResolvedValue({ id: "doc1" });
  h.readPinned.mockResolvedValue({ content: "Ana walked in.", document: { currentVersion: 1 } });
  h.runConsistencyChecks.mockResolvedValue([deadIssue]);
});

describe("POST /continuity/scan", () => {
  it("401s when auth fails", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    expect((await POST(req("?chapterNumber=18") as never, ctx as never)).status).toBe(401);
  });
  it("404s when the book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    expect((await POST(req("?chapterNumber=18") as never, ctx as never)).status).toBe(404);
  });
  it("400s on invalid chapterNumber", async () => {
    expect((await POST(req("") as never, ctx as never)).status).toBe(400);
  });
  it("scopes ownership by userId", async () => {
    await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(h.db.book.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "b1", userId: "u1" }) }));
  });

  it("extracts (positive) then detects, upserts a flag, and returns it with an id", async () => {
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(h.updateFromChapter).toHaveBeenCalledWith("b1", 18, "Ana walked in.");
    const up = h.db.continuityFlag.upsert.mock.calls[0][0];
    expect(up.where.bookId_signature.bookId).toBe("b1");
    expect(up.create.type).toBe("dead_character_reappears");
    expect(up.create.severity).toBe("critical"); // graph vocab, no mapping
    expect(up.create.status).toBe("active");
    expect(json.flags).toHaveLength(1);
    expect(json.flags[0].id).toBe("new1");
  });

  it("throttles extraction when the chapter was extracted recently", async () => {
    h.getChapterNodeUpdatedAt.mockResolvedValue(new Date(Date.now() - 10_000));
    await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(h.updateFromChapter).not.toHaveBeenCalled();
    expect(h.runConsistencyChecks).toHaveBeenCalled(); // check still runs
  });

  it("still runs the check (200) when extraction throws", async () => {
    h.findByType.mockRejectedValue(new Error("storage down"));
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.runConsistencyChecks).toHaveBeenCalled();
  });
  it("still runs the check (200) when updateFromChapter itself throws", async () => {
    h.updateFromChapter.mockRejectedValue(new Error("neo4j down"));
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.runConsistencyChecks).toHaveBeenCalled();
  });

  it("returns {flags:[]} and deletes NOTHING when the check throws", async () => {
    h.runConsistencyChecks.mockRejectedValue(new Error("cypher error"));
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "f1", signature: "sig1", status: "active" }]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.flags).toEqual([]);
    expect(h.db.continuityFlag.deleteMany).not.toHaveBeenCalled();
  });

  it("filters out an intentional-status flag and does not recreate it", async () => {
    const { continuityIssueSignature } = await import("@/lib/continuity/continuity-flags");
    const sig = continuityIssueSignature(deadIssue as never);
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "i1", signature: sig, status: "intentional" }]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(json.flags).toEqual([]);
    expect(h.db.continuityFlag.upsert).not.toHaveBeenCalled();
  });

  it("deletes stale ACTIVE flags no longer detected", async () => {
    h.runConsistencyChecks.mockResolvedValue([]); // nothing detected
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "f1", signature: "sig1", status: "active" }]);
    await POST(req("?chapterNumber=18") as never, ctx as never);
    const del = h.db.continuityFlag.deleteMany.mock.calls[0][0];
    expect(del.where.id).toEqual({ in: ["f1"] });
    expect(del.where.bookId).toBe("b1");
  });

  it("does NOT resolve/delete cross-chapter flags — a ch7 issue still detected survives a ch18 scan", async () => {
    // runConsistencyChecks is book-wide: it returns BOTH the ch18 dead issue and a ch7 location issue.
    const ch7 = { type: "location_conflict", severity: "major", description: "Milan in two places, ch7", entities: ["Milan"], chapters: [7] };
    h.runConsistencyChecks.mockResolvedValue([deadIssue, ch7]);
    const { continuityIssueSignature } = await import("@/lib/continuity/continuity-flags");
    const ch7sig = continuityIssueSignature(ch7 as never);
    h.db.continuityFlag.findMany.mockResolvedValue([{ id: "f7", signature: ch7sig, status: "active" }]);
    await POST(req("?chapterNumber=18") as never, ctx as never);
    // f7 is still detected (book-wide) → NOT deleted
    if (h.db.continuityFlag.deleteMany.mock.calls.length) {
      const del = h.db.continuityFlag.deleteMany.mock.calls[0][0];
      expect(del.where.id.in).not.toContain("f7");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (no route module).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/books/[id]/continuity/scan/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateFromChapter } from "@/lib/graph/graph-maintenance";
import { runConsistencyChecks, getChapterNodeUpdatedAt } from "@/lib/graph/graph-queries";
import { DocumentService } from "@/lib/documents/document-service";
import { DocumentType } from "@/generated/prisma/enums";
import { toContinuityFlags, shouldExtract, type ContinuityFlagInput } from "@/lib/continuity/continuity-flags";
import { planFlagSync, type ExistingFlag } from "@/lib/continuity/flag-sync";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };
const querySchema = z.object({ chapterNumber: z.coerce.number().int().positive() });

const EXTRACT_MIN_INTERVAL_MS = 90_000;
const GRAPH_TIMEOUT_MS = 5000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("graph timeout")), ms)),
  ]);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const parsed = querySchema.safeParse({
      chapterNumber: new URL(request.url).searchParams.get("chapterNumber"),
    });
    if (!parsed.success) return NextResponse.json({ error: "Invalid chapterNumber" }, { status: 400 });
    const chapterNumber = parsed.data.chapterNumber;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ── Throttled graph refresh (best-effort; failure never 500s). ──
    try {
      const lastExtracted = await withTimeout(getChapterNodeUpdatedAt(bookId, chapterNumber), GRAPH_TIMEOUT_MS);
      if (shouldExtract(lastExtracted, new Date(), EXTRACT_MIN_INTERVAL_MS)) {
        const svc = new DocumentService(user.id, bookId);
        const doc = await svc.findByType(DocumentType.CHAPTER_CONTENT, chapterNumber);
        if (doc) {
          const content = (await svc.readPinned(doc.id))?.content ?? "";
          await updateFromChapter(bookId, chapterNumber, content);
        }
      }
    } catch (err) {
      console.error("[continuity-scan] extraction skipped:", err);
    }

    // ── Detect (pure Cypher, book-wide). On failure: empty, delete NOTHING. ──
    let issues;
    try {
      issues = await withTimeout(runConsistencyChecks(bookId), GRAPH_TIMEOUT_MS);
    } catch (err) {
      console.error("[continuity-scan] check failed:", err);
      return NextResponse.json({ flags: [] });
    }

    // ── Load existing flags (active for the diff; intentional for the filter). ──
    const rows = await db.continuityFlag.findMany({
      where: { bookId },
      select: { id: true, signature: true, status: true },
    });
    const intentionalSignatures = new Set(rows.filter((r) => r.status === "intentional").map((r) => r.signature));
    const existing: ExistingFlag[] = rows.filter((r) => r.status === "active").map((r) => ({ id: r.id, signature: r.signature }));

    const detected = toContinuityFlags({ issues, intentionalSignatures });
    const { toCreate, toDelete } = planFlagSync({ detected, existing });

    for (const f of toCreate) {
      await db.continuityFlag.upsert({
        where: { bookId_signature: { bookId, signature: f.signature } },
        create: {
          bookId,
          chapterNumber: f.chapterNumber,
          signature: f.signature,
          type: f.type,
          severity: f.severity,
          description: f.description,
          entities: JSON.stringify(f.entities),
          anchor: f.anchor,
          jumpChapter: f.jumpChapter,
          status: "active",
        },
        update: {}, // already active with this signature → no-op
      });
    }
    if (toDelete.length > 0) {
      await db.continuityFlag.deleteMany({ where: { id: { in: toDelete }, bookId } });
    }

    // ── Return all ACTIVE flags with their ids (client needs id for [Intentional]). ──
    const active = await db.continuityFlag.findMany({
      where: { bookId, status: "active" },
      select: { id: true, signature: true, type: true, severity: true, description: true, entities: true, chapterNumber: true, jumpChapter: true, anchor: true },
    });
    const flags = active.map((r) => ({
      id: r.id,
      signature: r.signature,
      type: r.type as ContinuityFlagInput["type"],
      severity: r.severity as ContinuityFlagInput["severity"],
      description: r.description,
      entities: JSON.parse(r.entities || "[]") as string[],
      chapterNumber: r.chapterNumber,
      jumpChapter: r.jumpChapter,
      anchor: r.anchor,
    }));

    return NextResponse.json({ flags });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[continuity-scan]", error);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/books/[id]/continuity/scan/route.ts" tests/unit/continuity-scan-route.test.ts
git commit -m "feat: continuity scan route — book-wide symmetric sync + timeouts (Tier 4.4)"
```

---

### Task 6: intentional route

**Files:**
- Create: `src/app/api/books/[id]/continuity/intentional/route.ts`
- Test: `tests/unit/continuity-intentional-route.test.ts`

**Interfaces:**
- Produces: `POST` handler; body `{ flagId: string }`; flips the flag's `status` to `"intentional"` (fenced to the owned book). No EditFinding/WriterMemory.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/continuity-intentional-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { findFirst: vi.fn() }, continuityFlag: { updateMany: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));

import { POST } from "@/app/api/books/[id]/continuity/intentional/route";
const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/continuity/intentional", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.continuityFlag.updateMany.mockResolvedValue({ count: 1 });
});

describe("POST /continuity/intentional", () => {
  it("401 / 404 / 400 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ flagId: "f1" }) as never, ctx as never)).status).toBe(401);
    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await POST(req({ flagId: "f1" }) as never, ctx as never)).status).toBe(404);
    expect((await POST(req({}) as never, ctx as never)).status).toBe(400);
  });

  it("flips the flag to intentional, fenced to the owned book", async () => {
    const res = await POST(req({ flagId: "f1" }) as never, ctx as never);
    expect(res.status).toBe(200);
    const call = h.db.continuityFlag.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "f1", bookId: "b1" });
    expect(call.data.status).toBe("intentional");
  });

  it("404s when the flag is not in the owned book (updateMany count 0)", async () => {
    h.db.continuityFlag.updateMany.mockResolvedValue({ count: 0 });
    expect((await POST(req({ flagId: "x" }) as never, ctx as never)).status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/books/[id]/continuity/intentional/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };
const bodySchema = z.object({ flagId: z.string().min(1) });

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: "flagId required" }, { status: 400 });

    // Fenced to the owned book; updateMany count tells us if it matched.
    const result = await db.continuityFlag.updateMany({
      where: { id: parsed.data.flagId, bookId },
      data: { status: "intentional" },
    });
    if (result.count === 0) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[continuity-intentional]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/books/[id]/continuity/intentional/route.ts" tests/unit/continuity-intentional-route.test.ts
git commit -m "feat: continuity intentional route — status flip (Tier 4.4)"
```

---

### Task 7: annotation type + tooltip variant + flag→annotation mapper

**Files:**
- Modify: `src/components/editor/annotation-extension.ts` (add `"continuity"` type + class)
- Modify: `src/components/editor/annotation-tooltip.tsx` (add `TYPE_CONFIG.continuity` + `onGoToChapter`/`onIntentional`/`jumpChapter` props + buttons)
- Create: `src/lib/continuity/flag-annotations.ts` (`continuityFlagsToAnnotations`)
- Test: `tests/unit/flag-annotations.test.ts`

**Interfaces:**
- Consumes: `ContinuityFlagInput` (Task 2) extended to `ScanFlag = ContinuityFlagInput & { id: string }`; `AnnotationItem` from `@/components/editor/annotation-extension`.
- Produces: `function continuityFlagsToAnnotations(flags: ScanFlag[], currentChapter: number): AnnotationItem[]`

- [ ] **Step 1: Add the annotation type**

In `src/components/editor/annotation-extension.ts`: extend the `AnnotationType` union (line 17) with `| "continuity"`, and add `continuity: "anno-continuity",` to `TYPE_CLASSES` (line 32-41). *(Both maps are total `Record<AnnotationType,…>`, so tsc requires both edits.)*

- [ ] **Step 2: Add the tooltip variant**

In `src/components/editor/annotation-tooltip.tsx`:
- Add `MapPin` to the EXISTING lucide import line (`import { Check, X } from "lucide-react";` → `import { Check, MapPin, X } from "lucide-react";`). **`Check` is already imported — do NOT add a second import.**
- Add to `TYPE_CONFIG` (line 28-72): `continuity: { label: "Continuity", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30" },`
- Add to `AnnotationTooltipProps` (after `onDiscuss?`): `onGoToChapter?: () => void; onIntentional?: () => void; jumpChapter?: number | null;`
- In the button row, when `annotationType === "continuity"`, render the continuity actions INSTEAD of accept/reject (read the existing button JSX ~lines 200-235 and mirror the `Button` usage):
```tsx
{annotationType === "continuity" ? (
  <>
    {onGoToChapter && jumpChapter != null && (
      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onGoToChapter}>
        <MapPin className="h-3 w-3" /> Go to Ch {jumpChapter}
      </Button>
    )}
    {onIntentional && (
      <Button variant="secondary" size="sm" className="h-7 text-xs gap-1" onClick={onIntentional}>
        <Check className="h-3 w-3" /> Intentional
      </Button>
    )}
  </>
) : (
  /* existing accept/reject/discuss buttons unchanged */
)}
```

- [ ] **Step 3: Write the failing mapper test**

```ts
// tests/unit/flag-annotations.test.ts
import { describe, it, expect } from "vitest";
import { continuityFlagsToAnnotations } from "@/lib/continuity/flag-annotations";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

type ScanFlag = ContinuityFlagInput & { id: string };
function flag(over: Partial<ScanFlag> = {}): ScanFlag {
  return { id: "f1", signature: "s1", type: "dead_character_reappears", severity: "critical", description: "Ana died Ch12", entities: ["Ana"], chapterNumber: 18, jumpChapter: 12, anchor: "Ana", ...over };
}

describe("continuityFlagsToAnnotations", () => {
  it("maps an anchored current-chapter flag to a continuity annotation on the entity name", () => {
    const a = continuityFlagsToAnnotations([flag()], 18);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "continuity", text: "Ana", description: "Ana died Ch12", findingId: "f1" });
    expect(a[0].id).toBe("continuity-f1");
  });
  it("skips flags whose primary chapter is not the current chapter (they show in the indicator)", () => {
    expect(continuityFlagsToAnnotations([flag({ chapterNumber: 7 })], 18)).toEqual([]);
  });
  it("skips book-level flags with no anchor", () => {
    expect(continuityFlagsToAnnotations([flag({ chapterNumber: 0, anchor: null })], 0)).toEqual([]);
  });
});
```

- [ ] **Step 4: Write the mapper**

```ts
// src/lib/continuity/flag-annotations.ts
import type { AnnotationItem } from "@/components/editor/annotation-extension";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

type ScanFlag = ContinuityFlagInput & { id: string };

/** Map the current chapter's anchored live flags to inline annotations.
 *  Other-chapter and book-level flags are skipped (they surface in the indicator). */
export function continuityFlagsToAnnotations(flags: ScanFlag[], currentChapter: number): AnnotationItem[] {
  const out: AnnotationItem[] = [];
  for (const f of flags) {
    if (f.chapterNumber !== currentChapter || !f.anchor) continue;
    out.push({ id: `continuity-${f.id}`, type: "continuity", text: f.anchor, description: f.description, findingId: f.id });
  }
  return out;
}
```

- [ ] **Step 5: Run tests + type-check** → `npx vitest run tests/unit/flag-annotations.test.ts` PASS; `npx tsc --noEmit` exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/annotation-extension.ts src/components/editor/annotation-tooltip.tsx src/lib/continuity/flag-annotations.ts tests/unit/flag-annotations.test.ts
git commit -m "feat: continuity annotation type + tooltip variant + current-chapter mapper (Tier 4.4)"
```

---

### Task 8: client scan hook, idle trigger, indicator, editor wiring

**Files:**
- Create: `src/hooks/use-continuity-scan.ts` (`useContinuityScan` + `useIdleContinuityScan`)
- Create: `src/components/editor/continuity-indicator.tsx`
- Modify: `src/components/editor/manuscript-editor.tsx` (per-edit activity counter, idle trigger, merge current-chapter continuity annotations, render-site tooltip routing, mount indicator)
- Test: none (node-env suite; gated by `tsc` + `next build`)

**Interfaces:**
- Consumes: `fetchJson` (`@/lib/api-client`), `continuityFlagsToAnnotations` (Task 7), `ContinuityFlagInput` (Task 2), the scan/intentional routes, the pane store `setScrollToText`, `allChapters` (ManuscriptEditorProps), the editor `onUpdate`.

- [ ] **Step 1: Create the scan hook + idle trigger**

```ts
// src/hooks/use-continuity-scan.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import type { ContinuityFlagInput } from "@/lib/continuity/continuity-flags";

export type ScanFlag = ContinuityFlagInput & { id: string };

export function useContinuityScan(bookId: string) {
  const [flags, setFlags] = useState<ScanFlag[]>([]);
  const [scanning, setScanning] = useState(false);
  const inFlight = useRef(false);

  const scan = useCallback(async (chapterNumber: number) => {
    if (inFlight.current) return; // per-instance coalescing (multi-tab is server-idempotent)
    inFlight.current = true;
    setScanning(true);
    try {
      const res = await fetchJson<{ flags: ScanFlag[] }>(
        `/api/books/${bookId}/continuity/scan?chapterNumber=${chapterNumber}`,
        { method: "POST" }
      );
      setFlags(res.flags ?? []);
    } catch {
      /* best-effort: keep prior flags, never surface an error */
    } finally {
      inFlight.current = false;
      setScanning(false);
    }
  }, [bookId]);

  const markIntentional = useCallback(async (flagId: string) => {
    try {
      await fetchJson(`/api/books/${bookId}/continuity/intentional`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId }),
      });
      setFlags((prev) => prev.filter((f) => f.id !== flagId));
    } catch { /* next scan reconciles */ }
  }, [bookId]);

  return { flags, scanning, scan, markIntentional };
}

/** Scan ~debounceMs after the last EDIT (activityKey must change per keystroke),
 *  and immediately on chapter switch. */
export function useIdleContinuityScan(opts: {
  chapterNumber: number | null;
  activityKey: number; // a monotonically-increasing per-edit counter
  scan: (chapterNumber: number) => void;
  debounceMs?: number;
}) {
  const { chapterNumber, activityKey, scan, debounceMs = 20_000 } = opts;

  useEffect(() => {
    if (chapterNumber == null) return;
    scan(chapterNumber);
  }, [chapterNumber, scan]);

  useEffect(() => {
    if (chapterNumber == null) return;
    const t = setTimeout(() => scan(chapterNumber), debounceMs);
    return () => clearTimeout(t);
  }, [activityKey, chapterNumber, scan, debounceMs]);
}
```

- [ ] **Step 2: Create the indicator**

```tsx
// src/components/editor/continuity-indicator.tsx
"use client";

import { AlertTriangleIcon, Loader2Icon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ScanFlag } from "@/hooks/use-continuity-scan";

interface ContinuityIndicatorProps {
  flags: ScanFlag[];
  currentChapter: number | null;
  scanning: boolean;
}

/** Quiet live-continuity status: silent when clean; a count (with "here/elsewhere"
 *  split) when contradictions exist. */
export function ContinuityIndicator({ flags, currentChapter, scanning }: ContinuityIndicatorProps) {
  if (scanning && flags.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" /> checking…
      </span>
    );
  }
  if (flags.length === 0) return null;
  const here = flags.filter((f) => f.chapterNumber === currentChapter).length;
  const label = here > 0 ? `${here} here` + (flags.length > here ? ` · ${flags.length - here} elsewhere` : "") : `${flags.length} continuity`;
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-orange-600 border-orange-300">
      <AlertTriangleIcon className="size-3" /> {label}
    </Badge>
  );
}
```

- [ ] **Step 3: Wire into the editor**

In `src/components/editor/manuscript-editor.tsx`:
1. Import `useContinuityScan`, `useIdleContinuityScan`, `ContinuityIndicator`, `continuityFlagsToAnnotations`.
2. **Per-edit activity counter (the idle trigger needs a value that changes on EVERY keystroke — `isDirty` is sticky and won't work):** add `const [editTick, setEditTick] = useState(0);` and increment it inside the editor's `onUpdate` handler (search `onUpdate` ~line 308, where it calls `markDirty()`): add `setEditTick((n) => n + 1);` alongside the existing `markDirty()` call.
3. Instantiate: `const { flags: continuityFlags, scanning: continuityScanning, scan: continuityScan, markIntentional } = useContinuityScan(bookId);`
4. Drive the idle trigger: `useIdleContinuityScan({ chapterNumber, activityKey: editTick, scan: continuityScan });`
5. Merge ONLY the current chapter's continuity annotations into the annotation set (find where `findingsToAnnotations(findings)` is set as annotations, ~lines 218-268/328-341):
```ts
const annotations = [...findingsToAnnotations(findings), ...continuityFlagsToAnnotations(continuityFlags, chapterNumber)];
```
6. **Tooltip routing at the RENDER site (NOT in the baked click handler — that closure is frozen at editor construction and continuityFlags is empty then):** at the tooltip render site (~lines 1183-1220), when `tooltipState.annotationType === "continuity"`, resolve the flag from live state by stripping the `continuity-` prefix off the annotation id:
```ts
const continuityFlag = tooltipState.annotationType === "continuity"
  ? continuityFlags.find((f) => `continuity-${f.id}` === tooltipState.annotationId)
  : undefined;
```
Pass to `<AnnotationTooltip>`: `description={continuityFlag?.description ?? finding?.description ?? "Annotation"}`, `jumpChapter={continuityFlag?.jumpChapter ?? null}`, `onIntentional={continuityFlag ? () => markIntentional(continuityFlag.id) : undefined}`, and `onGoToChapter` (see step 7). Also ensure the click handler that builds `tooltipState` does NOT strip `finding-` off a `continuity-` id (guard: only strip `finding-` when the id starts with `finding-`).
7. **`[Go to Ch N]` navigation** (guard `allChapters`, use `guardedNavigate`, let the target chapter's load-effect apply the scroll — do NOT fire `setScrollToText` against the current doc):
```ts
onGoToChapter={continuityFlag && continuityFlag.jumpChapter != null && continuityFlag.jumpChapter !== chapterNumber
  ? () => {
      const target = allChapters?.find((c) => c.chapterNumber === continuityFlag.jumpChapter);
      if (!target) return;
      paneStore.getState().setScrollToText(continuityFlag.anchor ?? "");
      guardedNavigate(`/books/${bookId}/chapters/${target.id}`); // reuse the editor's existing guarded nav
    }
  : undefined}
```
*(Gate on `jumpChapter !== chapterNumber` so the button never renders a no-op self-jump. Setting `scrollToText` BEFORE navigation lets the target chapter's mount-time re-arm apply it against the freshly-loaded doc — the same pattern as the editorial "show in text" flow — instead of firing against the current chapter's doc and clearing itself.)*
8. Mount `<ContinuityIndicator flags={continuityFlags} currentChapter={chapterNumber} scanning={continuityScanning} />` near the toolbar's panel toggles (beside the findings/series toggles).

*(Additive edits only — do not disturb autosave, findings, version-history, or series-context wiring. Confirm `guardedNavigate`, `allChapters`, `chapterNumber`, `paneStore`, and the annotation-push + tooltip-render sites are in scope where you edit. `allChapters` is optional — the `?.find` guard handles undefined.)*

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run` → full suite green.
Run: `npx next build` → compiles (a failure ONLY on the local `.env` placeholder assertion is acceptable; a TS/lint/RSC error is not).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-continuity-scan.ts src/components/editor/continuity-indicator.tsx src/components/editor/manuscript-editor.tsx
git commit -m "feat: live continuity scan hook + per-edit idle trigger + indicator + editor wiring (Tier 4.4)"
```

---

### Task 9: Roadmap update + verification gate

**Files:**
- Modify: `docs/IMPROVEMENT-ROADMAP.md`

- [ ] **Step 1: Mark 4.4 shipped**

Under `### 4.4 Live continuity safety net`, prepend a `✅ SHIPPED 2026-07-02` note mirroring 4.1–4.3: deterministic graph-consistency live net (dead-reappears / location-conflict / timeline-violation inline + relationship-contradiction book-level), idle-triggered (per-edit debounce), throttled haiku extraction, stored in a **dedicated `ContinuityFlag` table** (no `EditFinding`/editorial-surface contamination), book-wide symmetric idempotent sync (resolve = delete row; order-invariant signature), `[Go to Ch N]` + `[Intentional]` (status flip), never-500 degradation + graph timeouts. **Deploy gate:** needs `prisma db push` (new model). Deferred: attribute-level (rank/title) LLM detection (phase 2), orphan-thread nudge, pause toggle, server-side scan rate-limit, 4.2 learning-loop reuse. Update the top progress banner.

- [ ] **Step 2: Full verification gate**

Run: `npx tsc --noEmit` → 0. Run: `npx vitest run` → all green (report count). Run: `npx next build` → compiles.

- [ ] **Step 3: Commit**

```bash
git add docs/IMPROVEMENT-ROADMAP.md
git commit -m "docs: mark Tier 4.4 live continuity net shipped"
```

---

## Deferred verification (documented, not silently claimed)

Live DB/Neo4j unreachable here. Requires a live stack:
- **DEPLOY GATE: `npx prisma db push`** must run against dev/prod before 4.4 works there (new `ContinuityFlag` model) — 4.4 will 500 on `/continuity/scan` until then.
- A real death-reappears flag appearing on idle after the graph extracts the current chapter.
- `[Go to Ch N]` cross-chapter navigation + scroll-to-entity via the target chapter's load-effect.
- `[Intentional]` round-trip flipping status and suppressing on re-scan.
- Extraction-throttle cost behavior under sustained writing.

## Known follow-ups (deferred, documented)

- **Server-side scan rate-limit.** The route wraps graph calls in `withTimeout` (a stalled Neo4j degrades in ~5s), and legitimate use is bounded by auth + client in-flight coalescing + the 20s idle debounce. A dedicated per-user/-book rate-limit (à la `/discuss`'s 200/24h) against a scripted-loop abuser is a fast follow-up, not shipped in v1.
- **Multi-tab concurrency.** `inFlight` coalesces within one editor instance only; two tabs can issue concurrent scans. The book-wide symmetric sync makes divergent concurrent scans self-healing (a wrongly-deleted flag is re-created on the next scan; upsert-on-unique makes creates race-safe), so this is a transient, self-correcting flap — documented, not blocking.
- **Phase 2 — attribute-level detection** (rank/title/appearance) via a cheap LLM/embedding pass emitting the same `ContinuityFlagInput` shape into this pipeline (catches "became a Major in Ch 15").
- `orphan_plot_thread` as a gentle 4.3-style nudge; a per-book "pause live continuity" toggle; carrying the `[Intentional]` decision into the Tier-1.4 learning loop (dropped from v1 with the EditFinding pivot).

## Self-review notes

- **Spec coverage:** spec §4 types → Task 2; §5 cadence/throttle → Tasks 2 (`shouldExtract`) + 4 + 5 + 8 (per-edit idle); §6 sync/intentional → Tasks 3,5,6; §7 UX → Tasks 7,8; §8 degradation/security → Task 5 (never-500, delete-only-on-success, ownership, book-scope, timeouts, zod) + Task 6 (fence, ownership). The spec's "persist as EditFinding / no schema change" is superseded by the dedicated-table pivot (review-driven) — §10/§11 and the roadmap note the migration/deploy gate.
- **Review remediation (28 confirmed findings folded):** the 7-HIGH `EditFinding` leak/cross-chapter/tombstone/double-annotation cluster → **dedicated `ContinuityFlag` table** + **book-wide symmetric sync** (Tasks 1,2,3,5); signature nondeterminism → **order-invariant structured signature** (Task 2); no query timeout → **`withTimeout`** (Task 5); rate-limit → documented follow-up; idle `activityKey` → **per-edit `editTick` counter** (Task 8); frozen click handler → **render-site routing** (Task 8); `[Go to Ch N]` scroll race / `allChapters` optional / `guardedNavigate` / self-jump → **Task 8 step 7**; extraction test false-green → **DocumentService + db mocked, positive assertion** (Task 5); Neo4j temporal cast → **`String(raw)`** (Task 4); duplicate `Check` import → **only add `MapPin`** (Task 7); timeline/dead-char anchor + no-op jump → **primary-site `chapterNumber` where the anchor lives + `jumpChapter !== currentChapter` gate** (Tasks 2,8).
- **Type consistency:** `ContinuityFlagInput` (Task 2) → `ScanFlag = +{id}` (Tasks 5/8) → mapper (Task 7); `ExistingFlag` (Task 3); severity stays graph vocab (critical|major|minor) end-to-end — no mapping, the dedicated table stores it directly.
- **No placeholders:** every code step is complete; Task 8's editor-wiring directives name the exact call sites and patterns.
