import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * D-27 regression: in the exact-name MERGE/upsert path, an entity's `aliases`
 * array was destructively REPLACED with the new extraction's aliases instead of
 * UNIONed with the existing set. Repro (P3 Selena): "Zoë Rasmussen" had aliases
 * ["Zoë","Zoe"]; a later chapter that emitted only ["Zoe"] overwrote it, dropping
 * the diacritic variant and degrading future alias-matching for "Zoë".
 *
 * Fix: aliases are unioned (existing ∪ new, deduped, all variants preserved) —
 * seeded on ON CREATE, appended on ON MATCH via
 *   n.aliases = coalesce(n.aliases, []) + [a IN $aliases WHERE NOT a IN coalesce(n.aliases, [])]
 * and kept out of the `+= $updateProps` map (which would overwrite the array).
 *
 * The fake Neo4j session mirrors real MERGE semantics (ON CREATE vs ON MATCH)
 * and emulates that one alias-union Cypher expression so create-then-match is
 * exercised for real.
 */

type Params = Record<string, unknown>;

const h = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  lastQuery: "" as string,
  lastCreateProps: {} as Params,
  lastUpdateProps: {} as Params,
}));

const ALIAS_UNION_CLAUSE =
  "n.aliases = coalesce(n.aliases, []) + [a IN $aliases WHERE NOT a IN coalesce(n.aliases, [])]";

vi.mock("@/lib/graph/neo4j-client", () => ({
  withSession: async (
    _mode: string,
    fn: (session: unknown) => Promise<unknown>
  ): Promise<unknown> => {
    const session = {
      run: async (query: string, params: Params = {}) => {
        const merge = query.match(/MERGE \(n:(\w+) \{bookId: \$bookId, name: \$name\}\)/);
        if (merge && query.includes("RETURN n.createdAt = n.updatedAt AS isNew")) {
          h.lastQuery = query;
          h.lastCreateProps = (params.createProps as Params) ?? {};
          h.lastUpdateProps = (params.updateProps as Params) ?? {};
          const key = `${merge[1]}:${String(params.bookId)}:${String(params.name)}`;
          const existing = h.store.get(key);
          let merged: Record<string, unknown>;
          if (!existing) {
            merged = { ...(params.createProps as Params), firstAppearance: params.chapter };
          } else {
            merged = { ...existing, ...(params.updateProps as Params) };
            if (query.includes(ALIAS_UNION_CLAUSE)) {
              const existingAliases = (existing.aliases as unknown[]) ?? [];
              const incoming = (params.aliases as unknown[]) ?? [];
              merged.aliases = [
                ...existingAliases,
                ...incoming.filter((a) => !existingAliases.includes(a)),
              ];
            }
          }
          h.store.set(key, merged);
          return { records: [{ get: (k: string) => (k === "isNew" ? !existing : null) }] };
        }
        return { records: [] as unknown[] };
      },
    };
    return fn(session);
  },
}));

import { upsertEntities } from "@/lib/graph/graph-builder";
import type { ExtractionResult } from "@/lib/graph/types";

const node = (key: string): Params => h.store.get(key) as Params;

function upsertCharacter(name: string, aliases: string[], chapterNumber: number) {
  const result: ExtractionResult = {
    bookId: "b1",
    entities: [
      {
        name,
        label: "Character",
        properties: { bookId: "b1", status: "alive", role: "supporting" },
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
  h.store.clear();
  h.lastQuery = "";
  h.lastCreateProps = {};
  h.lastUpdateProps = {};
});

describe("entity alias array is UNIONed, not overwritten (D-27)", () => {
  it("preserves the existing diacritic variant when a later chapter emits a subset", async () => {
    await upsertCharacter("Zoë Rasmussen", ["Zoë", "Zoe"], 1); // CREATE
    await upsertCharacter("Zoë Rasmussen", ["Zoe"], 4); // MATCH — must NOT drop "Zoë"
    const aliases = node("Character:b1:Zoë Rasmussen").aliases as string[];
    expect([...aliases].sort()).toEqual(["Zoe", "Zoë"]); // order-insensitive union
  });

  it("adds genuinely new aliases while keeping all prior variants (deduped union)", async () => {
    await upsertCharacter("Zoë Rasmussen", ["Zoë", "Zoe"], 1);
    await upsertCharacter("Zoë Rasmussen", ["Zoe", "Zo"], 5); // "Zoe" dup, "Zo" new
    const aliases = node("Character:b1:Zoë Rasmussen").aliases as string[];
    expect([...aliases].sort()).toEqual(["Zo", "Zoe", "Zoë"]);
    // deduped: "Zoe" appears exactly once
    expect(aliases.filter((a) => a === "Zoe")).toHaveLength(1);
  });

  it("seeds aliases on ON CREATE (createProps), and keeps them OUT of the += update map so ON MATCH cannot overwrite", async () => {
    await upsertCharacter("Zoë Rasmussen", ["Zoë", "Zoe"], 1);
    expect(h.lastCreateProps.aliases).toEqual(["Zoë", "Zoe"]);
    expect(h.lastUpdateProps.aliases).toBeUndefined();
    expect(h.lastQuery).toContain(ALIAS_UNION_CLAUSE);
  });

  it("does not emit the alias-union clause for an entity with no aliases", async () => {
    await upsertCharacter("Anon", [], 1);
    expect(h.lastQuery).not.toContain("n.aliases = coalesce(n.aliases");
    expect(h.lastCreateProps.aliases).toBeUndefined();
  });
});
