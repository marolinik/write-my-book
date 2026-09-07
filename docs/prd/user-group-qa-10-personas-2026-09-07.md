# User-Group QA — 10 personas review WriteMyBook

**Date:** 2026-09-07
**Scope:** full-app review across the real surfaces shipped to date (onboarding LLM wizard,
book overview dashboard, Book Development hub at `/dev`, 5-step setup wizard, new-novel /
editorial journeys, chapter editor, export via Pandoc, Stripe billing tiers, 7-locale i18n,
Perplexity/Firecrawl research providers).
**Method:** 10 simulated personas with distinct needs each rate the app 0–10 and give
concrete, actionable patches grounded in those surfaces. Ratings are subjective UGD
snapshots, not lab metrics.

Average across personas: **7.7 / 10**. Strong: platform depth, agent journey, export
safety, i18n. Weakest: first-run discoverability of the pre-draft pipeline, research requires
a third-party key with no in-app guidance, dashboard density for new users.

---

## 1. Raul — brand-new fantasy novelist, non-technical
- **Rating: 6.5 / 10**
- Sees: create book → drops into a dashboard with a lot of widgets, plus "write-first" blank
  Chapter 1. No obvious way to *plan first*.
- **Patches:**
  1. On a brand-new book, surface a prominent **"Start Book Development" empty-state CTA**
     linking to `/books/{id}/dev` (right now the pipeline is only reachable via the sidebar).
  2. On the overview, replace the generic setup hint with a 3-step "Idea → Synopsis →
     Structure" checklist for new books.

## 2. Simona — outliner / planner (“plotter”)
- **Rating: 8 / 10**
- Loves the Book Development hub and the gated prerequisites (architecture waits on
  synopsis, which waits on concept). Wants the hub to be the default landing for new books.
- **Patches:**
  1. Make `/dev` the post-creation redirect for new books (or a prominent banner), not the
     write-first blank editor.
  2. Per-stage "Run" buttons should show a one-line why: e.g. "Not started — run new-novel".

## 3. Dušan — pantser, writes straight through
- **Rating: 8 / 10**
- Resents mandatory pre-draft structure. Happy there's write-first + freewrite.
- **Patches:**
  1. Allow dismissing the hub "Next" badge so pantsers can ignore the recommended stage.
  2. Ensure the dev hub never blocks the editor (it's a view, not a gate — confirmed OK).

## 4. Elena — professional editor onboarding authors
- **Rating: 8.5 / 10**
- Praises the synopsis → dev-editor + continuity feedback, export sandboxing, versioned
  findings. Wants client-helping affordances.
- **Patches:**
  1. A "handoff" summary per chapter (findings + synopsis shown side by side) to brief
     clients.
  2. Line-edit could optionally load the synopsis too (currently micro-scope only) for
     prose that must preserve plot intent — enable as an editor setting.

## 5. Miloš — series author
- **Rating: 7.5 / 10**
- Uses Story Bible, Architecture, series context sidebar. Wants series continuity surfaced in
  the book dev hub.
- **Patches:**
  1. In the hub's Research/Plan cards, note whether the book belongs to a series and link to
     the series bible.
  2. Continuity report should be reachable from the hub's "Structure" card.

## 6. Tara — mobile editor on a tablet
- **Rating: 7 / 10**
- Mobile editor + autosave + offline draft buffer work. Wants the hub usable on small screens.
- **Patches:**
  1. The hub's 2-col/3-col grid should collapse to a single column on phones and the
     "Next" badge not overlap the card edge (check responsive layout).
  2. Add hub route to the mobile bottom nav.

## 7. Petar — skeptic re: AI quality / costs
- **Rating: 6.5 / 10**
- Concerns about cost and unpredictable output. No API key → world/topic research silently
  degrades.
- **Patches:**
  1. When no research provider key is set, the hub's Research card should show an inline
    "add a key in Settings → API Keys" hint instead of appearing merely "not started".
  2. Cost-limit guardrail / spending visibility near agent runs.

## 8. Jelena — bilingual (sr/en) user
- **Rating: 9 / 10**
- i18n is complete (7 locales incl. sr). Wants the agent-facing content to respect language
  too.
- **Patches:**
  1. Ensure the book-development hub strings never leak English into an sr session (already
     covered by the i18n guard tests — confirmed OK).
  2. Add the hub to the language-smoke e2e for one non-English locale.

## 9. Igor — power user, exports EPUB/PDF
- **Rating: 8.5 / 10**
- Export sandboxing, EPUB/PDF/DOCX fidelity are strong. Wants export presets + cover binding.
- **Patches:**
  1. Remember the last-used export options per book (persist in settings).
  2. Bind the book cover artifact into export when present.

## 10. Natalija — business owner / founder plan
- **Rating: 8 / 10**
- Likes Stripe tiers + The Shelf + analytics. Wants activation nudges to reduce churn.
- **Patches:**
  1. Dashboard should show the single highest-value next action for the current plan (e.g.
     "finish synopsis" or "run first beta-read").
  2. Add a lightweight "leaderboard/lifetime stats" already partly present — polish only.

---

## Prioritized fix list (triaged)

**Implement now (high value, low risk):**
1. **First-run discoverability** (Raul/Simona): a "Start Book Development" CTA on the book
   overview for books with no concept yet.
2. **Research "no key" hint** (Petar): hub Research card shows an actionable hint when no
   research provider key is available.
3. **Dismissable "Next" badge** (Dušan): hub recommended-stage badge is non-blocking and
   clearly informational (already a view, no gate — keep; add subtle "suggested" wording).

**Defer (worth a ticket, not this pass):**
- Chapter handoff summary (Elena), series continuity link in hub (Miloš), line-edit synopsis
  toggle (Elena), hub in mobile nav (Tara), export presets/cover (Igor), activation nudge
  (Natalija), language-smoke e2e for hub (Jelena).