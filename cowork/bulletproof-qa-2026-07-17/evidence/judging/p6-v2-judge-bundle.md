# P6 "Owen" re-judge v2 — blind judge bundle (2026-07-26)

You are re-judging persona **P6 "Owen"** (voice-moat power writer, BYOK opus) of the wmb-pub bulletproof-QA campaign, after a UI evidence wave on the already-fixed build.

## Baseline (prior verdict)
- `evidence/judging/HELD-REJUDGE-AGGREGATE.md` — P6 section: **6.0**, floor **D4** (onboarding/setup), dims D1 7.0 / D2 7.0 / D3 6.5 / D4 6.0 / D5 6.5 / D7 6.5 / D8 7.5 / D10 8.0 / D11 7.5.
- D4 floor driver then: setup-wizard completion never proven in UI (D-35 family). Fix commits to spot-check with git show: 48169ec (setupComplete/setupImportSkipped accepted by updateSettingsSchema) and dc912fa (strict settings writes + registry-based usage rollup, D-35/D-39/D-44). D7 drag D-43 (editor-model override silently inert) was later fixed in the fix wave — verify via git log --oneline --grep=D-43.

## New evidence (this wave)
- `evidence/p6-owen-rejudge/UI-CAPTURE-2026-07-26.md` — READ FULLY. 41-series screenshots in the same directory; view the PNGs yourself with the Read tool (they are ground truth).
- Key claims to verify against pixels: setup wizard entered on a real book with setupComplete reset via the D-35 PATCH (41a), walked to Done via Skip (41b), "Start Writing!" click navigates AND setupComplete=true re-read from the API afterwards (41e + doc log), post-setup overview clean (41c), BYOK Usage-by-Agent panel showing real spend (Coach $10.63 opus / qwen $0.43) (41d).
- Bonus honesty evidence: live Indie-plan 2-book 403 wall hit when creating a scratch book (disclosed in doc, kept as evidence).

## Disclosed caveats (do not treat as hidden)
- Identity via e2e test headers (x-e2e-test-secret + x-e2e-clerk-id), not a Clerk login; wizard walked with Skip (import path not exercised).
- The Keeper's Arithmetic ch5 + FINGERPRINT doc are a pre-registered byte-identical probe and were deliberately untouched; capture used the "VM1 Test" scratch book.
- setupComplete was reset to false via the same PATCH route under test, then proven to persist true after the wizard — circularity is limited because the re-read is a separate GET.
- Prior still-open P6 drags D-49 (rationale quotes phrase absent from fingerprint) and D-42 were NOT re-probed this wave.

## Your job
Score every baseline dim 1-10 (0.5 steps) for the persona experience AS EVIDENCED NOW (code truth + on-camera truth; absent evidence caps a dim; disclosed warts are honest but still warts). Overall = floor-bound (MIN across dims governs). Name the floor dim + driver, list any new defects you see in the pixels that the capture doc missed, and state what single next action would most raise the floor.
