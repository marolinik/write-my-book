# Write-First Onboarding — Design Spec (Tier 4.1)

- **Date:** 2026-07-01
- **Status:** Approved design, revised after adversarial spec verification (19 confirmed findings folded in) → next: implementation plan
- **Roadmap item:** Tier 4.1 (`docs/IMPROVEMENT-ROADMAP.md`) — "Write-first onboarding (kill the setup tax)"
- **Author context:** Brainstormed 2026-07-01; four core UX decisions locked with the user (see §2). Verified by a 5-lens adversarial review workflow (codebase-fidelity, completeness, consistency, ambiguity/scope, edge-cases) with a per-finding refute pass.

---

## 1. Goal & context

**Today.** Creating a book (`src/app/(app)/books/new/page.tsx`) collects name/genre/language, then shows a post-creation "next-steps" screen offering import / describe-to-coach / skip; the import path leads into the 6-step setup wizard (`/books/[bookId]/setup`). The blank page waits behind that choice. This is a setup tax that delays the one thing a writer came to do — write.

**Target.** New book → **blank editor → start typing.** The AI pipeline *follows* the writing rather than leading it: as the manuscript grows, the app offers the relevant craft workflow at natural word-count milestones. The setup wizard survives as an **opt-in power-user path**, never a wall.

**Key enabler (already in place).** Most mechanisms exist:
- Autosave computes word count server-side and maintains `Book.wordCount` (`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts`).
- The three target workflows are registered and fire through one entry point — `openWithWorkflow(workflowId)` (`src/stores/agent-ui-store.ts`) / `POST /api/books/[id]/agent`.
- Artifact documents already carry a `type` (`FINGERPRINT`, `ARCHITECTURE`, `STORY_BIBLE`) so "already built" is queryable, and a `["book-documents", bookId]` React Query already exists (invalidated today in `src/hooks/use-agent-stream.ts`).

**No database schema changes are required.** Three small **new** code changes to existing files are needed (all listed in §6): add `bookWordCount` to the save response, create an empty Chapter 1 on book creation, and change the post-creation redirect.

---

## 2. Locked decisions (from brainstorming)

1. **Front door:** keep the minimal create form (name + genre + language); CTA becomes **"Start writing"**; land **directly in a blank first-chapter editor**. Import/describe/wizard become opt-in.
2. **Trigger surface:** a **non-blocking Sonner toast** on threshold crossing, plus a **persistent badge** on the existing agent-panel button so a not-yet-actioned offer is retrievable — never a wall, never lost.
3. **Schedule:** **2K → `capture-style`, 5K → `build-architecture`, 10K → `create-story-bible`.** Every AI action is **user-initiated** — no silent/background agent runs, no surprise spend.
4. **Nag policy (precise):** each threshold toasts **at most once, ever, per book** (tracked persistently). Two distinct non-action outcomes:
   - **Ignore** (toast auto-expires or is closed without choosing): it does **not** re-toast, but it **remains on the badge** until built or dismissed.
   - **Dismiss** (`[Not now]`): it is **removed from the badge entirely** and never shown again.
   All offers are suppressed (no toast, not on badge) when the artifact already exists, or when the wizard was completed (`BookSettings.setupComplete`).

---

## 3. Non-goals (YAGNI)

- No conversational findings (that is Tier 4.2).
- No silent/background fingerprinting or any un-requested paid agent work.
- No changes to the workflows/agents themselves — only *when/how they're offered*.
- No removal of the setup wizard or the import flow — only demotion to opt-in.
- No retroactive toasts for books already past a threshold before this feature shipped (badge only — see §7).
- No new DB columns/tables; no cross-device sync of dismissed/toasted state (localStorage is sufficient; per-browser is acceptable).
- No artifact staleness/recency logic — presence of an artifact of the type suffices to suppress (§4.1).

---

## 4. Architecture

### 4.1 Pure decision core — `src/lib/onboarding/offers.ts` (new)

The entire trigger decision is a **pure function**, isolated so the correctness lives in unit tests (same shape as `src/lib/agents/budget.ts`).

```ts
export type OnboardingArtifactType = "FINGERPRINT" | "ARCHITECTURE" | "STORY_BIBLE";

export interface OnboardingOffer {
  workflowId: "capture-style" | "build-architecture" | "create-story-bible";
  threshold: number;          // cumulative Book.wordCount at which the offer unlocks
  artifactType: OnboardingArtifactType;
  title: string;              // toast headline
  cta: string;               // action-button label
}

export const ONBOARDING_OFFERS: readonly OnboardingOffer[] = [
  { workflowId: "capture-style",      threshold: 2000,  artifactType: "FINGERPRINT",
    title: "I've read enough to understand your voice.", cta: "Build style fingerprint" },
  { workflowId: "build-architecture", threshold: 5000,  artifactType: "ARCHITECTURE",
    title: "Your story has real shape now.",             cta: "Map the architecture" },
  { workflowId: "create-story-bible", threshold: 10000, artifactType: "STORY_BIBLE",
    title: "There's a world worth tracking here.",       cta: "Start the story bible" },
] as const; // ordered by threshold ascending; copy is draft — final wording in §10


export interface OnboardingInput {
  wordCount: number;                            // current cumulative Book.wordCount
  previousWordCount: number | null;            // last observed count; null = first eval this mount
  existingArtifactTypes: ReadonlySet<string>;  // DocumentTypes present for the book (presence suffices)
  dismissed: ReadonlySet<string>;              // workflowIds the writer said [Not now] to (localStorage)
  toasted: ReadonlySet<string>;                // workflowIds already toasted once ever (localStorage)
  setupComplete: boolean;                      // one-way; never reset (§7)
}

export interface OnboardingResult {
  pending: OnboardingOffer[];        // badge source: eligible & not dismissed
  toast: OnboardingOffer | null;     // single offer to toast on THIS update, or null
}

/**
 * Decides which onboarding offers are live.
 *
 * `pending` (badge): offers that are eligible = !setupComplete && wordCount >= threshold &&
 *   artifact of that type absent && not dismissed. Ordered ascending by threshold.
 *
 * `toast`: the single lowest-threshold offer that is eligible, NOT yet toasted, and was
 *   *live-crossed* on this update — previousWordCount !== null && previousWordCount < threshold
 *   && wordCount >= threshold. At most one per call (a large paste crossing several thresholds
 *   toasts only the lowest; the rest surface via the badge).
 *
 * "Presence suffices": any document of the artifact type suppresses the offer regardless of
 *   staleness/content; a deleted artifact (absent from the set) re-enables it.
 *
 * "Live crossing": because previousWordCount is seeded to the current count on mount, threshold
 *   transitions carried over from a prior session (e.g., 1999 yesterday → 2000 today) do NOT
 *   produce a toast — they surface only via the badge. This is intentional (no retroactive toasts).
 *   Combined with `toasted`, a given offer toasts at most once ever, even across dip-and-re-cross.
 */
export function computeOnboardingOffers(input: OnboardingInput): OnboardingResult;
```

**Why both `toasted` and crossing-detection?** Crossing-detection decides *when* to toast (on a genuine upward crossing, not on load-at-already-past). The persistent `toasted` set guarantees *at most once ever* — without it, deleting words below a threshold and retyping past it would re-toast, violating decision §2.4. Together they make "exactly once" true for non-monotonic word counts.

**Consequences (verified):**
- On mount `previousWordCount` is seeded → `toast` is `null` on first eval → reloads never re-toast.
- After the one toast, `toasted` contains the offer → never re-toasts, even on dip-and-re-cross.
- **Ignore** (toast closed/expired, no `[Not now]`): offer is in `toasted` but not `dismissed` → stays in `pending` (badge) until built or dismissed.
- **Dismiss** (`[Not now]`): offer added to `dismissed` → removed from `pending` (badge) permanently.

### 4.2 Local persistence — `src/lib/onboarding/local-state.ts` (new)

- Keys (per book): `wmb:onboard-dismissed:{bookId}` and `wmb:onboard-toasted:{bookId}`, each a JSON `string[]` of `workflowId`s.
- Exports: `getOnboardingState(bookId): { dismissed: Set<string>; toasted: Set<string> }`, `addDismissed(bookId, workflowId)`, `addToasted(bookId, workflowId)`.
- **SSR-guarded** (`typeof window === "undefined"` → empty sets / no-op) and wrapped in try/catch around `localStorage` access and `JSON.parse` (quota/permission/corruption → degrade to empty, never throw). Worst case a previously-dismissed offer reappears on the badge (never an errant toast, since `toasted` corruption only *permits* a toast that crossing-detection still gates).

### 4.3 React hook — `src/hooks/use-onboarding-offers.ts` (new)

`useOnboardingOffers({ bookId, bookWordCount, artifactTypes, setupComplete })`:
- **Fires on any chapter's editor** (not just Chapter 1). Word count is the cumulative `Book.wordCount`; dismissed/toasted state is book-scoped. Rationale: a writer may cross a milestone while editing Chapter 3 (e.g., pastes a scene); the offer should still surface, and it must not re-offer per chapter.
- **SSR-safe state load:** initialize `dismissed`/`toasted` to empty `Set`s via `useState`, then populate from `getOnboardingState(bookId)` inside a `useEffect` keyed on `bookId`. (Reading localStorage during render would cause a hydration mismatch / a flash of a dismissed offer.)
- Holds `previousWordCount` in a ref, seeded to the first `bookWordCount` observed. **After every evaluation, update the ref to the current `bookWordCount`** so crossing-detection works across subsequent saves (including dip-then-re-cross, which `toasted` then guards).
- On every change to `bookWordCount`, `artifactTypes`, `dismissed`, or `toasted`, call `computeOnboardingOffers(...)`. If `toast` is non-null: fire a **Sonner** toast and `addToasted(bookId, toast.workflowId)` immediately (so it never re-toasts).
- Returns `{ pending }` for the badge; because `pending` recomputes when `dismissed`/`artifactTypes` change, the badge shrinks immediately on dismiss or artifact creation.

**Toast lifecycle (Sonner):**
- Headline = offer `title`; actions = **`[Do it]`** and **`[Not now]`**, duration ≈ 10s (long enough to read mid-flow; not permanent).
- `[Do it]` → `openWithWorkflow(offer.workflowId)`.
- `[Not now]` → `addDismissed(bookId, offer.workflowId)` + local state update → removed from badge.
- Auto-expire or the toast's close/X = **ignore**: no dismissal; the offer remains on the badge (already recorded in `toasted`, so it won't re-toast).

### 4.4 Word-count delivery (resolved)

The save route already updates `Book.wordCount` and returns `{ wordCount, version }` (`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts`, ~line 179). **Extend the response to `{ wordCount, version, bookWordCount }`**, where `bookWordCount` is the updated cumulative `Book.wordCount` (compute from the same update, e.g. prior book total + word delta, or re-read the book). The chapter editor threads `bookWordCount` from each autosave response into `useOnboardingOffers`. This is additive/backward-compatible and avoids an extra query. (No fallback needed; if a component lacks the save response, it may read the book query instead — an equivalent value.)

### 4.5 Artifact-type availability (resolved)

Reuse the existing **`["book-documents", bookId]`** React Query (already present in the codebase; invalidated in `src/hooks/use-agent-stream.ts`). Derive `artifactTypes` = the set of `DocumentType`s in that query's result. **On workflow completion** (artifact written), the agent-stream completion handler already invalidates `["book-documents", bookId]`; confirm it fires for these three workflows so the badge shrinks automatically. If the query does not already expose document types on the editor page, add a minimal selector or `GET /api/books/[id]/documents` returning distinct types — the pure core is agnostic (takes a `Set<string>`).

### 4.6 Entry & routing changes

- **`POST /api/books`** (`src/app/api/books/route.ts`): within the existing creation transaction (after `Book` + `BookSettings`), also create an **empty Chapter 1** — `db.chapter.create({ data: { bookId, actNumber: 1, chapterNumber: 1, title: null } })` (no `CHAPTER_CONTENT` document; that is created on first save). Creation is one-time (part of the create tx), so idempotence is not a concern. **Return shape:** `{ ...book, firstChapterId }` (additive top-level field; existing consumers reading `book.id` are unaffected). Update the create hook's return type (`src/hooks/use-books.ts`, ~line 92) accordingly.
- **New-book page** (`src/app/(app)/books/new/page.tsx`): remove the post-creation "next-steps" phase. Primary CTA "Start writing" → create → **`router.push('/books/{id}/chapters/{firstChapterId}')`** (blank editor). If Chapter 1 creation fails server-side, the create call fails as a unit (transaction) and the page shows the existing error state — the user never lands in a chapterless book. Import & describe-to-coach move to opt-in entry points (§4.7), retaining today's behavior (import → `/setup?step=1`; describe → overview + `openWithWorkflow("onboard-new-book")`).

### 4.7 Wizard demotion

- Keep `/books/[bookId]/setup` **fully intact**.
- Add an **opt-in entry in the editor** — a menu item **"Set up book (import · style · bible · architecture)"** → navigates to `/setup`. Running the wizard sets `setupComplete`, which suppresses all offers (§4.1).

### 4.8 Badge on the agent-panel button

- The agent-panel trigger button renders a badge = `pending.length` when > 0.
- Opening it lists the pending offers; each item calls `openWithWorkflow(workflowId)`. Badge/list derive entirely from `pending`, which recomputes from word count + artifact types + dismissed + `setupComplete`, so it clears automatically as artifacts get built or offers dismissed.

---

## 5. Data flow

```
writer types → TipTap onUpdate → autosave (2s debounce)
  → PUT …/api/books/[id]/chapters/[chapterId]/content
      → route updates Chapter + Book.wordCount, returns { wordCount, version, bookWordCount }
  → editor threads bookWordCount into useOnboardingOffers
  → computeOnboardingOffers({ wordCount, previousWordCount, artifactTypes, dismissed, toasted, setupComplete })
       ├─ toast ≠ null → Sonner toast [Do it]/[Not now]; mark toasted (once-ever)
       │      [Do it]   → openWithWorkflow(id) → agent panel runs workflow → writes artifact doc
       │      [Not now] → addDismissed(id) → dismissed state updates → pending shrinks → badge shrinks
       │      close/expire (ignore) → stays on badge (in toasted, not dismissed)
       └─ pending[] → badge count + list on the agent-panel button
  → workflow completion invalidates ["book-documents", bookId] → artifactTypes update → offer no longer eligible → badge shrinks
  → hook updates previousWordCount ref to current bookWordCount (for next crossing detection)
```

---

## 6. Components — files to add / modify

**Add**
- `src/lib/onboarding/offers.ts` — `ONBOARDING_OFFERS`, `computeOnboardingOffers`, types (pure).
- `src/lib/onboarding/local-state.ts` — SSR-guarded localStorage helpers for `dismissed` + `toasted`.
- `src/hooks/use-onboarding-offers.ts` — the watcher hook (toast + badge state; SSR-safe load; ref update).
- `tests/unit/onboarding-offers.test.ts` — unit tests for the pure core.
- `tests/unit/onboarding-local-state.test.ts` — unit tests for the storage helpers.

**Modify**
- `src/app/api/books/route.ts` — create empty Chapter 1 in the create tx; return `{ ...book, firstChapterId }`.
- `src/hooks/use-books.ts` — update create-book hook return type to include `firstChapterId`.
- `src/app/(app)/books/new/page.tsx` — remove next-steps phase; "Start writing" → redirect to the new chapter; demote import/describe to opt-in.
- `src/app/api/books/[id]/chapters/[chapterId]/content/route.ts` — add `bookWordCount` to the save response.
- The chapter editor page and/or `src/components/editor/manuscript-editor.tsx` — mount `useOnboardingOffers`, thread `bookWordCount`.
- The agent-panel button component — render the pending badge + list.
- The editor menu/chrome — add the opt-in "Set up book" entry.
- `src/hooks/use-agent-stream.ts` — confirm `["book-documents", bookId]` invalidation fires on completion of the three workflows (add if missing).

**No schema changes.**

---

## 7. Edge cases

- **Large paste / import crossing multiple thresholds at once:** toast only the lowest-threshold eligible+not-toasted offer; the rest appear on the badge. No toast stacking.
- **Books created before this feature, already over a threshold, no artifact:** badge shows pending offers; **no retroactive toast** (crossing requires a live `previous < threshold`, and `previousWordCount` is seeded on mount). Intended.
- **Wizard completed (`setupComplete`):** all offers suppressed (no toast, absent from badge) regardless of word count. `setupComplete` is **permanent / one-way** — never reset by word-count changes; if the wizard is run at any point, write-first offers stay suppressed for that book's lifetime, even if content is later deleted. There is no UI to re-enable onboarding offers.
- **Dip below then re-cross a threshold (artifact not built, not dismissed):** does **not** re-toast (`toasted` set guards it); remains on the badge.
- **localStorage unavailable / corrupted:** helpers degrade to empty sets and never throw; worst case a dismissed offer reappears on the badge (never an errant toast).
- **Multiple tabs / devices:** dismissed/toasted are per-browser; a dismissal on device B may not suppress the badge on device A. Low harm; out of scope.
- **Concurrent chapter edits updating `Book.wordCount`:** the watcher is idempotent w.r.t. the latest `bookWordCount`; a stale value at most slightly mistimes an offer, never loses data.
- **Chapter 1 creation failure at book creation:** the create transaction fails atomically; the new-book page shows its error state; no chapterless book is created.
- **SSR/hydration:** dismissed/toasted load in a `useEffect` (empty on server + first client render), so no hydration mismatch and no flash of a dismissed offer.

---

## 8. Testing

**Unit (Vitest — harness added in Tier 2.6):**
- `offers.ts`:
  - eligibility by each suppressor (artifact present; dismissed; `setupComplete`);
  - boundary at exactly 2000 (crossing when `previous < 2000 <= count`);
  - `previousWordCount === null` → `toast === null`;
  - `toasted` blocks a second toast even on dip-and-re-cross;
  - multi-cross returns the lowest-threshold offer as `toast`, others in `pending`;
  - `pending` excludes dismissed but includes ignored (toasted, not dismissed);
  - ordering and membership of `pending`.
- `local-state.ts`: SSR no-op; add-then-get round-trip for both sets; corrupted JSON → empty; adds are idempotent.

**E2E (Playwright — optional, nice-to-have):**
- Create book → lands in blank editor (not the next-steps page, not the wizard).
- Seed/type past 2K → toast; `[Do it]` opens the agent panel with `capture-style`.
- `[Not now]` → reload → no re-toast; offer absent from badge.
- Type past 2K → ignore (close toast) → reload → no re-toast, but offer present on badge.
- Type to 2K → delete below → retype past 2K → **no** second toast (toasted-once).

---

## 9. Rollout & rollback

- **Additive & low-risk.** No data migration. The `bookWordCount` and `firstChapterId` response fields are additive; existing consumers are unaffected.
- **Rollback:** revert the new-book routing change (restore the prior post-creation paths) and the editor hook mount; the pure modules/tests can remain dormant.
- No feature flag required; if desired, the new-book routing default can be guarded by a simple setting during rollout (decided in planning).

---

## 10. Open items for the implementation plan

1. Final toast copy (`title` / `cta`) for the three offers (and the badge list labels).
2. Exact placement of the "Set up book" opt-in entry in the editor chrome, and where import/describe links live post-demotion.
3. Confirm the `["book-documents", bookId]` query is available on the chapter editor page (vs. adding a small selector/endpoint) and that its invalidation fires on completion of all three workflows.
4. Confirm the cheapest correct way to compute `bookWordCount` in the save route (delta vs. re-read) given the existing transaction.
