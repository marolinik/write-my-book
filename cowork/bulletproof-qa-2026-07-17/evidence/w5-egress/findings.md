# W5 Egress Audit — Static-Half Findings

> Transcribed by team-lead from p2-gerald's report (2026-07-18 ~10:05); Gerald's harness
> blocked direct Write of this file. Content verbatim-faithful to his message; C2b results
> live separately in `evidence/c2-restore-drill/runbook.md` §6 + `_results.json`.

## LLM inference routing — PASS (core claim confirmed in code)

`client-factory.ts` `resolveProviderRoute`: exactly 3 possible baseURLs —
`api.anthropic.com`, `openrouter.ai/api`, or `LITELLM_BASE_URL` (local proxy, default
`localhost:30400`, used only for direct OpenAI/Gemini/Grok keys via `x-provider-key` /
`x-target-provider` headers, never in body).

**Scope boundary (not a defect):** direct OpenAI/Gemini/Grok keys pass through the local
LiteLLM proxy before reaching upstream; LiteLLM's own outbound config lives outside this
repo and was not (cannot be, from here) audited in this pass.

## Extra outbound endpoints — 2 found, both benign

- `google.serper.dev` and `html.duckduckgo.com` (agent web-search tool,
  `tools.ts` `executeWebSearch`). Receive only the LLM-formulated search query string —
  never manuscript prose, never a user's LLM key (Serper uses our own `SERPER_API_KEY`
  service key). Outside the named-3 list, documented here; not a defect.

## Telemetry/analytics — PASS

Grep for posthog/segment/mixpanel/GA/amplitude/etc: all 37 hits false positives (Prisma
codegen boilerplate + a UI feature literally labeled "Analytics"). No third-party tracking
SDK wired in.

## API key storage — PASS (verified live)

`docker exec psql` against `api_keys`: `encrypted_key` values are genuine
`iv:tag:ciphertext` hex triples (212 chars, AES-256-GCM per `encryption.ts`); no plaintext
key prefixes visible.

## Sentry key scrubbing — PASS

All 3 configs (server/client/edge) redact key-shaped strings (`sk-ant-`, `sk-or-`,
`sk-proj-`, `sk-`, `xai-`, `AIza`) plus (server only) field-name-based redaction for
apikey/encryptedkey/x-provider-key/authorization etc.

## ⚠ Sentry Session Replay — FLAGGED (highest-attention item)

Client config sets `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0` —
DOM/UI recording is live for 10% of sessions and 100% of error sessions, shipping to
Sentry's ingest servers (an outbound destination outside the named 3). No explicit
`Sentry.replayIntegration({maskAllText, blockAllMedia})` override exists anywhere in the
repo (grep: zero matches). `@sentry/nextjs` v10.38.0 documented behavior: sample-rate
options alone auto-enable Replay with safe defaults (`maskAllText: true`,
`blockAllMedia: true`) — so manuscript text typed in the editor *should* be masked by
default. BUT this was confirmed only against Sentry's documented SDK behavior, not by
triggering a replay and inspecting the captured recording (runtime check, outside a
static pass).

**Recommendation:** either fold a runtime replay-content check into the live-capture
window, or have whoever owns the Sentry project dashboard confirm no masking override
exists at project-config level (a separate surface from SDK init code).

## Live-capture (mitmproxy) — PENDING-WORKER-WINDOW

Plan written at `evidence/w5-egress/plan.md`. Key finding: Node fetch/undici does NOT
respect `HTTP_PROXY`/`HTTPS_PROXY` (zero matches for ProxyAgent/setGlobalDispatcher in
src/) — plain env-var proxying won't work. 3 options in plan: (1) src/ instrumentation
(needs team-lead approval — DENIED: no product-code edits for test tooling), (2) OS-level
interception, (3) netstat/Get-NetTCPConnection connection-level fallback proving
destinations without TLS payload inspection — APPROVED by team-lead (passive, zero
interference with running journeys).

## C2b cross-reference

Object-storage backup/restore drill PASS — see `evidence/c2-restore-drill/runbook.md` §6.
1766 objects mirrored in 33.5s, ETag spot-check + byte-for-byte live-GET match; combined
DB+object RTO at dev scale < 60s. False-alarm resolved: 35884-vs-35997-byte diff was
CRLF/trailing-newline artifact of the curl+jq extraction pipeline on Windows, zero diff
after normalization. Prod gaps for ops list: no automated storage_key↔S3 reconciliation
job; live-key path needs same-instant DB/object backup pairing (versioned snapshots are
safe by design: write-once `.versions/<id>/vN.md`).
