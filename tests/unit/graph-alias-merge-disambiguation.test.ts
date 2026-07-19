import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Sub-fix 7(c) / D-27-adjacent regression: alias-merge disambiguation.
 *
 * Root cause: the pre-MERGE identity-resolution path folded an incoming entity
 * onto an existing node whenever they shared ANY alias, picking `LIMIT 1`. Two
 * DISTINCT characters that merely share a common title/first-name ("Doctor",
 * "Captain") therefore collapsed into one node — a D8 false-positive that
 * silently LOSES a character — and an over-eager `LIMIT 1` picked an arbitrary
 * node when several matched.
 *
 * Fix (chosen shape — see fix7c-handoff.md): bind via alias ONLY when the match
 * is UNAMBIGUOUS —
 *   (1) exactly ONE candidate node under a different spelling (≥2 → DO NOTHING,
 *       create/keep separate rather than guess), AND
 *   (2) at least one DISTINCTIVE (non-common/stop) token links us to it (a bare
 *       title/first-name never anchors a fold on its own).
 * Preserve/do-nothing is always preferred over a false fold. The D-27 alias
 * UNION is preserved on the fold path (it only APPENDS — no existing diacritic
 * variant is ever dropped).
 *
 * The fake Neo4j session below is STORE-DRIVEN: the alias-rename lookup returns
 * the real matching candidates from the store (ordered by firstAppearance) and
 * the fold SET unions aliases for real, so the RED→GREEN difference is purely in
 * graph-builder's decision logic, not in a lenient mock.
 */

type Params = Record<string, unknown>;
type NodeProps = Record<string, unknown> & { bookId: string; name: string };

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  store: new Map<string, NodeProps>(), // key `label:bookId:name`
}));

function byFirstAppearanceThenName(a: NodeProps, b: NodeProps): number {
  const fa = (a.firstAppearance as number) ?? Number.MAX_SAFE_INTEGER;
  const fb = (b.firstAppearance as number) ?? Number.MAX_SAFE_INTEGER;
  if (fa !== fb) return fa - fb;
  return String(a.name).localeCompare(String(b.name));
}

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });

        // ── Canonical Event lookup (sub-fix 7a) — Event-only; not exercised by
        //    these Character tests, but kept faithful. ──
        if (
          query.includes("n.canonicalName = $canonicalName") &&
          query.includes("RETURN n.name AS existingName")
        ) {
          const canonicalName = params.canonicalName as string;
          const candidates = (params.nameCandidates as string[]) ?? [];
          const matches = [...h.store.values()]
            .filter(
              (v) =>
                String(v.name).length >= 0 &&
                (v as NodeProps).bookId === params.bookId &&
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ((v as any).canonicalName === canonicalName ||
                  candidates.includes(v.name))
            )
            .filter((_v) => true);
          if (matches.length > 0) {
            const sorted = matches.sort(byFirstAppearanceThenName);
            const existingName = sorted[0].name;
            return {
              records: [
                { get: (k: string) => (k === "existingName" ? existingName : null) },
              ],
            };
          }
          return { records: [] as unknown[] };
        }

        // ── Alias-rename lookup (sub-fix 7c). Detected by the WHERE clause
        //    unique to it; returns ALL matching candidates from the store. ──
        if (query.includes("WHERE n.name IN $aliases")) {
          const label = query.match(/MATCH \(n:(\w+)/)?.[1] ?? "";
          const aliases = (params.aliases as string[]) ?? [];
          const matches = [...h.store.entries()]
            .filter(([key, v]) => {
              if (!key.startsWith(`${label}:`)) return false;
              if (v.bookId !== params.bookId) return false;
              const nodeAliases = (v.aliases as string[]) ?? [];
              return (
                aliases.includes(v.name) ||
                nodeAliases.some((a) => aliases.includes(a)) ||
                // HIGH fix: the lookup now also matches the incoming name itself
                // (`OR n.name = $name`) so an alias-less exact-name node is
                // returned and trips hasExactNameNode.
                v.name === params.name
              );
            })
            .map(([, v]) => v)
            .sort(byFirstAppearanceThenName);
          return {
            records: matches.map((v) => ({
              get: (k: string) =>
                k === "existingName"
                  ? v.name
                  : k === "existingAliases"
                    ? ((v.aliases as string[]) ?? [])
                    : null,
            })),
          };
        }

        // ── Fold SET (sub-fix 7c): union aliases onto the matched node. Handles
        //    both the new ($foldAliases) and legacy ($newName) fold shapes so a
        //    RED run against pre-fix code does not crash. ──
        if (query.includes("name: $existingName") && query.includes("SET n.aliases")) {
          const label = query.match(/MATCH \(n:(\w+)/)?.[1] ?? "";
          const key = `${label}:${String(params.bookId)}:${String(params.existingName)}`;
          const nodeProps = h.store.get(key);
          if (nodeProps) {
            const existingAliases = (nodeProps.aliases as string[]) ?? [];
            const incoming =
              (params.foldAliases as string[]) ??
              (params.newName !== undefined ? [params.newName as string] : []);
            nodeProps.aliases = [
              ...existingAliases,
              ...incoming.filter((a) => !existingAliases.includes(a)),
            ];
            nodeProps.lastMentioned = params.chapter as number;
            h.store.set(key, nodeProps);
            return { records: [{ get: () => null }] };
          }
          return { records: [] as unknown[] };
        }

        // ── Entity MERGE ──
        const merge = query.match(
          /MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/
        );
        if (merge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          const label = merge[1];
          const key = `${label}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.store.get(key);
          let merged: NodeProps;
          if (!existing) {
            merged = {
              ...(params.createProps as Params),
              firstAppearance: params.chapter,
              bookId: params.bookId as string,
              name: params.name as string,
            };
          } else {
            merged = { ...existing, ...(params.updateProps as Params) };
          }
          h.store.set(key, merged);
          return {
            records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }],
          };
        }

        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import { upsertEntities } from "@/lib/graph/graph-builder";
import type { ExtractionResult } from "@/lib/graph/types";

const node = (key: string): NodeProps => {
  const n = h.store.get(key);
  if (!n) throw new Error(`node ${key} not found`);
  return n;
};
const characterKeys = () =>
  [...h.store.keys()].filter((k) => k.startsWith("Character:"));

function seedCharacter(
  name: string,
  aliases: string[],
  firstAppearance: number,
  extra: Params = {}
) {
  h.store.set(`Character:b1:${name}`, {
    bookId: "b1",
    name,
    aliases,
    firstAppearance,
    ...extra,
  });
}

function upsertCharacter(
  name: string,
  aliases: string[],
  chapterNumber: number,
  props: Params = {}
) {
  const result: ExtractionResult = {
    bookId: "b1",
    entities: [
      {
        name,
        label: "Character",
        properties: { bookId: "b1", status: "alive", role: "supporting", ...props },
        aliases,
      },
    ],
    relationships: [],
    chapterNumber,
    contentHash: "0000000000000000",
  };
  return upsertEntities(result);
}

beforeEach(() => {
  h.calls.length = 0;
  h.store.clear();
});

// ─── The D8 hazard: distinct characters sharing a COMMON alias ────

describe("alias-merge disambiguation: a shared COMMON alias must NOT fold two distinct characters (c)", () => {
  it("(c1) two characters that merely share a title alias ('Doctor') stay SEPARATE nodes", async () => {
    seedCharacter("Elena Frost", ["Doctor"], 1);
    await upsertCharacter("Marcus Bright", ["Doctor"], 5);
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Elena Frost",
      "Character:b1:Marcus Bright",
    ]);
    // Elena did NOT absorb Marcus as an alias (no false fold).
    expect(node("Character:b1:Elena Frost").aliases).toEqual(["Doctor"]);
  });

  it("(c5) a name-anchored match on a COMMON title ('Doctor') still does not fold", async () => {
    // A minor character literally introduced only as the bare title "Doctor".
    seedCharacter("Doctor", [], 1);
    // A DIFFERENT character whose full name lists "Doctor" as an alias.
    await upsertCharacter("Marcus Bright", ["Doctor"], 5);
    // The title is too common to anchor a fold even as the sole candidate.
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Doctor",
      "Character:b1:Marcus Bright",
    ]);
  });
});

// ─── Ambiguity: ≥2 candidates → DO NOTHING (never guess) ──────────

describe("alias-merge disambiguation: ≥2 candidate nodes → no fold (c)", () => {
  it("(c2) when a DISTINCTIVE alias is (suspiciously) shared by two existing nodes, the incoming entity stays separate", async () => {
    seedCharacter("Elena Frost", ["Ghost-9843"], 1);
    seedCharacter("Nadia Cole", ["Ghost-9843"], 2);
    await upsertCharacter("Marcus Bright", ["Ghost-9843"], 5);
    // Two candidates → ambiguous → create/keep separate rather than guess.
    expect(characterKeys().length).toBe(3);
  });

  it("(c6) the alias-rename lookup no longer caps at LIMIT 1 and returns existingAliases for the count/strength guards", async () => {
    seedCharacter("Elena Frost", ["Ghost-9843"], 1);
    seedCharacter("Nadia Cole", ["Ghost-9843"], 2);
    await upsertCharacter("Marcus Bright", ["Ghost-9843"], 5);
    const lookup = h.calls.find((c) => c.query.includes("WHERE n.name IN $aliases"));
    expect(lookup).toBeDefined();
    expect(lookup!.query).not.toContain("LIMIT 1");
    expect(lookup!.query).toContain("existingAliases");
  });
});

// ─── D-27 preservation + genuine rename still binds ───────────────

describe("alias-merge disambiguation: genuine renames still bind; no variant lost (c)", () => {
  it("(c3) folding a distinctive shared-alias match NEVER drops an existing diacritic variant (D-27 union preserved)", async () => {
    // Existing node stored under the diacritic spelling, both variants aliased.
    seedCharacter("Zoë Rasmussen", ["Zoë", "Zoe"], 1);
    // A later chapter emits a fuller/other name with only a SUBSET alias.
    await upsertCharacter("Z. Rasmussen", ["Zoë"], 6);
    // Exactly one node (folded, no duplicate) and every variant survives.
    expect(characterKeys()).toEqual(["Character:b1:Zoë Rasmussen"]);
    const aliases = node("Character:b1:Zoë Rasmussen").aliases as string[];
    expect([...aliases].sort()).toEqual(["Z. Rasmussen", "Zoe", "Zoë"]);
  });

  it("(c4) a genuine name-anchored rename (existing NAME is our alias) still binds — no duplicate node", async () => {
    // A character introduced by a distinctive single name in ch1.
    seedCharacter("Corvin", [], 1);
    // ch5 reveals the full name, listing "Corvin" as an alias.
    const stats = await upsertCharacter("Corvin Ashe", ["Corvin"], 5);
    expect(characterKeys()).toEqual(["Character:b1:Corvin"]);
    expect(node("Character:b1:Corvin").aliases).toEqual(["Corvin Ashe"]);
    expect(stats.nodesCreated).toBe(0);
    expect(stats.nodesUpdated).toBe(1);
  });
});

// ─── Injection boundary ───────────────────────────────────────────

describe("alias-merge disambiguation: injection boundary intact (c)", () => {
  it("(c7) alias values ride as Cypher params; the label stays escaped and the book is bound", async () => {
    await upsertCharacter('Bob"}) DETACH DELETE n //', ["X"], 5);
    const lookup = h.calls.find((c) => c.query.includes("WHERE n.name IN $aliases"));
    expect(lookup).toBeDefined();
    expect(lookup!.query).toContain("MATCH (n:Character {bookId: $bookId})");
    expect(lookup!.query).not.toContain("DETACH DELETE");
    expect(lookup!.params.aliases).toEqual(["X"]);
  });
});

// ─── Fable c-fold-safety (CRITICAL): a shared DISTINCTIVE-LOOKING but actually
//     COMMON descriptor — surname, first name, epithet, rank/honorific — is a
//     WEAK identity signal (family/coincidence, not a rename) and must NEVER fold
//     two distinct characters. Each of these has EXACTLY ONE candidate, so the
//     ≥2-count guard cannot help; the fold must decline on the token's nature. ──

describe("alias-merge disambiguation: a shared surname/first-name/epithet/rank never false-folds (c, Fable-hardening)", () => {
  it("(c8) two siblings sharing a SURNAME alias ('Reynolds') stay SEPARATE", async () => {
    seedCharacter("Elena Reynolds", ["Reynolds"], 1);
    await upsertCharacter("Marcus Reynolds", ["Reynolds"], 5);
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Elena Reynolds",
      "Character:b1:Marcus Reynolds",
    ]);
    // Elena did NOT absorb Marcus (the surname is family evidence, not a rename).
    expect(node("Character:b1:Elena Reynolds").aliases).toEqual(["Reynolds"]);
  });

  it("(c9) two distinct characters sharing a FIRST-NAME alias ('Anna') stay SEPARATE", async () => {
    seedCharacter("Anna Kowalski", ["Anna"], 1);
    await upsertCharacter("Anna Schmidt", ["Anna"], 5);
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Anna Kowalski",
      "Character:b1:Anna Schmidt",
    ]);
    expect(node("Character:b1:Anna Kowalski").aliases).toEqual(["Anna"]);
  });

  it("(c10) two distinct characters sharing an EPITHET alias ('the Stranger') stay SEPARATE", async () => {
    seedCharacter("Aldric Vane", ["the Stranger"], 1);
    await upsertCharacter("Mira Sold", ["the Stranger"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:Aldric Vane").aliases).toEqual(["the Stranger"]);
  });

  it("(c11) two distinct characters sharing a RANK alias ('Sheriff') stay SEPARATE", async () => {
    seedCharacter("Tom Baxter", ["Sheriff"], 1);
    await upsertCharacter("Bill Hane", ["Sheriff"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:Tom Baxter").aliases).toEqual(["Sheriff"]);
  });

  it("(c12) a non-English honorific alias ('Señor') shared by two distinct characters stays SEPARATE", async () => {
    seedCharacter("Diego Marquez", ["Señor"], 1);
    await upsertCharacter("Rafael Ortiz", ["Señor"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:Diego Marquez").aliases).toEqual(["Señor"]);
  });
});

// ─── Exact-name node protection (HIGH): a pre-existing node whose stored NAME
//     equals the incoming name must trip hasExactNameNode even when its stored
//     aliases do NOT intersect the incoming aliases — otherwise the MERGE's own
//     node gets redirected onto a coincidental alias-sibling. ──

describe("alias-merge disambiguation: a pre-existing exact-name node is never redirected (c, HIGH)", () => {
  it("(c13) [structural] the alias-rename lookup also matches the incoming name (`OR n.name = $name`) so an alias-less exact node trips the guard", async () => {
    await upsertCharacter("Solene Vane", ["X"], 5);
    const lookup = h.calls.find((c) =>
      c.query.includes("WHERE n.name IN $aliases")
    );
    expect(lookup).toBeDefined();
    expect(lookup!.query).toContain("OR n.name = $name");
    expect(lookup!.params.name).toBe("Solene Vane");
  });

  it("(c14) an exact-name node with NO intersecting aliases self-binds, not folded onto a DISTINCTIVE alias-sibling", async () => {
    // 'Nightingale' is a distinctive codename — WITHOUT the exact-name guard the
    // incoming 'Sarah Vale' would fold onto 'Mira Cole'. But an exact 'Sarah
    // Vale' node already exists, so the MERGE must hit it directly.
    seedCharacter("Mira Cole", ["Nightingale"], 1);
    seedCharacter("Sarah Vale", [], 2);
    await upsertCharacter("Sarah Vale", ["Nightingale"], 5);
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Mira Cole",
      "Character:b1:Sarah Vale",
    ]);
    // Mira did NOT absorb Sarah.
    expect(node("Character:b1:Mira Cole").aliases).toEqual(["Nightingale"]);
  });

  it("(c15) team-lead scenario: exact 'Marcus Reynolds' (no aliases) + 'Elena Reynolds' aka 'Reynolds' + incoming 'Marcus Reynolds' aka 'Reynolds' → Marcus binds to himself", async () => {
    seedCharacter("Elena Reynolds", ["Reynolds"], 1);
    seedCharacter("Marcus Reynolds", [], 2);
    await upsertCharacter("Marcus Reynolds", ["Reynolds"], 5);
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Elena Reynolds",
      "Character:b1:Marcus Reynolds",
    ]);
    // Elena was NOT redirected-onto: her alias set is unchanged.
    expect(node("Character:b1:Elena Reynolds").aliases).toEqual(["Reynolds"]);
  });
});

// ─── Fable guard-attack (BLOCKER + 2 HIGH): the shared-name-word guard's
//     word-compare primitive must see through SURFACE FORM — hyphen compounds,
//     diacritic/apostrophe variance — and the common-title / epithet lists must
//     cover colloquial + non-English forms. Each vector below false-folds two
//     distinct characters against the surface-naive primitive. Every fix only
//     ADDS word-matches, so it can only DECLINE folds (fail-safe). ──

describe("alias-merge disambiguation: surface-form cannot defeat the shared-name-word guard (c, Fable guard-attack)", () => {
  it("(c16) a hyphen-compound SURNAME ('Reynolds-Vane' vs 'Reynolds') is one family, stays SEPARATE", async () => {
    seedCharacter("Elena Reynolds-Vane", ["Reynolds"], 1);
    await upsertCharacter("Marcus Reynolds", ["Reynolds"], 5);
    expect(characterKeys().sort()).toEqual([
      "Character:b1:Elena Reynolds-Vane",
      "Character:b1:Marcus Reynolds",
    ]);
    expect(node("Character:b1:Elena Reynolds-Vane").aliases).toEqual(["Reynolds"]);
  });

  it("(c17) a hyphen-compound FIRST-NAME ('Anne-Marie' vs 'Marie-Claire', shared alias 'Marie') stays SEPARATE", async () => {
    seedCharacter("Marie-Claire Cole", ["Marie"], 1);
    await upsertCharacter("Anne-Marie Cole", ["Marie"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:Marie-Claire Cole").aliases).toEqual(["Marie"]);
  });

  it("(c18) two distinct 'José's linked only by a diacritic-stripped alias ('Jose') stay SEPARATE", async () => {
    seedCharacter("José García", ["Jose"], 1);
    await upsertCharacter("José Herrera", ["Jose"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:José García").aliases).toEqual(["Jose"]);
  });

  it("(c19) two distinct 'O’Brien's whose names use a curly apostrophe stay SEPARATE (apostrophe unified)", async () => {
    // Names carry the curly U+2019; the shared surname alias is straight U+0027.
    seedCharacter("Sean O’Brien", ["O'Brien"], 1);
    await upsertCharacter("Maeve O’Brien", ["O'Brien"], 5);
    expect(characterKeys().length).toBe(2);
  });
});

describe("alias-merge disambiguation: colloquial + non-English titles/epithets never anchor a fold (c, Fable guard-attack)", () => {
  it("(c20) a colloquial title alias ('Doc') shared by two distinct characters stays SEPARATE", async () => {
    seedCharacter("Marcus Bright", ["Doc"], 1);
    await upsertCharacter("Elena Frost", ["Doc"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:Marcus Bright").aliases).toEqual(["Doc"]);
  });

  it("(c21) a non-English epithet alias ('El Lobo') shared by two distinct characters stays SEPARATE", async () => {
    seedCharacter("Diego Marquez", ["El Lobo"], 1);
    await upsertCharacter("Rafael Ortiz", ["El Lobo"], 5);
    expect(characterKeys().length).toBe(2);
    expect(node("Character:b1:Diego Marquez").aliases).toEqual(["El Lobo"]);
  });
});
