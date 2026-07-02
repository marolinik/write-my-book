# Live In-Book Continuity Net (Tier 4.4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a writer pauses, detect deterministic graph-consistency contradictions in the current chapter and surface them as non-blocking inline flags with `[Go to Ch N]` / `[Intentional]` actions — no LLM in the detector, idempotent, cost-bounded.

**Architecture:** Two pure modules (flag shaping + sync diff) + a thin best-effort `POST /continuity/scan` route (throttled haiku extraction → cheap Cypher `runConsistencyChecks` → idempotent `EditFinding` sync) + a tiny `POST /continuity/intentional` route + a client idle-trigger and a new `"continuity"` annotation type. Reuses the graph, `EditFinding`, the 4.2 constraint path, and the annotation/tooltip pipeline. Additive — no schema change, no migration.

**Tech Stack:** Next.js App Router, Prisma (`db`), Neo4j (`src/lib/graph`), Zod, TanStack Query, TipTap/ProseMirror decorations, `node:crypto`, Vitest (node env), TypeScript strict.

## Global Constraints

- **TypeScript strict, no `any`** — `unknown` + narrowing; explicit types on exports.
- **Immutability** — never mutate inputs.
- **Zod at the boundary** — validate `chapterNumber` (query) and the intentional body.
- **Unit tests in `tests/unit/**/*.test.ts`**, `environment: "node"`. **No component/RTL tests** (no jsdom); UI gated by `tsc` + `next build`. Route-test style: `vi.hoisted` + `vi.mock("@/lib/auth"|"@/lib/db"|...)` (see `tests/unit/series-context-route.test.ts`).
- **Read-mostly / cost-bounded:** the detector is pure Cypher (no LLM); the only LLM is the throttled `updateFromChapter` (haiku). No agent session. `console.error` only in a catch.
- **Persistence fencing:** live findings use `agentType = "continuity-live"` and `category = "continuity"`; the issue signature is stored in `contentHash`. ALL live-finding queries/writes filter `agentType = "continuity-live"` so they never touch editorial or on-demand-continuity findings.
- **Severity mapping:** graph severity → `EditFinding.severity`: `critical→"critical"`, `major→"important"`, `minor→"suggestion"`.
- **`ConsistencyIssue`** imports from `@/lib/graph/types`; `DocumentType` from `@/generated/prisma/enums`.
- Run commands from `D:\Projects\wmb-pub` (Windows / Git Bash). Test: `npx vitest run <file>`. Types: `npx tsc --noEmit`.

---

### Task 1: Pure continuity-flags module (signature, flag shaping, severity map, extract throttle)

**Files:**
- Create: `src/lib/continuity/continuity-flags.ts`
- Test: `tests/unit/continuity-flags.test.ts`

**Interfaces:**
- Consumes: `ConsistencyIssue` from `@/lib/graph/types` — shape `{ type: "character_undocumented"|"location_conflict"|"timeline_violation"|"dead_character_reappears"|"orphan_plot_thread"|"relationship_contradiction"; severity: "critical"|"major"|"minor"; description: string; entities: string[]; chapters: number[] }`.
- Produces (all exported):
  - `interface LiveFlag { signature: string; type: ConsistencyIssue["type"]; severity: "critical"|"major"|"minor"; description: string; entities: string[]; currentChapter: number; jumpChapter: number | null; anchor: string | null }`
  - `function continuityIssueSignature(issue: ConsistencyIssue): string`
  - `function toLiveFlags(input: { issues: ConsistencyIssue[]; currentChapter: number; intentionalSignatures: Set<string> }): LiveFlag[]`
  - `function mapSeverityToFinding(sev: "critical"|"major"|"minor"): "critical"|"important"|"suggestion"`
  - `function shouldExtract(lastExtractedAt: Date | null, now: Date, minIntervalMs: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/continuity-flags.test.ts
import { describe, it, expect } from "vitest";
import {
  continuityIssueSignature,
  toLiveFlags,
  mapSeverityToFinding,
  shouldExtract,
} from "@/lib/continuity/continuity-flags";
import type { ConsistencyIssue } from "@/lib/graph/types";

function issue(over: Partial<ConsistencyIssue> = {}): ConsistencyIssue {
  return {
    type: "dead_character_reappears",
    severity: "critical",
    description: 'Character "Ana" dies in chapter 12 but participates in events in chapters 18.',
    entities: ["Ana"],
    chapters: [12, 18],
    ...over,
  };
}

describe("continuityIssueSignature", () => {
  it("is deterministic and stable for the same issue", () => {
    expect(continuityIssueSignature(issue())).toBe(continuityIssueSignature(issue()));
  });
  it("differs by type and by description", () => {
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ type: "timeline_violation" })));
    expect(continuityIssueSignature(issue())).not.toBe(continuityIssueSignature(issue({ description: "different" })));
  });
  it("ignores whitespace noise in the description", () => {
    expect(continuityIssueSignature(issue({ description: "a  b" }))).toBe(continuityIssueSignature(issue({ description: "a b" })));
  });
});

describe("toLiveFlags", () => {
  const NONE = new Set<string>();

  it("keeps only issues touching the current chapter", () => {
    const flags = toLiveFlags({ issues: [issue({ chapters: [12, 18] }), issue({ chapters: [3, 4] })], currentChapter: 18, intentionalSignatures: NONE });
    expect(flags).toHaveLength(1);
    expect(flags[0].currentChapter).toBe(18);
  });

  it("maps dead_character_reappears jump target to the death (earliest) chapter", () => {
    const flags = toLiveFlags({ issues: [issue({ chapters: [12, 18] })], currentChapter: 18, intentionalSignatures: NONE });
    expect(flags[0].jumpChapter).toBe(12);
    expect(flags[0].anchor).toBe("Ana");
  });

  it("maps timeline_violation jump target to the other (non-current) chapter", () => {
    const flags = toLiveFlags({ issues: [issue({ type: "timeline_violation", severity: "critical", entities: ["E1", "E2"], chapters: [4, 9], description: "d" })], currentChapter: 9, intentionalSignatures: NONE });
    expect(flags[0].jumpChapter).toBe(4);
  });

  it("gives location_conflict no jump target (conflict is in-chapter)", () => {
    const flags = toLiveFlags({ issues: [issue({ type: "location_conflict", severity: "major", chapters: [7], entities: ["Milan"], description: "d" })], currentChapter: 7, intentionalSignatures: NONE });
    expect(flags[0].jumpChapter).toBeNull();
  });

  it("surfaces relationship_contradiction as book-level (no chapter filter, no anchor)", () => {
    const flags = toLiveFlags({ issues: [issue({ type: "relationship_contradiction", severity: "major", chapters: [], entities: ["A", "B"], description: "d" })], currentChapter: 7, intentionalSignatures: NONE });
    expect(flags).toHaveLength(1);
    expect(flags[0].anchor).toBeNull();
    expect(flags[0].jumpChapter).toBeNull();
  });

  it("excludes orphan_plot_thread and character_undocumented", () => {
    const flags = toLiveFlags({
      issues: [
        issue({ type: "orphan_plot_thread", severity: "major", chapters: [7], description: "d" }),
        issue({ type: "character_undocumented", severity: "minor", chapters: [7], description: "d" }),
      ],
      currentChapter: 7,
      intentionalSignatures: NONE,
    });
    expect(flags).toEqual([]);
  });

  it("drops flags whose signature is marked intentional", () => {
    const sig = continuityIssueSignature(issue());
    const flags = toLiveFlags({ issues: [issue()], currentChapter: 18, intentionalSignatures: new Set([sig]) });
    expect(flags).toEqual([]);
  });
});

describe("mapSeverityToFinding", () => {
  it("maps graph severities to EditFinding vocabulary", () => {
    expect(mapSeverityToFinding("critical")).toBe("critical");
    expect(mapSeverityToFinding("major")).toBe("important");
    expect(mapSeverityToFinding("minor")).toBe("suggestion");
  });
});

describe("shouldExtract", () => {
  const now = new Date("2026-07-02T12:00:00Z");
  it("extracts when never extracted", () => {
    expect(shouldExtract(null, now, 90_000)).toBe(true);
  });
  it("skips within the min interval", () => {
    expect(shouldExtract(new Date(now.getTime() - 30_000), now, 90_000)).toBe(false);
  });
  it("extracts after the min interval", () => {
    expect(shouldExtract(new Date(now.getTime() - 120_000), now, 90_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/continuity-flags.test.ts`
Expected: FAIL — cannot find module `@/lib/continuity/continuity-flags`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/continuity/continuity-flags.ts
import { createHash } from "node:crypto";
import type { ConsistencyIssue } from "@/lib/graph/types";

/** Contradiction types surfaced by the live net (the rest are advisories/todos). */
const INLINE_TYPES = new Set<ConsistencyIssue["type"]>([
  "dead_character_reappears",
  "location_conflict",
  "timeline_violation",
]);
const BOOK_LEVEL_TYPES = new Set<ConsistencyIssue["type"]>(["relationship_contradiction"]);

export interface LiveFlag {
  signature: string;
  type: ConsistencyIssue["type"];
  severity: "critical" | "major" | "minor";
  description: string;
  entities: string[];
  currentChapter: number;
  jumpChapter: number | null;
  anchor: string | null;
}

/** Stable idempotency key: hash of type + whitespace-normalized description. */
export function continuityIssueSignature(issue: ConsistencyIssue): string {
  const norm = (issue.description ?? "").trim().replace(/\s+/g, " ");
  return createHash("sha1").update(`${issue.type}|${norm}`).digest("hex");
}

function jumpChapterFor(issue: ConsistencyIssue, currentChapter: number): number | null {
  const others = (issue.chapters ?? []).filter((c) => c !== currentChapter);
  switch (issue.type) {
    case "dead_character_reappears":
      // jump to the death (earliest) chapter
      return issue.chapters.length ? Math.min(...issue.chapters) : null;
    case "timeline_violation":
      // jump to the other (non-current) chapter
      return others.length ? others[0] : null;
    default:
      return null; // location_conflict is in-chapter; book-level has none
  }
}

export function toLiveFlags(input: {
  issues: ConsistencyIssue[];
  currentChapter: number;
  intentionalSignatures: Set<string>;
}): LiveFlag[] {
  const out: LiveFlag[] = [];
  for (const issue of input.issues ?? []) {
    const isInline = INLINE_TYPES.has(issue.type);
    const isBookLevel = BOOK_LEVEL_TYPES.has(issue.type);
    if (!isInline && !isBookLevel) continue; // excluded types

    // Inline types must touch the current chapter; book-level are always shown.
    if (isInline && !(issue.chapters ?? []).includes(input.currentChapter)) continue;

    const signature = continuityIssueSignature(issue);
    if (input.intentionalSignatures.has(signature)) continue;

    out.push({
      signature,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      entities: Array.isArray(issue.entities) ? issue.entities : [],
      currentChapter: input.currentChapter,
      jumpChapter: isInline ? jumpChapterFor(issue, input.currentChapter) : null,
      anchor: isInline ? (issue.entities?.[0] ?? null) : null,
    });
  }
  return out;
}

export function mapSeverityToFinding(sev: "critical" | "major" | "minor"): "critical" | "important" | "suggestion" {
  if (sev === "critical") return "critical";
  if (sev === "major") return "important";
  return "suggestion";
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
git commit -m "feat: pure continuity-flags module — signature, flag shaping, throttle (Tier 4.4)"
```

---

### Task 2: Pure finding-sync module (idempotent create/resolve diff)

**Files:**
- Create: `src/lib/continuity/finding-sync.ts`
- Test: `tests/unit/finding-sync.test.ts`

**Interfaces:**
- Consumes: `LiveFlag` from `@/lib/continuity/continuity-flags` (Task 1).
- Produces:
  - `interface ExistingFinding { id: string; signature: string }`
  - `function planFindingSync(input: { detected: LiveFlag[]; existing: ExistingFinding[] }): { toCreate: LiveFlag[]; toResolve: string[] }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/finding-sync.test.ts
import { describe, it, expect } from "vitest";
import { planFindingSync } from "@/lib/continuity/finding-sync";
import type { LiveFlag } from "@/lib/continuity/continuity-flags";

function flag(sig: string): LiveFlag {
  return { signature: sig, type: "dead_character_reappears", severity: "critical", description: "d", entities: ["Ana"], currentChapter: 18, jumpChapter: 12, anchor: "Ana" };
}

describe("planFindingSync", () => {
  it("creates newly detected flags", () => {
    const r = planFindingSync({ detected: [flag("s1")], existing: [] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s1"]);
    expect(r.toResolve).toEqual([]);
  });

  it("resolves existing findings no longer detected", () => {
    const r = planFindingSync({ detected: [], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
    expect(r.toResolve).toEqual(["f1"]);
  });

  it("does nothing for a still-detected flag", () => {
    const r = planFindingSync({ detected: [flag("s1")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
    expect(r.toResolve).toEqual([]);
  });

  it("handles mixed create + resolve", () => {
    const r = planFindingSync({ detected: [flag("s2")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate.map((f) => f.signature)).toEqual(["s2"]);
    expect(r.toResolve).toEqual(["f1"]);
  });

  it("does not duplicate on an identical re-scan", () => {
    const r = planFindingSync({ detected: [flag("s1"), flag("s1")], existing: [{ id: "f1", signature: "s1" }] });
    expect(r.toCreate).toEqual([]);
  });

  it("is a no-op on empty/empty", () => {
    const r = planFindingSync({ detected: [], existing: [] });
    expect(r).toEqual({ toCreate: [], toResolve: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/finding-sync.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/continuity/finding-sync.ts
import type { LiveFlag } from "@/lib/continuity/continuity-flags";

export interface ExistingFinding {
  id: string;
  signature: string;
}

/**
 * Diff detected flags against existing active live-continuity findings by
 * signature. New → create; existing-but-gone → resolve. Idempotent: an
 * unchanged re-scan yields empty create/resolve.
 */
export function planFindingSync(input: {
  detected: LiveFlag[];
  existing: ExistingFinding[];
}): { toCreate: LiveFlag[]; toResolve: string[] } {
  const detectedSigs = new Set(input.detected.map((f) => f.signature));
  const existingSigs = new Set(input.existing.map((e) => e.signature));

  const seen = new Set<string>();
  const toCreate: LiveFlag[] = [];
  for (const f of input.detected) {
    if (existingSigs.has(f.signature)) continue;
    if (seen.has(f.signature)) continue; // de-dupe within one scan
    seen.add(f.signature);
    toCreate.push(f);
  }

  const toResolve = input.existing
    .filter((e) => !detectedSigs.has(e.signature))
    .map((e) => e.id);

  return { toCreate, toResolve };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/finding-sync.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/continuity/finding-sync.ts tests/unit/finding-sync.test.ts
git commit -m "feat: pure finding-sync diff planner for live continuity (Tier 4.4)"
```

---

### Task 3: Graph query — chapter node last-extraction timestamp

**Files:**
- Modify: `src/lib/graph/graph-queries.ts` (append near the other query fns)

**Interfaces:**
- Consumes: `withSession`.
- Produces: `function getChapterNodeUpdatedAt(bookId: string, chapterNumber: number): Promise<Date | null>`

- [ ] **Step 1: Add the query**

Append after `getBookCharacterStates` (added in Tier 4.3), before `runConsistencyChecks`:

```ts
/**
 * When the Chapter node was last (re)extracted into the graph — used to
 * time-throttle re-extraction on the live continuity scan. Null if the
 * chapter has never been extracted.
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
    const raw = result.records[0]?.get("updatedAt") as string | null | undefined;
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  });
}
```

- [ ] **Step 2: Verify type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. *(No unit test — consistent with the other integration-verified graph queries; exercised via the route mock in Task 4 and deferred live smoke.)*

- [ ] **Step 3: Commit**

```bash
git add src/lib/graph/graph-queries.ts
git commit -m "feat: getChapterNodeUpdatedAt for live-scan extraction throttle (Tier 4.4)"
```

---

### Task 4: continuity scan route

**Files:**
- Create: `src/app/api/books/[id]/continuity/scan/route.ts`
- Test: `tests/unit/continuity-scan-route.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `db`, `updateFromChapter` (`@/lib/graph/graph-maintenance`), `runConsistencyChecks` + `getChapterNodeUpdatedAt` (`@/lib/graph/graph-queries`), `toLiveFlags`/`continuityIssueSignature`/`mapSeverityToFinding`/`shouldExtract` (Task 1), `planFindingSync` (Task 2).
- Produces: `POST` handler returning `{ flags: LiveFlag[] }` (200 on all non-auth/ownership errors — best-effort).

**Key logic (transcribe exactly):** auth → ownership (`book.findFirst({id,userId})`) → validate `chapterNumber` → throttled `updateFromChapter` (best-effort) → `runConsistencyChecks` (on error → return `{flags:[]}` WITHOUT resolving anything) → load existing live findings (active + dismissed-intentional, fenced by `agentType:"continuity-live"`) → `toLiveFlags` (intentional filter) → `planFindingSync` → apply create (upsert on `bookId_chapterNumber_contentHash`) / resolve → return flags.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/continuity-scan-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: {
    book: { findFirst: vi.fn() },
    editFinding: { findMany: vi.fn(), upsert: vi.fn(), updateMany: vi.fn() },
  },
  updateFromChapter: vi.fn(),
  runConsistencyChecks: vi.fn(),
  getChapterNodeUpdatedAt: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/graph/graph-maintenance", () => ({ updateFromChapter: h.updateFromChapter }));
vi.mock("@/lib/graph/graph-queries", () => ({
  runConsistencyChecks: h.runConsistencyChecks,
  getChapterNodeUpdatedAt: h.getChapterNodeUpdatedAt,
}));

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
  h.db.book.findFirst.mockResolvedValue({ id: "b1", chapters: [{ chapterNumber: 18 }] });
  h.db.editFinding.findMany.mockResolvedValue([]);
  h.db.editFinding.upsert.mockResolvedValue({ id: "new" });
  h.db.editFinding.updateMany.mockResolvedValue({ count: 0 });
  h.updateFromChapter.mockResolvedValue({ updated: true, entitiesFound: 3 });
  h.getChapterNodeUpdatedAt.mockResolvedValue(null);
  h.runConsistencyChecks.mockResolvedValue([deadIssue]);
});

describe("POST /continuity/scan", () => {
  it("401s when auth fails", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(401);
  });

  it("404s when the book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("400s on invalid chapterNumber", async () => {
    const res = await POST(req("") as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it("scopes ownership by userId", async () => {
    await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(h.db.book.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "b1", userId: "u1" }) }));
  });

  it("detects a contradiction, creates a fenced finding, returns the flag", async () => {
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.flags).toHaveLength(1);
    expect(json.flags[0].type).toBe("dead_character_reappears");
    const created = h.db.editFinding.upsert.mock.calls[0][0];
    expect(created.create.agentType).toBe("continuity-live");
    expect(created.create.category).toBe("continuity");
    expect(created.create.severity).toBe("critical");
  });

  it("throttles extraction when the chapter was extracted recently", async () => {
    h.getChapterNodeUpdatedAt.mockResolvedValue(new Date(Date.now() - 10_000));
    await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(h.updateFromChapter).not.toHaveBeenCalled();
    expect(h.runConsistencyChecks).toHaveBeenCalled(); // check still runs
  });

  it("still runs the check (200) when extraction throws", async () => {
    h.updateFromChapter.mockRejectedValue(new Error("neo4j down"));
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    expect(res.status).toBe(200);
    expect(h.runConsistencyChecks).toHaveBeenCalled();
  });

  it("returns {flags:[]} and resolves NOTHING when the check throws", async () => {
    h.runConsistencyChecks.mockRejectedValue(new Error("cypher error"));
    h.db.editFinding.findMany.mockResolvedValue([{ id: "f1", type: "dead_character_reappears", contentHash: "sig1" }]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.flags).toEqual([]);
    expect(h.db.editFinding.updateMany).not.toHaveBeenCalled(); // resolve-only-on-success
  });

  it("filters out an issue marked intentional (dismissed live finding) and does not recreate it", async () => {
    // seed a dismissed-intentional live finding whose contentHash equals the issue signature
    const { continuityIssueSignature } = await import("@/lib/continuity/continuity-flags");
    const sig = continuityIssueSignature(deadIssue as never);
    h.db.editFinding.findMany.mockResolvedValue([
      { id: "d1", type: "dead_character_reappears", contentHash: sig, status: "dismissed", dismissReason: "intentional" },
    ]);
    const res = await POST(req("?chapterNumber=18") as never, ctx as never);
    const json = await res.json();
    expect(json.flags).toEqual([]);
    expect(h.db.editFinding.upsert).not.toHaveBeenCalled();
  });

  it("resolve query is fenced to agentType continuity-live", async () => {
    h.runConsistencyChecks.mockResolvedValue([]); // nothing detected → resolve the stale active one
    h.db.editFinding.findMany.mockResolvedValue([
      { id: "f1", type: "dead_character_reappears", contentHash: "sig1", status: "pending" },
    ]);
    await POST(req("?chapterNumber=18") as never, ctx as never);
    const resolveCall = h.db.editFinding.updateMany.mock.calls[0][0];
    expect(resolveCall.where.agentType).toBe("continuity-live");
    expect(resolveCall.where.id).toEqual({ in: ["f1"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/continuity-scan-route.test.ts`
Expected: FAIL — cannot find route module.

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
import {
  toLiveFlags,
  continuityIssueSignature,
  mapSeverityToFinding,
  shouldExtract,
  type LiveFlag,
} from "@/lib/continuity/continuity-flags";
import { planFindingSync, type ExistingFinding } from "@/lib/continuity/finding-sync";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };
const querySchema = z.object({ chapterNumber: z.coerce.number().int().positive() });

const AGENT_TYPE = "continuity-live";
const CATEGORY = "continuity";
const EXTRACT_MIN_INTERVAL_MS = 90_000;

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const parsed = querySchema.safeParse({
      chapterNumber: new URL(request.url).searchParams.get("chapterNumber"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chapterNumber" }, { status: 400 });
    }
    const chapterNumber = parsed.data.chapterNumber;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ── Throttled graph refresh (best-effort; failure never 500s) ──
    try {
      const lastExtracted = await getChapterNodeUpdatedAt(bookId, chapterNumber);
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

    // ── Detect (pure Cypher). On failure: empty, resolve NOTHING. ──
    let issues;
    try {
      issues = await runConsistencyChecks(bookId);
    } catch (err) {
      console.error("[continuity-scan] check failed:", err);
      return NextResponse.json({ flags: [] });
    }

    // ── Load existing live findings (active + dismissed-intentional), fenced. ──
    const liveFindings = await db.editFinding.findMany({
      where: { bookId, category: CATEGORY, agentType: AGENT_TYPE },
      select: { id: true, contentHash: true, status: true, dismissReason: true },
    });
    const intentionalSignatures = new Set(
      liveFindings
        .filter((f) => f.status === "dismissed" && f.dismissReason === "intentional" && f.contentHash)
        .map((f) => f.contentHash as string)
    );
    const activeExisting: ExistingFinding[] = liveFindings
      .filter((f) => f.status !== "dismissed" && f.contentHash)
      .map((f) => ({ id: f.id, signature: f.contentHash as string }));

    const flags = toLiveFlags({ issues, currentChapter: chapterNumber, intentionalSignatures });
    const { toCreate, toResolve } = planFindingSync({ detected: flags, existing: activeExisting });

    // ── Apply: create (idempotent upsert on the unique key) + resolve. ──
    for (const f of toCreate) {
      await db.editFinding.upsert({
        where: {
          bookId_chapterNumber_contentHash: {
            bookId,
            chapterNumber,
            contentHash: f.signature,
          },
        },
        create: {
          bookId,
          chapterNumber,
          agentType: AGENT_TYPE,
          category: CATEGORY,
          severity: mapSeverityToFinding(f.severity),
          description: f.description,
          originalText: f.anchor,
          contentHash: f.signature,
          status: "pending",
        },
        update: {}, // already exists with this signature → no-op
      });
    }
    if (toResolve.length > 0) {
      await db.editFinding.updateMany({
        where: { id: { in: toResolve }, bookId, agentType: AGENT_TYPE },
        data: { status: "resolved" },
      });
    }

    // Attach each returned flag's persisted finding id (the client needs it for [Intentional]).
    const refreshed = await db.editFinding.findMany({
      where: { bookId, category: CATEGORY, agentType: AGENT_TYPE, status: "pending" },
      select: { id: true, contentHash: true },
    });
    const sigToId = new Map(refreshed.map((f) => [f.contentHash as string, f.id]));
    const withIds: Array<LiveFlag & { findingId: string | null }> = flags.map((f) => ({
      ...f,
      findingId: sigToId.get(f.signature) ?? null,
    }));

    return NextResponse.json({ flags: withIds });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[continuity-scan]", error);
    return NextResponse.json({ error: "scan failed" }, { status: 500 });
  }
}
```

The route's response type is `{ flags: Array<LiveFlag & { findingId: string | null }> }` — Task 6's mapper and Task 7's hook consume that exact shape. The happy-path test's `findMany` mock must therefore return the created row so the join resolves a `findingId`; in the test, after the `upsert` mock, have `editFinding.findMany` return `[{ id: "new", contentHash: <the detected signature> }]` on its second call (or use `mockResolvedValueOnce` twice: first `[]` for existing-load, then the refreshed row) and assert `json.flags[0].findingId === "new"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/continuity-scan-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/books/[id]/continuity/scan/route.ts" tests/unit/continuity-scan-route.test.ts
git commit -m "feat: continuity scan route — throttled extract + cheap check + idempotent sync (Tier 4.4)"
```

---

### Task 5: intentional route

**Files:**
- Create: `src/app/api/books/[id]/continuity/intentional/route.ts`
- Test: `tests/unit/continuity-intentional-route.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `db`, `upsertConversationConstraint` (`@/lib/agents/writer-memory`).
- Produces: `POST` handler; body `{ findingId: string }`; dismisses the finding (`status:"dismissed"`, `dismissReason:"intentional"`) + writes a book-scoped constraint. Fenced to `agentType:"continuity-live"`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/continuity-intentional-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  requireUser: vi.fn(),
  db: { book: { findFirst: vi.fn() }, editFinding: { findFirst: vi.fn(), update: vi.fn() } },
  upsertConversationConstraint: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/agents/writer-memory", () => ({ upsertConversationConstraint: h.upsertConversationConstraint }));

import { POST } from "@/app/api/books/[id]/continuity/intentional/route";
const ctx = { params: Promise.resolve({ id: "b1" }) };
function req(body: unknown) {
  return new Request("http://t/api/books/b1/continuity/intentional", { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue(h.user);
  h.db.book.findFirst.mockResolvedValue({ id: "b1" });
  h.db.editFinding.findFirst.mockResolvedValue({ id: "f1", bookId: "b1", agentType: "continuity-live", description: "Ana died Ch12 but appears here" });
  h.db.editFinding.update.mockResolvedValue({ id: "f1" });
});

describe("POST /continuity/intentional", () => {
  it("401 / 404 / 400 guards", async () => {
    h.requireUser.mockRejectedValueOnce(new Error("Unauthorized"));
    expect((await POST(req({ findingId: "f1" }) as never, ctx as never)).status).toBe(401);

    h.db.book.findFirst.mockResolvedValueOnce(null);
    expect((await POST(req({ findingId: "f1" }) as never, ctx as never)).status).toBe(404);

    expect((await POST(req({}) as never, ctx as never)).status).toBe(400);
  });

  it("404s when the finding is not a continuity-live finding for this book", async () => {
    h.db.editFinding.findFirst.mockResolvedValue(null);
    const res = await POST(req({ findingId: "x" }) as never, ctx as never);
    expect(res.status).toBe(404);
    // ownership lookup must be fenced to this book + agentType
    expect(h.db.editFinding.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "x", bookId: "b1", agentType: "continuity-live" }) }));
  });

  it("dismisses the finding as intentional and writes a book-scoped constraint", async () => {
    const res = await POST(req({ findingId: "f1" }) as never, ctx as never);
    expect(res.status).toBe(200);
    const upd = h.db.editFinding.update.mock.calls[0][0];
    expect(upd.data.status).toBe("dismissed");
    expect(upd.data.dismissReason).toBe("intentional");
    expect(h.upsertConversationConstraint).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", bookId: "b1", findingId: "f1", category: "constraint" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/continuity-intentional-route.test.ts`
Expected: FAIL — cannot find route module.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/books/[id]/continuity/intentional/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { upsertConversationConstraint } from "@/lib/agents/writer-memory";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };
const bodySchema = z.object({ findingId: z.string().min(1) });

const AGENT_TYPE = "continuity-live";

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const book = await db.book.findFirst({ where: { id: bookId, userId: user.id } });
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: "findingId required" }, { status: 400 });
    }
    const { findingId } = parsed.data;

    // Fenced: only a continuity-live finding owned by this book can be marked intentional.
    const finding = await db.editFinding.findFirst({
      where: { id: findingId, bookId, agentType: AGENT_TYPE },
    });
    if (!finding) {
      return NextResponse.json({ error: "Finding not found" }, { status: 404 });
    }

    await db.editFinding.update({
      where: { id: findingId },
      data: { status: "dismissed", dismissReason: "intentional" },
    });

    // Learning-loop side effect (4.2 path); server-composed, agent never controls it.
    await upsertConversationConstraint({
      userId: user.id,
      bookId,
      findingId,
      category: "constraint",
      content: `Continuity: "${finding.description}" is intentional — do not flag it again.`,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[continuity-intentional]", error);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/continuity-intentional-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/books/[id]/continuity/intentional/route.ts" tests/unit/continuity-intentional-route.test.ts
git commit -m "feat: continuity intentional route — dismiss + constraint (Tier 4.4)"
```

---

### Task 6: annotation type + tooltip variant + flag→annotation mapper

**Files:**
- Modify: `src/components/editor/annotation-extension.ts` (add `"continuity"` type + class)
- Modify: `src/components/editor/annotation-tooltip.tsx` (add `TYPE_CONFIG.continuity` + `onGoToChapter`/`onIntentional`/`jumpChapter` props + buttons)
- Create: `src/lib/continuity/flag-annotations.ts` (`continuityFlagsToAnnotations`)
- Test: `tests/unit/flag-annotations.test.ts`

**Interfaces:**
- Consumes: `LiveFlag` (Task 1) — extended in Task 4 to `LiveFlag & { findingId: string | null }`; `AnnotationItem` from `@/components/editor/annotation-extension`.
- Produces: `function continuityFlagsToAnnotations(flags: Array<LiveFlag & { findingId: string | null }>): AnnotationItem[]`

- [ ] **Step 1: Add the annotation type**

In `src/components/editor/annotation-extension.ts`:
- Extend the union (line 17): add `| "continuity"`.
- Add to `TYPE_CLASSES` (line 32-41): `continuity: "anno-continuity",`

*(tsc enforces both maps are total, so both edits are required together.)*

- [ ] **Step 2: Add the tooltip variant**

In `src/components/editor/annotation-tooltip.tsx`:
- Add to `TYPE_CONFIG` (line 28-72): 
```tsx
  continuity: {
    label: "Continuity",
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-100 dark:bg-orange-900/30",
  },
```
- Add to `AnnotationTooltipProps` (after `onDiscuss?`): `onGoToChapter?: () => void; onIntentional?: () => void; jumpChapter?: number | null;`
- In the tooltip button row, when `annotationType === "continuity"`, render `[Go to Ch {jumpChapter}]` (only if `onGoToChapter && jumpChapter != null`) and `[Intentional]` (`onIntentional`) INSTEAD of accept/reject. Read the file's existing button JSX (~lines 200-235) and mirror the `Button` usage; import `MapPin` and `Check` from lucide. Example block:
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
import type { LiveFlag } from "@/lib/continuity/continuity-flags";

function flag(over: Partial<LiveFlag & { findingId: string | null }> = {}): LiveFlag & { findingId: string | null } {
  return { signature: "s1", type: "dead_character_reappears", severity: "critical", description: "Ana died Ch12", entities: ["Ana"], currentChapter: 18, jumpChapter: 12, anchor: "Ana", findingId: "f1", ...over };
}

describe("continuityFlagsToAnnotations", () => {
  it("maps an anchored flag to a continuity annotation on the entity name", () => {
    const a = continuityFlagsToAnnotations([flag()]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "continuity", text: "Ana", description: "Ana died Ch12", findingId: "f1" });
    expect(a[0].id).toContain("f1");
  });
  it("skips flags with no anchor (book-level) — they render in the indicator, not inline", () => {
    expect(continuityFlagsToAnnotations([flag({ anchor: null })])).toEqual([]);
  });
  it("skips flags with no findingId", () => {
    expect(continuityFlagsToAnnotations([flag({ findingId: null })])).toEqual([]);
  });
});
```

- [ ] **Step 4: Write the mapper**

```ts
// src/lib/continuity/flag-annotations.ts
import type { AnnotationItem } from "@/components/editor/annotation-extension";
import type { LiveFlag } from "@/lib/continuity/continuity-flags";

/** Map anchored live-continuity flags to inline annotations. Book-level or
 *  finding-less flags are skipped (they surface in the live indicator). */
export function continuityFlagsToAnnotations(
  flags: Array<LiveFlag & { findingId: string | null }>
): AnnotationItem[] {
  const out: AnnotationItem[] = [];
  for (const f of flags) {
    if (!f.anchor || !f.findingId) continue;
    out.push({
      id: `continuity-${f.findingId}`,
      type: "continuity",
      text: f.anchor,
      description: f.description,
      findingId: f.findingId,
    });
  }
  return out;
}
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run tests/unit/flag-annotations.test.ts` → PASS.
Run: `npx tsc --noEmit` → exit 0 (the two total-map edits + new props must be clean).

- [ ] **Step 6: Commit**

```bash
git add src/components/editor/annotation-extension.ts src/components/editor/annotation-tooltip.tsx src/lib/continuity/flag-annotations.ts tests/unit/flag-annotations.test.ts
git commit -m "feat: continuity annotation type + tooltip variant + flag mapper (Tier 4.4)"
```

---

### Task 7: client scan hook, idle trigger, indicator, editor wiring

**Files:**
- Create: `src/hooks/use-continuity-scan.ts` (`useContinuityScan` + `useIdleContinuityScan`)
- Create: `src/components/editor/continuity-indicator.tsx`
- Modify: `src/components/editor/manuscript-editor.tsx` (idle trigger, merge continuity annotations, tooltip action handlers, mount indicator)
- Test: none (node-env suite; gated by `tsc` + `next build`)

**Interfaces:**
- Consumes: `fetchJson` (`@/lib/api-client`), `continuityFlagsToAnnotations` (Task 6), `LiveFlag` (Task 1), the scan/intentional routes (Tasks 4/5), `useRouter`, the pane store `setScrollToText`.

- [ ] **Step 1: Create the scan hook + idle trigger**

```ts
// src/hooks/use-continuity-scan.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/api-client";
import type { LiveFlag } from "@/lib/continuity/continuity-flags";

export type ScanFlag = LiveFlag & { findingId: string | null };

/** POST a continuity scan for the given chapter. Best-effort — resolves to [] on error. */
export function useContinuityScan(bookId: string) {
  const [flags, setFlags] = useState<ScanFlag[]>([]);
  const [scanning, setScanning] = useState(false);
  const inFlight = useRef(false);

  const scan = useCallback(
    async (chapterNumber: number) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setScanning(true);
      try {
        const res = await fetchJson<{ flags: ScanFlag[] }>(
          `/api/books/${bookId}/continuity/scan?chapterNumber=${chapterNumber}`,
          { method: "POST" }
        );
        setFlags(res.flags ?? []);
      } catch {
        // best-effort: keep prior flags on failure, never surface an error
      } finally {
        inFlight.current = false;
        setScanning(false);
      }
    },
    [bookId]
  );

  const markIntentional = useCallback(
    async (findingId: string) => {
      try {
        await fetchJson(`/api/books/${bookId}/continuity/intentional`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ findingId }),
        });
        setFlags((prev) => prev.filter((f) => f.findingId !== findingId));
      } catch {
        /* leave the flag; next scan reconciles */
      }
    },
    [bookId]
  );

  return { flags, scanning, scan, markIntentional };
}

/**
 * Fire a continuity scan ~debounceMs after the writer's last edit (idle),
 * and immediately on chapterNumber change. `activityKey` should change on every
 * editor update (e.g. the pane's dirty counter or last-updated timestamp).
 */
export function useIdleContinuityScan(opts: {
  chapterNumber: number | null;
  activityKey: unknown;
  scan: (chapterNumber: number) => void;
  debounceMs?: number;
}) {
  const { chapterNumber, activityKey, scan, debounceMs = 20_000 } = opts;

  // Scan on chapter switch.
  useEffect(() => {
    if (chapterNumber == null) return;
    scan(chapterNumber);
  }, [chapterNumber, scan]);

  // Debounced scan after edits settle.
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
  scanning: boolean;
}

/** Quiet live-continuity status: silent when clean, a count when contradictions exist. */
export function ContinuityIndicator({ flags, scanning }: ContinuityIndicatorProps) {
  if (scanning && flags.length === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" /> checking…
      </span>
    );
  }
  if (flags.length === 0) return null;
  return (
    <Badge variant="outline" className="gap-1 text-[10px] text-orange-600 border-orange-300">
      <AlertTriangleIcon className="size-3" />
      {flags.length} continuity
    </Badge>
  );
}
```

- [ ] **Step 3: Wire into the editor**

In `src/components/editor/manuscript-editor.tsx`:
1. Import `useContinuityScan`, `useIdleContinuityScan`, `ContinuityIndicator`, `continuityFlagsToAnnotations`.
2. Instantiate: `const { flags: continuityFlags, scanning: continuityScanning, scan: continuityScan, markIntentional } = useContinuityScan(bookId);`
3. Drive the idle trigger with the pane's edit-activity signal (reuse the existing dirty/last-updated counter that changes on `editor.onUpdate`; if none is exposed, use `isDirty` + a ref counter):
```ts
useIdleContinuityScan({ chapterNumber, activityKey: /* edit counter or lastSaved */, scan: continuityScan });
```
4. Merge continuity annotations into the annotation set already pushed to the extension (find where `findingsToAnnotations(findings)` result is set as annotations, ~lines 218-268/328-341) and concatenate `continuityFlagsToAnnotations(continuityFlags)`:
```ts
const annotations = [...findingsToAnnotations(findings), ...continuityFlagsToAnnotations(continuityFlags)];
```
5. In the annotation-click → tooltip handler, when the clicked annotation's type is `"continuity"`, open the tooltip with the continuity props: `onGoToChapter` (look up the flag by findingId → its `jumpChapter`; if not the current chapter, `router.push(\`/books/${bookId}/chapters/${targetChapterId}\`)` + `paneStore.getState().setScrollToText(anchor)`; you'll need to resolve chapterNumber→chapterId via the book's chapter list already loaded in the editor), `onIntentional` (`() => markIntentional(findingId)`), and `jumpChapter`.
6. Mount `<ContinuityIndicator flags={continuityFlags} scanning={continuityScanning} />` near the toolbar's panel toggles (beside the findings/series toggles).

*(This is UI integration into a large file; make additive edits only — do not disturb autosave, findings, version-history, or series-context wiring. Confirm `router`, `bookId`, `chapterNumber`, `paneStore`, the chapter list, and the annotation-push site are all in scope where you edit.)*

- [ ] **Step 4: Type-check + build**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run` → full suite green (existing + Tasks 1/2/4/5/6 tests).
Run: `npx next build` → compiles (a failure ONLY on the local `.env` placeholder assertion is acceptable; a TS/lint/RSC error is not).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-continuity-scan.ts src/components/editor/continuity-indicator.tsx src/components/editor/manuscript-editor.tsx
git commit -m "feat: live continuity scan hook + idle trigger + indicator + editor wiring (Tier 4.4)"
```

---

### Task 8: Roadmap update + verification gate

**Files:**
- Modify: `docs/IMPROVEMENT-ROADMAP.md`

- [ ] **Step 1: Mark 4.4 shipped**

Under `### 4.4 Live continuity safety net`, prepend a `✅ SHIPPED 2026-07-02` note mirroring 4.1–4.3: deterministic graph-consistency live net (dead-reappears / location-conflict / timeline-violation inline + relationship-contradiction book-level), idle-triggered, throttled haiku extraction, idempotent `EditFinding` sync (category=continuity, agentType=continuity-live, signature in contentHash), `[Go to Ch N]` + `[Intentional]` (dismiss + 4.2 constraint), never-500 degradation. Deferred: attribute-level (rank/title) LLM detection (phase 2), orphan-thread nudge, pause toggle. Update the top progress banner.

- [ ] **Step 2: Full verification gate**

Run: `npx tsc --noEmit` → 0.
Run: `npx vitest run` → all green (report count).
Run: `npx next build` → compiles.

- [ ] **Step 3: Commit**

```bash
git add docs/IMPROVEMENT-ROADMAP.md
git commit -m "docs: mark Tier 4.4 live continuity net shipped"
```

---

## Deferred verification (documented, not silently claimed)

Live DB/Neo4j unreachable here. Requires a live stack:
- A real death-reappears flag appearing on idle after the graph extracts the current chapter.
- `[Go to Ch N]` cross-chapter navigation + scroll-to-entity.
- `[Intentional]` round-trip clearing the flag and suppressing it on re-scan.
- Extraction-throttle cost behavior under sustained writing.
- **No schema change → no `prisma db push` required for 4.4** (reuses `EditFinding` + `WriterMemory`).

## Adversarial-review checkpoints (flag for the plan review)

- **`contentHash` repurposing:** verify no global consumer reads `EditFinding.contentHash` assuming it is a *chapter* content hash in a way that would misbehave for `agentType="continuity-live"` findings (whose `contentHash` is an issue signature). If such a path exists and isn't agentType-scoped, fall back to recompute-signature-from-`type`+`description` + a fetch-or-create (accepting the rare cross-request double-create under client coalescing).
- **`updateMany` resolve fence:** confirm the resolve `where` includes `agentType:"continuity-live"` (never resolves editorial/on-demand findings).
- **Idle trigger activity source:** confirm the chosen `activityKey` actually changes on editor edits (else the debounce never re-fires).

## Self-review notes

- **Spec coverage:** §3 modules → Tasks 1,2,4,5,6,7; §4 detection types → Task 1; §5 cadence/throttle → Tasks 1 (`shouldExtract`) + 3 + 4 + 7 (idle); §6 sync + `[Intentional]` → Tasks 2,4,5; §7 UX → Tasks 6,7; §8 degradation/security → Task 4 (never-500, resolve-only-on-success, ownership, `agentType` fence, zod) + Task 5 (fence, ownership); §9 testing → per-task; §10 files match.
- **Type consistency:** `LiveFlag` defined once (Task 1), extended to `+{findingId}` at the route boundary (Task 4) and consumed as `ScanFlag` (Task 7); `ExistingFinding` (Task 2); severity map + `agentType`/`category`/`contentHash` constants identical across Tasks 4/5.
- **No placeholders:** every code step is complete; the one prose directive (Task 4 findingId join, Task 7 wiring) is precise about the exact calls and sites.
