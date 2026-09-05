# Production Readiness Sign-Off — WriteMyBook

**Date:** 2026-09-04
**Assessment against:** marolinik/write-my-book @ `e1c6a54` + the launch-blocking fixes in commit `59dd05f`
**Author dispatch:** response to the production review (2026-09-03) that returned the launch gate to red.

This sign-off maps each finding from the reviewer's launch review to its resolution, the evidence, and whatever residual risk genuinely remains. It concludes with an explicit **go / no-go** for a paid public launch *today*, and the exact remaining steps before that gate lifts.

---

## 1. Findings → resolution matrix

| Priority | Finding | Resolution (commit `59dd05f`) | Verified | Status |
|---|---|---|---|---|
| Critical | Exports can include server-readable files (converter without resource isolation) | Pandoc runs under `--sandbox` for DOCX/PDF/EPUB; `sanitizeManuscriptForConverter` strips unsafe images (`/abs`, `../`, `http(s):`, `data:`, `file://`), raw-HTML `<img>/<iframe>/<object>/<embed>`, `\include{/}\input{}` and template braces; cover image bundled into the conversion temp dir so no server path reaches the converter | 16 new unit tests (`export-sandbox-sanitize.test.ts`); `export-*` suite 64 tests green; tsc clean | **Resolved** |
| High | Undo can alter the wrong passage | Apply records the exact applied location (`locationStart/locationEnd`) + the document version it created; Undo reverses the **exact recorded spot** (version-gated) and only falls back to `indexOf` when `newText` occurs exactly once — never guesses among multiple occurrences; ambiguous/stale reversals reject with a `note` instead of clobbering | 8 new tests (`finding-apply-undo.test.ts`) proving (a) exact-location reversal ignoring an earlier identical `newText`, (b) 409 version_conflict on stale apply/undo, (c) no-guess pre-fix fallback; existing `finding-apply-guard` re-greened | **Resolved** |
| High | Concurrent writing not consistently protected (editorial/AI writes omit version check) | `apply`-finding now passes `expectedVersion` (CAS rejects → 409, no silent clobber); audited every other CHAPTER_CONTENT writer: agent write tool (single-session, trusted source), find/replace (atomic per-chapter RMW), discuss (rows only, no chapter write), ghost-text/inline-edit (don't write chapter content) — each understood and documented, none is the "stale tab" hazard | `finding-apply-undo.test.ts` + comment-audits in 4 files; full suite green | **Resolved** |
| High | Two offline tabs overwrite one saved draft | `putDraft` cross-tab non-clobber guard: a less-synced tab (`baseVersion` lower) can no longer overwrite a **different** tab's newer offline draft — it is refused and the foreign draft preserved | New `draft-store-put-guard.test.ts` (4 tests) over a mocked IDB | **Resolved** (logic); see §3 residual for interface |
| High | Billing can duplicate subscriptions (two pending sessions → two subs) | Checkout now serializes session creation via a Postgres advisory lock and **reuses a still-open pending Checkout session** (new `Subscription.pendingCheckoutSessionId`, cleared on `checkout.session.completed`); plan/interval change still opens a fresh correct session | 3 new checkout tests (reuse same-open, different-plan fresh, stale-id recovery); schema changed + applied to live dev DB | **Resolved** |
| High | A delayed payment event resurrects a canceled sub | `invoice.paid` and `customer.subscription.updated` now **reconcile against Stripe's current subscription state**: a canceled sub can only become active if Stripe still reports it live; Stripe-unreachable ⇒ stay put (never resurrect) | 4 new webhook tests (canceled-`invoice.paid` stays canceled, active-`invoice.paid` activates, stale `updated` not resurrected, confirmed reactivation) | **Resolved** |
| High | Release checks give incomplete assurance (e2e runs zero jobs; smoke skipped) | **e2e.yml**: removed the case-insensitive duplicate env key (`NO_PROXY`+`no_proxy` collided in GitHub Actions env normalization → the whole workflow failed with zero jobs at parse time). **deploy-smoke target wiring**: `smoke-deployment.ts` now honors `PLAYWRIGHT_BASE_URL` (previously it only read `SMOKE_BASE_URL`/`NEXT_PUBLIC_APP_URL` and silently fell back to `localhost:3000` on the runner, so even a configured target could never be smoked) | e2e.yml YAML re-validates clean with a single `NO_PROXY`; smoke script reads the workflow's var | **Resolved (mechanics)** — see §3 residual for the browser-in-CI + deployed-target operational gate |
| High | Backups can falsely report success / go to same MinIO | `db-backup` now dumps to a temp file first with explicit empty-cred, `pg_dump` exit-code, and `>=1000`-byte guards — a failed/partial dump is never uploaded and logs a searchable `BACKUP FAILED:`; new `db-backup-watchdog` container alerts on stale backups; `verify-backup-restore.sh` proves a paired restore into throwaway Postgres; docs lay out the required off-Host sync + MinIO versioning/lifecycle + scoped-key hardening checklist | Compose `config --quiet` exit 0; `sh -n`/`bash -n` clean on both loop bodies + verify script + retention; YAML parses | **Resolved (code)** — off-Host replication itself is an operator action (§3) |

---

## 2. What is actually verified right now

- **Full unit suite:** **218 test files / 1783 tests pass** (`npx vitest run`), up from the pre-fix 215/1748.
- **TypeScript:** `npx tsc --noEmit` clean across the whole project.
- **Billing schema migration applied:** `pendingCheckoutSessionId` added to the live dev Postgres (`subscriptions`), Prisma client regenerated; checkout/webhook unit tests green against it.
- **Request/API-level E2E (previously witnessed):** 68 passed / 1 skipped in the documented local run against the compose app; the bulk of the page-level suite now lacks a runnable browser in this environment (below).
- **CI workflow mechanics restored:** the e2e workflow was genuinely the root cause of the "zero jobs" failure (case-colliding env keys), now corrected.

---

## 3. Residual risk — what is NOT yet proven (be honest)

These are the gates that were impossible to fully close in this session and must be closed operationally before or at launch:

1. **Browser E2E in CI / on this dev box is machine-blocked.** Chromium, Chrome, Edge and Firefox all return `net::ERR_NAME_NOT_RESOLVED` for *any* `http://` navigation (even `127.0.0.1:3000`) on this workstation — while Node/curl work — a machine-wide browser-network block documented in `docs/HARDENING-2026-09-02.md`. GitHub's ubuntu runners showed the same browser-DNS symptom in the pre-fix e2e run (43/127 page-navigation failures). **The offline multi-tab draft fix in particular is verified at the unit level only** (mocked IndexedDB); its end-to-end behavior must be witnessed in a browser via the `offline-autosave`, `w4-data-safety-drills`, and `x1-two-tab-conflict` spec files in an environment where browser networking works.
2. **Deploy-smoke against a real deployed release.** The workflow now *runs* correctly, but it is still dormant until an operator sets the `PLAYWRIGHT_BASE_URL` repository *variable* to the deployed HTTPS URL (per the workflow's guard). A green deploy-smoke against the actual production instance is a **required** gate and has not happened.
3. **Off-host backup replication remains an operator action.** The code now fails loudly and proves restore, but the actual off-site `mc mirror`/versioning/lifecycle/scoped-key steps must be performed and confirmed by ops (checklist in `docs/database-deploy-backup.md`).
4. **Real auth + payment lifecycle + worker integration.** Clerk, Stripe and the background worker must be exercised against production credentials in the full journey (signup → import → write → AI review → apply → undo → export, with an interruption and a backup restore), per the reviewer's required "one demonstrated production journey."

---

## 4. Decision

### **Conditional GO** to proceed with a **small, supervised paid beta** — **not** a broad public launch — **only if** the following three operator/verification steps are closed first (roughly 2–4 days, parallelizable):

1. **Deploy the `59dd05f` code and witness the browser E2E suite green in an unblocked environment** (CI with working browser networking), at minimum the offline/x1/w4 page-level specs plus the existing request-level suite.
2. **Wire the deploy-smoke target** (repo variable `PLAYWRIGHT_BASE_URL` → deployed URL) and require a green deploy-smoke run.
3. **Run the full production journey** with real Clerk/Stripe/worker, including an interruption-recovery and a proof restore (the new `verify-backup-restore.sh`).

**These are the only remaining blockers.** All five code-level launch blockers from the review — export sandboxing, accurate/version-gated undo, concurrent-write enforcement, checkout dedup + webhook reconciliation, backup failure/alert/restore-proof — are implemented, unit-tested (1783 green), type-checked, and committed. The residual items are **verification/operational**, not code defects.

### Why no unconditional public GO today
The reviewer's core requirement — *"require successful checks against the deployed release"* — is still unmet because there is **no configured deployed target** and the browser suite can't be witnessed in this environment. Shipping a broad paid public launch without a green browser E2E against the actual deployment and an exercised payment/worker journey would repeat the exact "green but unverified" mistake this review flagged.

### Recheck
A focused recheck after the three operator gates close — re-running the reviewer's attack scenarios (Pandoc file-include, delayed-invoice resurrection, two-tab concurrency) against the deployed instance — should be sufficient to lift the remaining conditions.

---

*Prepared from code inspection, the full unit suite (1783 green), TypeScript verification, a live dev-DB schema migration, and targeted new tests (export sandbox/sanitize 16, finding apply/undo 8, billing checkout dedup 3 + webhook reconcile 4, offline draft guard 4).*