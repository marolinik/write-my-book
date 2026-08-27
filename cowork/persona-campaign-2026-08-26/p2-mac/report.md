# WriteMyBook — Evaluation (P2: Mac Delgado)

**Reviewer:** Mac Delgado, 58, retired engineer, first novel — *"Dead Reckoning Point"* (thriller)
**Date:** 2026-08-26 · full end-to-end session

## 1. Summary

The machine respects an engineer's order of operations. It refused my empty title and my 300-character title with plain, exact Zod errors, parsed my two chapters without mangling the markdown, and the style-watchers quoted back my own tics. But I've spent forty years with regressions, and I log two: the ghost-chapter/exports gap my colleague flagged (SIM-01/02 — verified again here), and a continuity "net" that extracts entities yet never flags anything. My planted Tuesday-that-lasts-three-days passed its gate silently.

## 2. The journey

Provision was a clean one-click, then the onboarding ramp stopped me — first agent attempt 400'd on "No Anthropic API key configured" (SIM-03). I filed my Anthropic key; validated instantly, masked nicely. Onward.

My import probes: empty name → 400 with `name: Too small`, 300-char title → 400. Plain, correct, no apology thesauri. Book created, two chapters parsed: 187 + 183 = 370 words — arithmetic accurate to the word.

I drove read-manuscript & analyze straight at it and got a **correct** 422: "Setup incomplete" with a redirectTo — honest, but the wizard should say the trio-first-order up front; I shouldn't have to hit it. After the trio I ran them again: read-manuscript walked both chapters, analyze gave structure+pacing+market. capture-style (167s) named the "engineering cadence" of my log-keeper. build-architecture asked before inventing (approval gate, 1 click).

Wiki populated 27 entities. Bogus workflow `make-it-bestseller` answered 400 "Unknown workflow" — the right refusal. Exports: docx clean; **PDF degraded silently to .md** (SIM-02 confirmed).

## 3. Agent quality

Ran on real Claude Sonnet BYOK (ox-alpha registry not in this image — deployment note, assessed as such). Style fingerprint precise. Analyst hit pacing correctly. All fine — but the automated **continuity scan extracted the graph cleanly AND STILL FLAGGED NOTHING** (SIM-04) — the net is a database with no detector. The day that's fixed is the day I pay.

## 4. Bugs & findings (candidate'ese: severity as graded by me)

- SIM-01 (HIGH) — ghost-written chapters lack Chapter rows (re-confirmed in export chapterCount:2)
- SIM-02 (HIGH) — PDF silently becomes markdown
- SIM-03 (MED) — key-free ramp ends at first agent call
- SIM-04 (LOW) — continuity scan flags always empty
- SIM-05 (LOW) — dismiss gives no learning feedback
- SIM-06 (env) — host clock skew breaking auth (ops, not product)

## 5. Grades

| Dimension | Grade |
|---|---|
| Usability (error plainness) | A− |
| Design (IA/copy/feedback) | B |
| Agent quality | B+ |
| Feature completeness | C+ |
| Reliability (plumbing) | C |
| **Overall** | **B−** |

## 6. What would make me pay

1. A continuity net that actually triggers on contradiction (agent-level exists; the automated flags need to fire)
2. PDF = PDF (fix the TMPDIR/pandoc fallthrough)
3. One honest "your real spend" number, not provider-rate estimates
