# P5 Sam — re-judge v5 aggregate (post D-127/D-129/D-130/D-131 fix + phone re-shoot)

2026-07-26 · Blind panel, 3 independent Fable judges (func+reliability /
ux+experience / trust+MI), scoring neutral bundle
`evidence/judging/p5-v5-judge-bundle.md` + 11 listed phone shots (workflow
wf_0fbe3f71-123). Aggregation per GRADING-PROTOCOL: MIN on D1/D2/D7/D8, median
elsewhere; carry-forward where the bundle offers no genuine evidence.

## Verdict

**P5 4.5 — numerically UNCHANGED, but the floor MOVED.** The v3/v4 floor
cluster D5/D10/D11 (experience evidence) **lifted off the floor** (+0.5/+1.5/
+1.0): the Wave C thesis — capture the phone experience on the fixed build —
did exactly what it promised. The new floor is **D3b 4.5: there is no touch
affordance to accept ghost text** — every render shows only a "Tab ↹" hint
(inline edit badges "F2"); mobile soft keyboards have neither key. All 3
judges flagged it independently (2 floored on it); it was invisible until this
round because no phone render existed to show it. Second tier at 5.0: D2
(accept-then-close loss window inside the autosave debounce, no pagehide
flush), D5 (non-streaming, cold-start unmeasured), D4 (carry).

| Dim | FUNC | UX | TRUST | v5 agg | rule | v4 | Δ |
|---|---|---|---|---|---|---|---|
| D1 Functionality | 6.5 | 6.5 | 6.5 | **6.5** | MIN | 6.0 | +0.5 |
| D2 Reliability | 5.5 | 5.0 | 5.5 | **5.0** | MIN | 7.0 | −2.0 (loss-window now evidenced) |
| D3 Usability | 6.5 | 6.5 | 7.0 | **6.5** | med | 5.5 | +1.0 |
| D3b Ergonomy | 4.5 | 4.5 | 6.0 | **4.5 FLOOR** | med | carry | first direct evidence |
| D4 Onboarding | NE | 5.5† | 5.5† | 5.0 | carry v4 | 5.0 | = (†inferential, no onboarding evidence in bundle — discarded per v4 precedent) |
| D5 Performance feel | 5.0 | 5.0 | 5.0 | **5.0** | med | **4.5 floor** | **+0.5 — OFF the floor** (loading dots landed; non-streaming + cold-start keep it at 5) |
| D6 Look & feel | 6.0 | 5.5 | 6.0 | 6.0 | med | carry | first direct evidence |
| D7 Trust & safety | 7.0 | 7.0 | 6.5 | **6.5** | MIN | 6.0 | +0.5 (honest wall + upgrade deep-link + disclosure) |
| D8 Manuscript intel | 6.0 | 5.0‡ | 5.0‡ | **6.0** | MIN* | 6.5 | −0.5 (‡see artifact correction) |
| D9 Retention | NE | 5.5† | 5.5† | 6.0 | carry v4 | 6.0 | = |
| D10 Delight | 6.5 | 6.0 | 6.0 | **6.0** | med | **4.5 floor** | **+1.5 — OFF the floor** (ghost render + join + toast judged real magic-adjacent) |
| D11 Competitive edge | 5.5 | 5.5 | 5.5 | **5.5** | med | **4.5 floor** | **+1.0 — OFF the floor** |

Grade = lowest aggregated dim = **D3b 4.5**.

`*`**D8 artifact correction (aggregator ground truth, v4-discard precedent):**
UX and TRUST floored D8 on "accepted ghost continuations corrupt saved prose"
citing "slowly opened the That night…" and "about the The harbor…". Those
strings are **capture-harness artifacts**: the re-shoot script appended its
typed trigger sentences (" That night the captain wrote about the", " The
harbor waited for the") directly after pre-existing dangling text; the run logs
show the doubled articles arriving via scripted `keyboard.type`, not via any
ghost accept. The two ghost outputs actually on camera are clean and
voice-anchored (both judges concede this). Per the v4 precedent (UX D8=3.0
bundle-artifact discarded), the artifact-driven 5.0s are discarded; D8 carries
the least-contaminated FUNC 6.0, which independently prices the real gaps
(single surface, single seeded book, partial-word join residual).

## What v5 PROVED (all four fix-lane defects dead on camera)
- **D-129**: wall toast renders the server's exact 429 copy + **Upgrade** →
  `/settings/billing` loads (09b, 18). The silent wall is gone.
- **D-130**: Tab accept joins with a space — "wrote about the ship…"
  (16, DOM-verified; persistence probe survived reload with join intact).
- **D-131**: picker trigger renders "Qwen 3.6 27B (OpenRouter)" for the stored
  sonnet id (19; was blank in 12).
- **D-127**: disclosure line live in menu item, popup, desktop tooltip (13, 17).
- **D5 affordance**: in-flight `···` role=status at the cursor (14).

## New defects (register; next free was D-132)
| ID | Sev | Finding |
|---|---|---|
| **D-132** | **S2** | **No touch path to accept ghost text** — only affordance is "Tab ↹" (ghost) / "F2" (inline label; menu path exists). Phone-first persona likely cannot use the flagship feature at all on a real device. All 3 judges; 2 floored on it. THE new floor + next lift lever. Fix shape: tap-the-overlay to accept (+ visible tap hint), keep Tab for hardware keyboards. |
| **D-133** | S2-cond | Accept-then-close loss window: accepted sentence lost when browser closed ~10 s after accept (inside autosave debounce); typed text from same run saved. No pagehide/beforeunload flush evidenced. Backgrounding-within-seconds is normal phone behavior (FUNC judge rated S1). Fix shape: flush on `pagehide`/`visibilitychange` (sendBeacon). Drove D2 to 5.0. |
| **D-134** | S3 | Wall re-entry re-silences by design: per-message 60 s toast cooldown means 2nd–5th pauses at the wall render nothing — the D-129 silence pattern returns inside the cooldown window. All 3 judges. Fix shape: persistent inline wall banner (or cooldown-exempt the cap message). |
| **D-135** | S4 | BYOK trust-panel copy provider-wrong: "You pay Anthropic directly for token usage" while Sam's only key is OpenRouter (12). Trust-sensitive copy. |
| **D-136** | S4 | Overlay/z-order cluster: cap toast fully covers bottom nav (09b); "N"/Issues pill occludes Home/Books nav in most editor shots; ghost overlay renders as hanging-indent column at cursor x-offset instead of paragraph reflow (06, 15); overflow menu scroll affordance unproven (13); "Limited -- Founder's Price" ASCII hyphen (18). |
| — | n/a | "Dangling-article prose corruption" claim: **NOT a defect** — harness typing artifact (see D8 correction). Chapter content should be cleaned before any future capture round. |

Judge honesty checks concur: bundle "honestly labeled but success-path
curated" — 422 backstop card and wall re-entry are the named missing captures.

## Lift path (crisp, small)
4.5 → next re-judge needs: **D-132 tap-to-accept** (the floor, small UI),
**D-133 pagehide flush** (D2 recovery toward its old 7.0), **D-134 persistent
wall banner**, D-135 copy fix, then a SHORT re-capture: touch-accept on camera
(tap, not Tab), wall re-entry with banner visible, 422 backstop force-render.
D5 beyond 5.0 wants streaming or measured prod latency; D8 beyond 6.0 wants
inline-edit results + a real (non-seeded) manuscript; both are larger levers
than the four above.
