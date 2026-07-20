# D-95 (S2) — false privacy claim on onboarding screen 1

**Surfaced by:** P5 rejudge blind panel (trust + experience lenses, independent), 2026-07-20.

## Defect
`src/components/onboarding/onboarding-wizard.tsx` (privacy bullet) stated:
> **Your Data Stays Private** — Your manuscript goes directly to the AI provider. **WMB never stores or processes your content on our servers.**

This is **false**. The product persists manuscript content server-side and processes it:
- chapter prose stored with `documentId` + `version` (autosave + byte-identical read-back proven in `p5-sam-rejudge/api-traces/03c`/`03d`);
- books carry an `s3Prefix` (object storage — `02-create-book-freetier.json`);
- continuity extraction + embeddings run server-side.

It also **contradicts the company's own published copy**: `src/app/(public)/terms/page.tsx:108` ("store, process, and transmit your content solely for the purpose…"), `faq-accordion.tsx:29` ("manuscripts are stored with encryption at rest"), `privacy/page.tsx` ("Your content is sent to these providers…"). A fabricated privacy guarantee shown to every new user = S2 honesty defect (and a legal-exposure risk).

## Fix (LANDED, pending Fable verify + commit)
Copy corrected to match the truthful published ToS/FAQ:
> **Your Writing Stays Yours** — Your manuscript is stored encrypted at rest and sent only to the AI provider you connect. We never use your content to train AI models, and your API keys are encrypted — we never see them in plaintext.

Single-file copy change, no logic. Every clause is independently supported: encryption-at-rest (faq:29), BYOK provider send (privacy page), no-training (terms:211 / faq:29), key encryption AES-256-GCM (ui-strings.ts:462). Verify scope: confirm the new copy is accurate vs actual data handling AND consistent with terms/privacy/faq.
