# P8 "Rita" — Defects

Evidence-only. No severity grading beyond the descriptive S-scale requested by the task brief; final grading is the orchestrator's call. Raw traces for every entry below live in `api-traces/`.

---

## D-01 — Malformed JSON request body returns 500 instead of 400/422 (architectural, multi-route)

**Class:** Fault leak / input-validation robustness gap. **Not** a cross-tenant leak, **not** an auth bypass, **not** a data-confidentiality issue — response bodies contain only a generic message (`{"error":"Failed to save content"}` / `{"error":"Failed to create book"}`), no stack trace, no internal detail.

### Root cause

Every route handler that accepts a JSON body follows the same shape:

```ts
try {
  const user = await requireUser();
  ...
  const body = await req.json();          // <-- throws SyntaxError on malformed JSON
  const data = someSchema.parse(body);     // <-- throws ZodError on schema mismatch
  ...
} catch (error) {
  if ((error as Error).message === "Unauthorized") return 401;
  if ((error as Error).name === "ZodError") return 400;
  console.error(...);
  return NextResponse.json({ error: "..." }, { status: 500 }); // SyntaxError falls through here
}
```

`req.json()`'s `SyntaxError` matches neither special case, so it falls through to the generic handler and returns **500** for what is actually a client input error (should be 400/422).

**Scope confirmed by static analysis:** `grep -r "SyntaxError" src/app/api` returns **zero matches** across all 46 route files that call `await req.json()`. This is not a one-off bug in a single file — it is the shared error-handling pattern used everywhere in the API layer. It was independently reproduced live on two unrelated routes below; by code inspection the same fault is architecturally present on the other ~44.

### Repro 1 — POST /api/books

```
POST /api/books
Headers: x-e2e-test-secret: <secret>, x-e2e-clerk-id: user_qa_p3, Content-Type: application/json
Body (raw, intentionally invalid): {not valid json at all
```
Expected: 400 or 422. **Actual: 500**, body `{"error":"Failed to create book"}`.
Actor: `user_qa_p3` (professional plan, `maxBooks: Infinity` — deliberately chosen so the plan-gate cap cannot confound the result; see journey-log.md Phase 5 note on val-01/02/07).
Trace: `api-traces/val-01-isolated.txt`

### Repro 2 — PUT /api/books/{id}/chapters/{chapterId}/content

```
PUT /api/books/{p1_book_id}/chapters/{p1_chapter_id}/content
Headers: x-e2e-test-secret: <secret>, x-e2e-clerk-id: user_qa_p1, Content-Type: application/json
Body (raw, intentionally invalid): not { json
```
Expected: 400 or 422. **Actual: 500**, body `{"error":"Failed to save content"}`.
Actor: `user_qa_p1` (indie), targeting their own owned chapter (not a cross-tenant test — pure validation probe).
Trace: `api-traces/val-05.txt`

### Suggested fix (evidence-gathering only — not applied, per task constraints)

Catch `SyntaxError` explicitly (or wrap `await req.json()` in its own try/catch) and return 400 with a clear "Invalid JSON body" message, ahead of the generic 500 fallback. A single shared helper (e.g. `parseJsonBody(req)`) used by all 46 routes would fix this everywhere at once rather than patching each route's catch block individually.

### Why this matters for trust

A 500 on bad input, while not a data leak here, is a broken contract: clients (and any automated retry/backoff logic) cannot distinguish "your request was malformed" (client error, don't retry as-is) from "the server is unhealthy" (server error, safe to retry). At scale this also pollutes error-rate alerting/monitoring with client-input noise indistinguishable from real server faults.

---

## Confirmed clean (explicitly recorded, not just omitted)

- **No S1 cross-tenant data leak found.** All 15 rows of the ownership matrix (`ownership-matrix.md`) — including the deep composite-key fence test (row 14) — blocked cross-tenant read/write/delete with 404, including the two IDOR fixes the task flagged for fix-verification (`memory/stats` bookId fence, style-lens DELETE fence).
- **No tier-gate bypass found.** p5/p8 (unsubscribed) blocked from book/series creation (403); p1 (indie) blocked from series creation and series analytics; p3 (professional) succeeds on both. Two precedence points documented as correct-by-design, not bugs: ownership-fence-before-plan-gate (p1 vs p3's series → 404, not 403) and ownership-fence-before-quota-gate (p5 vs any book → 404, not 429) — both fail closed on the cheaper/more specific check first.
- **No prompt-injection escape found.** Hostile embedded LLM-directive text stored and retrieved as byte-for-byte identical plain text; no findings were auto-resolved, no system-prompt fragments or API keys appeared in any response.
- **Rate-limit correctly enforced.** 3-user-turn cap on the discuss endpoint fires exactly on the 4th turn (409), verified with real LLM calls end-to-end and a fresh per-run finding to avoid cross-run turn-count carryover.
- **No key leak found.** `GET /api/settings/api-keys` returns only `maskedKey` (format `sk-or-v...705e`, matching the app's own `maskApiKey()` logic exactly); the raw `encryptedKey` field never appears in any response payload, for the owner or for a cross-tenant caller.
- **Health endpoints report truthfully.** `/api/health` and `/api/health/dependencies` returned real per-dependency status and plausible non-zero latencies for all 8 checked services (postgres, schema, redis, s3, worker, qdrant, neo4j, environment) — not a hardcoded/stubbed "always ok."
