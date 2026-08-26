# D-201 / D-202 — registered from the 50-series capture (P2, 2026-07-27)

Both found while capturing the Lane-C fixes on the running build. Neither is fixed.
Numbers D-199 and D-200 were already taken by the orchestrator's DB cross-check in
`p2-gerald-rejudge/ADJUDICATION-2026-07-27-50-series.md`. Next free defect: **D-203**.

---

## D-201 [S3] — transcript recovery can install a conversational turn as the declared artifact

**Where.** `src/lib/agents/artifact-contract.ts` (`looksLikeDeliverable`),
`src/lib/agents/book-health.ts:206`.

**What happened, captured.** Shot 50a drove "Create Story Bible" on book `90436e20`. The
agent wrote into the chat instead of calling `WriteDocument`, the RECOVERY branch fired
correctly, and document `dd0cc514-a7ae-454e-b12a-c366f21d9d92` was persisted as
`STORY_BIBLE` with `change_source = transcript-recovery`, `version = 1`, `word_count = 777`.

Reading what was saved (`GET /api/books/90436e20-.../documents/dd0cc514-...`, HTTP 200):

- 847 words, 8 markdown headings, **8 question marks**
- opens: *"Welcome. I'm your Writing Coach, and I'll be building the story bible for
  **P2-CAPTURE-D8-1785129390**."*
- closes, after five numbered questions to the writer: *"Take your time — this bible will be
  the reference document for everything that follows (architecture, editing, analysis), so I
  want it to be right."*

That is the coach's **opening interview turn** — a request for input — stored as the
finished deliverable. It passes the contract because the contract's deliverable test is
structural (`>=300` words, `>=2` headings) and cannot tell a filled-in bible from a
well-formatted question.

**Why it matters.** `book-health.ts:206` derives the gate by existence only:

```ts
hasStoryBible: docTypes.has("STORY_BIBLE"),
```

So the recovered interview turn flips `hasStoryBible` true, which:

- marks the Story Bible step **"Created"** in the setup summary (`setup/page.tsx:648`),
- advances the wizard ladder and re-labels the button `reCreateBible` (`setup/page.tsx:552-574`),
- adds `create-story-bible` to the completed set in the agent panel (`agent-panel.tsx:127`).

Every later stage (architecture, editing, analysis) then proceeds on a "bible" that contains
the questions instead of the answers. There is no review-before-persist step and no undo
affordance on the recovery path — the writer's only signal is one sentence in a toast.

**Severity S3, not higher:** the product does disclose that it persisted the text, and the
document is visible and editable in the documents list. The harm is silent gate
satisfaction, not data loss.

**Suggested shape (not implemented).** Either raise the deliverable test (reject text whose
tail is interrogative / whose question density is high), or make the recovered document
enter in a `needs-review` state that does not satisfy `hasStoryBible` until the writer
confirms. The second is cheaper and matches the campaign's honesty pattern.

**Evidence.** `p2-gerald-rejudge/shots/50a-assertions.json`, `50a3-artifact-verdict.png`,
`50a4-contract-message-closeup.png`; document + version rows above.

---

## D-202 [S4] — Find & Replace preview can stall on the minimum-length hint

**Where.** `src/components/editor/find-replace-dialog.tsx:55, 66-70, 132`.

**What happened, captured.** In the banked 50d run, all six queries (`old`, `Zürich`,
`ürich`, and their toggle variants) left the preview panel reading *"Type at least 2
characters to preview matches."* for roughly 40 s, while the Find box visibly held the term
(`50d2-old-wholeword-on.png`).

**Why it is not simply "the text never reached the input".** Two derived values in the same
component read different state:

```ts
const wholeWordApplies = find.trim().length === 0 || isWordLikeQuery(find);   // :75  <- find
const showPreview = debouncedFind.trim().length >= 2;                          // :132 <- debouncedFind
```

In the same banked run, `wholeWordApplies` flipped exactly once — at the non-word query
`"— "`, where `wholeWordDisabled` went `true` and the reason text rendered — and `scopeBook`
moved `"This chapter" -> "Whole book"`. Both require the `find` state to have updated and
React to have re-rendered. What never advanced was `debouncedFind`, i.e. the 300 ms
`setTimeout` state commit at `:66-70`.

**Status: mechanism unresolved, intermittent.** Run 1 of the same build previewed correctly
(console-observed, not banked: `Zürich` whole-word ON = 176 matches in 8 chapters). The
retry budget for the shot was spent on the run that regressed, so per the honest-capture
rule there was no third attempt.

**S4 and harness-suspect**, but worth one human keystroke test: if it reproduces with real
typing, a writer sees a Find dialog that looks broken while the underlying search is fine.
The API returns correct counts for the identical queries
(`old` 1/277, `Zürich` 176/176, `ürich` 0/176, `Marseille` 170/170, `arseille` 0/170).

**Evidence.** `p2-gerald-rejudge/shots/50d-assertions.json` (`raw.*.previewHeader` on every
probe), `50d2-old-wholeword-on.png`, `50d6-nonword-toggle-disabled.png`.
