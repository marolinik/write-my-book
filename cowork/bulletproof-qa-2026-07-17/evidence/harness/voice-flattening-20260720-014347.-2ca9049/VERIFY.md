# VERIFY — voice-flattening-20260720-014347.-2ca9049

Run ONE command (no repo knowledge needed):

    node cowork/bulletproof-qa-2026-07-17/evidence-harness/verify/verify-bundle.mjs "D:\Projects\wmb-pub\cowork\bulletproof-qa-2026-07-17\evidence\harness\voice-flattening-20260720-014347.-2ca9049"

- **VERIFIED** — chain intact, every raw byte matches the manifest, every recorded
  number reproduces from raw, brackets consistent, narrative lints clean.
- **TAMPER-SUSPECT (seq=N)** — a raw byte, a manifest line, or a summary number was
  changed after sealing. Score the bundle as if its claims are FALSE.
- **NON-CERTIFIABLE** — sealed honestly under a limit (UNDER-N, dirty tree, or a
  voided worker bracket). The partial results are real; the coverage claim is not.

Read order: `raw/` first, `checks/summary.machine.json` second, `narrative/` last
(context only, never evidence).
