# §Z6 Error-Hygiene Sweep — Defects

Persona: `user_qa_p2` (own throwaway rows only), `user_qa_p8` used strictly read-only per
team-lead instruction. 86 scripted probes + 8 targeted follow-up probes across all required
route families. IDs below are tentative (next free slot after D-12 in the campaign-wide
register); team-lead may renumber on merge into the master register, per the D-06/D-07
precedent ("your IDs stand" unless collision).

---

## D-13 — [S2] `POST/PATCH/GET /api/books/{id}/wiki[...]` has zero top-level error handling — any Zod validation failure raw-500s with an empty body

**Severity: S2.** Not an information leak (body is completely empty — no stack trace, no
Prisma/SQL fragment, nothing), but it is a genuine **unhandled exception** on ordinary,
parseable, malformed input to a first-class writing feature (the worldbuilding wiki), and the
client receives *zero* diagnostic information — not even a generic `{error}` envelope — to act
on. Fails team-lead's explicit rule: *"Any raw 500 on malformed-but-parseable input = defect
(D-01 covered unparseable only)."*

### Root cause

`src/app/api/books/[id]/wiki/route.ts`:
- `POST` (lines 44-81) — only the raw JSON parse step is guarded (lines 61-68, per a comment
  citing D-01). The very next line, `wikiEntitySchema.parse(body)` (line 69), has **no**
  surrounding try/catch. Neither does `requireUser()` (line 48) or any of the DB calls.
- `GET` (lines 7-42) — same shape: `wikiQuerySchema.parse(sp)` (line 23) is unguarded.

`src/app/api/books/[id]/wiki/[entityId]/route.ts`:
- `PATCH` (lines 23-60) — identical pattern: `wikiEntityUpdateSchema.parse(body)` (line 47) is
  unguarded (only the JSON-parse step above it is defended).

Every other route family probed in this sweep wraps its handler body in `try { ... } catch
(error) { ... }` with explicit `ZodError` → 400, `Unauthorized` → 401, and a logged generic 500
fallback. The wiki routes are the one family missing this pattern entirely — not just the
error-*class* mapping (like the style/lenses defect below), but the try/catch itself.

### Repro (3 independent confirmations)

| Probe | Request | Result |
|---|---|---|
| `WIKI-01` | `POST .../wiki` body `{}` (missing name/type) | `500`, empty body |
| `WIKI-02` | `POST .../wiki` body `{type:"not-a-real-entity-type", name:"x"}` | `500`, empty body |
| `XCUT-03` | `POST .../wiki` body `{type:"character", name: null}` | `500`, empty body |
| follow-up | `GET .../wiki?type=not-a-real-type` | `500`, empty body |
| follow-up | Created a real throwaway entity under `user_qa_p2` (`POST .../wiki` valid body → `201`), then `PATCH .../wiki/{realEntityId}` body `{type:"not-a-real-entity-type"}` | `500`, empty body — **proves the crash is not limited to the "book not found" pre-check path; it reproduces against a real, owned row.** Throwaway entity cleaned up afterward via the known-good `DELETE` endpoint (`{"ok":true}`). |

Full trace: `api-traces/wiki-500-repro.txt`.

### Fix direction (not applied — no `src/` edits per scope)

Wrap `GET`/`POST` in `wiki/route.ts` and `PATCH` in `wiki/[entityId]/route.ts` in the same
try/catch shape already used everywhere else in the codebase (`invalidJsonBodyResponse` →
`ZodError` → 400 → `Unauthorized` → 401 → logged generic 500). `wiki/[entityId]/route.ts`'s
`GET`/`DELETE` don't call `.parse()` on user input so they're lower-risk, but adding the guard
uniformly is cheap and closes the `requireUser()`-throws-500-instead-of-401 gap too.

---

## D-14 — [S3] Legacy hand-validated `style`/`style/lenses` routes misreport wrong-type validation errors as `401 Unauthorized`

**Severity: S3** (matches the pre-known COVERAGE-MATRIX §Z6 entry: *"error hygiene: raw
error.message at 500 ... ~12 bare catch→401 mask faults"* — this sweep confirms that entry with
a concrete repro rather than a raw 500 variant). No leak — envelope stays a clean
`{"error":"Unauthorized"}` — but the HTTP class is wrong (should be 400/422) and the message is
actively misleading: a client could interpret this as an auth/session failure (e.g. trigger a
re-login flow) when the real problem is a malformed field.

### Root cause

`src/app/api/books/[id]/style/route.ts` `POST` catch block (~lines 87-91) and
`src/app/api/books/[id]/style/lenses/route.ts` `POST` catch block (~lines 71-81): both check
`invalidJsonBodyResponse` and a `P2002` Prisma unique-constraint case, then fall through to a
**generic catch-all that returns 401** for anything else — including a Prisma client-side
validation error thrown when a field is sent with the wrong type (`CharacterLens` /
`StyleFingerprint` fields are all `String`/`String?` in `prisma/schema.prisma`, so sending an
object/number for one of them throws before ever reaching an auth check). The GET handlers in
`style/route.ts` (line ~45-47) and `style/lenses/route.ts` (line ~28-30), plus the `DELETE` in
`style/lenses/[lensId]/route.ts` (line ~77-79), carry the identical bare `catch { return 401 }`
shape structurally, though this sweep only had a body-payload vector to trigger it on the two
`POST` handlers above.

This is the "5 legacy hand-validated routes" family the D-01 migration (`ca01cb5`) intentionally
left on their pre-existing any-typed validation instead of moving to Zod — confirmed by diffing
that commit: the actual 5 are **insights ×2 + style ×3**, not "style ×2, settings ×3" as
originally phrased in the task brief. Only the **style** ×3 family (not insights) carries this
risky catch-all; the insights ×2 routes already had a proper `console.error(...)` + generic 500
fallback before D-01 and are unaffected.

### Repro

| Probe | Request | Result |
|---|---|---|
| `STYLE-02` | `POST /api/books/{id}/style` body with `fingerprint` as a nested object (schema wants `String?`) | `401` `{"error":"Unauthorized"}` |
| `LENS-02` | `POST /api/books/{id}/style/lenses` body with `sensoryPriority` as a nested object (schema wants `String`) | `401` `{"error":"Unauthorized"}` |

Full trace: `api-traces/style-lens-401-repro.txt`.

### Fix direction (not applied — no `src/` edits per scope)

Add an explicit Prisma validation-error check (or migrate to Zod, consistent with the rest of
the codebase) before the generic fallback, mapping it to `400`/`422` instead of `401`.

---

## Confirmed clean / not new defects (self-corrected before filing)

Per campaign norm (verify before filing — see the W6 proration false-positive precedent), the
following were investigated as candidate defects and ruled out:

- **`CHAP-06/07/08` (chapters/reorder) — harness bug, not a product bug.** Original probes used
  `POST`; the route only exports `PATCH` (`src/app/api/books/[id]/chapters/reorder/route.ts`),
  so Next.js correctly 405'd before the handler ever ran. Re-ran all 3 with the correct verb:
  `PATCH` with a non-array `order` → clean `400 {"error":"Invalid input"}`; `PATCH` with a
  foreign/nonexistent `chapterId` → clean `404 {"error":"Chapter not found"}`; `PATCH` with a
  duplicate `chapterId` → clean `400 {"error":"Invalid input"}`. The route's error hygiene is
  fine; my harness used the wrong HTTP method.
- **`SET-04` (default-model) — harness bug, not a product bug.** Original probe sent
  `{modelId: "..."}`, but the route's Zod schema only recognizes `defaultModel` (unknown keys
  are silently stripped by default `z.object()` behavior), so the update was a no-op and the
  200 just reflected pre-existing state. Re-ran with the correct field name
  (`{defaultModel: "totally-made-up-model-id-xyz"}`) → clean `400
  {"error":"Unknown model ID for defaultModel"}`. The registry-id validation
  (`src/app/api/settings/default-model/route.ts:84-92`, `getModelDef()`) works correctly.
- **`EXP-04` (export/config) — harness bug, not a product bug.** Original probe sent a
  top-level `{isbn: ...}`, but `isbn` lives under `metadata` in `exportConfigSchema`
  (`src/lib/validation.ts:236`, `z.string().max(50)`) and the top-level key was silently
  stripped, so the PUT was a no-op. Re-ran with the correct nested shape
  (`{metadata: {isbn: "x".repeat(10000)}}`) → clean `400` ZodError. Incidental, out-of-Z6-scope
  observation (not filed as a defect): the route's docstring calls this a "partial merge," but
  `exportConfigUpdateSchema = exportConfigSchema.partial()` is only a **shallow** partial —
  supplying `metadata.isbn` alone still requires every other `metadata` sibling field
  (`title`, `subtitle`, etc.) or the whole request 400s. That's an API-contract/DX gap, not an
  error-hygiene issue (the response itself is clean, correctly classed, and leak-free) — noting
  it for whoever owns that route family, not claiming a Z6 slot for it.
- **`XCUT-04` (unknown sub-route 404) — leak-scan false positive, not a real leak.** The
  regex hit `node_modules[\\/]` against the raw HTML of Next.js/Turbopack's own dev-mode 404
  page. Full-body inspection (not just the 400-char preview) shows the match is
  `/_next/static/chunks/node_modules_next_dist_compiled_react-dom_....js` — a **publicly served,
  intentional Turbopack bundle chunk filename**, not a filesystem path disclosure, not a stack
  trace, and not application code. This is the same class of finding as the W6 proration
  false-positive: the scanner pattern is doing its job, this specific hit just isn't a real leak.
- **`SET-06` (onboarding, bogus body)** — 200 is expected, not a gap: `user_qa_p2` already has
  ≥1 saved API key (seeded for this campaign), which is onboarding's actual DB-side
  precondition; the request body's content doesn't gate anything here. Probe design limitation,
  not a defect.
- **`MEM-05` (delete nonexistent memory row → 200, not 404)** — matches the already-documented,
  intentional campaign behavior (COVERAGE-MATRIX §B6.1: "patch/delete 0-row returns success not
  404"). Confirmed clean, not new.
