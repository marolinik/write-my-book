# Bring Your Own Keys (BYOK)

Write My Book uses a **Bring Your Own Key** model. You provide API keys from the AI providers you want to use. There is no platform markup on API calls -- you pay the providers directly at their published rates.

## Supported Providers

Write My Book supports 5 AI providers. You only need a key from **one** provider to get started.

| Provider | Key Prefix | Get Your Key |
|----------|-----------|--------------|
| **Anthropic** | `sk-ant-` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| **OpenRouter** | `sk-or-` | [openrouter.ai/keys](https://openrouter.ai/keys) |
| **OpenAI** | `sk-` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Google Gemini** | `AIza` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **xAI (Grok)** | `xai-` | [console.x.ai](https://console.x.ai/) |

### What Each Provider Offers

- **Anthropic** -- Claude models (Opus 4.6, Sonnet 4.5, Haiku 4.5) with the lowest latency. Best for writers who want Claude exclusively.
- **OpenRouter** -- A single key gives access to Claude, GPT, Gemini, Grok, MiniMax, Qwen, DeepSeek, and 200+ other models. Best value if you want variety.
- **OpenAI** -- GPT-4o, o3, and o4-mini models. Good for writers who prefer GPT for certain tasks.
- **Google Gemini** -- Gemini 2.5 Pro and Flash models. Competitive pricing, especially Flash for quick tasks.
- **xAI (Grok)** -- Grok-4, Grok-3, and Grok-3 Mini. Strong performance at competitive rates.

## Adding a Key

1. Go to **Settings > API Keys**
2. Find the provider card you want to connect
3. Click **Add Key**
4. Paste your API key into the input field
5. The key is **validated immediately** -- Write My Book makes a small test request to confirm the key works
6. Once validated, the key is encrypted and stored

**First-time users:** When you first sign in, the onboarding wizard walks you through adding your first key before you can access any features.

## Key Security

Your API keys are protected with industry-standard encryption:

- **AES-256-GCM encryption** at rest -- keys are never stored in plaintext
- **Server-side only** -- your keys are never sent to the browser or exposed in client-side code
- **Decryption on demand** -- keys are only decrypted server-side when starting an agent session
- **No logging** -- API keys are sanitized from all server logs and error reports

## Re-validating a Key

If you rotate your key on the provider's website, you can verify the new key still works:

1. Go to **Settings > API Keys**
2. Click the **Re-validate** button on the provider card
3. Write My Book makes a test request to confirm the key is still active
4. If validation fails, update the key with your new one

## Removing a Key

1. Go to **Settings > API Keys**
2. Click the **delete** icon on the provider card
3. Confirm the deletion

**Restrictions:**
- You must keep at least one active key at all times. The platform cannot function without at least one AI provider connected.
- Keys cannot be deleted while agent sessions are actively running with that provider.

## OpenRouter as Universal Access

If you want the simplest setup, **OpenRouter is the recommended single-key option**. With one OpenRouter key, you get access to:

- Claude (Opus, Sonnet, Haiku) from Anthropic
- GPT-4o, o3, o4-mini from OpenAI
- Gemini 2.5 Pro and Flash from Google
- Grok models from xAI
- Budget-friendly alternatives like MiniMax, Qwen, DeepSeek, and Kimi

OpenRouter acts as a unified gateway -- you fund one account and access models from all major providers. This is ideal if you want to experiment with different models without managing multiple API accounts.

## Cost Transparency

Every workflow card shows an **estimated cost** before you start, based on the model that will be used. During a session, a **live cost counter** tracks actual spending in real time. All costs are at the provider's published rates with zero markup.

See the [Model Selection Guide](./user-guide-models.md) to learn how to choose which models are used for each task.
