# D-63 — Cypher injection via unsanitized relationship type (CRITICAL)

**Severity:** CRITICAL (cross-tenant graph destruction) · **Class:** security / injection
**Found:** 2026-07-19, W-D root-cause workflow (RC-1), confirmed in source by team-lead.
**Status:** OPEN → dispatched to opus-fix-sec.

## Chain (all confirmed in working tree)
1. `src/lib/agents/tools.ts:606` — `UpdateGraphEntity` tool input schema declares relationship `type` as a **free string** (`{ type: "string", description: "Relationship type (e.g. KNOWS, ALLIED_WITH)" }`). No `enum` (contrast entity `type`, :580-588, which is enum-constrained). JSON-schema enum is only an LLM hint anyway — not runtime-enforced.
2. `src/lib/agents/tools.ts:1524` — `type: r.type as RelationshipType` is a compile-time cast (no-op at runtime). No allowlist parse.
3. `src/lib/graph/graph-builder.ts:272` — `MERGE (a)-[r:${type}]->(b)` interpolates `type` **raw** into Cypher. Node labels on :270-271 pass through `escapeLabelForQuery()` (strips `[^a-zA-Z0-9_]`); relationship `type` has **no** equivalent.

## Impact
`type` is fully LLM-controlled. Ghostwriter/series agents read untrusted manuscript prose → indirect prompt injection can steer the model to emit a crafted `type`. Example payload:
```
KNOWS]->(b) WITH a MATCH (n) DETACH DELETE n //
```
Resulting query MATCHes are book-scoped by `$bookId`, but the injected tail runs unscoped → `DETACH DELETE n` wipes every node across **all tenants'** graphs. Also a plain reliability bug: any hallucinated `type` containing a space/bracket breaks the query (silent extraction failure, ties to RC-3/RC-4).

## Fix invariant (for executor)
- Relationship type must be a deterministic allowlist/sanitize at the **graph-builder boundary** (defense-in-depth, mirroring `escapeLabelForQuery`), NOT only at the tool layer. Neo4j rel types: `[A-Za-z0-9_]`, must not be empty.
- Add runtime validation (map to known `RelationshipType`, else sanitize to `[A-Z0-9_]` uppercased, empty → safe fallback e.g. `RELATED_TO`).
- Constrain the tool schema `type` to the known set (or document why free-form is needed) so the model is guided too.
- Apply the same audit to any other raw-interpolated identifier in graph-builder / graph-queries (grep `:${` and `[r:${`).
- Regression test with the injection payload above: assert no unscoped delete, sanitized type persisted.
