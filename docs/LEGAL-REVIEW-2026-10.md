# Legal review pack: Privacy Policy and Terms of Service (2026-10-12)

Pages: `src/app/(public)/privacy/page.tsx` and `src/app/(public)/terms/page.tsx`. Both are drafts written against the code at HEAD 7942685. A lawyer still has to review them. Every data-flow claim below is listed with the code it rests on. If the code changes, the page has to change with it.

## 1. Placeholders to fill (visible on the public pages)

| # | Placeholder | Page / section | Who |
|---|---|---|---|
| P1 | `[Company legal name, registered address and company number]` | Privacy §1, Terms §1 | Owner |
| P2 | `[Data protection officer or EU representative, if required]` | Privacy §1 | Lawyer. A Serbian company targeting EU users likely needs an Art. 27 GDPR EU representative. |
| P3 | `[Hosting provider]` and its location | Privacy §5 table | Owner |
| P4 | Stripe location `[Ireland / United States]` | Privacy §5 | Owner (depends on the Stripe account entity) |
| P5 | Sentry location (account region US or EU) | Privacy §5 | Owner. Check the DSN: `ingest.de.sentry.io` means EU. |
| P6 | `[Transfer mechanism for each provider]` (DPF / SCCs) | Privacy §7 | Lawyer. Serbia needs ZZPL Art. 64-65 grounds, e.g. the Poverenik's standard clauses. |
| P7 | `[Billing records retention period]` | Privacy §8 | Accountant/lawyer (Serbian accounting law) |
| P8 | `[Sentry error report retention]` | Privacy §8 | Owner (Sentry plan setting) |
| P9 | `[Disk encryption at the host]` | Privacy §9 | Owner |
| P10 | `[Whether prices include VAT or other taxes]` | Terms §5 | Accountant. Stripe checkout has no `automatic_tax` (`src/app/api/billing/checkout/route.ts:163-170`). |
| P11 | `[Refund policy]` | Terms §5 | Owner + lawyer. The EU 14-day withdrawal right for digital services needs the user's express consent to immediate performance. Checkout does not collect that consent today. |
| P12 | `[Governing law]`, `[Competent courts]` | Terms §15 | Lawyer |

## 2. Assumptions the owner or lawyer must confirm

1. **Free trial.** The brief said "no free trial", but the code still has one: Indie and Professional get `trialDays: 14` (`src/lib/billing/stripe-client.ts:30,48`). Checkout applies it once per account with `missing_payment_method: "cancel"` (`src/app/api/billing/checkout/route.ts:172-192`). Terms §5 uses conditional wording ("If a plan is offered with a trial…") that stays true either way. If the trial is being removed, set `trialDays: 0` in code.
2. **Founder "Locked-in $19/mo forever".** The code has the feature string at `stripe-client.ts:21` and `maxSlots: 200` at `:12`. Terms §5 narrows "forever" to "for as long as that subscription remains active without interruption". Confirm the landing page can carry that limit.
3. **Minimum age 18.** This was carried over from the old terms. No age gate exists in code. Decide 18 or 16, and whether sign-up should ask.
4. **Account deletion route.** No in-app delete button exists. Deletion runs through Clerk's `UserButton` > Manage account (`src/components/layout/app-header.tsx:26-27,162`). Confirm "Allow users to delete their accounts" is ON in the Clerk dashboard. If it is off, Privacy §10 must say "email us".
5. **Prod deploy topology.** The policy assumes:
   - an HTTPS reverse proxy in front (DEPLOYMENT.md §SSL/HTTPS, `docker-compose.prod.yml:5-6`);
   - DB ports bound to 127.0.0.1 (`docker-compose.yml:10,23,38,68,85`).

   Confirm both on the real host.
6. **OpenAI API "not used for training by default"** (Privacy §4). That is OpenAI's published API policy, not something our code enforces. The lawyer should decide whether to cite it.
7. **"We answer within 30 days"** (Privacy §10). That is a legal deadline the owner must be able to meet.
8. **"Tell you in the app" for policy/terms changes** (Privacy §14, Terms §16). There is no product email provider in code; only Clerk sends auth emails. If email notice is required, an email channel is needed.
9. **Publisher plan.** It is purchasable in code (`PURCHASABLE_PLANS`), but the landing shows "Contact Us". Terms list it with prices `stripe-client.ts:64-66`. Decide.
10. **Sentry session replay.** Privacy §5 says replays are not recorded. `sentry.client.config.ts:21-23` sets `replaysSessionSampleRate: 0.1` / `replaysOnErrorSampleRate: 1.0`, but no `replayIntegration()` is registered anywhere, so replay is inert. If anyone adds `replayIntegration`, the policy must change first. Recommendation: remove the two sample-rate lines so nobody assumes replay is on.

## 3. Data-flow claims and their evidence

| Claim (page §) | Evidence |
|---|---|
| Account data from Clerk: email, name, Clerk id (P §2) | `src/app/api/auth/webhook/route.ts:134-150` (user.created/updated), `prisma/schema.prisma` model User |
| AI keys and custom-endpoint keys encrypted with AES-256-GCM (P §9, T §6) | `src/lib/encryption.ts:3,11,14-18`; custom providers `src/app/api/settings/custom-providers/route.ts:152`; schema `CustomProvider.apiKey` |
| Keys are removable (T §6) | `src/app/api/settings/api-keys/[id]/route.ts:73` (DELETE) |
| BYOK routing: Anthropic direct; OpenRouter; OpenAI/Gemini/Grok via the self-run LiteLLM translation proxy, else OpenRouter (P §3) | `src/lib/llm/client-factory.ts:177-276`; `LITELLM_BASE_URL` `:29` |
| Custom endpoints receive text (P §3) | `src/app/api/settings/custom-providers/route.ts:34` (user-supplied `baseURL`) |
| Default model is DeepSeek V4.1 Flash on OpenRouter (P §3) | `src/lib/llm/defaults.ts:25` (`openrouter-deepseek-flash/sonnet`), override `WMB_DEFAULT_MODEL` `:46-50` |
| No OpenRouter routing restriction set by us (P §3, §4) | No `provider`, `data_collection` or `zdr` field anywhere in `src/lib` (grep, 2026-10-12) |
| Platform-funded allowance: Free only, $0.50/day, $3/month, off unless env-enabled (P §3, T §6) | `src/lib/billing/managed-tier.ts:39,41,62-68,92-102`; used by `src/app/api/books/[id]/agent/route.ts:10,321` |
| Self-hosted fleet stays on our servers (P §3) | `src/lib/llm/client-factory.ts:37,278-287` (`local-llm-proxy`). Not in prod compose; "where we offer" wording. |
| Memory: passages go to OpenAI embeddings on the platform key, and text plus vectors are stored in Qdrant (P §3, §5) | `src/lib/vector/embeddings.ts:22-24,33,93-94`; payload `text: chunk.text` `src/lib/vector/indexer.ts:102-126` |
| Story graph of entities in Neo4j (P §3) | `src/lib/graph/graph-builder.ts:24-50` (`upsertEntities`), called from `src/lib/agents/tools.ts:13`; service `docker-compose.yml:64` |
| Web research: Perplexity, Serper, DuckDuckGo, Firecrawl (P §3, §5) | `src/lib/agents/tools.ts:2570-2582` (Perplexity), `:2629-2632` (Serper), `:2667` (DuckDuckGo), `:2742-2746` (Firecrawl) |
| Stripe for payments; billing portal for cancellation (P §2, T §5) | `src/lib/billing/stripe-client.ts`, `src/app/api/billing/portal/route.ts:28` |
| Cancel means paid until period end, then Free (T §5) | `cancel_at_period_end` mirrored at `src/app/api/billing/webhook/route.ts:442,456,520`; `isFreeTier` treats `canceled` as Free `src/lib/billing/free-tier.ts` (isFreeTier) |
| Free plan limits (T §4) | `src/lib/billing/free-tier.ts` `FREE_TIER` (maxBooks 1, monthlyAgentSessions 20, dailyGhostText 100, dailyInlineEdit 50, dailyPolishScene 5, maxAiEligibleWords 40,000, maxConcurrentSessions 1) |
| Paid plan prices and limits (T §5) | `src/lib/billing/stripe-client.ts:7-90` |
| Export always allowed; formats EPUB/PDF/DOCX (P §10, T §8) | `src/lib/billing/plan-gating.ts:33,45`; `src/lib/validation.ts:531` |
| Book deletion purges DB, S3 and Qdrant but not Neo4j (P §8) | `src/app/api/books/[id]/route.ts:117,124-132`; `clearBookGraph` exists (`src/lib/graph/schema.ts:54`) but nothing calls it |
| Account deletion cascades DB rows only (P §8) | `src/app/api/auth/webhook/route.ts:171-180` (`db.user.deleteMany`); `Book.user onDelete: Cascade`. No S3, Qdrant or Neo4j purge. |
| Backups 24 hourly / 7 daily / 4 weekly (P §8) | `scripts/backup-rotate.sh:2-34`; sidecar `docker-compose.prod.yml:59` |
| Share links: expiry and revoke; IP rate limit (P §2, §13, T §9) | `src/app/api/share/route.ts:36-51`; `src/app/api/share/[token]/route.ts:11,54` |
| Sentry: errors and traces (100%), API keys redacted, no user identity set, no replay integration (P §5) | `sentry.client.config.ts:19-24`, `sentry.server.config.ts`, `src/instrumentation.ts`; no `Sentry.setUser`, no `replayIntegration` (grep) |
| No analytics, ads or marketing email providers (P §5, §6) | grep for posthog/plausible/gtag/mixpanel/@vercel/analytics/resend/sendgrid/postmark/nodemailer: none |
| Cookies: `wmb_onboarded` 1y, `sidebar_state` 7d, Clerk session (P §11) | `src/lib/onboarding-cookie.ts:9,24`; `src/components/ui/sidebar.tsx:28-29,86` |
| Local storage incl. offline draft copies (P §11) | `src/lib/offline/draft-store.ts` (IndexedDB), `src/lib/offline/last-chance-mirror.ts:98`, `src/stores/agent-ui-store.ts` |
| Manuscripts not encrypted by the app (P §9) | `src/lib/storage/s3-adapter.ts` sets no SSE; Postgres/Qdrant store plain text |

## 4. Risky flows. Fix them or accept them knowingly before launch

1. **Free writers' manuscripts via OpenRouter to DeepSeek on the owner's key, with no training or retention guard.** No `provider: { data_collection: "deny" }` / ZDR preference is sent. Which host serves the request is OpenRouter's choice, and that host can be DeepSeek itself (PRC). Privacy §4 says this openly.

   Fix options:
   - add `provider: { data_collection: "deny" }` (and optionally `zdr: true`) to OpenRouter requests on platform-key routes;
   - turn off "allow training providers" in the owner's OpenRouter account privacy settings, then update §4.
2. **Every writer's text goes to OpenAI on the platform key for embeddings**, including writers who chose a self-hosted model or another provider. The policy discloses this. Consider a per-book opt-out, or a self-hosted embedding model.
3. **Deletion gaps** (a GDPR erasure risk):
   - Account deletion leaves S3 files, Qdrant chunks and Neo4j nodes behind.
   - Book deletion leaves Neo4j nodes.

   The policy currently works around this with "delete your books first, or email us". Fix in code: call `clearBookGraph` in book DELETE, and purge storage, vectors and graph per book in the `user.deleted` webhook.
4. **Web research queries go to Perplexity, Serper and Firecrawl on platform keys.** They can carry book topics. This is low risk, and it is disclosed.
5. **The LiteLLM proxy is not in either compose file.** Direct OpenAI, Gemini and Grok keys only work where `LITELLM_BASE_URL` points to a running proxy. This is not a privacy issue, but the policy's "translation service we run" claim assumes that proxy exists in production.
