# Ambient Series Awareness (Tier 4.3 foundation) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the editor a read-only, context-aware sidebar that surfaces prior-book character state, open plot threads, and tone drift while an author writes a later book in a series — computed from cheap graph/style data with no agent run.

**Architecture:** A **pure resolver** (`ambient-context.ts`) does all cross-book name/alias matching, thread filtering, and tone-drift math. A **pure metrics** module (`chapter-metrics.ts`) computes objective text statistics. An **I/O sources** layer (`ambient-sources.ts`) wraps the Neo4j graph queries + StyleProfile + DocumentService reads, each independently failure-isolated. A **thin route** (`GET /api/books/[id]/series-context`) orchestrates: auth → ownership → gather → resolve → envelope, never running an agent. A toggle-able **`AmbientSeriesPanel`** editor sidebar consumes it via `useAmbientContext`.

**Tech Stack:** Next.js App Router (route handlers), Prisma (`db`), Neo4j (`src/lib/graph`), Zod, TanStack Query, Zustand (editor store), Vitest (node env), TypeScript strict.

## Global Constraints

- **TypeScript strict, no `any`** — use `unknown` + narrowing; explicit types on all exported functions (project rule `typescript/coding-style.md`).
- **Immutability** — never mutate inputs; return new objects/arrays.
- **Zod at the boundary** — validate the `chapterNumber` query param before use.
- **Unit tests live in `tests/unit/**/*.test.ts`**, `environment: "node"` (see `vitest.config.ts`). **No component/RTL tests** — the suite has none (no jsdom); UI is gated on `tsc` + prod build only. Match the existing `vi.hoisted` + `vi.mock("@/lib/auth"|"@/lib/db")` route-test style (see `tests/unit/finding-discuss-route.test.ts`).
- **DocumentType** imports from `@/generated/prisma/enums`.
- **No `console.log`.** `console.error` inside a `catch` is allowed (matches existing routes).
- **Read-only / zero-cost invariant:** the route must trigger no agent, no LLM call, and no DB write. v1 uses **graph + style sources only** (no `searchMemory`/embeddings — vector enrichment is deferred, which also removes the BYOK-embedding caveat from this feature).
- **Run commands from repo root** `D:\Projects\wmb-pub`. Test runner: `npx vitest run <file>`. Type check: `npx tsc --noEmit`.

---

### Task 1: Pure chapter-metrics module

Computes objective text statistics from chapter markdown, defined to be **directly comparable** to the stored `StructuredFingerprint` baseline: `sentenceLength.mean` → words per sentence, `paragraphLength.mean` → **sentences** per paragraph (the fingerprint's `paragraphLength` is measured in sentences — note its `singleSentenceRate` sibling), `dialogueRatio` → 0..1.

**Files:**
- Create: `src/lib/series/chapter-metrics.ts`
- Test: `tests/unit/chapter-metrics.test.ts`

**Interfaces:**
- Produces:
  - `interface StyleMetrics { avgWordsPerSentence: number; dialogueRatio: number; avgSentencesPerParagraph: number }`
  - `function computeChapterMetrics(text: string): StyleMetrics | null` — returns `null` when the text has no countable sentences/words.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/chapter-metrics.test.ts
import { describe, it, expect } from "vitest";
import { computeChapterMetrics } from "@/lib/series/chapter-metrics";

describe("computeChapterMetrics", () => {
  it("returns null for empty or whitespace-only text", () => {
    expect(computeChapterMetrics("")).toBeNull();
    expect(computeChapterMetrics("   \n\n  ")).toBeNull();
  });

  it("counts words per sentence", () => {
    // 2 sentences, 8 words total → 4 words/sentence
    const m = computeChapterMetrics("The cat sat down. A dog ran fast.");
    expect(m).not.toBeNull();
    expect(m!.avgWordsPerSentence).toBeCloseTo(4, 5);
  });

  it("counts sentences per paragraph across blank-line breaks", () => {
    // paragraph A: 2 sentences, paragraph B: 1 sentence → 1.5 sentences/paragraph
    const m = computeChapterMetrics("One two. Three four.\n\nFive six seven.");
    expect(m!.avgSentencesPerParagraph).toBeCloseTo(1.5, 5);
  });

  it("computes dialogue ratio from sentences containing quotes (straight + curly + guillemets)", () => {
    // 1 of 2 sentences has a quote → 0.5
    const m = computeChapterMetrics('He spoke. "Run now!" she cried.');
    expect(m!.dialogueRatio).toBeCloseTo(0.5, 5);
  });

  it("treats a quote-only chapter as fully dialogue", () => {
    const m = computeChapterMetrics('"Hello." "Goodbye."');
    expect(m!.dialogueRatio).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/chapter-metrics.test.ts`
Expected: FAIL — cannot find module `@/lib/series/chapter-metrics`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/series/chapter-metrics.ts

/**
 * Objective, reproducible text statistics for a chapter, defined to be
 * comparable to the stored StructuredFingerprint baseline:
 *   avgWordsPerSentence      ~ fingerprint.sentenceLength.mean
 *   avgSentencesPerParagraph ~ fingerprint.paragraphLength.mean  (measured in sentences)
 *   dialogueRatio            ~ fingerprint.dialogueRatio          (0..1)
 *
 * dialogueRatio here is an approximation (fraction of sentences containing a
 * quotation mark); it is advisory only and never becomes a finding.
 */
export interface StyleMetrics {
  avgWordsPerSentence: number;
  dialogueRatio: number;
  avgSentencesPerParagraph: number;
}

const QUOTE_CHARS = /[\"“”«»]/; // " " " « »

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countWords(text: string): number {
  const t = text.trim();
  if (t.length === 0) return 0;
  return t.split(/\s+/).length;
}

export function computeChapterMetrics(text: string): StyleMetrics | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const sentences = splitSentences(trimmed);
  if (sentences.length === 0) return null;

  const totalWords = sentences.reduce((sum, s) => sum + countWords(s), 0);
  if (totalWords === 0) return null;

  const dialogueSentences = sentences.filter((s) => QUOTE_CHARS.test(s)).length;
  const paragraphCount = paragraphs.length > 0 ? paragraphs.length : 1;

  return {
    avgWordsPerSentence: totalWords / sentences.length,
    dialogueRatio: dialogueSentences / sentences.length,
    avgSentencesPerParagraph: sentences.length / paragraphCount,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/chapter-metrics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/series/chapter-metrics.ts tests/unit/chapter-metrics.test.ts
git commit -m "feat: pure chapter-metrics module for tone-drift comparison (Tier 4.3)"
```

---

### Task 2: Pure ambient-context resolver

The core. Cross-book character matching (name ∪ aliases, diacritic-insensitive, latest-book-wins), thread relevance filtering (thread touches an on-stage character), and tone-drift computation with a materiality threshold.

**Files:**
- Create: `src/lib/series/ambient-context.ts`
- Test: `tests/unit/ambient-context.test.ts`

**Interfaces:**
- Consumes: `StyleMetrics` from `@/lib/series/chapter-metrics` (Task 1).
- Produces: (all exported)
  - `interface PriorCharacter { bookNumber: number; name: string; aliases: string[]; role: string | null; status: string | null; lastMentioned: number | null; description: string | null }`
  - `interface PriorThread { bookNumber: number; name: string; status: string; relatedNames: string[] }`
  - `interface AmbientContextInput { currentBookNumber: number; onStageNames: string[]; priorBookCharacters: PriorCharacter[]; openThreads: PriorThread[]; currentStyleMetrics: StyleMetrics | null; seriesBaselineMetrics: StyleMetrics | null; baselineBookNumber: number | null }`
  - `interface AmbientCharacterView { name: string; matchedFrom: string | null; lastBook: number; lastChapter: number | null; role: string | null; status: string | null; description: string | null; aliases: string[] }`
  - `interface AmbientThreadView { name: string; fromBook: number; status: string; relatedNames: string[] }`
  - `interface ToneMetricView { key: string; current: number; baseline: number; deltaPct: number; material: boolean }`
  - `interface AmbientContextView { characters: AmbientCharacterView[]; threads: AmbientThreadView[]; toneDrift: { baselineBook: number; metrics: ToneMetricView[] } | null; notReady: boolean }`
  - `function buildAmbientContext(input: AmbientContextInput): AmbientContextView`
  - `const MATERIALITY_PCT = 20`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ambient-context.test.ts
import { describe, it, expect } from "vitest";
import {
  buildAmbientContext,
  type AmbientContextInput,
  type PriorCharacter,
} from "@/lib/series/ambient-context";

function base(overrides: Partial<AmbientContextInput> = {}): AmbientContextInput {
  return {
    currentBookNumber: 2,
    onStageNames: [],
    priorBookCharacters: [],
    openThreads: [],
    currentStyleMetrics: null,
    seriesBaselineMetrics: null,
    baselineBookNumber: null,
    ...overrides,
  };
}

const milanB1: PriorCharacter = {
  bookNumber: 1, name: "Milan", aliases: ["the Captain"], role: "supporting",
  status: "alive", lastMentioned: 18, description: "distrusted by the council",
};

describe("buildAmbientContext — matching", () => {
  it("returns an empty, valid view for empty input", () => {
    const v = buildAmbientContext(base());
    expect(v.characters).toEqual([]);
    expect(v.threads).toEqual([]);
    expect(v.toneDrift).toBeNull();
    expect(v.notReady).toBe(true); // no on-stage cast
  });

  it("matches an on-stage name to a prior character by exact name", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Milan"], priorBookCharacters: [milanB1] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].name).toBe("Milan");
    expect(v.characters[0].lastBook).toBe(1);
    expect(v.characters[0].lastChapter).toBe(18);
    expect(v.characters[0].matchedFrom).toBeNull();
    expect(v.notReady).toBe(false);
  });

  it("matches on an alias and records matchedFrom", () => {
    const v = buildAmbientContext(base({ onStageNames: ["the Captain"], priorBookCharacters: [milanB1] }));
    expect(v.characters[0].name).toBe("Milan");
    expect(v.characters[0].matchedFrom).toBe("the Captain");
  });

  it("matches case- and diacritic-insensitively", () => {
    const milos: PriorCharacter = { ...milanB1, name: "Miloš", aliases: [] };
    const v = buildAmbientContext(base({ onStageNames: ["milos"], priorBookCharacters: [milos] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].name).toBe("Miloš");
  });

  it("keeps the latest book when a character appears in several prior books", () => {
    const milanB2Prior: PriorCharacter = { ...milanB1, bookNumber: 1, lastMentioned: 18 };
    const milanLater: PriorCharacter = { bookNumber: 2, name: "Milan", aliases: [], role: "supporting", status: "dead", lastMentioned: 4, description: "fell at the bridge" };
    // currentBookNumber 3 so both 1 and 2 are "prior"
    const v = buildAmbientContext(base({ currentBookNumber: 3, onStageNames: ["Milan"], priorBookCharacters: [milanB2Prior, milanLater] }));
    expect(v.characters).toHaveLength(1);
    expect(v.characters[0].lastBook).toBe(2);
    expect(v.characters[0].status).toBe("dead");
  });

  it("drops on-stage names that match no prior character", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Ana"], priorBookCharacters: [milanB1] }));
    expect(v.characters).toEqual([]);
    expect(v.notReady).toBe(false); // cast existed, just no prior matches
  });

  it("does not throw on malformed prior records", () => {
    const bad = { bookNumber: 1, name: "X", aliases: null as unknown as string[], role: null, status: null, lastMentioned: null, description: null } as PriorCharacter;
    expect(() => buildAmbientContext(base({ onStageNames: ["X"], priorBookCharacters: [bad] }))).not.toThrow();
  });
});

describe("buildAmbientContext — threads", () => {
  const thread = { bookNumber: 1, name: "What Milan knows", status: "developing", relatedNames: ["Milan"] };

  it("keeps threads whose related names intersect the on-stage cast", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Milan"], priorBookCharacters: [milanB1], openThreads: [thread] }));
    expect(v.threads).toHaveLength(1);
    expect(v.threads[0].name).toBe("What Milan knows");
  });

  it("drops threads not touching the on-stage cast", () => {
    const v = buildAmbientContext(base({ onStageNames: ["Ana"], openThreads: [thread] }));
    expect(v.threads).toEqual([]);
  });

  it("matches a thread via an on-stage character's alias", () => {
    const v = buildAmbientContext(base({ onStageNames: ["the Captain"], priorBookCharacters: [milanB1], openThreads: [thread] }));
    expect(v.threads).toHaveLength(1);
  });
});

describe("buildAmbientContext — tone drift", () => {
  const cur = { avgWordsPerSentence: 24, dialogueRatio: 0.12, avgSentencesPerParagraph: 5 };
  const baseline = { avgWordsPerSentence: 18, dialogueRatio: 0.12, avgSentencesPerParagraph: 5 };

  it("is null when either side is missing", () => {
    expect(buildAmbientContext(base({ currentStyleMetrics: cur })).toneDrift).toBeNull();
    expect(buildAmbientContext(base({ seriesBaselineMetrics: baseline, baselineBookNumber: 1 })).toneDrift).toBeNull();
  });

  it("flags a material metric and omits immaterial ones", () => {
    const v = buildAmbientContext(base({ currentStyleMetrics: cur, seriesBaselineMetrics: baseline, baselineBookNumber: 1 }));
    expect(v.toneDrift).not.toBeNull();
    const sent = v.toneDrift!.metrics.find((m) => m.key === "avgWordsPerSentence");
    expect(sent!.deltaPct).toBe(33);
    expect(sent!.material).toBe(true);
    // dialogueRatio identical → deltaPct 0, not material
    const dlg = v.toneDrift!.metrics.find((m) => m.key === "dialogueRatio");
    expect(dlg!.material).toBe(false);
  });

  it("skips a metric whose baseline is zero (no divide-by-zero)", () => {
    const v = buildAmbientContext(base({
      currentStyleMetrics: { ...cur, dialogueRatio: 0.3 },
      seriesBaselineMetrics: { ...baseline, dialogueRatio: 0 },
      baselineBookNumber: 1,
    }));
    expect(v.toneDrift!.metrics.find((m) => m.key === "dialogueRatio")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ambient-context.test.ts`
Expected: FAIL — cannot find module `@/lib/series/ambient-context`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/series/ambient-context.ts
import type { StyleMetrics } from "@/lib/series/chapter-metrics";

export interface PriorCharacter {
  bookNumber: number;
  name: string;
  aliases: string[];
  role: string | null;
  status: string | null;
  lastMentioned: number | null;
  description: string | null;
}

export interface PriorThread {
  bookNumber: number;
  name: string;
  status: string;
  relatedNames: string[];
}

export interface AmbientContextInput {
  currentBookNumber: number;
  onStageNames: string[];
  priorBookCharacters: PriorCharacter[];
  openThreads: PriorThread[];
  currentStyleMetrics: StyleMetrics | null;
  seriesBaselineMetrics: StyleMetrics | null;
  baselineBookNumber: number | null;
}

export interface AmbientCharacterView {
  name: string;
  matchedFrom: string | null;
  lastBook: number;
  lastChapter: number | null;
  role: string | null;
  status: string | null;
  description: string | null;
  aliases: string[];
}

export interface AmbientThreadView {
  name: string;
  fromBook: number;
  status: string;
  relatedNames: string[];
}

export interface ToneMetricView {
  key: string;
  current: number;
  baseline: number;
  deltaPct: number;
  material: boolean;
}

export interface AmbientContextView {
  characters: AmbientCharacterView[];
  threads: AmbientThreadView[];
  toneDrift: { baselineBook: number; metrics: ToneMetricView[] } | null;
  notReady: boolean;
}

export const MATERIALITY_PCT = 20;

/** Lowercase, strip diacritics, collapse whitespace. Total on any input. */
function normalize(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function aliasSet(c: PriorCharacter): Set<string> {
  const names = [c.name, ...(Array.isArray(c.aliases) ? c.aliases : [])];
  return new Set(names.map(normalize).filter((n) => n.length > 0));
}

/** Latest book wins; tie broken by higher lastMentioned. */
function isLater(a: PriorCharacter, b: PriorCharacter): boolean {
  if (a.bookNumber !== b.bookNumber) return a.bookNumber > b.bookNumber;
  return (a.lastMentioned ?? 0) > (b.lastMentioned ?? 0);
}

function matchCharacters(
  onStageNames: string[],
  prior: PriorCharacter[]
): AmbientCharacterView[] {
  const out: AmbientCharacterView[] = [];
  for (const token of onStageNames) {
    const norm = normalize(token);
    if (norm.length === 0) continue;
    let best: PriorCharacter | null = null;
    for (const c of prior) {
      if (aliasSet(c).has(norm)) {
        if (best === null || isLater(c, best)) best = c;
      }
    }
    if (best === null) continue;
    if (out.some((v) => v.name === best!.name && v.lastBook === best!.bookNumber)) continue;
    out.push({
      name: best.name,
      matchedFrom: normalize(best.name) === norm ? null : token,
      lastBook: best.bookNumber,
      lastChapter: best.lastMentioned,
      role: best.role,
      status: best.status,
      description: best.description,
      aliases: Array.isArray(best.aliases) ? best.aliases : [],
    });
  }
  return out;
}

function filterThreads(
  threads: PriorThread[],
  onStageNorm: Set<string>
): AmbientThreadView[] {
  const out: AmbientThreadView[] = [];
  for (const t of threads) {
    if (t.status === "resolved" || t.status === "abandoned") continue;
    const related = Array.isArray(t.relatedNames) ? t.relatedNames : [];
    if (related.some((n) => onStageNorm.has(normalize(n)))) {
      out.push({ name: t.name, fromBook: t.bookNumber, status: t.status, relatedNames: related });
    }
  }
  return out;
}

function toneDrift(
  current: StyleMetrics | null,
  baseline: StyleMetrics | null,
  baselineBook: number | null
): AmbientContextView["toneDrift"] {
  if (!current || !baseline || baselineBook == null) return null;
  const keys: (keyof StyleMetrics)[] = [
    "avgWordsPerSentence",
    "dialogueRatio",
    "avgSentencesPerParagraph",
  ];
  const metrics: ToneMetricView[] = [];
  for (const key of keys) {
    const b = baseline[key];
    const c = current[key];
    if (typeof b !== "number" || typeof c !== "number" || b <= 0) continue;
    const deltaPct = Math.round(((c - b) / b) * 100);
    metrics.push({ key, current: c, baseline: b, deltaPct, material: Math.abs(deltaPct) >= MATERIALITY_PCT });
  }
  return { baselineBook, metrics };
}

export function buildAmbientContext(input: AmbientContextInput): AmbientContextView {
  const onStage = (input.onStageNames ?? []).filter((n) => normalize(n).length > 0);
  const prior = (input.priorBookCharacters ?? []).filter((c) => c.bookNumber < input.currentBookNumber);
  const onStageNorm = new Set(onStage.map(normalize));

  return {
    characters: matchCharacters(onStage, prior),
    threads: filterThreads(input.openThreads ?? [], onStageNorm),
    toneDrift: toneDrift(input.currentStyleMetrics, input.seriesBaselineMetrics, input.baselineBookNumber),
    notReady: onStage.length === 0,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ambient-context.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/series/ambient-context.ts tests/unit/ambient-context.test.ts
git commit -m "feat: pure ambient-context resolver — cross-book match + tone drift (Tier 4.3)"
```

---

### Task 3: New graph query — prior-book character state

`getCharacterNetwork` returns only `{name, role, connections}`. We need full character state. Add a focused read query alongside the existing ones.

**Files:**
- Modify: `src/lib/graph/graph-queries.ts` (append a new exported function + result type near the other query fns, e.g. after `getChapterEntities` around line 223)

**Interfaces:**
- Consumes: `withSession` and the private `toNumber` helper already in the file.
- Produces:
  - `interface BookCharacterState { name: string; aliases: string[]; role: string | null; status: string | null; lastMentioned: number | null; firstAppearance: number | null; description: string | null }`
  - `function getBookCharacterStates(bookId: string): Promise<BookCharacterState[]>`

- [ ] **Step 1: Add the result type and query function**

Add this exported interface to the query-result types (top of file is fine, or just above the function):

```ts
export interface BookCharacterState {
  name: string;
  aliases: string[];
  role: string | null;
  status: string | null;
  lastMentioned: number | null;
  firstAppearance: number | null;
  description: string | null;
}
```

Add this function after `getChapterEntities` (before `runConsistencyChecks`):

```ts
/**
 * Get full state for every character in a book (role, status, aliases, chapter
 * span, description). Used by ambient series awareness to surface a prior
 * book's character state while writing a later book. Read-only, no LLM.
 */
export async function getBookCharacterStates(
  bookId: string
): Promise<BookCharacterState[]> {
  return withSession("READ", async (session) => {
    const result = await session.run(
      `MATCH (c:Character {bookId: $bookId})
       RETURN c.name AS name, c.aliases AS aliases, c.role AS role,
              c.status AS status, c.lastMentioned AS lastMentioned,
              c.firstAppearance AS firstAppearance, c.description AS description
       ORDER BY c.lastMentioned DESC`,
      { bookId }
    );

    return result.records.map((rec) => ({
      name: rec.get("name") as string,
      aliases: (rec.get("aliases") as string[] | null) ?? [],
      role: (rec.get("role") as string | null) ?? null,
      status: (rec.get("status") as string | null) ?? null,
      lastMentioned:
        rec.get("lastMentioned") != null ? toNumber(rec.get("lastMentioned")) : null,
      firstAppearance:
        rec.get("firstAppearance") != null ? toNumber(rec.get("firstAppearance")) : null,
      description: (rec.get("description") as string | null) ?? null,
    }));
  });
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: exit 0 (no new errors). *(No unit test: graph queries in this file are integration-verified against a live Neo4j — consistent with the 6 existing untested query functions. The mapping is exercised indirectly by Task 4's mocked sources test and by the deferred live smoke.)*

- [ ] **Step 3: Commit**

```bash
git add src/lib/graph/graph-queries.ts
git commit -m "feat: getBookCharacterStates graph query for prior-book state (Tier 4.3)"
```

---

### Task 4: I/O sources layer

Wraps each data source. Per-**book** isolation lives here (`Promise.allSettled`) so one prior book's graph failure doesn't drop the others; whole-**source** isolation lives in the route (Task 5).

**Files:**
- Create: `src/lib/series/ambient-sources.ts`
- Test: `tests/unit/ambient-sources.test.ts`

**Interfaces:**
- Consumes: `getChapterEntities`, `getPlotThreads`, `getBookCharacterStates` (Task 3) from `@/lib/graph/graph-queries`; `db` from `@/lib/db`; `DocumentService` from `@/lib/documents`; `DocumentType` from `@/generated/prisma/enums`; `computeChapterMetrics` (Task 1); `PriorCharacter`, `PriorThread` (Task 2); `StyleMetrics` (Task 1); `StructuredFingerprint` from `@/lib/agents/types`.
- Produces: (all exported)
  - `type PriorBookRef = { id: string; bookNumber: number }`
  - `function getOnStageNames(bookId: string, chapterNumber: number): Promise<string[]>`
  - `function getPriorCharacters(priorBooks: PriorBookRef[]): Promise<PriorCharacter[]>`
  - `function getOpenThreads(priorBooks: PriorBookRef[]): Promise<PriorThread[]>`
  - `function getStyleBaseline(userId: string, seriesBookIds: string[]): Promise<{ metrics: StyleMetrics | null; baselineBookNumber: number | null }>`
  - `function getCurrentChapterMetrics(userId: string, bookId: string, chapterNumber: number): Promise<StyleMetrics | null>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/ambient-sources.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getChapterEntities: vi.fn(),
  getPlotThreads: vi.fn(),
  getBookCharacterStates: vi.fn(),
  styleFindFirst: vi.fn(),
}));

vi.mock("@/lib/graph/graph-queries", () => ({
  getChapterEntities: h.getChapterEntities,
  getPlotThreads: h.getPlotThreads,
  getBookCharacterStates: h.getBookCharacterStates,
}));
vi.mock("@/lib/db", () => ({ db: { styleProfile: { findFirst: h.styleFindFirst } } }));

import {
  getPriorCharacters,
  getOpenThreads,
  getStyleBaseline,
} from "@/lib/series/ambient-sources";

beforeEach(() => vi.clearAllMocks());

describe("getPriorCharacters", () => {
  it("flattens per-book states, tagging bookNumber", async () => {
    h.getBookCharacterStates.mockResolvedValueOnce([
      { name: "Milan", aliases: ["Cap"], role: "supporting", status: "alive", lastMentioned: 18, firstAppearance: 2, description: "d" },
    ]);
    const out = await getPriorCharacters([{ id: "b1", bookNumber: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0].bookNumber).toBe(1);
    expect(out[0].name).toBe("Milan");
  });

  it("isolates a failing book — others still return", async () => {
    h.getBookCharacterStates
      .mockRejectedValueOnce(new Error("neo4j down"))
      .mockResolvedValueOnce([{ name: "Ana", aliases: [], role: "minor", status: "alive", lastMentioned: 3, firstAppearance: 1, description: null }]);
    const out = await getPriorCharacters([{ id: "b1", bookNumber: 1 }, { id: "b2", bookNumber: 2 }]);
    expect(out.map((c) => c.name)).toEqual(["Ana"]);
  });
});

describe("getOpenThreads", () => {
  it("keeps only unresolved threads and maps relatedNames", async () => {
    h.getPlotThreads.mockResolvedValueOnce({
      threads: [
        { name: "Open", type: "mystery", status: "developing", introducedChapter: 4, resolvedChapter: undefined, relatedCharacters: ["Milan"] },
        { name: "Done", type: "main", status: "resolved", introducedChapter: 1, resolvedChapter: 20, relatedCharacters: ["Ana"] },
      ],
    });
    const out = await getOpenThreads([{ id: "b1", bookNumber: 1 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Open", bookNumber: 1, relatedNames: ["Milan"] });
  });
});

describe("getStyleBaseline", () => {
  it("maps a StructuredFingerprint into StyleMetrics", async () => {
    h.styleFindFirst.mockResolvedValueOnce({
      sourceBookNumber: 1,
      metrics: { sentenceLength: { mean: 18 }, dialogueRatio: 0.25, paragraphLength: { mean: 4 } },
    });
    const out = await getStyleBaseline("u1", ["b1", "b2"]);
    expect(out.baselineBookNumber).toBe(1);
    expect(out.metrics).toEqual({ avgWordsPerSentence: 18, dialogueRatio: 0.25, avgSentencesPerParagraph: 4 });
  });

  it("returns nulls when no profile exists", async () => {
    h.styleFindFirst.mockResolvedValueOnce(null);
    const out = await getStyleBaseline("u1", ["b1"]);
    expect(out).toEqual({ metrics: null, baselineBookNumber: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/ambient-sources.test.ts`
Expected: FAIL — cannot find module `@/lib/series/ambient-sources`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/series/ambient-sources.ts
import { db } from "@/lib/db";
import { DocumentService } from "@/lib/documents";
import { DocumentType } from "@/generated/prisma/enums";
import {
  getChapterEntities,
  getPlotThreads,
  getBookCharacterStates,
} from "@/lib/graph/graph-queries";
import { computeChapterMetrics, type StyleMetrics } from "@/lib/series/chapter-metrics";
import type { PriorCharacter, PriorThread } from "@/lib/series/ambient-context";
import type { StructuredFingerprint } from "@/lib/agents/types";

export type PriorBookRef = { id: string; bookNumber: number };

/** Characters on stage in the current chapter (by name). Throws on graph error. */
export async function getOnStageNames(
  bookId: string,
  chapterNumber: number
): Promise<string[]> {
  const entities = await getChapterEntities(bookId, chapterNumber);
  return entities.characters;
}

/** Full character state across all prior books; per-book failure isolated. */
export async function getPriorCharacters(
  priorBooks: PriorBookRef[]
): Promise<PriorCharacter[]> {
  const settled = await Promise.allSettled(
    priorBooks.map(async (b) => {
      const states = await getBookCharacterStates(b.id);
      return states.map((s) => ({
        bookNumber: b.bookNumber,
        name: s.name,
        aliases: s.aliases,
        role: s.role,
        status: s.status,
        lastMentioned: s.lastMentioned,
        description: s.description,
      }));
    })
  );
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Unresolved plot threads across all prior books; per-book failure isolated. */
export async function getOpenThreads(
  priorBooks: PriorBookRef[]
): Promise<PriorThread[]> {
  const settled = await Promise.allSettled(
    priorBooks.map(async (b) => {
      const { threads } = await getPlotThreads(b.id);
      return threads
        .filter((t) => t.resolvedChapter == null && (t.status === "introduced" || t.status === "developing"))
        .map((t) => ({
          bookNumber: b.bookNumber,
          name: t.name,
          status: t.status,
          relatedNames: t.relatedCharacters,
        }));
    })
  );
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

function fingerprintToMetrics(fp: StructuredFingerprint | null | undefined): StyleMetrics | null {
  if (!fp || typeof fp !== "object") return null;
  const sentenceMean = fp.sentenceLength?.mean;
  const paragraphMean = fp.paragraphLength?.mean;
  const dialogue = fp.dialogueRatio;
  if (typeof sentenceMean !== "number" || typeof paragraphMean !== "number" || typeof dialogue !== "number") {
    return null;
  }
  return {
    avgWordsPerSentence: sentenceMean,
    dialogueRatio: dialogue,
    avgSentencesPerParagraph: paragraphMean,
  };
}

/** The series' author-style baseline: earliest calibrated StyleProfile in the series. */
export async function getStyleBaseline(
  userId: string,
  seriesBookIds: string[]
): Promise<{ metrics: StyleMetrics | null; baselineBookNumber: number | null }> {
  const profile = await db.styleProfile.findFirst({
    where: { userId, sourceBookId: { in: seriesBookIds } },
    orderBy: { sourceBookNumber: "asc" },
  });
  if (!profile) return { metrics: null, baselineBookNumber: null };
  return {
    metrics: fingerprintToMetrics(profile.metrics as unknown as StructuredFingerprint),
    baselineBookNumber: profile.sourceBookNumber ?? null,
  };
}

/** Objective metrics for the current chapter's stored content. */
export async function getCurrentChapterMetrics(
  userId: string,
  bookId: string,
  chapterNumber: number
): Promise<StyleMetrics | null> {
  const svc = new DocumentService(userId, bookId);
  const doc = await svc.findByType(DocumentType.CHAPTER_CONTENT, chapterNumber);
  if (!doc) return null;
  const result = await svc.readPinned(doc.id);
  const content = result?.content ?? "";
  return computeChapterMetrics(content);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/ambient-sources.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series/ambient-sources.ts tests/unit/ambient-sources.test.ts
git commit -m "feat: ambient-sources I/O layer with per-book failure isolation (Tier 4.3)"
```

---

### Task 5: series-context route

Thin orchestration: auth → ownership → validate → gather (each source wrapped) → resolve → envelope. Never runs an agent or writes.

**Files:**
- Create: `src/app/api/books/[id]/series-context/route.ts`
- Test: `tests/unit/series-context-route.test.ts`

**Interfaces:**
- Consumes: `requireUser`, `db`, `buildAmbientContext` (Task 2), all `ambient-sources` fns (Task 4).
- Produces: `GET` handler returning the §5 envelope.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/series-context-route.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  user: { id: "u1" },
  db: { book: { findFirst: vi.fn(), findMany: vi.fn() } },
  sources: {
    getOnStageNames: vi.fn(),
    getPriorCharacters: vi.fn(),
    getOpenThreads: vi.fn(),
    getStyleBaseline: vi.fn(),
    getCurrentChapterMetrics: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => Promise.resolve(h.user) }));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/series/ambient-sources", () => h.sources);

import { GET } from "@/app/api/books/[id]/series-context/route";

const ctx = { params: Promise.resolve({ id: "b2" }) };
function req(qs: string) {
  return new Request(`http://t/api/books/b2/series-context${qs}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sources.getOnStageNames.mockResolvedValue(["Milan"]);
  h.sources.getPriorCharacters.mockResolvedValue([
    { bookNumber: 1, name: "Milan", aliases: [], role: "supporting", status: "alive", lastMentioned: 18, description: "d" },
  ]);
  h.sources.getOpenThreads.mockResolvedValue([]);
  h.sources.getStyleBaseline.mockResolvedValue({ metrics: null, baselineBookNumber: null });
  h.sources.getCurrentChapterMetrics.mockResolvedValue(null);
});

describe("GET /series-context", () => {
  it("400s on a missing/invalid chapterNumber", async () => {
    const res = await GET(req("") as never, ctx as never);
    expect(res.status).toBe(400);
  });

  it("404s when the book is not owned", async () => {
    h.db.book.findFirst.mockResolvedValue(null);
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    expect(res.status).toBe(404);
  });

  it("returns series:null for a standalone book", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b2", bookNumber: 1, seriesId: null, series: null });
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.series).toBeNull();
  });

  it("returns a populated envelope on the happy path", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b2", bookNumber: 2, seriesId: "s1", series: { id: "s1", title: "Saga", seriesType: "TRILOGY" } });
    h.db.book.findMany.mockResolvedValue([{ id: "b1", bookNumber: 1 }]);
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.series.currentBookNumber).toBe(2);
    expect(json.characters[0].name).toBe("Milan");
    expect(json.meta.sourcesAvailable.graph).toBe(true);
  });

  it("never 500s when a graph source throws — panel empty, flag false", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b2", bookNumber: 2, seriesId: "s1", series: { id: "s1", title: "Saga", seriesType: "TRILOGY" } });
    h.db.book.findMany.mockResolvedValue([{ id: "b1", bookNumber: 1 }]);
    h.sources.getPriorCharacters.mockRejectedValue(new Error("neo4j down"));
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.meta.sourcesAvailable.graph).toBe(false);
    expect(json.characters).toEqual([]);
  });

  it("flags notReady when the current chapter has no on-stage cast", async () => {
    h.db.book.findFirst.mockResolvedValue({ id: "b2", bookNumber: 2, seriesId: "s1", series: { id: "s1", title: "Saga", seriesType: "TRILOGY" } });
    h.db.book.findMany.mockResolvedValue([{ id: "b1", bookNumber: 1 }]);
    h.sources.getOnStageNames.mockResolvedValue([]);
    const res = await GET(req("?chapterNumber=7") as never, ctx as never);
    const json = await res.json();
    expect(json.meta.notReady).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/series-context-route.test.ts`
Expected: FAIL — cannot find module `.../series-context/route`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/api/books/[id]/series-context/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildAmbientContext } from "@/lib/series/ambient-context";
import {
  getOnStageNames,
  getPriorCharacters,
  getOpenThreads,
  getStyleBaseline,
  getCurrentChapterMetrics,
  type PriorBookRef,
} from "@/lib/series/ambient-sources";
import type { PriorCharacter, PriorThread } from "@/lib/series/ambient-context";
import type { StyleMetrics } from "@/lib/series/chapter-metrics";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({ chapterNumber: z.coerce.number().int().positive() });

export async function GET(request: NextRequest, { params }: RouteParams) {
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

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { series: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!book.seriesId || !book.series) {
      return NextResponse.json({
        series: null,
        chapterNumber,
        characters: [],
        threads: [],
        toneDrift: null,
        meta: { notReady: false, sourcesAvailable: { graph: false, style: false } },
      });
    }

    const priorBooks: PriorBookRef[] = await db.book.findMany({
      where: { seriesId: book.seriesId, bookNumber: { lt: book.bookNumber } },
      select: { id: true, bookNumber: true },
      orderBy: { bookNumber: "asc" },
    });

    // Per-source failure isolation — a dependency outage must never 500 the sidebar.
    let graphOk = true;
    let styleOk = true;

    let onStageNames: string[] = [];
    try { onStageNames = await getOnStageNames(book.id, chapterNumber); }
    catch { graphOk = false; }

    let priorBookCharacters: PriorCharacter[] = [];
    try { priorBookCharacters = await getPriorCharacters(priorBooks); }
    catch { graphOk = false; }

    let openThreads: PriorThread[] = [];
    try { openThreads = await getOpenThreads(priorBooks); }
    catch { graphOk = false; }

    let baseline: { metrics: StyleMetrics | null; baselineBookNumber: number | null } = {
      metrics: null,
      baselineBookNumber: null,
    };
    try { baseline = await getStyleBaseline(user.id, [book.id, ...priorBooks.map((b) => b.id)]); }
    catch { styleOk = false; }
    if (!baseline.metrics) styleOk = false;

    let currentStyleMetrics: StyleMetrics | null = null;
    try { currentStyleMetrics = await getCurrentChapterMetrics(user.id, book.id, chapterNumber); }
    catch { /* tone panel simply hides */ }

    const view = buildAmbientContext({
      currentBookNumber: book.bookNumber,
      onStageNames,
      priorBookCharacters,
      openThreads,
      currentStyleMetrics,
      seriesBaselineMetrics: baseline.metrics,
      baselineBookNumber: baseline.baselineBookNumber,
    });

    return NextResponse.json({
      series: {
        id: book.series.id,
        title: book.series.title,
        seriesType: book.series.seriesType,
        currentBookNumber: book.bookNumber,
      },
      chapterNumber,
      characters: view.characters,
      threads: view.threads,
      toneDrift: view.toneDrift,
      meta: { notReady: view.notReady, sourcesAvailable: { graph: graphOk, style: styleOk } },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[series-context]", error);
    return NextResponse.json({ error: "Failed to load series context" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/series-context-route.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/books/[id]/series-context/route.ts" tests/unit/series-context-route.test.ts
git commit -m "feat: series-context route — read-only, per-source isolated (Tier 4.3)"
```

---

### Task 6: Client hook + editor-store toggle flag

**Files:**
- Create: `src/hooks/use-ambient-context.ts`
- Modify: `src/stores/editor-store.ts` (add `showSeriesContext` state + `toggleSeriesContext` action)

**Interfaces:**
- Consumes: `fetchJson` from `@/lib/api-client`; the route envelope shape.
- Produces:
  - `interface AmbientContextData { series: {...} | null; chapterNumber: number; characters: AmbientCharacterView[]; threads: AmbientThreadView[]; toneDrift: {...} | null; meta: { notReady: boolean; sourcesAvailable: { graph: boolean; style: boolean } } }`
  - `function useAmbientContext(bookId: string, chapterNumber: number | null, enabled: boolean)` → `UseQueryResult<AmbientContextData>`
  - editor store: `showSeriesContext: boolean`, `toggleSeriesContext: () => void`

- [ ] **Step 1: Add the store flag**

In `src/stores/editor-store.ts`:
- Add to `EditorPaneState` interface (near `showFindings: boolean;` line 47): `showSeriesContext: boolean;`
- Add to the actions block (near `toggleFindings: () => void;` line 67): `toggleSeriesContext: () => void;`
- Add to `initialPaneState` (near `showFindings: false,` line 95): `showSeriesContext: false,`
- Add the action in the factory (near `toggleFindings:` line 148):
```ts
    toggleSeriesContext: () =>
      set((s) => ({ showSeriesContext: !s.showSeriesContext })),
```

- [ ] **Step 2: Create the hook**

```ts
// src/hooks/use-ambient-context.ts
"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import type {
  AmbientCharacterView,
  AmbientThreadView,
} from "@/lib/series/ambient-context";

export interface AmbientContextData {
  series: { id: string; title: string; seriesType: string; currentBookNumber: number } | null;
  chapterNumber: number;
  characters: AmbientCharacterView[];
  threads: AmbientThreadView[];
  toneDrift: { baselineBook: number; metrics: Array<{ key: string; current: number; baseline: number; deltaPct: number; material: boolean }> } | null;
  meta: { notReady: boolean; sourcesAvailable: { graph: boolean; style: boolean } };
}

/**
 * Fetches ambient series context for the currently-open chapter. Cached 5 min,
 * re-queried on chapter switch (chapterNumber is part of the key). Disabled
 * until the panel is open and a chapter is loaded.
 */
export function useAmbientContext(
  bookId: string,
  chapterNumber: number | null,
  enabled: boolean
): UseQueryResult<AmbientContextData> {
  return useQuery<AmbientContextData>({
    queryKey: ["ambient-context", bookId, chapterNumber],
    queryFn: () =>
      fetchJson(`/api/books/${bookId}/series-context?chapterNumber=${chapterNumber}`),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: enabled && chapterNumber != null,
  });
}
```

- [ ] **Step 3: Verify type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-ambient-context.ts src/stores/editor-store.ts
git commit -m "feat: useAmbientContext hook + editor-store showSeriesContext flag (Tier 4.3)"
```

---

### Task 7: AmbientSeriesPanel component + toolbar toggle + editor mount

The UI. Renders three sections from `useAmbientContext`, distinguishing loading / notReady / graph-offline / normal. Mounted like the version-history sidebar (a `w-72 border-l` column on `lg+`, a Sheet below) and toggled from the toolbar's Panels group. **No unit test** (node-env suite, no jsdom) — gated on `tsc --noEmit` + prod build; live behavior is deferred smoke.

> **Implementation note (deviation from spec §7):** the spec proposed a "segmented findings|series" control, but the live editor already mounts version-history as an independent toggle-able side column alongside findings. Mirroring that established pattern (independent column) is lower-risk than inventing a segmented control; do it that way.

**Files:**
- Create: `src/components/editor/ambient-series-panel.tsx`
- Modify: `src/components/editor/editor-toolbar.tsx` (add two props + a toggle button in the `panels` group)
- Modify: `src/components/editor/manuscript-editor.tsx` (read `showSeriesContext`, pass toolbar props, mount the panel)

**Interfaces:**
- Consumes: `useAmbientContext` (Task 6), `AmbientContextData` (Task 6).
- Produces: `function AmbientSeriesPanel(props: { bookId: string; chapterNumber: number | null; onClose?: () => void })`

- [ ] **Step 1: Create the panel component**

```tsx
// src/components/editor/ambient-series-panel.tsx
"use client";

import {
  LibraryIcon,
  RefreshCwIcon,
  Loader2Icon,
  UsersIcon,
  GitBranchIcon,
  ActivityIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAmbientContext } from "@/hooks/use-ambient-context";

interface AmbientSeriesPanelProps {
  bookId: string;
  chapterNumber: number | null;
  onClose?: () => void;
}

export function AmbientSeriesPanel({ bookId, chapterNumber, onClose }: AmbientSeriesPanelProps) {
  const { data, isLoading, isError, refetch, isFetching } = useAmbientContext(
    bookId,
    chapterNumber,
    true
  );

  const graphOffline = data?.meta.sourcesAvailable.graph === false;
  const notReady = data?.meta.notReady === true;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <LibraryIcon className="size-4" />
          Series context
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-6" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh series context">
            {isFetching ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="size-6" onClick={onClose} aria-label="Close series context">
              <XIcon className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2Icon className="size-3 animate-spin" /> Loading series context...
            </div>
          ) : isError ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Couldn&apos;t load series context.</p>
          ) : graphOffline ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Series graph unavailable right now.</p>
          ) : notReady ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Keep writing — series context appears once this chapter&apos;s cast is detected.</p>
          ) : (
            <>
              {/* Characters */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <UsersIcon className="size-3" /> Characters ({data?.characters.length ?? 0})
                </div>
                {data && data.characters.length > 0 ? (
                  data.characters.map((c) => (
                    <div key={`${c.name}-${c.lastBook}`} className="rounded-md border p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{c.name}</span>
                        <Badge variant="outline" className="text-[9px]">
                          B{c.lastBook}{c.lastChapter != null ? `·Ch${c.lastChapter}` : ""}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {[c.role, c.status].filter(Boolean).join(" · ")}
                      </p>
                      {c.description && <p className="text-[11px] mt-1 italic">{c.description}</p>}
                      {c.matchedFrom && <p className="text-[10px] text-muted-foreground mt-1">matched &ldquo;{c.matchedFrom}&rdquo;</p>}
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground">No prior-book characters on stage here.</p>
                )}
              </section>

              {/* Open threads */}
              <section className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <GitBranchIcon className="size-3" /> Open threads ({data?.threads.length ?? 0})
                </div>
                {data && data.threads.length > 0 ? (
                  data.threads.map((t) => (
                    <div key={`${t.name}-${t.fromBook}`} className="rounded-md border p-2">
                      <span className="text-sm">{t.name}</span>
                      <p className="text-[10px] text-muted-foreground">B{t.fromBook} · {t.status}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-[11px] text-muted-foreground">No open threads touch this chapter.</p>
                )}
              </section>

              {/* Tone drift — advisory only */}
              {data?.toneDrift && data.toneDrift.metrics.some((m) => m.material) && (
                <section className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    <ActivityIcon className="size-3" /> Tone vs Book {data.toneDrift.baselineBook}
                  </div>
                  {data.toneDrift.metrics.filter((m) => m.material).map((m) => (
                    <p key={m.key} className="text-[11px] text-muted-foreground">
                      {m.key}: {m.deltaPct > 0 ? "▲" : "▼"}{Math.abs(m.deltaPct)}% vs series
                    </p>
                  ))}
                  <p className="text-[10px] text-muted-foreground/70 italic">advisory — not a finding</p>
                </section>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Add the toolbar toggle**

In `src/components/editor/editor-toolbar.tsx`:
1. Add `LibraryBig` to the lucide import block (line 5-31).
2. Add two props to `EditorToolbarProps` (after `onToggleFindings?` line 66): `showSeriesContext?: boolean;` and `onToggleSeriesContext?: () => void;`
3. Add the same two to `ToolbarGroupContext` (after `onToggleFindings?` line 167).
4. Add them to the destructured `EditorToolbar({...})` params and to the `ctx` object built at line 612 (mirror how `showFindings`/`onToggleFindings` are threaded).
5. In the `panels` group `render` (after the Findings button, before the History button at line 526), add:
```tsx
        {ctx.onToggleSeriesContext && (
          <ToolbarButton
            icon={<LibraryBig className="h-4 w-4" />}
            label="Series Context"
            isActive={ctx.showSeriesContext}
            pressed={!!ctx.showSeriesContext}
            onClick={ctx.onToggleSeriesContext}
          />
        )}
```

- [ ] **Step 3: Mount the panel in the editor**

In `src/components/editor/manuscript-editor.tsx`:
1. Import the panel near the other editor imports: `import { AmbientSeriesPanel } from "./ambient-series-panel";`
2. Read the flag alongside the existing `showFindings` selector (search for `useEditorPaneStore(paneId, (s) => s.showFindings)`):
```ts
  const showSeriesContext = useEditorPaneStore(paneId, (s) => s.showSeriesContext);
```
3. Pass toolbar props where `<EditorToolbar ... />` is rendered (search for `onToggleFindings=`), add:
```tsx
        showSeriesContext={showSeriesContext}
        onToggleSeriesContext={() => paneStore.getState().toggleSeriesContext()}
```
4. Mount the panel next to the version-history sidebar block (the `{isLg ? (showVersionHistory && ...) : (<VersionHistorySheet .../>)}` block at lines 1320-1342). Add immediately after that block, before the closing `</div>` at line 1343:
```tsx
      {/* Ambient series context — inline column on lg+, Sheet on smaller screens */}
      {isLg ? (
        showSeriesContext && (
          <div className="w-72 border-l flex flex-col">
            <AmbientSeriesPanel
              bookId={bookId}
              chapterNumber={chapterNumber}
              onClose={() => paneStore.getState().toggleSeriesContext()}
            />
          </div>
        )
      ) : (
        <FindingsSheet
          open={showSeriesContext}
          onOpenChange={(open) => {
            if (!open && paneStore.getState().showSeriesContext) {
              paneStore.getState().toggleSeriesContext();
            }
          }}
          side={isMobile ? "bottom" : "right"}
          paneRootRef={paneRootRef}
        >
          <AmbientSeriesPanel bookId={bookId} chapterNumber={chapterNumber} />
        </FindingsSheet>
      )}
```
*(Reuses the already-imported `FindingsSheet`, `isLg`, `isMobile`, `paneRootRef`, `chapterNumber`, `bookId`, `paneStore` from the surrounding component — confirm each is in scope; they are all used by the findings/version-history blocks directly above.)*

- [ ] **Step 4: Type-check and build**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npx vitest run`
Expected: all unit tests PASS (existing + the 4 new files).

Run: `npx next build`
Expected: compiles (a failure only on the local `.env` placeholder assertion is acceptable — matches the 4.1/4.2 gate; a real TypeScript/lint error is not).

- [ ] **Step 5: Commit**

```bash
git add src/components/editor/ambient-series-panel.tsx src/components/editor/editor-toolbar.tsx src/components/editor/manuscript-editor.tsx
git commit -m "feat: AmbientSeriesPanel sidebar + toolbar toggle + editor mount (Tier 4.3)"
```

---

### Task 8: Roadmap update + verification gate

**Files:**
- Modify: `docs/IMPROVEMENT-ROADMAP.md` (mark 4.3 foundation shipped)

- [ ] **Step 1: Mark 4.3 shipped**

Under `### 4.3 Ambient series awareness ...`, prepend a `✅ SHIPPED 2026-07-02 (foundation)` note mirroring the 4.1/4.2 entries: read-only ambient sidebar (prior-book character state via cross-book alias match, open threads, advisory tone drift) on a new read-only `series-context` route, no agent run; 4.4 live net + vector enrichment + thread-from-SERIES_ARCHITECTURE deferred. Update the top progress banner (lines 5-12) to include 4.3.

- [ ] **Step 2: Full verification gate**

Run: `npx tsc --noEmit` → exit 0.
Run: `npx vitest run` → all green (report the count).
Run: `npx next build` → compiles.

- [ ] **Step 3: Commit**

```bash
git add docs/IMPROVEMENT-ROADMAP.md
git commit -m "docs: mark Tier 4.3 ambient series awareness foundation shipped"
```

---

## Deferred verification (documented, not silently claimed)

Live DB/Neo4j/Qdrant are unreachable in this environment. The following require a live stack and are **not** covered by this plan's gate:
- Real `/series-context` fetch against a populated multi-book series (alias + i18n name match).
- Chapter-switch re-query in the live editor; toggle + mobile Sheet.
- Graph-offline path (`sourcesAvailable.graph=false`) rendering.
- No schema/DB change is introduced, so **no `prisma db push` is required** for 4.3 (unlike the 4.2 deploy gate).

## Self-review notes

- **Spec coverage:** §3 modules → Tasks 1,2,4,5,6,7; §4 data flow → Task 5; §5 envelope → Task 5; §6 degradation → Tasks 4 (per-book) + 5 (per-source) + 7 (UI states); §7 UI → Task 7; §8 testing → per-task tests + Task 8 gate; §9 invariants → route test (ownership 404, read-only, isolation, 400 validation). §2 vector enrichment intentionally dropped from v1 (documented).
- **Type consistency:** `StyleMetrics` defined once (Task 1), imported everywhere; `PriorCharacter`/`PriorThread`/view types defined once (Task 2); `getBookCharacterStates`→`BookCharacterState` (Task 3) consumed only by Task 4; envelope shape identical in route (Task 5) and hook (Task 6).
- **No placeholders:** every code step is complete and runnable.
