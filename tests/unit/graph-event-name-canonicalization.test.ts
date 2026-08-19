import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Sub-fix 7(a) / D-32c regression: Event-name canonicalization before MERGE.
 *
 * Root cause: the MERGE identity for every entity is the RAW `{bookId, name}`.
 * Same-batch stochastic extraction refers to one event two ways ("The Wedding"
 * vs "Wedding") and forks it into two graph nodes — both stamped the same
 * chapter, so every LEADS_TO becomes chXX→chXX and `timeline_violation` is
 * unconstructible.
 *
 * Fix (chosen shape — see fix7a-handoff.md): keep the MERGE on the RAW
 * `{bookId, name}` (so no EXISTING node forks and the first-seen display
 * spelling is preserved), and add a pre-MERGE canonical-resolution step for
 * Event nodes ONLY. An incoming Event whose canonical form matches an existing
 * Event folds onto that node's stored name, pushing its own spelling into the
 * D-27 alias union. A `canonicalName` property is stamped going forward so the
 * lookup is a single equality; legacy nodes (pre-fix, no canonicalName) are
 * still caught by the enumerated article-variant name candidates.
 *
 * SCOPE: Event only. A false-merge of two Characters is worse than of two
 * Events, and character identity is sub-fix (c)'s concern — Characters/Objects
 * must NOT canonical-fold here.
 *
 * The fake Neo4j session below mirrors real MERGE semantics (ON CREATE vs ON
 * MATCH), the alias-union clause, canonicalName coalesce, AND the pre-MERGE
 * canonical lookup (canonicalName equality OR article-variant name candidates,
 * ORDER BY firstAppearance) so same-batch read-your-writes convergence is
 * exercised for real, not masked by a substring-only emulation.
 */

type Params = Record<string, unknown>;
type NodeProps = Record<string, unknown>;

const ALIAS_UNION_CLAUSE =
  "n.aliases = coalesce(n.aliases, []) + [a IN $aliases WHERE NOT a IN coalesce(n.aliases, [])]";
const CANONICAL_COALESCE_CLAUSE =
  "n.canonicalName = coalesce(n.canonicalName, $canonicalName)";

const h = vi.hoisted(() => ({
  calls: [] as Array<{ query: string; params: Params }>,
  store: new Map<string, NodeProps>(), // key `label:bookId:name`
}));

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        h.calls.push({ query, params });

        // ── Pre-MERGE canonical-resolution lookup (sub-fix 7a) ──
        if (
          query.includes("n.canonicalName = $canonicalName") &&
          query.includes("RETURN n.name AS existingName")
        ) {
          const canonicalName = params.canonicalName as string;
          const candidates = (params.nameCandidates as string[]) ?? [];
          const matches = [...h.store.entries()]
            .filter(
              ([key, v]) =>
                key.startsWith("Event:") &&
                v.bookId === params.bookId &&
                (v.canonicalName === canonicalName ||
                  candidates.includes(v.name as string))
            )
            .map(([, v]) => v)
            .sort((a, b) => {
              // deterministic ORDER BY n.firstAppearance, n.name (nulls last)
              const fa = (a.firstAppearance as number) ?? Number.MAX_SAFE_INTEGER;
              const fb = (b.firstAppearance as number) ?? Number.MAX_SAFE_INTEGER;
              if (fa !== fb) return fa - fb;
              return String(a.name).localeCompare(String(b.name));
            });
          if (matches.length > 0) {
            const existingName = matches[0].name;
            return {
              records: [
                { get: (k: string) => (k === "existingName" ? existingName : null) },
              ],
            };
          }
          return { records: [] as unknown[] };
        }

        // ── Alias-lookup (rename detection): no match in these tests ──
        if (query.includes("RETURN n.name AS existingName LIMIT 1")) {
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
              bookId: params.bookId,
              name: params.name,
            };
          } else {
            merged = { ...existing, ...(params.updateProps as Params) };
            if (query.includes(ALIAS_UNION_CLAUSE)) {
              const ex = (existing.aliases as unknown[]) ?? [];
              const inc = (params.aliases as unknown[]) ?? [];
              merged.aliases = [...ex, ...inc.filter((a) => !ex.includes(a))];
            }
            if (query.includes(CANONICAL_COALESCE_CLAUSE)) {
              // PESSIMISTIC sequential SET semantics: coalesce reads the value
              // AS OF this clause — i.e. the value the preceding `+= $updateProps`
              // already wrote — NOT a pre-merge snapshot. Neo4j does not specify
              // snapshot semantics, so a poison canonicalName that survived into
              // $updateProps would be read back here and frozen. Modelling the
              // dangerous ordering is what makes the strip (Fable BLOCKER) a
              // genuine regression test rather than one masked by a lenient mock.
              merged.canonicalName =
                (merged.canonicalName as string) ?? params.canonicalName;
            }
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

import {
  upsertEntities,
  canonicalizeEntityName,
} from "@/lib/graph/graph-builder";
import type { ExtractionResult, GraphNodeLabel } from "@/lib/graph/types";

const mergeCalls = () =>
  h.calls.filter((c) =>
    c.query.includes("RETURN n.createdAt = n.updatedAt AS isNew")
  );
const node = (key: string): NodeProps => {
  const n = h.store.get(key);
  if (!n) throw new Error(`node ${key} not found`);
  return n;
};
const eventKeys = () =>
  [...h.store.keys()].filter((k) => k.startsWith("Event:"));

function extraction(over: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    bookId: "b1",
    entities: [],
    relationships: [],
    chapterNumber: 7,
    contentHash: "0000000000000000",
    ...over,
  };
}

const ev = (
  name: string,
  properties: Record<string, unknown> = {}
): { name: string; label: GraphNodeLabel; properties: Record<string, unknown> } => ({
  name,
  label: "Event",
  properties: { bookId: "b1", ...properties },
});

const entity = (
  name: string,
  label: GraphNodeLabel,
  properties: Record<string, unknown> = {}
): { name: string; label: GraphNodeLabel; properties: Record<string, unknown> } => ({
  name,
  label,
  properties: { bookId: "b1", ...properties },
});

beforeEach(() => {
  h.calls.length = 0;
  h.store.clear();
});

// ─── Pure canonicalizer ───────────────────────────────────────────

describe("canonicalizeEntityName — pure deterministic MATCH-key transform", () => {
  it("strips a leading definite article (case-insensitive)", () => {
    expect(canonicalizeEntityName("The Wedding")).toBe("Wedding");
    expect(canonicalizeEntityName("the wedding")).toBe("wedding");
    expect(canonicalizeEntityName("THE Wedding")).toBe("Wedding");
  });

  it("strips a leading indefinite article ('A '/'An ', case-insensitive)", () => {
    expect(canonicalizeEntityName("A Reckoning")).toBe("Reckoning");
    expect(canonicalizeEntityName("an uprising")).toBe("uprising");
    expect(canonicalizeEntityName("An Uprising")).toBe("Uprising");
  });

  it("does NOT strip an article that is merely a word prefix (no following space)", () => {
    // "Answer" starts with "an", "Theory" with "the", "Atlas" with "a" — none is
    // a leading article token, so the name is preserved verbatim.
    expect(canonicalizeEntityName("Answer")).toBe("Answer");
    expect(canonicalizeEntityName("Theory")).toBe("Theory");
    expect(canonicalizeEntityName("Atlas")).toBe("Atlas");
  });

  it("keeps a one-word title that IS an article (empty-remainder guard)", () => {
    expect(canonicalizeEntityName("The")).toBe("The");
    expect(canonicalizeEntityName("A")).toBe("A");
    // "The The" strips ONE article, leaving a non-empty remainder
    expect(canonicalizeEntityName("The The")).toBe("The");
  });

  it("collapses internal whitespace runs and trims", () => {
    expect(canonicalizeEntityName("  The   Grand   Ball  ")).toBe("Grand Ball");
    expect(canonicalizeEntityName("Battle\tof\nEmberfall")).toBe("Battle of Emberfall");
  });

  it("normalizes Unicode to NFC so combining and precomposed forms converge", () => {
    const decomposed = "The Café Meeting"; // e + combining acute
    const precomposed = "The Café Meeting"; // é
    expect(canonicalizeEntityName(decomposed)).toBe(
      canonicalizeEntityName(precomposed)
    );
    expect(canonicalizeEntityName(decomposed)).toBe("Café Meeting");
  });

  it("is idempotent: canonicalize(canonicalize(x)) === canonicalize(x)", () => {
    for (const raw of ["The Wedding", "an uprising", "  A  Vow  ", "The The", "Plain"]) {
      const once = canonicalizeEntityName(raw);
      expect(canonicalizeEntityName(once)).toBe(once);
    }
  });

  it("returns '' for non-string input (never throws)", () => {
    expect(canonicalizeEntityName(undefined)).toBe("");
    expect(canonicalizeEntityName(null)).toBe("");
    expect(canonicalizeEntityName(42)).toBe("");
  });
});

// ─── Same-batch determinism proof (#1) ────────────────────────────

describe("Event canonicalization: same-batch article/spelling variants MERGE to ONE node", () => {
  it("(a1) 'The Wedding' + 'Wedding' in the SAME extraction batch → exactly ONE Event node", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [ev("The Wedding"), ev("Wedding")],
      })
    );
    expect(eventKeys()).toEqual(["Event:b1:The Wedding"]);
    // the second spelling was folded in as an alias — no prose/spelling lost
    const n = node("Event:b1:The Wedding");
    expect(n.aliases).toEqual(["Wedding"]);
  });

  it("(a1') the reverse order also converges (first-seen spelling wins as display name)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [ev("Wedding"), ev("The Wedding")],
      })
    );
    expect(eventKeys()).toEqual(["Event:b1:Wedding"]);
    expect(node("Event:b1:Wedding").aliases).toEqual(["The Wedding"]);
  });

  it("(a2) three variants (article + whitespace + NFC) in one batch collapse to ONE node", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 2,
        entities: [
          ev("The Café Vigil"),
          ev("Café  Vigil"),
          ev("The Café Vigil"), // decomposed é
        ],
      })
    );
    expect(eventKeys()).toEqual(["Event:b1:The Café Vigil"]);
  });
});

// ─── Across-batch convergence ─────────────────────────────────────

describe("Event canonicalization: across-batch variants fold onto the existing node", () => {
  it("(a3) an existing 'Wedding' + a later 'The Wedding' scan → ONE node, variant aliased", async () => {
    await upsertEntities(extraction({ chapterNumber: 2, entities: [ev("Wedding")] }));
    await upsertEntities(extraction({ chapterNumber: 9, entities: [ev("The Wedding")] }));
    expect(eventKeys()).toEqual(["Event:b1:Wedding"]);
    expect(node("Event:b1:Wedding").aliases).toEqual(["The Wedding"]);
  });

  it("(a4) a re-scan of the IDENTICAL spelling does not spuriously self-alias", async () => {
    await upsertEntities(extraction({ chapterNumber: 2, entities: [ev("The Wedding")] }));
    await upsertEntities(extraction({ chapterNumber: 9, entities: [ev("The Wedding")] }));
    expect(eventKeys()).toEqual(["Event:b1:The Wedding"]);
    expect(node("Event:b1:The Wedding").aliases).toBeUndefined();
  });

  it("(a5/legacy bridge) a legacy Event WITHOUT canonicalName is still caught via article-variant name candidates", async () => {
    // Seed a pre-fix node directly: created before canonicalName existed.
    h.store.set("Event:b1:Wedding", {
      bookId: "b1",
      name: "Wedding",
      chapter: 2,
      firstAppearance: 2,
    });
    await upsertEntities(extraction({ chapterNumber: 9, entities: [ev("The Wedding")] }));
    expect(eventKeys()).toEqual(["Event:b1:Wedding"]);
    expect(node("Event:b1:Wedding").aliases).toEqual(["The Wedding"]);
  });
});

// ─── False-merge guard (the D8 hazard) ────────────────────────────

describe("Event canonicalization: genuinely distinct events must NOT collide", () => {
  it("(a6) 'The Wedding' and 'The Funeral' (different canonical) stay TWO nodes — same batch", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [ev("The Wedding"), ev("The Funeral")],
      })
    );
    expect(eventKeys().sort()).toEqual([
      "Event:b1:The Funeral",
      "Event:b1:The Wedding",
    ]);
  });

  it("(a6') distinct events differing only past the article do not fold ('The Red Vow' vs 'The Blood Vow')", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [ev("The Red Vow"), ev("The Blood Vow")],
      })
    );
    expect(eventKeys().length).toBe(2);
  });

  it("(a6'') article-only difference of the SAME name is treated as the SAME event (spec-accepted for Events)", async () => {
    // "The Wedding" in ch2 and "The Wedding" in ch40 are the same NAME → same
    // node; canonicalization does not over-disambiguate (sub-fix c's concern).
    await upsertEntities(extraction({ chapterNumber: 2, entities: [ev("The Wedding")] }));
    await upsertEntities(extraction({ chapterNumber: 40, entities: [ev("Wedding")] }));
    expect(eventKeys()).toEqual(["Event:b1:The Wedding"]);
  });
});

// ─── Display fidelity + stored shape ──────────────────────────────

describe("Event canonicalization: stored shape preserves display fidelity", () => {
  it("(a7) canonicalName is stamped on ON CREATE and kept OUT of the blanket += update map", async () => {
    await upsertEntities(extraction({ chapterNumber: 3, entities: [ev("The Reckoning")] }));
    const merge = mergeCalls()[0];
    const createProps = merge.params.createProps as Params;
    const updateProps = merge.params.updateProps as Params;
    expect(createProps.canonicalName).toBe("Reckoning");
    expect(updateProps.canonicalName).toBeUndefined(); // stable, coalesced on match
    expect(merge.query).toContain(CANONICAL_COALESCE_CLAUSE);
    // the STORED display name keeps the original spelling
    expect(node("Event:b1:The Reckoning").name).toBe("The Reckoning");
    expect(node("Event:b1:The Reckoning").canonicalName).toBe("Reckoning");
  });

  it("(a8) the folded node keeps the FIRST-SEEN spelling as name and every variant as an alias (no spelling lost)", async () => {
    await upsertEntities(extraction({ chapterNumber: 1, entities: [ev("The Grand Ball")] }));
    await upsertEntities(extraction({ chapterNumber: 5, entities: [ev("Grand Ball")] }));
    const n = node("Event:b1:The Grand Ball");
    expect(n.name).toBe("The Grand Ball"); // first-seen display spelling
    expect(n.aliases).toEqual(["Grand Ball"]); // variant retained
  });
});

// ─── Injection boundary ───────────────────────────────────────────

describe("Event canonicalization: injection boundary intact", () => {
  it("(a9) canonical values ride as Cypher params; the label stays escaped and the MERGE key is parameterized", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [ev('Wedding"}) DETACH DELETE n //')],
      })
    );
    const merge = mergeCalls()[0];
    expect(merge.query).toContain("MERGE (n:Event {bookId: $bookId, name: $name})");
    expect(merge.query).not.toContain("DETACH DELETE");
    expect(merge.query).toContain("$canonicalName");
    // the malicious string is a param value, never interpolated
    expect((merge.params.createProps as Params).canonicalName).toBe(
      'Wedding"}) DETACH DELETE n //'
    );
    // the canonical lookup also parameterizes its values
    const lookup = h.calls.find(
      (c) =>
        c.query.includes("n.canonicalName = $canonicalName") &&
        c.query.includes("RETURN n.name AS existingName")
    );
    expect(lookup).toBeDefined();
    expect(lookup!.query).toContain("MATCH (n:Event {bookId: $bookId})");
    expect(lookup!.query).not.toContain("DETACH DELETE");
  });
});

// ─── Event-scope only: Characters/Objects must NOT canonical-fold ─

describe("Event canonicalization is Event-SCOPED (does not touch Character/Object identity)", () => {
  it("(a10) two Character variants ('The Prophet' vs 'Prophet') stay TWO nodes — no canonical fold for Characters", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [
          entity("The Prophet", "Character", { status: "alive" }),
          entity("Prophet", "Character", { status: "alive" }),
        ],
      })
    );
    const charKeys = [...h.store.keys()].filter((k) => k.startsWith("Character:"));
    expect(charKeys.sort()).toEqual([
      "Character:b1:Prophet",
      "Character:b1:The Prophet",
    ]);
    // and no canonical lookup was ever issued for a Character
    const charLookup = h.calls.find(
      (c) =>
        c.query.includes("n.canonicalName = $canonicalName") &&
        c.query.includes("MATCH (n:Character")
    );
    expect(charLookup).toBeUndefined();
  });

  it("(a10') a Character never has canonicalName stamped (property is Event-only)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [entity("Corvin", "Character", { status: "dead" })],
      })
    );
    const createProps = mergeCalls()[0].params.createProps as Params;
    expect("canonicalName" in createProps).toBe(false);
    expect(node("Character:b1:Corvin").canonicalName).toBeUndefined();
  });

  it("(a11) two Object variants ('The Sword' vs 'Sword') stay TWO nodes", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [
          entity("The Sword", "Object", { status: "intact" }),
          entity("Sword", "Object", { status: "intact" }),
        ],
      })
    );
    const objKeys = [...h.store.keys()].filter((k) => k.startsWith("Object:"));
    expect(objKeys.length).toBe(2);
  });
});

// ─── Canonical-key poisoning guard (Fable BLOCKER) ────────────────
// canonicalName is identity-load-bearing: the pre-MERGE lookup folds on
// `n.canonicalName = $canonicalName`. The extraction `properties` are
// unconstrained LLM output (record_narrative_graph / UpdateGraphEntity open
// object; agents SEE canonicalName on QueryGraph results, so a round-trip echo
// is realistic). An LLM-supplied properties.canonicalName MUST NOT reach the
// node — otherwise a poisoned key deterministically false-merges a genuinely
// distinct Event. Like bookId (D-30) and userId (RC-6), the app-derived value
// must be the ONLY writer: stripped from allProps/$updateProps.

describe("Event canonicalization: LLM-supplied canonicalName is stripped (no key poisoning)", () => {
  it("(a12) properties.canonicalName never reaches $updateProps or $createProps (app-derived value is the only writer)", async () => {
    await upsertEntities(
      extraction({
        chapterNumber: 4,
        entities: [ev("The Funeral", { canonicalName: "Wedding" })], // poison
      })
    );
    const merge = mergeCalls()[0];
    const createProps = merge.params.createProps as Params;
    const updateProps = merge.params.updateProps as Params;
    // the blanket += map must NOT carry the poison
    expect(updateProps.canonicalName).toBeUndefined();
    // ON CREATE carries the app-derived value, NOT the poison
    expect(createProps.canonicalName).toBe("Funeral");
    expect(node("Event:b1:The Funeral").canonicalName).toBe("Funeral");
  });

  it("(a13) an ON MATCH re-scan carrying a poison properties.canonicalName cannot repoint the stored key", async () => {
    await upsertEntities(
      extraction({ chapterNumber: 2, entities: [ev("The Funeral")] })
    ); // CREATE → canonicalName "Funeral"
    await upsertEntities(
      extraction({
        chapterNumber: 6,
        entities: [ev("The Funeral", { canonicalName: "Wedding" })], // poison on MATCH
      })
    );
    // stored key stays the app-derived "Funeral" (poison never applied)
    expect(node("Event:b1:The Funeral").canonicalName).toBe("Funeral");
    // and the poison is absent from the second scan's blanket update map
    const secondMerge = mergeCalls()[1];
    expect((secondMerge.params.updateProps as Params).canonicalName).toBeUndefined();
  });

  it("(a14) a poisoned canonicalName cannot make a DISTINCT event fold — 'Funeral' stays its own node", async () => {
    // ch2: a real "Wedding" event.
    await upsertEntities(
      extraction({ chapterNumber: 2, entities: [ev("Wedding")] })
    );
    // ch6: a genuinely distinct "The Funeral" whose LLM output smuggles
    // canonicalName:"Wedding" trying to alias itself onto Wedding.
    await upsertEntities(
      extraction({
        chapterNumber: 6,
        entities: [ev("The Funeral", { canonicalName: "Wedding" })],
      })
    );
    // Two distinct nodes — the poison did not fold Funeral onto Wedding.
    expect(eventKeys().sort()).toEqual(["Event:b1:The Funeral", "Event:b1:Wedding"]);
    expect(node("Event:b1:Wedding").aliases).toBeUndefined();
    // ch10: a later real "Funeral" still converges onto the app-derived key.
    await upsertEntities(
      extraction({ chapterNumber: 10, entities: [ev("Funeral")] })
    );
    expect(node("Event:b1:The Funeral").aliases).toEqual(["Funeral"]);
  });
});
