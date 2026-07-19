# W-G judge-prompt snippet — harness bundle consumption (W-F3 §6, T15)

> Team-lead: paste this block into the W-G judge prompt, and add the one-liner in
> §"Protocol integration" below to `GRADING-PROTOCOL.md §4`. (This file is authored
> IN the harness lane; integration into the shared protocol is a team-lead edit — the
> W-F3 executor did not modify GRADING-PROTOCOL.md.)

---

## Scoring a harness evidence bundle

Some evidence for this campaign was captured by the **off-executor evidence
harness** (not by a fix-executor). Each harness bundle is a directory containing
`MANIFEST.json`, `manifest.jsonl`, `raw/`, `checks/`, `scenarios/`, and optionally
`sealed/` and `narrative/`.

**Before scoring, run the one-command verification:**

```
node cowork/bulletproof-qa-2026-07-17/evidence-harness/verify/verify-bundle.mjs <bundle-dir>
```

1. **A bundle that does not print `VERIFIED` is scored as if its claims are FALSE.**
   `TAMPER-SUSPECT` means a byte changed after sealing; `NON-CERTIFIABLE` means the
   run sealed honestly under a limit (`UNDER-N`, dirty tree, or a voided worker
   bracket) — the partial results are real but the coverage/certification claim is
   not, so do not credit the metric as met.
2. **Score from `raw/` and `checks/summary.machine.json` only.** Every number lives
   in `summary.machine.json` with a `{artifact, path|byteRange, method}` source
   pointer you can re-derive. There are no numbers to trust elsewhere.
3. **`narrative/` is context, never evidence.** It is optional, LLM-authored,
   generated after sealing, and lint-checked (unmatched quotes / uncited numbers are
   reported in `checks/quote-lint.json`). Read it last, if at all.
4. **Blind tasks:** for suites with a `sealed/` key (e.g. voice-flattening pairing),
   file your blind A/B verdicts FIRST, then open `sealed/pairing-key.json`. The key's
   hash is pinned in the manifest, so it could not have been changed after you saw
   the pairs.
5. **Missingness is declared, not discovered.** `UNDER-N` and `VOID-WORKER` stamps
   are in the manifest — the standing question "what failure evidence is missing?"
   is answered mechanically. Absence of evidence is recorded as absence.

Harness bundles carry the **pre-registered-N metrics** and **risky-row re-captures**
(data-loss / voice / billing / ownership / injection) that persona journeys were
never allowed to self-certify. Persona journey dirs stay as they are; harness
bundles slot in as a sibling under the campaign evidence tree.

## Protocol integration (team-lead one-liner for GRADING-PROTOCOL.md §4)

> Risky-row metrics (pre-registered-N: misquote, voice, continuity, autosave;
> re-captures: proration/D-45, batch-cap, D-63 graph) are captured by the W-F3
> off-executor harness (`evidence-harness/`), not by fix-executors. Every such
> bundle must print `VERIFIED` under `verify/verify-bundle.mjs` before its numbers
> count; a non-`VERIFIED` bundle scores as false.
