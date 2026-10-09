import { describe, it, expect } from "vitest";
import { joinEdge, splitEdge } from "@/lib/structure/chapter-edges";

/**
 * Dev editor v2, phase C — a hook move rewrites only a chapter's opening or
 * its ending. Everything outside that edge must come back byte-identical.
 */

const para = (label: string, n = 3) => Array.from({ length: n }, (_, i) => `${label} rečenica ${i}.`).join(" ");

const scenes = [
  "# Poglavlje 7: Kuća",
  "",
  para("Prvi"),
  "",
  para("Drugi"),
  "",
  "◆",
  "",
  para("Sredina"),
  "",
  "◆",
  "",
  para("Pretposlednji"),
  "",
  para("Poslednji"),
].join("\n");

describe("splitEdge on a chapter with scenes", () => {
  it("takes the first scene as the opening, keeping the heading outside it", () => {
    const e = splitEdge(scenes, "opening");
    expect(e.segment).toContain("Prvi rečenica 0.");
    expect(e.segment).toContain("Drugi rečenica 2.");
    expect(e.segment).not.toContain("Sredina");
    expect(e.segment).not.toContain("# Poglavlje");
    expect(e.before).toContain("# Poglavlje 7");
  });

  it("takes the last scene as the ending", () => {
    const e = splitEdge(scenes, "ending");
    expect(e.segment).toContain("Pretposlednji");
    expect(e.segment).toContain("Poslednji rečenica 2.");
    expect(e.segment).not.toContain("Sredina");
  });

  it("puts the chapter back together byte for byte", () => {
    for (const scope of ["opening", "ending"] as const) {
      const e = splitEdge(scenes, scope);
      expect(joinEdge(e, e.segment)).toBe(scenes);
    }
  });

  it("replaces only the edge", () => {
    const e = splitEdge(scenes, "ending");
    const out = joinEdge(e, "Novi kraj.");
    expect(out).toContain("Sredina rečenica 0.");
    expect(out).toContain("Prvi rečenica 0.");
    expect(out.trimEnd().endsWith("Novi kraj.")).toBe(true);
    expect(out).not.toContain("Poslednji rečenica");
  });
});

describe("review fixes", () => {
  const NL = "\n";
  const long = (label: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${label}${i} ${"reč ".repeat(20).trim()}.`).join(NL + NL);

  it("skips a dateline or epigraph before the first break", () => {
    const text = ["Pariz, 1943.", "", "◆", "", long("Prvi", 3), "", "◆", "", long("Drugi", 3)].join(NL);
    const e = splitEdge(text, "opening");
    expect(e.segment).toContain("Prvi0");
    expect(e.segment).not.toContain("Pariz");
    expect(joinEdge(e, e.segment)).toBe(text);
  });

  it("caps a long first scene at a few paragraphs", () => {
    const text = [long("A", 12), "", "◆", "", long("B", 3)].join(NL);
    const e = splitEdge(text, "opening");
    expect(e.segment).toContain("A0");
    expect(e.segment).not.toContain("A8");
  });

  it("keeps a heading glued to the first paragraph out of the edge", () => {
    const text = "# Poglavlje 3" + NL + long("P", 6);
    const e = splitEdge(text, "opening");
    expect(e.segment).not.toContain("# Poglavlje");
    expect(e.before).toContain("# Poglavlje 3");
    expect(joinEdge(e, e.segment)).toBe(text);
  });

  it("writes the rewrite back in the chapter's own line endings", () => {
    const CRLF = "\r\n";
    const text = ["Uvod.", "", "◆", "", long("K", 3).split(NL).join(CRLF)].join(CRLF);
    const e = splitEdge(text, "ending");
    const out = joinEdge(e, "Novi kraj." + NL + NL + "Drugi pasus.");
    expect(out.replace(/\r\n/g, "").includes(NL)).toBe(false);
  });
});

describe("splitEdge on a single-scene chapter", () => {
  const single = Array.from({ length: 10 }, (_, i) => para(`P${i}`)).join("\n\n");

  it("takes the first few paragraphs as the opening", () => {
    const e = splitEdge(single, "opening");
    expect(e.segment).toContain("P0 rečenica");
    expect(e.segment).toContain("P1 rečenica");
    expect(e.segment).not.toContain("P5 rečenica");
    expect(joinEdge(e, e.segment)).toBe(single);
  });

  it("takes the last few paragraphs as the ending", () => {
    const e = splitEdge(single, "ending");
    expect(e.segment).toContain("P9 rečenica");
    expect(e.segment).not.toContain("P4 rečenica");
    expect(joinEdge(e, e.segment)).toBe(single);
  });
});
