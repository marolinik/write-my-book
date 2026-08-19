# D-169 / D-170 / D-171 / D-172 — new defects from the D-157 live re-shoot (2026-07-27)

Source: `evidence/p1-maya-rejudge/UI-CAPTURE-2026-07-27-d157.md` (43-series shots).
Register continues from D-168. Next free after this file: **D-173**.

Context: single tight capture proving `d625d51` (D-157 fix) on camera. **Both prescribed proof
points PASS** — see "Also confirmed" below. These four are what fell out of the surrounding paths.

## D-169 (S2) — in-thread "Keep as-is" / "Use it" / close-X also navigate the writer out of Editorial Review
- **Symptom:** clicking "Keep as-is" inside an expanded discuss thread writes the dismiss PATCH *and*
  router-pushes to `/books/:id/chapters/:chapterId`. The writer is thrown into the chapter editor
  mid-review, losing their place in the findings queue and any view of the decision just made.
- **Cause:** `FindingCard`'s root `<Card>` has `onClick → setSelectedFinding + onShowInText(finding)`,
  and on the editorial page `onShowInText = handleShowInText` → `router.push(...)`
  (`findings-panel.tsx:52-71`). Every button rendered directly by `FindingCard` calls
  `e.stopPropagation()` (`finding-card.tsx:293-348`); the buttons rendered by `FindingConversation`
  ("Use it", "Keep as-is", thread close **X** — `finding-conversation.tsx:52, 101-106`) do not, so
  their clicks bubble to the card.
- **Evidence (live):** `43d-keep-as-is-nav-defect.png` — immediately after the click the shot shows
  the *in-editor* findings panel (blue selected card + `text changed` staleness badge, a prop only
  `editor-findings-panel.tsx` supplies). `43d-keep-as-is-assertions.json` network trace shows
  `PATCH …/findings/73b2781c` 200 followed by `GET …/editorial/findings?chapterNumber=1` (the
  editor's chapter-scoped query).
- **Fix sketch:** `e.stopPropagation()` on the three `FindingConversation` handlers (or accept a
  wrapper that stops propagation for the whole thread subtree).

## D-170 (S3) — constraint chip promises a memory that dismiss won't persist when a later turn carries a REVISION
- **Symptom:** UI shows *On "Keep as-is", I'll remember: "…"* but clicking "Keep as-is" persists
  nothing, whenever the newest assistant turn carries a REVISION (or plain prose) rather than the
  REMEMBER.
- **Cause:** `computeConversationView` scans **all** assistant turns and keeps `latestConstraint`
  from whichever turn last carried one (`finding-conversation.ts:62-73`), while the dismiss route
  re-parses **only the newest** assistant reply (`findings/[findingId]/route.ts:267-273`,
  `findFirst … orderBy createdAt desc`). Guarded-overwrite in the view means a mid-thread constraint
  survives on screen but not in the route's single-row read.
- **Evidence:** `43c-retro-drift-clean.png` — finding `036a088d`, turns 1–2 carry REMEMBER, turn 3
  carries REVISION only; the chip renders. Source-audited, not live-fired (firing it would have
  consumed `036a088d`'s pending-state evidence). Cheap to prove: dismiss `036a088d`, diff
  `writer_memories`.
- **Family:** same silent-drop class as D-157 itself, one layer up — the leak is fixed and the
  promise is now legible, but the promise is still breakable.

## D-171 (S3) — persisted writer memories have no writer-facing surface at all
- `src/components/memory/writer-memory-panel.tsx` is the only component that lists / edits / revokes
  `writer_memories` via `/api/memory`, and it has **zero import sites** anywhere in `src/`.
- The two mounted "memory" surfaces are about the Qdrant vector index, not writer memory:
  `MemorySettings` (settings page) and `MemoryStatsCard` (book overview), both fed by
  `/api/memory/stats` → `chunkCount` / `qdrantHealthy` / `embeddingCost`.
- Net effect: the editor says "I'll remember X", stores X book-scoped and permanently `active`, feeds
  X into every later prompt via `formatWriterMemoryForPrompt`, and the writer can never see the list,
  correct a mis-summarised constraint, or take one back. All three API endpoints already exist
  (`GET/POST /api/memory`, `PATCH/DELETE /api/memory/:id`) and are already wired in the dead panel.
- **Family:** writer-trust / observability (D-44, D9 retention lens).

## D-172 (S2) — discuss turns are unmetered: real BYOK spend, zero `usage_records`
- `runDiscussTurn` (`src/lib/editorial/discuss-llm.ts`) builds its own LLM client and calls
  `client.messages.create` with **no** usage/cost write anywhere in the discuss path
  (`grep usageRecord|recordUsage|trackUsage` across `src/lib/editorial/` and the editorial routes →
  no hits).
- **Evidence (live):** this session's 24.3 s discuss turn ran at `2026-07-26 23:26` UTC; the newest
  `usage_records` row for `user_qa_p1` is `2026-07-26 21:28:02` (a prior session's writing-coach
  call). Nothing recorded.
- Every discuss turn is a real charge against the writer's own OpenRouter key that the in-app spend
  panel will never show — the concrete mechanism behind the D-44 / D-119 "usage panel is a dishonest
  health surface" family, now pinned to one specific unbilled route.

## Also confirmed in this capture (no new numbers)
- **D-157 fix holds live, both prescribed proof points PASS.** One live turn on virgin finding
  `73b2781c`: clean prose bubble, constraint chip, **0** raw control blocks (programmatic assertion);
  "Keep as-is" → new `writer_memories` row `d6ae40cc` whose `content` is byte-identical to the chip
  text. Proof artifacts `43a-*`, `43b-writer-memory-row.txt`.
- **Drift branch exercised on real model output, not a fixture.** `036a088d`'s two stored turns carry
  the genuine 2-bracket `<<<REMEMBER category="preference">>` captured on camera 07-26; post-fix the
  same bytes render as prose and the chip recovers the drifted block's body (`43c`, direct
  counterpart of `42a-discuss-thread.png`).
- **Disclosed honestly:** the *fresh* turn emitted well-formed `>>>` (three brackets), so the fresh
  emission alone did not exercise drift tolerance. Observed live drift rate on this book is 2 of 4
  stored REMEMBER emissions.
- Belt-and-braces sweep produced **zero** `[discuss]` log lines — correct, since the observed drift
  shape is now handled by the tolerant strict regex and the sweep never has to fire.
- D-104 fix still holds (no blank bubbles across the re-rendered 3-turn capped thread);
  `<<<REVISION>>>` still renders as the AI Rewrite Comparison card; 3-exchange cap notice intact.
