# D-136 adjudication — "Issues pill" is the Next.js dev-tools indicator, not product UI

**Date:** 2026-07-26 · **Verdict: HARNESS/ENVIRONMENT ARTIFACT — not a product defect. D-136 reclassified.**

## What was registered

D-136: red "N Issues ×" pill bottom-left in every phone shot (v6 shots 20–27, v7
shot 28), occluding the Home/Books tabs of the bottom nav. Judges deducted
presentational points for it across rounds; it was carried as a product z-order
defect in the D-136 family.

## Evidence it is not product UI

1. **Source sweep:** no component in `src/` renders an "Issues" pill — greps for
   `Issues` across `src/components`, `src/app` (case-insensitive, label and
   template forms) hit only comments, `story-radar.tsx` card copy, and Prisma
   generated code. The findings UI uses `findings-sheet.tsx` (bottom sheet), not
   a floating pill.
2. **Live DOM probe** (headless, editor route, phone context, session scratchpad
   `probe-pill.js`): `document.querySelector("nextjs-portal")` → **present**
   (shadow root carrying the Next dev-tools overlay styles); product-DOM query
   for leaf nodes containing "Issues" → **zero hits**. The pill lives inside the
   `nextjs-portal` shadow DOM.
3. **Anatomy match:** dark pill, Next.js "N" logo roundel, live error count,
   dismiss × — the Next 15 dev-tools error indicator. The counted "issues" this
   session were real console errors the DEV overlay aggregates (hydration-
   mismatch warning + Clerk-js load failure from the fake `clerk.example.test`
   publishable key — the latter itself a harness condition, see v6 §harness
   artifacts).

## Consequences

- **Prod is clean:** the indicator does not exist in production builds. Every
  presentational deduction attributed to the pill's occlusion of the bottom nav
  was charged to dev-server chrome the writer never sees.
- **Capture protocol (from v8 on):** hide it at the harness, not in the product —
  `await page.addStyleTag({ content: "nextjs-portal{display:none!important}" })`
  after load in capture scripts. No `next.config` change (product untouched).
- **Judge bundles:** this adjudication ships with the next bundle so the pill in
  historical shots (20–28) is read as disclosed harness chrome.

## Residue worth keeping

- The dev counter was fed by a **real hydration mismatch** on the editor route
  ("A tree hydrated but some attributes of the server rendered HTML didn't
  match…"). That console error is a genuine (likely benign-attribute) finding —
  registered as **D-141 (S4)**: hydration mismatch warning on the editor route;
  cause unattributed (theme/Clerk-bypass attribute class suspected); no writer-
  visible symptom observed. Next free: **D-142**.
- D-139 (bottom-anchored toasts under nav/keyboard) is UNAFFECTED by this
  adjudication — that occlusion involves the product's own bottom tab nav and
  remains a real defect (fix lane `wf_d705f1b5-b7a` in flight).
