/**
 * A-12 / A-35 / A-36 / A-37 — the genre guide a book gets is the guide for its
 * genre, and the agents whose job is genre-shaped actually get one.
 *
 * `getGenreGuide` matched substrings in both directions, so an alias could
 * swallow the query: the genre "fiction" is a substring of the romance alias
 * "romantic fiction", and romance is first in the list, so every book filed as
 * plain fiction was edited to romance conventions — HEA endings, black moment,
 * heat levels. Five guides existed, and horror, historical fiction, young
 * adult and memoir resolved to nothing at all. The market reader — whose entire
 * job is genre fit across five markets — was in no genre set. Style Analyst and
 * Manuscript Analyst were in no skill map, so they got an empty string.
 */

import { describe, it, expect } from "vitest";
import { getGenreGuide, GENRE_GUIDES } from "@/lib/agents/skills/genre-guides";
import { selectSkillsForAgent } from "@/lib/agents/skills";
import { getAllAgentDefinitions } from "@/lib/agents/definitions";

describe("resolving a genre", () => {
  it("never answers romance for a book that is not one", () => {
    expect(getGenreGuide("fiction")?.genre).toBe("literary");
    expect(getGenreGuide("general fiction")?.genre).toBe("literary");
    expect(getGenreGuide("historical fiction")?.genre).toBe("historical fiction");
    expect(getGenreGuide("literary fiction")?.genre).toBe("literary");
  });

  it("prefers the longest matching alias", () => {
    // Both "romance" and "historical romance" appear; the specific one wins.
    expect(getGenreGuide("historical romance")?.genre).toBe("historical fiction");
    expect(getGenreGuide("romantic suspense")?.genre).toBe("romance");
  });

  it("covers the genres that used to resolve to nothing", () => {
    for (const [genre, expected] of [
      ["horror", "horror"],
      ["psychological horror", "horror"],
      ["gothic", "horror"],
      ["historical", "historical fiction"],
      ["istorijski roman", "historical fiction"],
      ["young adult", "young adult"],
      ["YA", "young adult"],
      ["coming of age", "young adult"],
      ["memoir", "memoir"],
      ["creative nonfiction", "memoir"],
      ["drama", "literary"],
    ] as const) {
      expect(getGenreGuide(genre)?.genre, `${genre} has no guide`).toBe(expected);
    }
  });

  it("still answers null when it genuinely does not know", () => {
    expect(getGenreGuide("cookbook")).toBeNull();
    expect(getGenreGuide("")).toBeNull();
    expect(getGenreGuide(null)).toBeNull();
  });

  it("gives every guide all seven sections", () => {
    for (const guide of GENRE_GUIDES) {
      for (const field of [
        "conventions",
        "pacing",
        "characterArcs",
        "readerExpectations",
        "commonPitfalls",
        "structureNotes",
        "proseStyle",
      ] as const) {
        expect(guide[field].trim().length, `${guide.genre}.${field}`).toBeGreaterThan(80);
      }
    }
  });
});

describe("the skills an agent is given", () => {
  it("are non-empty for every agent type that exists", () => {
    const empty = getAllAgentDefinitions()
      .map((d) => d.type)
      .filter((type) => selectSkillsForAgent(type, "thriller").trim().length === 0);
    expect(empty).toEqual([]);
  });

  it("include the genre guide for the agent that judges genre fit", () => {
    const skills = selectSkillsForAgent("market-reader", "horror");
    expect(skills).toContain('<genre_guide genre="horror">');
    expect(skills).toContain("## Reader Expectations");
  });
});
