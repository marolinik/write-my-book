# P5 evidence bundle — BLIND SCORING (v6)

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
Writes primarily on a phone (390×844) with a soft keyboard: **no Tab, F2, or
Escape keys exist for him.** Two quick-assist surfaces matter:
- **ghost-text** = inline autocomplete continuation as he types (60-token budget, fires after a 1.5 s typing pause).
- **inline-edit** = rewrite a selected passage into N alternatives (popup; F2 on hardware keyboards, overflow-menu on touch).

## Evidence A — prior rounds (behaviour observed earlier, summarized)
1. Rounds 1–3: ghost-text on his default returned an honest 422 error card 6/6;
   inline-edit worked but took 28–44 s and billed 1655–3464 invisible
   "thinking" tokens per call to his own key (~50–90× cheap-model cost).
2. Round 4 (after a routing fix, live HTTP as Sam): ghost-text 200 real prose
   (cold 12.6 s, warm 1.99 s), inline-edit 200 with 98 output tokens; spend
   attributed to the resolved cheap model; free-tier meter incremented only on
   success. Endpoints non-streaming (whole-response latency).
3. Round 5 (first phone captures, then a fix build + re-shoot): word-glue on
   Tab accept fixed with a quote-aware space join; loading dots during the
   fetch; the silent cap wall replaced by an honest 429 toast with an Upgrade
   deep-link; model picker renders his stored default; point-of-use
   disclosure line on all quick-assist surfaces. All verified on phone-viewport
   shots. **But the round-5 shots also showed: the ONLY accept affordance was
   a "Tab ↹" hint (inline edit badged "F2") — keys that do not exist on his
   phone; an accepted sentence was lost when the browser closed ~10 s after
   accept (typed text from the same run saved; no page-hide server flush
   existed); the wall toast had a per-message 60 s cooldown so a second pause
   at the wall rendered nothing; the BYOK settings copy read "You pay
   Anthropic directly" while his only key is OpenRouter.**

## Evidence B — code state since round 5 (dev-server, same branch, all landed in one build)
- **Touch accept**: on coarse-pointer devices the ghost suggestion overlay is
  itself the tap target (whole suggestion tappable, `role=button`,
  "Tap to accept" pill hint). Tap discrimination: pointer-down is captured so
  the ghost is not dismissed by the caret move, accept fires on pointer-up
  within a 10 px slop, and a scroll/drag that merely starts on the overlay
  cancels (no accidental insert). After accept, focus returns to the editor
  with the cursor after the inserted text. Fine-pointer (desktop) keeps the
  original passive overlay ("Tab ↹", click passes through to the editor).
  The inline-edit "F2" badge is hidden on coarse pointers (the overflow-menu
  path is the touch path).
- **Page-hide server flush**: on `pagehide` / `visibilitychange:hidden`, if the
  pane is dirty (no save in flight, no unresolved conflict, online), the SAME
  version-stamped CAS save dispatches immediately with `fetch keepalive`, so
  the words reach the SERVER even if the page dies. 60 KB single-body cap plus
  a global in-flight byte budget (two split-view panes cannot jointly breach
  the browser's 64 KB keepalive sum); over budget falls back to a plain fetch.
  When the page survives (normal phone backgrounding) the response flows
  through the existing 409/conflict machinery.
- **Persistent wall banner**: the 429 cap wall now renders a persistent
  `role=alert` banner — verbatim server copy + an Upgrade button
  (→ /settings/billing) + a dismiss control, both ≥44 px touch targets —
  TOP-anchored so the soft keyboard and the bottom nav can never occlude it.
  While the wall is up, further ghost fetches are suppressed for 5 minutes
  (no doomed per-pause 429 calls), then the next pause re-probes: still capped
  re-shows the banner, success clears it. Dismiss hides the banner without
  re-arming the fetch loop. The per-message 60 s cooldown still governs
  non-wall error toasts.
- **BYOK copy**: the settings trust panel now reads "You pay your AI provider
  directly for token usage" (provider-neutral) in all 7 UI locales.
- Suite at capture time: 1351/1351 across 162 files; the changes carry
  RED-first tests. An independent adversarial review panel raised 13 findings;
  10 confirmed (2 high, both phone-UX: keyboard-occluded bottom banner,
  accidental accept on scroll-start) and all 10 were addressed in the same
  build; 3 refuted.
- Known residuals, disclosed: ghost text can still be ARMED during the
  immersive (distraction-free) mode whose overlay renders ABOVE the banner and
  ghost — a cap hit inside immersive mode is invisible until exit (registered
  as a new defect, not fixed in this build); split view can render two wall
  banners; desktop mouse users cannot click-accept (deliberate: Tab is the
  hardware path); the banner may overlap the sticky toolbar area while the
  wall is up.

## Evidence C — phone re-capture on this build (07-26, headless Playwright, 390×844 DPR3, **isMobile + hasTouch** so `(pointer: coarse)` matches, dev-server)
Scripted probe results (logged):
- Tap accept: `page.touchscreen.tap` on the overlay (REAL touch tap, no Tab
  key) inserted the suggestion; DOM check `OK-NO-GLUE` (space join intact);
  after a 13 s autosave window and a fresh reload the accepted text was
  present (`PERSISTENCE: SURVIVED`).
- Flush-on-close: a probe sentence was typed and the page closed **700 ms
  after the last keystroke** — INSIDE the 2 s autosave debounce — then a
  **completely fresh browser context** (empty IndexedDB/localStorage, so no
  local recovery is possible) loaded the chapter: the sentence was present
  (`FLUSH-SURVIVAL: SURVIVED-SERVER`). Contrast round 5, where this exact
  close-inside-debounce scenario lost the sentence.
- Wall: with the meter at 100, a typing pause produced the banner; a SECOND
  typing pause inside the old 60 s cooldown window left the banner still
  visible; Upgrade measured 89×44 px and deep-linked /settings/billing;
  dismiss measured 44×44 px and cleared the banner; an instrumented run
  (network-logged) showed exactly ONE ghost request at the wall — post-dismiss
  typing produced ZERO further requests and no banner bounce-back.
- 422 backstop: rendered live for the first time — honest toast with the
  model-can't-do-quick-suggestions copy and an **Open Settings** action.
- A direct API probe at the wall answered 429 in 69 ms with the honest JSON
  body; the meter never advanced on 429s or the 422 (integrity re-verified).

### Staging disclosures
- The wall was staged by setting the daily meter to 100 by direct DB write
  (restored after; wall traffic otherwise organic).
- The 422 is currently UNREACHABLE for any real configuration (every provider
  has a fit cheap-model fallback for quick assist — defense in depth). It was
  forced by temporarily flagging all OpenRouter registry entries unfit in
  source (reverted immediately), which makes resolution fall back to the
  reasoning model whose thinking survives the reasoning-disable switch — the
  server pipeline and copy are genuine.
- Dangling "the" fragments visible in the wall shots' prose are typed trigger
  sentences the wall rejected (capture-harness artifact — no ghost output was
  involved; the chapter was re-cleaned through the editor after the run).
- One probe run hit a headless-environment artifact (an auth-CDN failure
  rewrote a POST to an HTML 200, raising a transient generic error toast);
  the instrumented re-run above is the authoritative wall-behavior record.

## Evidence D — image files (view ALL; paths relative to `cowork/bulletproof-qa-2026-07-17/evidence/p5-wave-c/`)
Pre-fix shots listed for contrast. Judge what you SEE.

| File | What was captured |
|---|---|
| `06-phone-ghost-text-rendered.png` | (round 5, pre-fix) ghost overlay: "Tab ↹" the only affordance |
| `09-phone-cap-wall-moment.png` | (round 5, pre-fix) wall moment — plain editor, nothing rendered |
| `09b-phone-cap-wall-toast.png` | (round 5 fix build) wall toast with Upgrade — bottom-anchored, covering the bottom nav |
| `20-phone-ghost-tap-hint.png` | (v6) ghost overlay with the "Tap to accept" pill on coarse pointer |
| `21-phone-ghost-tap-accepted.png` | (v6) after the TOUCH TAP: suggestion inserted into the paragraph, no glue |
| `22-phone-cap-wall-banner.png` | (v6) the wall banner: top-anchored card, verbatim copy, Upgrade + × |
| `23-phone-wall-reentry-banner.png` | (v6) second pause inside the old cooldown window — banner still visible |
| `24-phone-wall-upgrade-billing.png` | (v6) after tapping Upgrade: /settings/billing loaded |
| `25-phone-wall-dismissed.png` | (v6) after tapping ×: banner gone, editor usable |
| `26-phone-flushclose-survived.png` | (v6) fresh-context reload after the close-inside-debounce probe: the sentence is in the chapter |
| `27-phone-422-backstop.png` | (v6) the 422 backstop toast with Open Settings action |

### What this bundle does NOT contain (still missing)
- No physical-device capture (headless browser at phone viewport with touch
  emulation; real thumb reach, IME, momentum scroll, and OS keyboard behavior
  unexercised — the tap-accept slop logic has only emulated-touch evidence).
- Latency still single-sample; cold-start (12.6 s in round 4) not re-measured;
  prod never measured; endpoints remain non-streaming.
- Inline-edit results on camera; a real (non-seeded) manuscript; 409
  stale-save UX; docx export; provider-outage behavior: unprobed.
- The wall-suppression 5-minute expiry re-probe (banner re-showing on a STILL
  capped account after the window) is unit-tested, not captured live.
- Immersive-mode wall invisibility is a disclosed, unfixed residual.

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
dimension.
