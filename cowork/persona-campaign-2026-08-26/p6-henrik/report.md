# WriteMyBook — Evaluation (P6: Henrik Bauer)

**Reviewer:** Henrik Bauer, 45, publisher/editor — *"The Cartographer's Widow"*
**Date:** 2026-08-26 · editorial stack verdict

## 1. Summary

I grade editorial stacks professionally and this is the first one I'd hand to a client. Beta panel actually gates; line-edit and dev-edit are genuinely different lenses; publishing-check handed me the front-matter checklist a week before launch needs; marketing logline/blurb were in-voice. Two data-integrity wobbles keep this off A: SIM-01 (my colleague's ghost-chapter row gap) plus my own post-revise anomaly — 690 words became 4,008 words with revisionCount staying 0, which looks inflationary.

## 2. Editorial stack verdict

**Beta-read (299s):** panel verdict gate PASSED and the chapter status advanced to beta_passed — the pipeline discriminates (it can fail). The tail advice (naming the protegée early) was real critique.
**Line-edit (94s):** quick and specific.
**Dev-edit (283s):** 5 findings; the summary endpoint confirms 14 total findings across sessions (3 critical/3 important/8 suggestion) — a parse artifact in the run reported '0'; I verified against the summary endpoint. Noted and dismissed.
**Revise:** post-state words=4008 revisionCount=0. If revise inflates word count by re-writing the chapter without touching revisionCount, the ledger lies. Report at HIGH.

**Publishing-check:** actual front/back matter guidance — real value.
**Marketing kit:** logline + blurb in correct voice.

## 3. Cost transparency

Usage endpoint priced the month across 13 sessions at $3.89 by agent/model with key attribution. Read that line as: trustworthy enough to bill a publisher. The cost-estimate endpoint wanted ?workflowId (driver nuisance).

## 4. Bugs & findings

- NEW (HIGH): revise ballooning word-count with frozen revisionCount
- SIM-01..06 acknowledged; SM-01 especially resonates (publish-ready exports depend on it)
- SIM-04: the automated scan-flag detector never fired — even editorial-grade continuity needs the detector

## 5. Grades

| Dimension | Grade |
|---|---|
| Editorial depth | A− |
| Usability | B+ |
| Design (IA/copy) | B |
| Feature completeness | B− |
| Reliability | B− |
| **Overall** | **B+** |

## 6. Pay-for items

1. Fix revise word-count inflation
2. Inherit fixed (saw Priya's) + ghost-chapter row creation (SIM-01)
3. Detector that fires on contradiction
