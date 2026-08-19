# W5 — Server-layer egress ledger: capture plan

Goal (team-lead): prove ONLY provider endpoints (openrouter.ai, api.anthropic.com,
api.openai.com) ever receive prose/keys.

## Status

- **Static/grep half: DONE** — see `findings.md` in this folder.
- **Live-capture half: PENDING-WORKER-WINDOW.** Not attempted. Needs a dedicated worker
  window from team-lead (an actual agent-run whose outbound traffic gets captured). This
  document describes the intended method so it can be executed on short notice once a
  window is granted.

## Live-capture method (not yet run)

### Mitmproxy availability

Not yet checked on this box at time of writing. First step of the live-capture session:
confirm `mitmproxy`/`mitmdump` is installed (`mitmdump --version`); if absent, this leg
needs either an install (read-only decision left to team-lead — installing tooling is a
mild environment change) or a substitute interception method (see fallback below).

### Key constraint discovered during the static half

`src/lib/llm/client-factory.ts` constructs the Anthropic SDK client directly with
`baseURL` set to one of three literal values (`https://api.anthropic.com`,
`https://openrouter.ai/api`, or `LITELLM_BASE_URL`, default `http://localhost:30400`).
Grepped the whole `src/` tree for `HTTP_PROXY`/`HTTPS_PROXY`/`ProxyAgent`/
`setGlobalDispatcher` — **zero matches**. Node's built-in `fetch`/undici (which the
Anthropic SDK and the app's own `fetch()` calls use) does **not** respect
`HTTP_PROXY`/`HTTPS_PROXY` env vars out of the box. This means simply setting
`HTTPS_PROXY=http://localhost:8080` before starting the app will **not** route traffic
through mitmproxy — undici needs either:

1. An explicit `undici.setGlobalDispatcher(new undici.ProxyAgent(...))` call added
   at process startup (would require a `src/` change — out of scope for a QA agent
   under the "no src/ edits" constraint; would need to be a team-lead-approved
   temporary instrumentation, reverted after the capture), **or**
2. OS-level interception: point the dev box's default HTTP(S) route through mitmproxy
   in transparent/regular proxy mode (e.g. via a system proxy setting Node does
   respect if launched with `--use-system-ca`/proxy env recognized by the OS
   networking stack) — more invasive, not recommended for a shared dev box other
   agents are actively using, **or**
3. **Recommended fallback**: skip mitmproxy entirely and instead capture at the
   `S3`/network layer already available — Node 18+'s `fetch` supports a
   `--experimental-network-inspection` / the app could temporarily log outbound
   request URLs (not bodies) via a `fetch` wrapper for the duration of one worker
   run, OR simpler still: **inspect OS-level connections during a live agent run**
   with `netstat`/`Get-NetTCPConnection` (Windows) filtered to the worker process
   PID, capturing the **remote IP:port and resolved hostname** for every outbound
   TCP connection opened during a real agent job. This proves *destination* (which
   is team-lead's actual ask: "ONLY provider endpoints ever receive prose/keys")
   without needing to decrypt/inspect TLS payloads at all — connection-level evidence
   is sufficient to prove no *additional, unexpected* endpoints are contacted during
   an LLM call, which combined with the static grep's endpoint inventory (see
   `findings.md`) gives full coverage without any `src/` instrumentation.

### Planned live-capture steps (once a worker window is granted)

1. Confirm mitmproxy availability; if present, prefer option 1/2 above (actual TLS
   payload inspection — strongest evidence). If not, fall back to option 3
   (connection-level `netstat` capture — destination-only evidence, no payload).
2. Identify the worker process PID (`platform-new-worker` container or local
   `npm run worker` process, per team-lead's coordination).
3. Start capture (mitmdump or netstat polling) **before** triggering the run.
4. Trigger one small, controlled agent run (team-lead specifies which persona/book/
   chapter — should be a short op, e.g. one chapter's continuity scan or one
   editorial pass, not a full-book batch).
5. Stop capture once the job completes (poll `BatchRun`/`AgentSession` status).
6. Diff captured destinations against the static inventory in `findings.md` §1.
   Any destination NOT in that inventory is a new finding to escalate immediately.
7. If mitmproxy TLS inspection was used: additionally confirm request bodies sent
   to the 3 provider endpoints contain the expected prompt/prose fields and
   nothing else (no accidental key-in-body — keys should only ever appear in the
   `Authorization`/`x-api-key`/`x-provider-key` headers, never the JSON body, per
   code read of `client-factory.ts`).
8. Document results in a new `live-capture-results.md` in this same folder;
   update this `plan.md`'s status line from PENDING-WORKER-WINDOW to DONE.

## Non-goals for this leg

Not re-auditing Stripe, email/notification providers, or other non-LLM third-party
calls — team-lead's ask is specifically about prose/key confidentiality relative to
the LLM inference path. Sentry (a genuine outbound destination touching UI/error data,
not raw LLM prompts) is covered separately in `findings.md` §3 since it surfaced
during the static grep as relevant to the same "confidentiality" concern.
