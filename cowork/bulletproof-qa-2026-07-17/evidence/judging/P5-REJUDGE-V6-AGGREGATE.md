# P5 Sam — re-judge v6 aggregate (post D-132/D-133/D-134/D-135 fix + v6 phone re-capture)

2026-07-26 · Blind panel, 3 independent Fable judges (func+reliability /
ux+experience / trust+MI), scoring neutral bundle
`evidence/judging/p5-v6-judge-bundle.md` + 11 listed phone shots (workflow
wf_1e6a24aa-565). Aggregation per GRADING-PROTOCOL: MIN on D1/D2/D7/D8, median
elsewhere; carry-forward where the bundle offers no genuine evidence.

## Verdict

**P5 5.0 — UP from 4.5. First numeric lift since v3; new platform MIN = 5.0.**
The v5 floor D3b (no touch path to accept ghost text) is DEAD: tap-accept on
camera lifted it 4.5 → 6.0. D2 recovered 5.0 → 6.5 on the strongest artifact of
the round — the close-inside-debounce probe re-run against a FRESH browser
context (no local recovery possible) with the sentence present on reload:
only the new pagehide keepalive flush can explain it, and the FUNC judge
called the arithmetic coherent (word counts across shots add up). New floor is
a 5.0 cluster: **D5 performance feel** (non-streaming, cold-start never
re-measured, loading dots not re-captured), **D10 delight** (the magic moment
finally lands by thumb — and is visually marred by the overlay layout in the
same shot), **D11 edge** ("table stakes reached, not a switching case"),
plus D4 carry.

| Dim | FUNC | UX | TRUST | v6 agg | rule | v5 | Δ |
|---|---|---|---|---|---|---|---|
| D1 Functionality | 6.5 | 6.5 | 6.0 | **6.0** | MIN | 6.5 | −0.5 (inline-edit touch path never on camera) |
| D2 Reliability | 7.5 | 7.0 | 6.5 | **6.5** | MIN | 5.0 | **+1.5 — loss window CLOSED on camera** |
| D3 Usability | 6.5 | 5.5 | 5.5 | 5.5 | med | 6.5 | −1.0 (overlay clipping, 422 occlusion evidenced) |
| D3b Ergonomy | 6.0 | 6.0 | 5.5 | **6.0** | med | **4.5 FLOOR** | **+1.5 — FLOOR CLEARED (tap-accept)** |
| D4 Onboarding | NE | NE | NE | 5.0 | carry v5 | 5.0 | = |
| D5 Performance feel | 5.5 | 5.0 | 4.0 | **5.0 FLOOR-TIE** | med | 5.0 | = (unre-verified this round; own gap list) |
| D6 Look & feel | 5.5 | 5.5 | 4.5 | 5.5 | med | 6.0 | −0.5 (overlay column, pill z-fights on camera) |
| D7 Trust & safety | 6.5 | 6.5 | 6.0 | **6.0** | MIN | 6.5 | −0.5 (BYOK fix + meter integrity prose-only) |
| D8 Manuscript intel | 6.0 | 6.0 | 6.0 | **6.0** | MIN | 6.0 | = (two competent voice-matched completions; still seeded prose) |
| D9 Retention | 5.0† | NE | 4.0† | 6.0 | carry v5 | 6.0 | = (†both scored on quick-assist-only bundle scope; per v5 precedent carry stands — retention surfaces deliberately out of bundle) |
| D10 Delight | 5.5 | 5.0 | 4.5 | **5.0 FLOOR-TIE** | med | 6.0 | −1.0 (moment delivered, presentation undercuts it) |
| D11 Competitive edge | 5.0 | 5.0 | 4.5 | **5.0 FLOOR-TIE** | med | 5.5 | −0.5 |

Grade = lowest aggregated dim = **5.0** (D5/D10/D11 cluster + D4 carry).
Judges' headlines: FUNC 5.0 (D11), UX 5.0 (D11), TRUST 4.0 (D5) — TRUST's 4.0
D5 is his single-judge low; the median holds 5.0.

## PROVED this round (fix-lane on camera)
- **D-132 CLOSED**: real `touchscreen.tap` on the overlay inserted the
  suggestion (20→21), space join intact, persisted through reload. Ghost text
  usable by thumb for the first time in eight rounds.
- **D-133 CLOSED**: page closed 700 ms after the last keystroke (inside the 2 s
  debounce) → fresh context → sentence on the server (26). Round-5's exact
  loss scenario, dead.
- **D-134 CLOSED**: persistent top-anchored banner (23), re-entry inside the
  old 60 s cooldown window still visible, Upgrade 89×44 → /settings/billing
  (24), dismiss 44×44 (25), instrumented probe: ONE request at the wall, zero
  doomed re-fetches post-dismiss.
- **D-118 backstop finally rendered live** (27): honest 422 copy + Open
  Settings (staged registry flag, disclosed; pipeline + copy genuine).

## Aggregator adjudications (documented per v4/v5 precedent)
- **Shot 22 empty-banner** (all 3 judges flagged; 2 filed it as a defect): the
  capture script's `role=alert` wait was satisfied by a transient
  headless-auth artifact toast that vanished before the screenshot — the
  disclosed auth-CDN failure mode. The instrumented re-run in Evidence C
  (network-logged) shows the FIRST 429 producing the banner within one pause.
  Adjudicated **harness artifact, not a first-pause render defect**; judges'
  D3/D1 deductions for "first-pause unproven ON CAMERA" stand as scored (the
  camera gap is real). Re-shoot item: first-pause banner shot.
- **D9 carry**: two judges scored 4.0–5.0 on a bundle that deliberately
  contains no retention surfaces; v5 precedent (5.5† scores → carry) applies
  unchanged. Without carry the headline would move to a dimension the bundle
  did not probe.

## New defects (register; next free was D-138)
| ID | Sev | Finding |
|---|---|---|
| **D-138** | S3 | Ghost overlay layout broken near the right viewport edge on phone: fixed-position overlay at raw cursor coords gets no max-width/wrap logic, rendering a one-word-per-line column with clipped glyphs flowing under the bottom nav — and burying the "Tap to accept" pill below the fold (20; SAME failure visible in pre-fix 06 — longstanding, first time judged). Undercuts D-132's discoverability, D6, D10. Fix shape: clamp overlay width/position to viewport (flip to left of cursor near the edge; max-width; keep hint pill inside the visible block). |
| **D-139** | S3 | Non-wall quick-assist toasts (422 backstop, fallback errors) remain bottom-anchored sonner toasts — occluded by the Issues pill and sitting over the bottom nav (27), the exact occlusion class the wall banner escaped by going top-anchored (D-136 family). Fix shape: top-position quick-assist toasts on small screens (or promote the 422 to the banner surface). |
| **D-140** | S4 | Accepted ghost text can end mid-clause: the 60-token budget truncates ("…a slick-backed shape that showed") and tap-accept inserts the dangling fragment verbatim (21). No sentence-boundary trim on accept. Copilot-style tools share this behavior — severity S4, design-memo candidate rather than clear bug. |
| — | — | Confirmed on camera (already registered): D-136 Issues-pill z-order/nav occlusion in every shot; banner-over-toolbar = disclosed D-132/134-lane residual (S4). Inline-edit-on-touch and BYOK-panel captures = evidence gaps, not defects (re-shoot list). |

Judge honesty checks concur: bundle "unusually self-critical in prose" but the
image set is weaker than the prose in two load-bearing places (shot 22, the
buried tap pill) — both now adjudicated/registered above.

## Lift path from 5.0
The 5.0 cluster needs: **D5** — streaming (or measured prod latency + honest
cold-start story; the single biggest named lever for two judges), re-capture
loading dots; **D10/D6** — fix D-138 overlay layout (cheap, big presentational
win on the flagship moment); **D11** — inline-edit on camera by touch + a real
(non-seeded) manuscript run (also the D8 lever). Cheap evidence wins for next
round: first-pause banner shot, BYOK settings-panel shot, meter screenshot
before/after a walled call, inline-edit overflow-menu flow on phone.
