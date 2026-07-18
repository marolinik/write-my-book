# §Z6 Error-Hygiene Sweep — Journey Log

**Scope:** prove error responses across the API surface never leak internals and stay
envelope-consistent. Non-LLM (P1 kept the worker). Persona `user_qa_p2` for all mutating/
throwaway-row probes; `user_qa_p8` used strictly read-only (cross-tenant GET + a write-attempt
against p2's resource, expected to be denied before any creation logic runs — no row was ever
created or mutated under her account, per her "unsubscribed by design, read-only" constraint).

No `src/` edits. No server/worker restarts. No LLM/agent job enqueues. No destructive calls
against another persona's data — the one throwaway row created (a wiki entity) was created and
deleted under my own persona (`user_qa_p2`).

## Method

Built a CommonJS Node harness (`z6_harness.js`, scratchpad) hitting the live dev server directly
via `fetch` with the standard e2e-persona headers (`x-e2e-test-secret` + `x-e2e-clerk-id`). 86
probes across all 14 required families: books, chapters, content, documents, findings/discuss,
series, batch, memory, style/lenses, settings, billing, export, wiki, health, plus character-chat
and feedback (Z6/Z7 pre-known targets) and 7 cross-cutting special probes (deep nesting, unicode
round-trip, null-vs-missing, unknown-route 404 shape, Content-Type variants, D-01 regression
spot-check on a different route) and 2 cross-persona (p8) spot-checks.

Each probe recorded: HTTP status, whether the body parsed as JSON with an `error` field
("envelope-consistency"), a 400-char body preview, and a **leak scan** — an 11-pattern regex
sweep for JS stack frames, `node_modules` paths, raw Prisma error classes/codes, raw SQL
fragments, absolute filesystem paths, env-var name+value pairs, raw secret-shaped tokens
(`sk-ant-`, `whsec_`, etc.), raw `TypeError`/`ReferenceError`, unmapped `SyntaxError`, and
internal host:port strings — run against the **full** response body, not just the preview.

For the two real findings (see `defects.md`) I went further than the scripted sweep: created a
real throwaway row under my own persona to prove the wiki crash isn't limited to the
pre-ownership-check path, and re-tested the legacy style/lenses catch-all with a live server
response rather than inferring from source alone.

## Self-correction discipline

Four of the initial sweep's "interesting" results turned out to be **harness bugs**, not
product defects, and were caught before filing anything (full detail + fixed re-runs in
`defects.md`'s "Confirmed clean" section and `api-traces/self-corrections.txt`):

1. `chapters/reorder` probes used `POST`; the route only exports `PATCH` → 405s were a wrong-verb
   mistake, not a product gap. Re-ran with `PATCH` — clean 400/404 envelopes.
2. `settings/default-model` probe sent `{modelId: ...}` instead of the schema's `{defaultModel:
   ...}` key; Zod silently strips unknown keys, so the "200 on an invalid id" was a no-op, not a
   missing validation. Re-ran with the right key — clean 400, registry validation confirmed
   working.
3. `export/config` probe sent a top-level `{isbn: ...}` instead of the schema's nested
   `{metadata: {isbn: ...}}` shape — same no-op-via-unknown-key-stripping issue. Re-ran nested —
   clean 400 ZodError. (Surfaced an unrelated, out-of-scope API-contract note: the route's
   "partial merge" is only a shallow partial, so a lone `metadata.isbn` update still requires
   every metadata sibling field. Not filed as a Z6 defect — noted for the route owner.)
4. The sweep's only leak-scan hit (`XCUT-04`, unknown-route 404) matched `node_modules[\\/]`
   against Turbopack's own dev-mode bundle chunk filenames in the framework's 404 HTML page —
   confirmed via full-body inspection (not just the 400-char preview). Publicly-served,
   intentional asset naming, not a path disclosure. False positive, same class as the W6
   proration false-positive from the prior task.

## What held up

- **Zod-backed routes are uniformly clean.** Every route using the standard `bodySchema.parse()`
  → `try/catch` → `ZodError → 400` pattern (books, chapters, content, documents, discuss, series,
  batch, memory-create, style-legacy missing-field checks, settings/api-keys, settings/language,
  billing/checkout, export/format) returned a consistent `{"error": ..., "details"?: ...}`
  envelope with the correct 4xx class, human-readable Zod messages, and zero leak-scan hits —
  across missing fields, wrong types, negative/huge numbers, absurd string lengths, invalid
  enums, deep (60-level) JSON nesting, null-vs-missing distinctions, array-where-object-expected,
  wrong/omitted `Content-Type`, and unicode/emoji round-trips (confirmed byte-safe both ways).
- **Cross-tenant probes (own book + p8 identity) stayed uniform 404s**, no existence leak,
  consistent with Rita's P8 bulk finding — spot-checked, not re-litigated in full here.
- **Path traversal on export filenames** (`../../../etc/passwd`, `../../windows/win.ini`) both
  cleanly 400 `{"error":"Invalid filename"}` — no filesystem access attempted.
- **`MEM-05`** (delete a nonexistent memory row → 200, not 404) matches the already-documented
  intentional behavior in COVERAGE-MATRIX §B6.1 — confirmed clean, not re-filed.
- **The 5 "legacy hand-validated" routes are actually insights ×2 + style ×3**, not "style ×2,
  settings ×3" as the task brief phrased it — verified against the `ca01cb5` diff and current
  source before building probes around it. Only the style ×3 family carries the risky
  generic-catch-401 pattern (insights ×2 already had proper 500 fallbacks pre-D-01), which is
  exactly where D-14 below was found.

## What didn't

Two confirmed new defects, both written up in full in `defects.md`:

- **D-13 [S2]** — `wiki` create/update/list routes have no top-level try/catch at all; any Zod
  validation failure raw-500s with a completely empty body (not even `{error}`). Confirmed on
  `POST`, `PATCH` (against a real owned row, not just the ownership pre-check), and `GET`'s
  query-string validation.
- **D-14 [S3]** — the style/lenses legacy routes' generic catch-all misreports a wrong-type
  field (Prisma client-side validation error) as `401 Unauthorized` instead of `400`. Confirmed
  on both `style` and `style/lenses` `POST`. No leak, but wrong 4xx class and a misleading
  message. Matches the pre-known COVERAGE-MATRIX §Z6 entry.

## Totals

**86 scripted probes + 8 targeted follow-up probes = 94 total.** Envelope-consistency: clean
across every family except the 2 defects above (14/16 probed families fully clean; wiki and
style/lenses each have one confirmed gap). Leak count: **0** confirmed (1 scanner hit,
investigated and ruled a false positive — see self-corrections). 2 new defects (D-13 S2, D-14
S3), both root-caused to exact file:line, both left unfixed per this phase's read-only `src/`
scope.
