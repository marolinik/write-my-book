/**
 * D1 — a quick take and a considered answer are not the same request.
 *
 * Discuss has a 19-48 second wall before its first token, and that wall is the
 * measured floor of two persona panels. The cause is not price: discuss
 * already picks the cheap tier. It is that on a reasoning default the cheap
 * slot aliases the SAME reasoning model, so every turn pays for a thinking
 * phase before it says anything at all.
 *
 * The product already knows how to escape that. `resolveQuickAssistModelFor`
 * was built for ghost-text and inline-edit, whose tiny output budgets were
 * being spent entirely on thinking (D-116/D-117): it substitutes the cheapest
 * non-reasoning model from the same provider, so a single-key writer keeps
 * working. Discuss never called it.
 *
 * So the lever is a choice the writer can see and make, not an experiment run
 * on them. The default does not move: a writer who says nothing gets the
 * answer they have always got.
 */

import {
  resolveCheapModelFor,
  resolveQuickAssistModelFor,
  type ModelDefinition,
} from "@/lib/llm/model-registry";

export type DiscussMode = "quick" | "considered";

/** What a turn is when the writer has not asked for anything else. */
export const DEFAULT_DISCUSS_MODE: DiscussMode = "considered";

/** Whether a value off the wire is a mode this product offers. */
export function isDiscussMode(value: unknown): value is DiscussMode {
  return value === "quick" || value === "considered";
}

/**
 * The model a discuss turn should run on.
 *
 * `quick` routes around the reasoning slot the same way quick-assist does.
 * Anything else — including a value this product does not recognise — is the
 * considered turn, unchanged from what discuss has always done.
 */
export function discussModelFor(
  userDefaultModelId: string,
  mode: DiscussMode
): ModelDefinition {
  return mode === "quick"
    ? resolveQuickAssistModelFor(userDefaultModelId)
    : resolveCheapModelFor(userDefaultModelId);
}
