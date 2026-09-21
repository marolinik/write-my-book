/**
 * D1 — a quick take and a considered answer are not the same request.
 *
 * Discuss has a 19-48 second wall before the first token, and it is the
 * measured floor of two persona panels. The cause is not price: discuss
 * already picks the cheap tier. It is that on a reasoning default the cheap
 * slot aliases the SAME reasoning model, so every turn pays for a thinking
 * phase before it says anything.
 *
 * The product already knows how to escape that. `resolveQuickAssistModelFor`
 * was built for ghost-text and inline-edit, whose tiny budgets were being
 * spent entirely on thinking (D-116/D-117): it substitutes the cheapest
 * non-reasoning model from the same provider, so a single-key writer keeps
 * working. Discuss never called it.
 *
 * So the lever is a choice, not an experiment the writer cannot see: a quick
 * take routes around the reasoning slot, and thinking it through stays exactly
 * what it is today. The default must not move — a writer who says nothing gets
 * the answer they have always got.
 */

import { describe, it, expect } from "vitest";
import { discussModelFor, DEFAULT_DISCUSS_MODE } from "@/lib/editorial/discuss-mode";
import { resolveCheapModelFor, resolveQuickAssistModelFor } from "@/lib/llm/model-registry";

/** A reasoning default whose own cheap slot is the same reasoning model. */
const REASONING_DEFAULT = "openrouter-qwen36/sonnet";

describe("the discuss mode", () => {
  it("defaults to the answer the writer has always got", () => {
    expect(DEFAULT_DISCUSS_MODE).toBe("considered");
    expect(discussModelFor(REASONING_DEFAULT, DEFAULT_DISCUSS_MODE).id).toBe(
      resolveCheapModelFor(REASONING_DEFAULT).id
    );
  });

  it("routes a quick take around the reasoning slot", () => {
    const considered = discussModelFor(REASONING_DEFAULT, "considered");
    const quick = discussModelFor(REASONING_DEFAULT, "quick");

    expect(quick.id).toBe(resolveQuickAssistModelFor(REASONING_DEFAULT).id);
    // The point of the choice: on a reasoning default the two differ.
    expect(quick.id).not.toBe(considered.id);
    expect(quick.unfitForQuickAssist).not.toBe(true);
  });

  it("changes nothing when the cheap slot was never a reasoning model", () => {
    const plain = "anthropic/sonnet";
    expect(discussModelFor(plain, "quick").id).toBe(discussModelFor(plain, "considered").id);
  });

  it("treats an unknown mode as the considered one", () => {
    expect(discussModelFor(REASONING_DEFAULT, "nonsense" as never).id).toBe(
      discussModelFor(REASONING_DEFAULT, "considered").id
    );
  });
});
