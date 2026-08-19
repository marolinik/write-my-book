# P5 evidence bundle — BLIND SCORING (v5)

Score this persona on the 12-dimension rubric below. Judge ONLY from the
evidence in THIS file **plus the image files explicitly listed in Evidence D**
(view them). Do not read any other file or explore the repository. All
measurements are on a **dev server** (label everything dev-server). The model
under test is a seeded reasoning model (`qwen3.6-27b` family) as the persona's
default; "cheap model" below = a non-reasoning DeepSeek model, routed via the
same OpenRouter key.

## Persona
**Sam** — phone-first hobbyist novelist. Brings his own OpenRouter API key
(BYOK). Unsubscribed → **free tier** (daily quick-assist meters apply: 100
ghost-text completions/day). Account default model is a seeded reasoning model.
Writes primarily on a phone (390×844). Two quick-assist surfaces matter:
- **ghost-text** = inline autocomplete continuation as he types (60-token budget, fires after a 1.5 s typing pause).
- **inline-edit** = rewrite a selected passage into N alternatives (popup, F2).

## Evidence A — prior audit rounds (behaviour observed earlier, summarized)
1. Round 1–3: ghost-text on his default returned an honest 422 error card 6/6
   (autocomplete impossible until manual model switch); inline-edit worked but
   took 28–44 s and billed 1655–3464 invisible "thinking" tokens per call to
   his own key (~50–90× the cheap-model cost).
2. Round 4 (after a routing fix, live HTTP as Sam): ghost-text 200 real prose
   (cold 12.6 s, warm 1.99 s), inline-edit 200 with 98 output tokens; spend
   attributed to the resolved cheap model; free-tier meter incremented only on
   success; the 422 card remains as a backstop for genuinely reasoning-only
   models. Non-streaming endpoints (whole-response latency; no token cadence).
3. Round 4 had **no phone/browser evidence at all** for this phone-first
   persona; cap exhaustion and cross-tenant access were unprobed for 4 rounds.

## Evidence B — first phone capture (07-25, build BEFORE the latest fixes)
Phone viewport 390×844 in a live browser as Sam:
1. Ghost text rendered as-you-type on the phone (overlay suggestion + "Tab ↹"
   hint); Tab accept worked BUT inserted with no joining space — the doc came
   to read **"wrote about thedream:"** (word glue, DOM-verified).
2. No loading affordance existed during the 3–6 s fetch (blind wait).
3. Cap wall probed for the first time: with the daily meter at 100, the server
   answered **429** with body `{"error":"Free plan includes 100 ghost-text
   completions per day. Resets at midnight UTC.","upgradeToTier":"indie",
   "remainingToday":0}` — but the **UI stayed completely silent** (both
   quick-assist clients discarded every non-200; no toast, no banner; ghost
   simply stopped appearing). The 422 backstop copy was equally unreachable.
4. Cross-tenant isolation under Sam's real session vs another user's book:
   GET book / GET documents / POST ghost-text all **404 "Book not found"**
   (existence-hiding, no spend); the page route renders an app 404.
5. Billing panel: founder slots consistent; BYOK spend shown $0.03 (sub-cent
   formatter live); usage 12 agent sessions ≈ $0.03, 3.2K in / 10.6K out.
6. Settings "Global Default Model" combobox rendered **BLANK** for Sam's stored
   default (the picker deduped same-name tier variants and dropped his id) —
   he could not see his own default model.
7. No point-of-use disclosure anywhere that quick suggestions may run on a
   different (faster) model than his selected default.

## Evidence C — code state since Evidence B (dev-server, same branch)
- The three client gaps above were addressed: quick-assist clients now surface
  server error copy (throttled toast on ghost with per-message 60 s cooldown;
  in-popup `role=alert` on inline-edit which stays retryable and also reports
  the zero-suggestions case); the ghost Tab-accept join inserts a separating
  space when both sides are word-like (quote/punctuation aware, 2-char
  context); the model picker dedupe now keeps the stored id's entry; a
  point-of-use disclosure line ("Quick suggestions may use a faster model than
  your default.") renders in the ghost-toggle menu item, its desktop tooltip,
  and the inline-edit popup; a pulsing `role=status` indicator renders at the
  cursor while the ghost fetch is in flight. The cap-wall toast carries an
  **Upgrade** action (routes to /settings/billing); the 422 backstop toast
  carries **Open Settings** (routes to /settings).
- Unit suite at capture time: 1297/1297 across 159 files; the changes above
  carry 46 dedicated tests written failing-first. An independent adversarial
  review panel confirmed 19 low/medium refinements (all high/medium addressed
  in the same build); no critical findings.
- Known residuals, disclosed: a suggestion continuing a PARTIAL word would now
  get a spurious space (heuristic cannot distinguish "the"+"dream" from
  "thr"+"ough"; the glue direction was the observed live failure); while a
  lower-tier id is stored, same-display-name sibling tier ids have no picker
  item; the toolbar disclosure markup has no automated render test.

## Evidence D — phone re-shoot on the fixed build (07-26, headless Playwright, 390×844 DPR3, dev-server)
View these image files (paths relative to
`cowork/bulletproof-qa-2026-07-17/evidence/p5-wave-c/`); pre-fix shots from
Evidence B are listed for contrast. Judge what you SEE.

| File | What was captured |
|---|---|
| `06-phone-ghost-text-rendered.png` | (07-25 pre-refinement) ghost overlay on phone |
| `09-phone-cap-wall-moment.png` | (07-25) the wall moment — plain editor, nothing rendered |
| `12-phone-settings-model-selection.png` | (07-25) blank model combobox |
| `13-phone-more-tools-disclosure.png` | (07-26) "Enable AI Ghost Text" menu item with caption "Quick suggestions may use a faster model than your default." |
| `14-phone-ghost-loading-dots.png` | (07-26) muted `···` at the cursor during the in-flight fetch |
| `15-phone-ghost-rendered.png` | (07-26) ghost overlay: italic suggestion + "Tab ↹", autosave stamp "Saved 02:18 AM" |
| `16-phone-ghost-accepted-join.png` | (07-26) after Tab: doc reads "wrote about the ship and its strange cargo…" (DOM check logged `OK-NO-GLUE`); the earlier "thedream" glue is still visible higher in the same paragraph (historical text) |
| `09b-phone-cap-wall-toast.png` | (07-26) meter set to 100, typing pause → red toast "Free plan includes 100 ghost-text completions per day. Resets at midnight UTC." + **Upgrade** button |
| `18-phone-upgrade-deeplink-billing.png` | (07-26) after tapping Upgrade: /settings/billing loaded |
| `17-phone-inline-popup-disclosure.png` | (07-26) AI Edit popup (pills, instruction field) with the disclosure line under Generate/Cancel |
| `19-phone-settings-picker-fixed.png` | (07-26) Global Default Model combobox renders "Qwen 3.6 27B (OpenRouter) $$" for the stored id |

Scripted probe results (logged, not screenshotted): Tab-accepted text +
autosave flush + fresh page reload → text present after reload with the space
join intact. An earlier capture run that closed the browser within ~10 s of
accepting lost the accepted sentence — attributed to closing inside the
autosave debounce (the typed text from the same run did save); treat as a
capture-harness artifact unless you weigh it otherwise. The cap-wall meter was
set to 100 by direct DB write and reset after the shot; wall traffic was
otherwise organic.

### What Evidence D does NOT contain (still missing)
- No physical-device capture (headless browser at phone viewport; touch
  keyboard, IME, and scroll feel unexercised).
- Latencies this round are single-sample; cold-start (12.6 s in round 4) not
  re-measured; prod never measured. Endpoints remain non-streaming.
- 429-wall re-entry UX beyond the toast (what a 4th, 5th pause feels like under
  cooldown), 409 stale-save, docx export, provider-outage: unprobed.
- The 422 backstop card was not force-rendered live this round (its copy and
  Open Settings action are unit-tested only).
- D3b ergonomy and D6 look-and-feel have only what the listed shots show.

## Rubric — 12 dimensions (score each 0–10 or NO-EVIDENCE)
| # | Dimension | Weight |
|---|---|---|
| D1 | Functionality — journeys complete correctly | 2.0 |
| D2 | Reliability & data safety — words never lost | 2.0 |
| D3 | Usability — state visibility, control, plain-language errors | 1.5 |
| D3b | Ergonomy & efficiency — click/keystroke economy, no dead-ends | 1.0 |
| D4 | Onboarding / time-to-first-word | 1.0 |
| D5 | Performance feel — latency, first-token, stream cadence, queue honesty | 1.0 |
| D6 | Look & feel / design polish — themes, contrast, locale, states | 1.0 |
| D7 | Trust & safety — gates, ownership, key handling, billing states | 1.5 |
| D8 | Manuscript intelligence quality — voice, anchoring, continuity | 2.0 |
| D9 | Retention / habit | 1.0 |
| D10 | Delight — moments that exceed expectation (ghost text, "magic") | 0.5 |
| D11 | Competitive edge vs incumbent; "would switch & pay" | 1.5 |

## Calibration anchors
- 6 — works but feels like an internal tool; frequent friction.
- 7 — good SaaS baseline; occasional rough edge.
- 8 — polished; a paying author is satisfied; rare friction.
- 9 — genuine peer to best-in-class with a real moat; friction is rare/memorable.
- 9.5 — best-in-class; testers try to break it and fail.
- 10 — reserved; do not award.

## Severity for any new defects
S1 data-loss/billing-overrun/leak/ownership-bypass/crash · S2 journey-block/wrong
output · S3 friction/polish capping a dim · S4 cosmetic.

## Your task
Score EVERY dimension you have evidence for; mark **NO-EVIDENCE** (excluded, not
a low score) where the bundle gives you nothing. For each score cite the specific
evidence line or image. Explicitly answer: *does this bundle look suspiciously
clean, and what failure evidence would you expect that is missing?* End with a
one-line headline grade = the lowest dimension you scored, and name that
flooring dim.
