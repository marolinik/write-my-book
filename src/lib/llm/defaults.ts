/**
 * Platform-wide default model + local fallback policy.
 *
 * Every surface that needs "the model to use when the user has not chosen one"
 * MUST read {@link getDefaultModelId} instead of hardcoding a registry id —
 * 15 copies of `?? "anthropic/sonnet"` meant the deployment's default lived in
 * 15 files and could not be changed without touching all of them.
 *
 * The default is DeepSeek V4.1 Flash on OpenRouter: one key reaches it, it
 * costs 0.15/0.60 per million, and it carries a million tokens of context.
 *
 * It used to be the self-hosted fleet, which works on a box that HAS a fleet
 * and on no other — a clean clone or any hosted deployment defaulted to a
 * gateway that was not there. The fleet keeps its registry entries and stays a
 * model a writer can pick; with WMB_LOCAL_FALLBACK=1 it also still catches a
 * writer who has no usable key at all.
 *
 * Deployments that want a different provider set WMB_DEFAULT_MODEL to its
 * registry id.
 */

import { getModelDef } from "./model-registry";

/** Registry id used when WMB_DEFAULT_MODEL is unset or unknown. */
export const FALLBACK_DEFAULT_MODEL_ID = "openrouter-deepseek-flash/sonnet";

/**
 * The model WMB_LOCAL_FALLBACK serves when a writer has no usable key.
 *
 * This is NOT the platform default and must never be derived from it. The
 * two were the same constant until the default moved to OpenRouter, at which
 * point the "local stand-in" stopped being local and the fleet fallback
 * would have routed keyless writers straight back to a provider they have no
 * key for. The whole point of the fallback is that it needs no key.
 */
export const LOCAL_STAND_IN_MODEL_ID = "local-deepseek/sonnet";

/**
 * The deployment's default model registry id.
 *
 * `WMB_DEFAULT_MODEL` overrides it, but only when it names a model the registry
 * actually has: an unknown id would resolve to anthropic/sonnet deep inside
 * {@link resolveFromTier} and silently bill a provider the user may not have a
 * key for. Unknown values are ignored (and the built-in default used) rather
 * than trusted.
 *
 * Client bundles never see non-NEXT_PUBLIC_ env vars, so in the browser this
 * always returns the built-in default — which is exactly the value the server
 * uses unless an operator overrode it.
 */
export function getDefaultModelId(): string {
  const configured = process.env.WMB_DEFAULT_MODEL;
  if (configured && getModelDef(configured)) return configured;
  return FALLBACK_DEFAULT_MODEL_ID;
}

/**
 * Whether a model whose provider has no usable API key should fall back to the
 * local fleet instead of failing.
 *
 * Off by default: on a hosted deployment there is no LAN gateway, and silently
 * serving a different model than the user picked would be a lie. Set
 * WMB_LOCAL_FALLBACK=1 on installs that run against the fleet gateway.
 */
export function isLocalFallbackEnabled(): boolean {
  return process.env.WMB_LOCAL_FALLBACK === "1";
}

/**
 * Whether this install can serve models from the self-hosted fleet at all.
 *
 * The model picker derives its provider list from the user's validated BYOK
 * keys, and the fleet has no key — so without this the 12 local models were
 * invisible in every picker, and a user whose default IS a local model got a
 * Select with no matching item (a blank trigger, the D-131 failure).
 *
 * Server-side only in effect: in the browser the env vars are absent, so
 * callers must take this from an API response rather than calling it directly.
 */
export function isLocalFleetConfigured(): boolean {
  if (process.env.WMB_LLM_FORCE_LOCAL === "1") return true;
  if (isLocalFallbackEnabled()) return true;
  return getModelDef(getDefaultModelId())?.provider === "local";
}
