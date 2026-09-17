# Local fleet models (LAN gateway)

This install serves its LLM traffic from the self-hosted fleet instead of a paid
provider: **DeepSeek V4.1 Flash is the default model**, with the other gateway
models selectable per user, per book and per agent role. Nothing here costs
tokens, and no provider key is required to use the app.

Gateway reference (endpoints, restart, health): `GATEWAY-SETUP.md` in
`D:\Projects\Setting up DgX spark`.

## Topology

```
app / worker ──Anthropic Messages API──> local-llm-proxy.py :30400
                                              │ translates to OpenAI chat/completions
                                              │ maps registry id -> gateway model
                                              ▼
                                   LiteLLM gateway 10.33.0.153:4000/v1
                                              ├── deepseek-v4.1-flash   (H100)
                                              ├── deepseek-v4-flash     (H100)
                                              ├── qwen3.8-flash-next    (Sparks :8888)
                                              └── qwen3.8-27b-uncensored(Zika :8080)
```

The app speaks only the Anthropic Messages API (its SDK is hard-wired to it).
`local-llm-proxy.py` is the single adapter: it translates the wire format **and**
owns the registry-id → gateway-model mapping, so no TypeScript ever learns a
gateway model name.

## Registry ids

| Registry id | Gateway model | Notes |
|---|---|---|
| `local-deepseek/{opus,sonnet,haiku}` | `deepseek-v4.1-flash` | Deployment default |
| `local-deepseek-v4/{opus,sonnet,haiku}` | `deepseek-v4-flash` | Previous generation |
| `local-qwenflash/{opus,sonnet,haiku}` | `qwen3.8-flash-next` | 1M context, parallel agents |
| `local-zika/{opus,sonnet,haiku}` | `qwen3.8-27b-uncensored` | Vision, no refusals |
| `local/qwen38`, `local/qwen38-haiku` | `qwen3.8-flash-next` | Legacy ids in old settings rows |

Each family carries all three tier slots because role resolution and
`resolveCheapModelFor()` walk `<family>/<tier>`; without a `/haiku` sibling they
fall through to `anthropic/haiku` and fail for a user with no Anthropic key.
The slots are the same upstream model and share a display name, so the picker
collapses each family into one entry.

The gateway aliases `claude-local` and `qwen3.8-27b` are deliberately not
registered — both are aliases of models already listed above.

**Adding a model:** add its three tier slots to `MODEL_REGISTRY`
(`src/lib/llm/model-registry.ts`) *and* its three ids to `DEFAULT_MODEL_MAP`
(`local-llm-proxy.py`). `tests/unit/local-fleet-models.test.ts` fails if the two
lists drift.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `WMB_DEFAULT_MODEL` | `local-deepseek/sonnet` | Deployment default model (registry id). Unknown ids are ignored. |
| `WMB_LOCAL_FALLBACK` | off | `1` = serve a model whose provider key is missing from the fleet instead of failing. |
| `WMB_LLM_FORCE_LOCAL` | off | `1` = pin **every** call to the default local model, ignoring the picker. |
| `WMB_LOCAL_PROXY_URL` | `http://local-llm-proxy:30400` | Proxy root. Host dev server uses `http://localhost:30400`. |
| `WMB_ALLOW_PRIVATE_MODEL_HOSTS` | off | Allow custom-provider base URLs on private ranges. LAN installs only. |
| `LOCAL_LLM_BASE_URL` | `http://10.33.0.153:4000/v1` | Upstream OpenAI-compatible base. |
| `LOCAL_LLM_MODEL` | `deepseek-v4.1-flash` | Gateway model used for ids the map does not know. |
| `LOCAL_LLM_MODEL_MAP` | — | JSON object merged over `DEFAULT_MODEL_MAP`. |
| `LOCAL_LLM_PIN_MODEL` | — | `1` = ignore the requested model, always use `LOCAL_LLM_MODEL`. |
| `LOCAL_LLM_BIND` | `127.0.0.1` | Proxy listen address. The compose service sets `0.0.0.0`; a host process stays on loopback so the LAN cannot proxy into the gateway. |
| `LOCAL_LLM_REASONING_EFFORT` | `medium` | Upstream reasoning effort; quick-assist surfaces force `none`. |

Every route resolves its provider through `resolveRouteWithLocalFallback()`
(`src/lib/llm/client-factory.ts`), never `resolveProviderRoute()` directly —
the pre-checks that returned their own 400 used to make the setting mean two
different things depending on which endpoint you hit. Each substitution logs
`[llm] no usable key for <asked> — serving <served>`.

`WMB_LOCAL_FALLBACK` must stay **off** on any hosted deployment: there is no LAN
gateway there, and quietly serving a different model than the user picked would
be a lie. On this install it is on, and the client reports the local stand-in as
the model that ran (zero cost), not the model that was asked for.

## Switching the default

1. Set `WMB_DEFAULT_MODEL` to the registry id you want.
2. `npx tsx scripts/migrate-default-model.ts` (dry run), then `--apply` — it
   repoints only users still carrying the *previous platform default*, never a
   model a user chose.

Users can override the default (and each agent role) in Settings → Models.
The fleet appears there as the keyless **Local fleet (self-hosted)** group,
offered whenever the server reports `localFleet: true` from
`GET /api/settings/default-model`.

New accounts are created with `getDefaultModelId()` explicitly (see
`src/lib/auth.ts` and the Clerk webhook) — the Prisma column default alone
would make `WMB_DEFAULT_MODEL` inert for every signup.

## Running it

```bash
docker compose up -d postgres redis minio minio-init neo4j qdrant
docker compose -f docker-compose.yml -f docker-compose.local-llm.yml up -d local-llm-proxy
npm run dev            # :3000
npm run worker:dev     # BullMQ worker
```

Health checks:

```bash
curl -s http://localhost:30400/health            # proxy + its model map
curl -s http://10.33.0.153:4000/v1/models        # what the gateway serves
```

## Troubleshooting

- **A model hangs with no response.** Probe it straight on the gateway
  (`curl http://10.33.0.153:4000/v1/chat/completions -d '{"model":"...","max_tokens":1500,...}'`).
  If that hangs too, the backing box is down or loading — not an app problem.
  Zika (`qwen3.8-27b-uncensored`) answers `/v1/models` even while its weights are
  not resident, so a live model list is not proof the model will answer.
- **Empty `content` with `finish_reason: length`.** These are thinking models;
  keep `max_tokens` ≥ 1500 or the reasoning pass eats the whole budget.
- **Everything answers as the default model.** `LOCAL_LLM_PIN_MODEL=1` or
  `WMB_LLM_FORCE_LOCAL=1` is set.
