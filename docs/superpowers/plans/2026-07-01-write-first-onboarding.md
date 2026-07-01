# Write-First Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New book → blank editor → start typing; the AI pipeline follows via word-count milestones (offers for style/architecture/bible), with the setup wizard demoted to opt-in.

**Architecture:** A pure decision function (`computeOnboardingOffers`) + SSR-safe localStorage helpers hold all the trigger logic (unit-tested). A client hook (`useOnboardingOffers`), mounted via a null-rendering `OnboardingWatcher` on the chapter editor page, reads live cumulative word count (published into the React Query cache by the save mutation), artifact types (`["book-documents", bookId]`), and localStorage state; it fires a Sonner toast on a live threshold crossing and publishes pending offers to `agent-ui-store` for a badge on the companion bubble. Three small backend edits: `POST /api/books` creates an empty Chapter 1 and returns `firstChapterId`; the save route returns `bookWordCount`; the new-book page redirects straight to the editor.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Zustand, TanStack Query, Sonner, Prisma 7, Vitest.

## Global Constraints

- **No database schema changes.** (Chapter, DocumentType, BookSettings.setupComplete already exist.)
- Thresholds (verbatim): `capture-style` = 2000, `build-architecture` = 5000, `create-story-bible` = 10000.
- Artifact types (verbatim): `capture-style`→`FINGERPRINT`, `build-architecture`→`ARCHITECTURE`, `create-story-bible`→`STORY_BIBLE`.
- Every AI action is **user-initiated** — no automatic/background agent runs.
- A given offer toasts **at most once ever per book**. **Ignore** (auto-expire/close) keeps it on the badge; **Dismiss** (`[Not now]`) removes it from the badge permanently. Suppressed entirely when the artifact exists or `setupComplete` is true.
- localStorage keys: `wmb:onboard-dismissed:{bookId}`, `wmb:onboard-toasted:{bookId}` (each a JSON `string[]` of workflowIds).
- All TypeScript must pass `npx tsc --noEmit`. Unit tests run via `npm run test:unit`.
- Commit messages: conventional commits, no attribution trailers.

---

## File Structure

**New files**
- `src/lib/onboarding/offers.ts` — pure trigger logic (`ONBOARDING_OFFERS`, `computeOnboardingOffers`, types).
- `src/lib/onboarding/local-state.ts` — SSR-guarded localStorage for `dismissed` + `toasted`.
- `src/hooks/use-onboarding-offers.ts` — client watcher hook (word count + artifacts + toast + badge publish).
- `src/components/onboarding/onboarding-watcher.tsx` — null-rendering client mount.
- `tests/unit/onboarding-offers.test.ts`, `tests/unit/onboarding-local-state.test.ts`.

**Modified files**
- `src/stores/agent-ui-store.ts` — add `onboardingOffers` state + `setOnboardingOffers`.
- `src/components/agent/ai-companion-bubble.tsx` — render pending-offer pills (badge).
- `src/app/api/books/route.ts` — create empty Chapter 1; return `firstChapterId`.
- `src/hooks/use-books.ts` — `useCreateBook` return type gains `firstChapterId`.
- `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts` — return `bookWordCount`.
- `src/hooks/use-documents.ts` — `useSaveChapterContent` return type + `onSuccess` publishes word count.
- `src/app/(app)/books/new/page.tsx` — redirect to editor; remove next-steps; add opt-in "Guided setup".
- `src/app/(app)/books/[bookId]/chapters/[chapterId]/page.tsx` — mount `OnboardingWatcher`.

**Scoping note (v1):** The in-editor "Set up book" chrome entry from spec §4.7 is realized here as an opt-in **"Guided setup"** button on the new-book form (fully specified below) plus the always-live `/books/[bookId]/setup` route; the describe-to-coach flow remains reachable via the agent panel's workflow list (`onboard-new-book`). A dedicated editor-toolbar entry is deferred (spec §10) to avoid restructuring the editor chrome in v1.

---

## Task 1: Pure decision core (`offers.ts`)

**Files:**
- Create: `src/lib/onboarding/offers.ts`
- Test: `tests/unit/onboarding-offers.test.ts`

**Interfaces:**
- Produces: `ONBOARDING_OFFERS`, `computeOnboardingOffers(input: OnboardingInput): OnboardingResult`, types `OnboardingOffer`, `OnboardingArtifactType`, `OnboardingInput`, `OnboardingResult`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/onboarding-offers.test.ts
import { describe, it, expect } from "vitest";
import { computeOnboardingOffers, ONBOARDING_OFFERS } from "@/lib/onboarding/offers";

const NONE = new Set<string>();
const base = {
  wordCount: 0,
  previousWordCount: null as number | null,
  existingArtifactTypes: NONE,
  dismissed: NONE,
  toasted: NONE,
  setupComplete: false,
};

describe("computeOnboardingOffers", () => {
  it("has three offers ordered by ascending threshold", () => {
    expect(ONBOARDING_OFFERS.map((o) => o.threshold)).toEqual([2000, 5000, 10000]);
  });

  it("toasts nothing on first eval (previousWordCount null), even past a threshold", () => {
    const r = computeOnboardingOffers({ ...base, wordCount: 2500, previousWordCount: null });
    expect(r.toast).toBeNull();
    expect(r.pending.map((o) => o.workflowId)).toEqual(["capture-style"]);
  });

  it("toasts on a live crossing of exactly the threshold", () => {
    const r = computeOnboardingOffers({ ...base, previousWordCount: 1999, wordCount: 2000 });
    expect(r.toast?.workflowId).toBe("capture-style");
  });

  it("does not toast below the threshold", () => {
    const r = computeOnboardingOffers({ ...base, previousWordCount: 1000, wordCount: 1999 });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });

  it("toasts the LOWEST-threshold offer when several cross at once; rest go to pending", () => {
    const r = computeOnboardingOffers({ ...base, previousWordCount: 0, wordCount: 12000 });
    expect(r.toast?.workflowId).toBe("capture-style");
    expect(r.pending.map((o) => o.workflowId)).toEqual([
      "capture-style", "build-architecture", "create-story-bible",
    ]);
  });

  it("does not re-toast an already-toasted offer even on dip-and-re-cross", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 1500, wordCount: 2100,
      toasted: new Set(["capture-style"]),
    });
    expect(r.toast).toBeNull();
    expect(r.pending.map((o) => o.workflowId)).toEqual(["capture-style"]); // still on badge
  });

  it("suppresses an offer whose artifact already exists (toast + pending)", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 1999, wordCount: 2000,
      existingArtifactTypes: new Set(["FINGERPRINT"]),
    });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });

  it("dismissed offers are excluded from pending (badge) and never toast", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 1999, wordCount: 2000,
      dismissed: new Set(["capture-style"]),
    });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });

  it("ignored (toasted, not dismissed) offers stay on the badge", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: null, wordCount: 3000,
      toasted: new Set(["capture-style"]),
    });
    expect(r.pending.map((o) => o.workflowId)).toEqual(["capture-style"]);
  });

  it("setupComplete suppresses everything", () => {
    const r = computeOnboardingOffers({
      ...base, previousWordCount: 0, wordCount: 12000, setupComplete: true,
    });
    expect(r.toast).toBeNull();
    expect(r.pending).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- onboarding-offers`
Expected: FAIL — "Failed to resolve import @/lib/onboarding/offers".

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/onboarding/offers.ts
export type OnboardingArtifactType = "FINGERPRINT" | "ARCHITECTURE" | "STORY_BIBLE";

export interface OnboardingOffer {
  workflowId: "capture-style" | "build-architecture" | "create-story-bible";
  threshold: number;
  artifactType: OnboardingArtifactType;
  title: string;
  cta: string;
}

/** Ordered ascending by threshold. Copy is draft (spec §10). */
export const ONBOARDING_OFFERS: readonly OnboardingOffer[] = [
  { workflowId: "capture-style", threshold: 2000, artifactType: "FINGERPRINT",
    title: "I've read enough to understand your voice.", cta: "Build style fingerprint" },
  { workflowId: "build-architecture", threshold: 5000, artifactType: "ARCHITECTURE",
    title: "Your story has real shape now.", cta: "Map the architecture" },
  { workflowId: "create-story-bible", threshold: 10000, artifactType: "STORY_BIBLE",
    title: "There's a world worth tracking here.", cta: "Start the story bible" },
] as const;

export interface OnboardingInput {
  wordCount: number;
  previousWordCount: number | null;
  existingArtifactTypes: ReadonlySet<string>;
  dismissed: ReadonlySet<string>;
  toasted: ReadonlySet<string>;
  setupComplete: boolean;
}

export interface OnboardingResult {
  /** Eligible offers, ascending by threshold — drives the badge. */
  pending: OnboardingOffer[];
  /** Single offer to toast on this update, or null. */
  toast: OnboardingOffer | null;
}

/**
 * Pure trigger decision. An offer is eligible (→ pending/badge) when the wizard
 * is not complete, the cumulative word count has reached its threshold, its
 * artifact does not yet exist, and it has not been dismissed. `toast` is the
 * lowest-threshold eligible offer that has not been toasted before AND was
 * live-crossed this update (previousWordCount < threshold <= wordCount).
 * previousWordCount === null (first eval / mount seed) never toasts, so reloads
 * and cross-session catch-ups surface only via the badge, never a toast.
 */
export function computeOnboardingOffers(input: OnboardingInput): OnboardingResult {
  const { wordCount, previousWordCount, existingArtifactTypes, dismissed, toasted, setupComplete } = input;

  if (setupComplete) return { pending: [], toast: null };

  const pending = ONBOARDING_OFFERS.filter(
    (o) =>
      wordCount >= o.threshold &&
      !existingArtifactTypes.has(o.artifactType) &&
      !dismissed.has(o.workflowId)
  );

  const toast =
    previousWordCount === null
      ? null
      : pending.find(
          (o) =>
            !toasted.has(o.workflowId) &&
            previousWordCount < o.threshold &&
            wordCount >= o.threshold
        ) ?? null;

  return { pending, toast };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- onboarding-offers`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/offers.ts tests/unit/onboarding-offers.test.ts
git commit -m "feat: pure onboarding-offers trigger logic (Tier 4.1)"
```

---

## Task 2: SSR-safe localStorage helpers (`local-state.ts`)

**Files:**
- Create: `src/lib/onboarding/local-state.ts`
- Test: `tests/unit/onboarding-local-state.test.ts`

**Interfaces:**
- Produces: `getOnboardingState(bookId): { dismissed: Set<string>; toasted: Set<string> }`, `addDismissed(bookId, workflowId)`, `addToasted(bookId, workflowId)`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/onboarding-local-state.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getOnboardingState, addDismissed, addToasted } from "@/lib/onboarding/local-state";

const store = new Map<string, string>();
function installLocalStorage() {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
}
function uninstallLocalStorage() {
  delete (globalThis as Record<string, unknown>).window;
  delete (globalThis as Record<string, unknown>).localStorage;
}

describe("onboarding local-state", () => {
  beforeEach(() => { store.clear(); installLocalStorage(); });
  afterEach(() => uninstallLocalStorage());

  it("returns empty sets when nothing stored", () => {
    const s = getOnboardingState("book1");
    expect(s.dismissed.size).toBe(0);
    expect(s.toasted.size).toBe(0);
  });

  it("round-trips dismissed and toasted independently, per book", () => {
    addDismissed("book1", "capture-style");
    addToasted("book1", "build-architecture");
    const s = getOnboardingState("book1");
    expect([...s.dismissed]).toEqual(["capture-style"]);
    expect([...s.toasted]).toEqual(["build-architecture"]);
    expect(getOnboardingState("book2").dismissed.size).toBe(0);
  });

  it("add is idempotent", () => {
    addDismissed("book1", "capture-style");
    addDismissed("book1", "capture-style");
    expect([...getOnboardingState("book1").dismissed]).toEqual(["capture-style"]);
  });

  it("corrupted JSON degrades to empty set", () => {
    store.set("wmb:onboard-dismissed:book1", "{not json");
    expect(getOnboardingState("book1").dismissed.size).toBe(0);
  });

  it("is a no-op / empty under SSR (no window)", () => {
    uninstallLocalStorage();
    expect(() => addDismissed("book1", "capture-style")).not.toThrow();
    expect(getOnboardingState("book1").dismissed.size).toBe(0);
    installLocalStorage(); // restore for afterEach symmetry
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:unit -- onboarding-local-state`
Expected: FAIL — cannot resolve `@/lib/onboarding/local-state`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/onboarding/local-state.ts
const DISMISSED_PREFIX = "wmb:onboard-dismissed:";
const TOASTED_PREFIX = "wmb:onboard-toasted:";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function addToSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    const set = readSet(key);
    set.add(value);
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    // ignore quota/permission failures
  }
}

export interface OnboardingLocalState {
  dismissed: Set<string>;
  toasted: Set<string>;
}

export function getOnboardingState(bookId: string): OnboardingLocalState {
  return {
    dismissed: readSet(DISMISSED_PREFIX + bookId),
    toasted: readSet(TOASTED_PREFIX + bookId),
  };
}

export function addDismissed(bookId: string, workflowId: string): void {
  addToSet(DISMISSED_PREFIX + bookId, workflowId);
}

export function addToasted(bookId: string, workflowId: string): void {
  addToSet(TOASTED_PREFIX + bookId, workflowId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:unit -- onboarding-local-state`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding/local-state.ts tests/unit/onboarding-local-state.test.ts
git commit -m "feat: SSR-safe localStorage for onboarding dismissed/toasted (Tier 4.1)"
```

---

## Task 3: Backend — create empty Chapter 1 on book creation

**Files:**
- Modify: `src/app/api/books/route.ts:86-90`
- Modify: `src/hooks/use-books.ts:92`

**Interfaces:**
- Produces: `POST /api/books` response now `{ ...book, firstChapterId: string }`; `useCreateBook().mutateAsync` resolves to `{ id: string; firstChapterId: string }`.

- [ ] **Step 1: Add Chapter 1 creation + firstChapterId to the response**

In `src/app/api/books/route.ts`, replace the block that creates settings and returns (currently lines 85-90):

```ts
    // Create default settings
    await db.bookSettings.create({
      data: { bookId: book.id },
    });

    return NextResponse.json(updatedBook, { status: 201 });
```

with:

```ts
    // Create default settings
    await db.bookSettings.create({
      data: { bookId: book.id },
    });

    // Write-first onboarding: create an empty Chapter 1 so the writer lands
    // directly in a blank editor. No CHAPTER_CONTENT document yet — that is
    // created on first save.
    const firstChapter = await db.chapter.create({
      data: { bookId: book.id, actNumber: 1, chapterNumber: 1, title: null },
    });

    return NextResponse.json(
      { ...updatedBook, firstChapterId: firstChapter.id },
      { status: 201 }
    );
```

- [ ] **Step 2: Update the create-book hook return type**

In `src/hooks/use-books.ts`, change line 92:

```ts
      return res.json() as Promise<{ id: string }>;
```

to:

```ts
      return res.json() as Promise<{ id: string; firstChapterId: string }>;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manually verify (dev server)**

Run the app, create a book, and confirm the POST response JSON includes `firstChapterId` (Network tab) and that `/books/{id}/chapters/{firstChapterId}` renders the editor. (Automated coverage: extend `tests/e2e/book-crud.spec.ts` in Task 9's verification.)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/books/route.ts src/hooks/use-books.ts
git commit -m "feat: create empty Chapter 1 on book creation, return firstChapterId (Tier 4.1)"
```

---

## Task 4: Backend — return `bookWordCount` and publish it to the query cache

**Files:**
- Modify: `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts:179`
- Modify: `src/hooks/use-documents.ts:45-57`

**Interfaces:**
- Consumes: nothing new.
- Produces: save PUT response `{ wordCount, version, bookWordCount }`; after a successful save, the React Query cache key `["book-wordcount", bookId]` holds the latest cumulative `Book.wordCount`.

- [ ] **Step 1: Add `bookWordCount` to the save response**

In `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts`, change line 179:

```ts
    return NextResponse.json({ wordCount, version });
```

to:

```ts
    // book.wordCount is the pre-update value (fetched above); wordDelta is this
    // save's change — their sum is the new cumulative total the client needs.
    return NextResponse.json({
      wordCount,
      version,
      bookWordCount: book.wordCount + wordDelta,
    });
```

- [ ] **Step 2: Update the save hook's return type and publish the count**

In `src/hooks/use-documents.ts`, change the `useSaveChapterContent` mutation. Replace the `fetchJson<{ wordCount: number; version: number }>(` generic (line 45) with:

```ts
      fetchJson<{ wordCount: number; version: number; bookWordCount: number }>(
```

and replace the `onSuccess` (lines 53-57):

```ts
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["chapter-content", bookId, chapterId],
      });
    },
```

with:

```ts
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: ["chapter-content", bookId, chapterId],
      });
      // Publish the live cumulative book word count for the onboarding watcher
      // (no refetch — the value came back with the save response).
      qc.setQueryData<number>(["book-wordcount", bookId], data.bookWordCount);
    },
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add "src/app/api/books/[id]/chapters/[chapterId]/content/route.ts" src/hooks/use-documents.ts
git commit -m "feat: return bookWordCount from save + publish to query cache (Tier 4.1)"
```

---

## Task 5: Store — pending offers for the badge

**Files:**
- Modify: `src/stores/agent-ui-store.ts:82-102` (interface), `:108-114` (initial state), `:196-209` (reset)

**Interfaces:**
- Produces: `useAgentUIStore` gains `onboardingOffers: OnboardingOfferView[]` and `setOnboardingOffers(offers)`.

- [ ] **Step 1: Add the type, state, action, and reset**

In `src/stores/agent-ui-store.ts`, add near the top (after the `PanelMode` type, ~line 8):

```ts
export interface OnboardingOfferView {
  workflowId: string;
  cta: string;
}
```

In the `AgentUIState` interface, add to the state block (after `pageContext: PageContext | null;`):

```ts
  onboardingOffers: OnboardingOfferView[];
```

and to the actions block (after `setPageContext`):

```ts
  setOnboardingOffers: (offers: OnboardingOfferView[]) => void;
```

In the store initializer object, add to the initial state (after `pageContext: null,`):

```ts
  onboardingOffers: [],
```

Add the action (next to `setPageContext`):

```ts
  setOnboardingOffers: (offers) => set({ onboardingOffers: offers }),
```

In `reset()`, add `onboardingOffers: []` to the `set({ ... })` call.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/stores/agent-ui-store.ts
git commit -m "feat: agent-ui-store onboardingOffers state for badge (Tier 4.1)"
```

---

## Task 6: The watcher hook (`use-onboarding-offers.ts`)

**Files:**
- Create: `src/hooks/use-onboarding-offers.ts`

**Interfaces:**
- Consumes: `computeOnboardingOffers`, `ONBOARDING_OFFERS` (Task 1); `getOnboardingState`, `addDismissed`, `addToasted` (Task 2); `useAgentUIStore.openWithWorkflow` + `setOnboardingOffers` (Task 5); the `["book-wordcount", bookId]` cache written in Task 4.
- Produces: `useOnboardingOffers({ bookId, initialBookWordCount, setupComplete })` — side-effecting hook (no return value).

- [ ] **Step 1: Create the hook**

```tsx
// src/hooks/use-onboarding-offers.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { computeOnboardingOffers } from "@/lib/onboarding/offers";
import {
  getOnboardingState,
  addDismissed,
  addToasted,
} from "@/lib/onboarding/local-state";

interface UseOnboardingOffersParams {
  bookId: string;
  initialBookWordCount: number;
  setupComplete: boolean;
}

/**
 * Watches cumulative book word count and offers craft workflows at milestones.
 * Mount once per book (via OnboardingWatcher on the chapter editor page).
 */
export function useOnboardingOffers({
  bookId,
  initialBookWordCount,
  setupComplete,
}: UseOnboardingOffersParams): void {
  const qc = useQueryClient();
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const setOnboardingOffers = useAgentUIStore((s) => s.setOnboardingOffers);

  // Live cumulative word count: seeded from the server, then updated by the
  // save mutation via qc.setQueryData(["book-wordcount", bookId], n).
  const { data: bookWordCount = initialBookWordCount } = useQuery<number>({
    queryKey: ["book-wordcount", bookId],
    queryFn: () =>
      qc.getQueryData<number>(["book-wordcount", bookId]) ?? initialBookWordCount,
    initialData: initialBookWordCount,
    staleTime: Infinity,
  });

  // Artifact types already present for this book.
  const { data: artifactTypes } = useQuery<Set<string>>({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) return new Set<string>();
      const docs = (await res.json()) as Array<{ type: string }>;
      return new Set(docs.map((d) => d.type));
    },
    staleTime: 30_000,
  });

  // SSR-safe: load dismissed/toasted after mount (empty on server + first render).
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [toasted, setToasted] = useState<Set<string>>(new Set());
  useEffect(() => {
    const state = getOnboardingState(bookId);
    setDismissed(state.dismissed);
    setToasted(state.toasted);
  }, [bookId]);

  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    const types = artifactTypes ?? new Set<string>();
    const { pending, toast: toFire } = computeOnboardingOffers({
      wordCount: bookWordCount,
      previousWordCount: prevRef.current,
      existingArtifactTypes: types,
      dismissed,
      toasted,
      setupComplete,
    });

    if (toFire) {
      addToasted(bookId, toFire.workflowId);
      setToasted((s) => new Set(s).add(toFire.workflowId));
      toast(toFire.title, {
        duration: 10_000,
        action: {
          label: toFire.cta,
          onClick: () => openWithWorkflow(toFire.workflowId),
        },
        cancel: {
          label: "Not now",
          onClick: () => {
            addDismissed(bookId, toFire.workflowId);
            setDismissed((s) => new Set(s).add(toFire.workflowId));
          },
        },
      });
    }

    setOnboardingOffers(
      pending.map((o) => ({ workflowId: o.workflowId, cta: o.cta }))
    );

    // Update the crossing baseline for the next evaluation.
    prevRef.current = bookWordCount;
  }, [
    bookWordCount,
    artifactTypes,
    dismissed,
    toasted,
    setupComplete,
    bookId,
    openWithWorkflow,
    setOnboardingOffers,
  ]);

  // Clear the badge when leaving the book.
  useEffect(() => {
    return () => setOnboardingOffers([]);
  }, [bookId, setOnboardingOffers]);
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-onboarding-offers.ts
git commit -m "feat: useOnboardingOffers watcher hook (Tier 4.1)"
```

---

## Task 7: Watcher component + mount on the editor page

**Files:**
- Create: `src/components/onboarding/onboarding-watcher.tsx`
- Modify: `src/app/(app)/books/[bookId]/chapters/[chapterId]/page.tsx:17-30` (include settings) and `:47-71` (mount)

**Interfaces:**
- Consumes: `useOnboardingOffers` (Task 6); `book.wordCount`, `book.settings?.setupComplete` from the page's Prisma query.
- Produces: `<OnboardingWatcher bookId initialBookWordCount setupComplete />` (renders null).

- [ ] **Step 1: Create the watcher component**

```tsx
// src/components/onboarding/onboarding-watcher.tsx
"use client";

import { useOnboardingOffers } from "@/hooks/use-onboarding-offers";

interface OnboardingWatcherProps {
  bookId: string;
  initialBookWordCount: number;
  setupComplete: boolean;
}

/** Null-rendering client mount that drives write-first onboarding offers. */
export function OnboardingWatcher(props: OnboardingWatcherProps) {
  useOnboardingOffers(props);
  return null;
}
```

- [ ] **Step 2: Include settings in the page's book query**

In `src/app/(app)/books/[bookId]/chapters/[chapterId]/page.tsx`, change the `db.book.findFirst` `include` block (lines 19-29) to also select settings:

```ts
    include: {
      chapters: {
        orderBy: { chapterNumber: "asc" },
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          status: true,
        },
      },
      settings: { select: { setupComplete: true } },
    },
```

- [ ] **Step 3: Import and mount the watcher**

Add the import at the top of the same file (after the `SplitEditor` import):

```ts
import { OnboardingWatcher } from "@/components/onboarding/onboarding-watcher";
```

Then mount it inside the returned wrapper `div`, immediately after the closing `</SplitEditor>` tag:

```tsx
      </SplitEditor>
      <OnboardingWatcher
        bookId={bookId}
        initialBookWordCount={book.wordCount}
        setupComplete={book.settings?.setupComplete ?? false}
      />
    </div>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0. (`book.wordCount` is a default Book scalar; `book.settings` is present via the new include.)

- [ ] **Step 5: Commit**

```bash
git add src/components/onboarding/onboarding-watcher.tsx "src/app/(app)/books/[bookId]/chapters/[chapterId]/page.tsx"
git commit -m "feat: mount OnboardingWatcher on the chapter editor page (Tier 4.1)"
```

---

## Task 8: Badge — pending-offer pills on the companion bubble

**Files:**
- Modify: `src/components/agent/ai-companion-bubble.tsx`

**Interfaces:**
- Consumes: `useAgentUIStore.onboardingOffers` + `openWithWorkflow` (Task 5).

- [ ] **Step 1: Render the pending-offer pills**

Replace the entire contents of `src/components/agent/ai-companion-bubble.tsx` with:

```tsx
"use client";

import { BotIcon, SparklesIcon } from "lucide-react";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useAgentSessionStore } from "@/stores/agent-session-store";

export function AICompanionBubble() {
  const panelMode = useAgentUIStore((s) => s.panelMode);
  const setPanelMode = useAgentUIStore((s) => s.setPanelMode);
  const unreadCount = useAgentUIStore((s) => s.unreadCount);
  const onboardingOffers = useAgentUIStore((s) => s.onboardingOffers);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const hasRunning = useAgentSessionStore((s) => s.hasRunningSessions)();

  if (panelMode !== "bubble") return null;

  return (
    <>
      {/* Pending onboarding offers — retrievable if a toast was ignored. */}
      {onboardingOffers.length > 0 && (
        <div className="fixed bottom-20 right-5 z-50 flex flex-col items-end gap-2">
          {onboardingOffers.map((offer) => (
            <button
              key={offer.workflowId}
              onClick={() => openWithWorkflow(offer.workflowId)}
              className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/95 px-3 py-1.5 text-xs font-medium shadow-md hover:bg-primary/10 transition-colors"
            >
              <SparklesIcon className="size-3.5 text-primary" />
              {offer.cta}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => setPanelMode("mini")}
        className="fixed bottom-5 right-5 z-50 flex items-center justify-center size-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Open Writing Agent"
      >
        <BotIcon className="size-5" />

        {/* Pulse ring when agent is working */}
        {hasRunning && (
          <span className="absolute inset-0 rounded-full animate-ping bg-primary/30 pointer-events-none" />
        )}

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center size-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/agent/ai-companion-bubble.tsx
git commit -m "feat: onboarding offer pills on the companion bubble (Tier 4.1)"
```

---

## Task 9: New-book front door — redirect to editor + opt-in guided setup

**Files:**
- Modify: `src/app/(app)/books/new/page.tsx`

**Interfaces:**
- Consumes: `useCreateBook().mutateAsync` → `{ id, firstChapterId }` (Task 3).

- [ ] **Step 1: Replace the create logic and remove the next-steps phase**

In `src/app/(app)/books/new/page.tsx`:

1. Remove the now-unused imports `UploadIcon, MessageCircleIcon, ArrowRightIcon, CheckCircle2Icon` (from the lucide-react import) and remove the `useAgentUIStore` import and the `openWithWorkflow` selector (line 43). Keep `toast`, `useRouter`, `useCreateBook`, `useSeries`, `useLanguage`, UI imports.

2. Remove the `type PagePhase = "create" | "next-steps";` line, and the `phase` / `createdBookId` state (lines 45-46).

3. Replace `handleSubmit` (lines 53-71) with:

```tsx
  async function createAndGo(mode: "write" | "setup") {
    if (!name.trim()) return;
    try {
      const book = await createBook.mutateAsync({
        name: name.trim(),
        genre: genre.trim() || undefined,
        language,
        seriesId: seriesId !== "none" ? seriesId : undefined,
        bookNumber: seriesId !== "none" ? bookNumber : undefined,
      });
      toast.success(t.newBook.bookCreated);
      router.push(
        mode === "setup"
          ? `/books/${book.id}/setup?step=1`
          : `/books/${book.id}/chapters/${book.firstChapterId}`
      );
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void createAndGo("write");
  }
```

4. Delete the entire `if (phase === "next-steps" && createdBookId) { ... }` block (lines 73-145).

- [ ] **Step 2: Update the form's action buttons**

Replace the button row (lines 232-243) with:

```tsx
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                {t.newBook.cancel}
              </Button>
              <Button type="submit" disabled={createBook.isPending}>
                {createBook.isPending ? t.newBook.creating : "Start writing"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={createBook.isPending}
                onClick={() => void createAndGo("setup")}
                className="text-muted-foreground"
              >
                Guided setup instead
              </Button>
            </div>
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: exit 0 (no dangling references to removed state/imports).

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/books/new/page.tsx"
git commit -m "feat: write-first new-book front door — redirect to editor, opt-in guided setup (Tier 4.1)"
```

---

## Task 10: Verify artifact-refresh on workflow completion

**Files:**
- Read/confirm: `src/hooks/use-agent-stream.ts:103`

**Interfaces:**
- Consumes: nothing.

- [ ] **Step 1: Confirm the invalidation already fires**

Open `src/hooks/use-agent-stream.ts` and confirm the completion handler invalidates `["book-documents", bookId]` (currently line 103). Because `useOnboardingOffers` reads `artifactTypes` from that same key, a completed `capture-style`/`build-architecture`/`create-story-bible` run refreshes the set → the offer becomes ineligible → the badge shrinks. No change needed if present.

- [ ] **Step 2: If (and only if) it is missing or gated to specific workflows**, add:

```ts
queryClient.invalidateQueries({ queryKey: ["book-documents", bookId] });
```

to the session-completion branch, then `npx tsc --noEmit` and commit:

```bash
git add src/hooks/use-agent-stream.ts
git commit -m "fix: invalidate book-documents on workflow completion for onboarding badge (Tier 4.1)"
```

Otherwise, no commit — this task is a verification gate only.

---

## Task 11: Final verification

- [ ] **Step 1: Full unit suite + type-check**

Run: `npm run test:unit`
Expected: all tests pass (including the two new onboarding suites).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 2: Manual smoke (dev server)**

1. Create a new book with "Start writing" → lands in a blank Chapter 1 editor (not the next-steps page, not the wizard).
2. Paste/type past 2,000 words → a toast appears offering the style fingerprint; `[Do it]` opens the agent panel with `capture-style`.
3. Reload → no re-toast. If the previous toast was closed without dismissing, a "Build style fingerprint" pill shows near the companion bubble; `[Not now]` removes it.
4. "Guided setup instead" on the new-book form → lands in the setup wizard at step 1.

- [ ] **Step 3 (optional): Extend E2E**

Add to `tests/e2e/book-crud.spec.ts` a case asserting that creating a book with "Start writing" navigates to a `/chapters/` URL. Run `npm run test:e2e` (see handoff for the port/env setup).

---

## Self-review notes (author)

- **Spec coverage:** §4.1 pure core → Task 1; §4.2 storage → Task 2; §4.3 hook (SSR load, ref update, toast lifecycle, multi-chapter via cumulative count) → Task 6; §4.4 bookWordCount → Task 4; §4.5 artifact query + invalidation → Tasks 6 & 10; §4.6 Chapter 1 + redirect → Tasks 3 & 9; §4.7 wizard demotion → Task 9 (+ scoping note); §4.8 badge → Tasks 5 & 8; §7 edge cases → covered by Task 1 tests (boundary, dip-recross, dismissed vs ignored, setupComplete) and Task 6 (SSR). §8 tests → Tasks 1, 2, 11.
- **Type consistency:** `firstChapterId` (Tasks 3/9), `bookWordCount` (Task 4/6), `["book-wordcount", bookId]` (Tasks 4/6), `onboardingOffers`/`setOnboardingOffers`/`OnboardingOfferView` (Tasks 5/6/8) are used consistently across producing and consuming tasks.
- **Deferred (spec §10, not blocking):** final toast copy; a dedicated in-editor "Set up book" toolbar entry (v1 uses the new-book "Guided setup" button + live `/setup` route).
