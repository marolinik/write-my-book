/**
 * A-28 — a role is a knob, and a knob may only mean one thing.
 *
 * Fourteen agents resolved their model through six roles, and seven of them
 * landed on `analyst`. That role held the style analyst, whose captured voice
 * the ghostwriter then imitates for the whole book and whose own default is
 * opus, together with the manuscript analyst, which counts words and defaults
 * to haiku. One knob, two intentions: a writer who raised `analyst` to buy a
 * better voice capture paid opus prices for word counting, and a writer who
 * lowered it to stop paying for word counting cheapened the voice capture.
 *
 * The checkable form of that defect is not "seven agents share a role" — some
 * sharing is the point. It is: **no role may contain two agents whose own
 * default models differ.** Where the definitions disagree about how much
 * thinking a job needs, the configuration surface has to be able to disagree
 * too.
 *
 * That test also catches `creative`, which the audit never named: the story
 * architect defaults to opus and the scene planner to sonnet, through one
 * field.
 *
 * And the mirror, which is how a knob lies in the other direction:
 * `BookSettings.modelResearch` has existed for as long as the table has, is
 * accepted by `validation.ts` and typed into `use-settings.ts` — and
 * `ROLE_TO_BOOK_FIELD` never read it. The writer could set it and nothing
 * anywhere would change.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getAllAgentDefinitions } from "@/lib/agents/definitions";
import {
  AGENT_ROLES,
  agentTypeToRole,
  ROLE_TO_BOOK_FIELD,
  ROLE_TO_USER_FIELD,
} from "@/lib/llm/model-resolver";

const schema = readFileSync(join(__dirname, "..", "..", "prisma", "schema.prisma"), "utf-8");

/** The model-role fields a Prisma model declares, read from the schema itself. */
function modelFields(modelName: string): string[] {
  const start = schema.indexOf(`model ${modelName} {`);
  const body = schema.slice(start, schema.indexOf("\n}", start));
  return [...body.matchAll(/^\s+(model[A-Z]\w+)\s/gm)].map((m) => m[1]);
}

describe("a role", () => {
  it("never holds two agents that disagree about how much thinking the job needs", () => {
    const byRole = new Map<string, Map<string, string[]>>();
    for (const def of getAllAgentDefinitions()) {
      const role = agentTypeToRole(def.type);
      const models = byRole.get(role) ?? new Map<string, string[]>();
      models.set(def.defaultModel, [...(models.get(def.defaultModel) ?? []), def.type]);
      byRole.set(role, models);
    }

    const split: string[] = [];
    for (const [role, models] of byRole) {
      if (models.size > 1) {
        const detail = [...models]
          .map(([model, types]) => `${model}: ${types.join(", ")}`)
          .join(" | ");
        split.push(`${role} — ${detail}`);
      }
    }
    expect(split).toEqual([]);
  });

  it("is settable per book", () => {
    const fields = modelFields("BookSettings");
    const missing = AGENT_ROLES.filter((role) => !fields.includes(ROLE_TO_BOOK_FIELD[role]));
    expect(missing).toEqual([]);
  });

  it("is settable globally for the writer", () => {
    const fields = modelFields("User");
    const missing = AGENT_ROLES.filter((role) => !fields.includes(ROLE_TO_USER_FIELD[role]));
    expect(missing).toEqual([]);
  });
});

describe("a model field the writer can set", () => {
  // `modelOverride` is the book's own fallback, one level below every role —
  // not a role field, and read by the resolver directly.
  const NOT_A_ROLE_FIELD = ["modelOverride"];

  it("is read by some role — no knob wired to nothing", () => {
    const wiredToBook = new Set<string>([
      ...AGENT_ROLES.map((role) => ROLE_TO_BOOK_FIELD[role]),
      ...NOT_A_ROLE_FIELD,
    ]);
    const dead = modelFields("BookSettings").filter((field) => !wiredToBook.has(field));
    expect(dead).toEqual([]);
  });

  it("is read by some role at the writer level too", () => {
    const wiredToUser = new Set<string>(AGENT_ROLES.map((role) => ROLE_TO_USER_FIELD[role]));
    const dead = modelFields("User").filter((field) => !wiredToUser.has(field));
    expect(dead).toEqual([]);
  });
});

describe("every agent", () => {
  it("has a role", () => {
    for (const def of getAllAgentDefinitions()) {
      expect(AGENT_ROLES, `${def.type}`).toContain(agentTypeToRole(def.type));
    }
  });
});
