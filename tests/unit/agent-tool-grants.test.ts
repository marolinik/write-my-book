/**
 * A-03 / A-05 / A-10 / A-11 / A-12 / A-18 / A-40 — a prompt may only name a
 * tool the agent actually holds.
 *
 * The audit's most expensive defects all had the same shape: two layers agreed
 * through free-form text a model writes. This is that same shape one level
 * down. `scene-planner` was ordered to `ReadAllChapters` and held neither
 * chapter tool; `manuscript-reader` had to open with a whole-manuscript chapter
 * table and could not enumerate chapters; `style-analyst` was asked for a voice
 * fingerprint with no route to any prose at all. Nothing failed loudly: the
 * agent simply invented the numbers and the run still reported "completed".
 *
 * The contract this test enforces:
 *   1. every tool named in an agent's own instructions is granted to it;
 *   2. every tool named in the conductor text for a workflow is held by
 *      somebody in that conversation — the coach, or the specialist it
 *      delegates to;
 *   3. every granted tool name is a real tool in the registry.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BASE_INSTRUCTIONS,
  CONDUCTOR_WORKFLOW_INSTRUCTIONS,
  WORKFLOW_INSTRUCTION_OVERRIDES,
} from "@/lib/agents/prompt-assembler";
import { getAllAgentDefinitions, getAgentDefinition } from "@/lib/agents/definitions";
import { getAllWorkflows } from "@/lib/agents/workflows";
import { TOOL_GUIDANCE, buildToolRoster } from "@/lib/agents/tool-roster";

/** Tool names the registry knows, read from its source so a typo cannot pass. */
const TOOL_NAMES: string[] = (() => {
  const src = readFileSync(
    join(__dirname, "..", "..", "src", "lib", "agents", "tools.ts"),
    "utf-8"
  ).split(String.fromCharCode(13)).join("");
  return [...src.matchAll(/^  name: "(\w+)",$/gm)].map((m) => m[1]);
})();

const WORD_BOUNDARY = String.fromCharCode(92) + "b";

function toolsNamedIn(text: string): string[] {
  return TOOL_NAMES.filter((name) =>
    new RegExp(WORD_BOUNDARY + name + WORD_BOUNDARY).test(text)
  );
}

/**
 * Tools a prompt names only in order to forbid them. The story architect
 * proposes structure moves and must never rewrite prose itself — saying so
 * costs one mention of a tool it deliberately does not hold.
 */
const NAMED_TO_FORBID: Record<string, string[]> = {
  "story-architect": ["WriteChapter"],
};

describe("the tool registry", () => {
  it("is non-empty and parsed", () => {
    expect(TOOL_NAMES.length).toBeGreaterThan(20);
    expect(TOOL_NAMES).toContain("ReadAllChapters");
  });

  it("knows every tool every agent is granted", () => {
    const unknown: string[] = [];
    for (const def of getAllAgentDefinitions()) {
      for (const tool of def.tools) {
        if (!TOOL_NAMES.includes(tool)) unknown.push(`${def.type}: ${tool}`);
      }
    }
    expect(unknown).toEqual([]);
  });
});

describe("a specialist's own instructions", () => {
  it("never name a tool the specialist does not hold", () => {
    const gaps: string[] = [];

    for (const def of getAllAgentDefinitions()) {
      const own = getAllWorkflows().filter((w) => w.primaryAgent === def.type);
      let text = BASE_INSTRUCTIONS[def.type] ?? "";
      for (const w of own) text += "\n" + (WORKFLOW_INSTRUCTION_OVERRIDES[w.id] ?? "");

      const allowed = [...def.tools, ...(NAMED_TO_FORBID[def.type] ?? [])];
      for (const named of toolsNamedIn(text)) {
        if (!allowed.includes(named)) gaps.push(`${def.type} is told to use ${named}`);
      }
    }

    expect(gaps).toEqual([]);
  });
});

describe("the conductor text for a workflow", () => {
  it("only names tools the coach or its specialist holds", () => {
    const coach = getAgentDefinition("writing-coach");
    expect(coach).toBeDefined();
    const gaps: string[] = [];

    for (const workflow of getAllWorkflows()) {
      const text = CONDUCTOR_WORKFLOW_INSTRUCTIONS[workflow.id];
      if (!text) continue;
      const specialist = getAgentDefinition(workflow.primaryAgent);
      const held = [
        ...(coach?.tools ?? []),
        ...(specialist?.tools ?? []),
        ...(NAMED_TO_FORBID[workflow.primaryAgent] ?? []),
      ];
      for (const named of toolsNamedIn(text)) {
        if (!held.includes(named)) {
          gaps.push(`${workflow.id}: nobody in the room holds ${named}`);
        }
      }
    }

    expect(gaps).toEqual([]);
  });
});

describe("the agents whose job is the whole manuscript", () => {
  const bookWide = [
    "manuscript-reader",
    "manuscript-analyst",
    "publishing-editor",
    "continuity-checker",
    "style-analyst",
  ] as const;

  it.each(bookWide)("%s can enumerate and read chapters", (type) => {
    const def = getAgentDefinition(type);
    expect(def?.tools).toContain("ListChapters");
    expect(def?.tools).toContain("ReadAllChapters");
  });
});

describe("the agents that work from editorial findings", () => {
  // No tool anywhere reads a finding. For the coach running discuss-edits and
  // the ghostwriter running revise, the injected finding history is the only
  // route — and both used to have it switched off.
  it.each(["writing-coach", "ghostwriter"] as const)("%s is given the finding history", (type) => {
    expect(getAgentDefinition(type)?.contextProfile.findingHistory).toBe(true);
  });
});

/**
 * A-32 — and the mirror: a tool an agent holds is a tool it is told about.
 *
 * The contract above runs one way only. It catches a prompt that orders a tool
 * the agent does not hold, and says nothing at all about a tool the agent
 * holds and the prompt never mentions. Thirteen tools sat on that blind side:
 * the graph, the writer's memory and the blackboard were all granted widely
 * and named nowhere.
 *
 * That is not a documentation gap. The read half of each of those three
 * systems is injected into the prompt as context, so an agent sees what the
 * blackboard already holds; the write half is a tool, and a tool no
 * instruction ever names is a tool the model has no occasion to call. The
 * systems can only ever grow from `promoteFindings`, which runs after an edit
 * session and posts findings — never from an agent noticing something worth
 * keeping.
 *
 * The roster closes it by construction rather than by editing fourteen
 * prompts: every granted tool gets one line saying when to reach for it, and
 * the lines are generated from `definition.tools`, so a tool granted tomorrow
 * cannot be silent. It stays quiet about the tools the prompt already
 * explains in its own words — the continuity checker's hand-written tool
 * section is better than a generated line and is left to speak for itself.
 */
describe("the mirror — a tool an agent holds is a tool it is told about", () => {
  /** The instruction text an agent of this type can actually be sent. */
  function instructionsFor(type: string): string {
    const own = getAllWorkflows().filter((w) => w.primaryAgent === type);
    let text = BASE_INSTRUCTIONS[type] ?? "";
    for (const w of own) {
      text += "\n" + (WORKFLOW_INSTRUCTION_OVERRIDES[w.id] ?? "");
      if (type === "writing-coach") text += "\n" + (CONDUCTOR_WORKFLOW_INSTRUCTIONS[w.id] ?? "");
    }
    return text;
  }

  it("gives every tool in the registry a line of usage guidance", () => {
    const missing = TOOL_NAMES.filter((name) => !TOOL_GUIDANCE[name]);
    expect(missing).toEqual([]);
  });

  it("has no guidance for a tool that does not exist", () => {
    const ghosts = Object.keys(TOOL_GUIDANCE).filter((name) => !TOOL_NAMES.includes(name));
    expect(ghosts).toEqual([]);
  });

  it("names every granted tool in the prompt the agent receives", () => {
    const silent: string[] = [];
    for (const def of getAllAgentDefinitions()) {
      const own = instructionsFor(def.type);
      const text = own + "\n" + buildToolRoster(def.type, own);
      const named = toolsNamedIn(text);
      for (const tool of def.tools) {
        if (!named.includes(tool)) silent.push(`${def.type} holds ${tool} and is never told`);
      }
    }
    expect(silent).toEqual([]);
  });

  it("stays silent about a tool the prompt already explains itself", () => {
    // The continuity checker writes its own TOOLS YOU HAVE BEEN GIVEN section,
    // one careful sentence per series tool. A generated line underneath it
    // would say the same thing worse, twice.
    const roster = buildToolRoster("continuity-checker", instructionsFor("continuity-checker"));
    expect(roster).not.toContain("ReadSiblingChapter");
    expect(roster).toContain("PostInsight");
  });

  it("is appended to the instructions, not merely exported", () => {
    const assembler = readFileSync(
      join(__dirname, "..", "..", "src", "lib", "agents", "prompt-assembler.ts"),
      "utf-8"
    );
    expect(assembler).toContain("buildToolRoster(definition.type,");
    const instructionsBuilt = assembler.indexOf("const instructions: string[] = [];");
    const rosterPushed = assembler.indexOf("buildToolRoster(definition.type,");
    expect(instructionsBuilt).toBeGreaterThan(0);
    expect(rosterPushed).toBeGreaterThan(instructionsBuilt);
  });
});
