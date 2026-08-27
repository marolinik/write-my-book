# WriteMyBook — Evaluation (P3: Priya Sharma)

**Reviewer:** Priya Sharma, 29, romantasy indie author — *"Emberfall Dynasty"*
**Date:** 2026-08-26 · series stack end-to-end

## 1. Summary

I came to grade the series tooling and left having graded the billing path too: the Free-plan series gate was honest ("requires Professional — upgradeToTier"), and I **actually upgraded through a hosted Stripe checkout** and got in. Most of the series surface delivered: setup trio, character chat that's genuinely in-voice, an agent-run that CAUGHT MY PLANTED NAME DRIFT. One nagging wound: inherit answered 200 while it applied exactly nothing.

## 2. The journey

Series create → book 1 in series → import → style/bible/architecture (approval gate) all fine. Then the upgrade detour: Free refused series with a precise upgrade hint (good monetization copy!), I paid Pro monthly through the hosted page, webhooks synced the local row (plan=professional/active), and the whole loop re-ran green. That gate-to-paid loop is proof billing works, graded A here.

Then: **Series continuity check ran 187s and flagged "resolve name spelling (recommend 'Kaelen')"** — my planted drift caught properly with a recommended fix, not a bare alarm.

Character chat: asked the shadow "what's your name?" and got an in-voice deflection ("Not a name. A *purpose*.") — I squealed.

Batch: started [line-edit, beta-read] on ch1-2 → running → I cancelled → state flipped honestly to "cancelled". Good lifecycle discipline.

Series analytics & usage: clean (~$0.90 booked estimate).

## 3. The wound

**Inherit a1 → b2 returned `{"applied":[],"skipped":["Story Bible","Architecture","Fingerprint"]}`** on an EMPTY second book. Either inherit silently decides "never copy setup docs" (undocumented), or the copy path is dead while returning success. Both understandably 200 → dangerously silent. Flag HIGH.

## 4. Bugs & findings

- NEW (HIGH): inherit silently applies nothing on empty targets
- SIM-01..06 acknowledge owed here; my session mostly steered around them
- SIM-04 nuance from my seat: automated scan-flag emptiness vs agent-level continuity correctness (mine caught drift) — the net needs BOTH

## 5. Grades

| Dimension | Grade |
|---|---|
| Usability | B+ |
| Design (IA/copy) | B+ |
| Series tooling depth | B− (inherit wound) |
| Agent quality | A− |
| Reliability | B |
| **Overall** | **B+** |

## 6. Pay-for items

1. Inherit that actually moves setup documents (or honestly denies/justifies)
2. The scan-flag detector fixed so series continuity runs unattended too
3. Real-spend transparency per session/book
