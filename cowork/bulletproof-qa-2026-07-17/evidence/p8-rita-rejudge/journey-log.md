# P8 "Rita" — REJUDGE Journey Log (adversary / security / money-path)

**Target:** `http://127.0.0.1:3002` (LIVE, current committed code — HEAD `afc7f2d`)
**Persona:** `user_qa_p8` (free tier, has a seeded OpenRouter BYOK key), acting cross-persona as permitted (p1/p2/p3/p5)
**Date:** 2026-07-20
**Method:** Raw HTTP via a `tsx` driver reading `process.env.E2E_TEST_SECRET` (never echoed). Every request written once to `api-traces/<ID>_<label>.json` with the secret redacted in the stored headers.
**Auth:** `x-e2e-test-secret: <E2E_TEST_SECRET>` + `x-e2e-clerk-id: user_qa_p{n}`
**Scripts:** `scripts/lib.ts` (driver), `scripts/00-discover.ts` (discovery), `scripts/10-probe.ts` (all phases).
**Worker:** exactly one worker runtime at capture — see `worker-proof.txt` (PID 61892 is the sole node runtime importing `src/worker.ts`; 31644/28224 are its launcher shims; `/api/health/dependencies` corroborates `worker:ok`).

## What this run re-tests (P8 baseline drivers)
P8 baseline (AGGREGATE-VERDICT): protocol grade **5.5**, weighted 6.30, MIN dim D5=5.5 (a *coverage* artifact — no perf evidence), strongest dim **D7 trust=7–8**. The trust judges' concrete P8 defects were: **D-01** (malformed JSON→500), **D-56/P8-03** (batch validates before ownership fence → 400 not 404), **D-15** (wiki empty-body 500), **D-14** (style/lens 401-misclass), **D-06** (duplicate-checkout double-billing), plus the "confirmed clean" fencing/tier-gate/key sweeps. This run re-drives every one of those LIVE and adds new adversarial probes.

---

## Phase A — D-01 malformed JSON → honest 400 (was raw 500)

| id | actor | method | path | status | expected | verdict |
|---|---|---|---|---|---|---|
| A1 | p3 | POST | /api/books (rawBody `{not valid json at all`) | **400** | 400 | CLOSED (was 500) |
| A2 | p1 | PUT | /api/books/{p1_book}/chapters/{p1_chapter}/content (rawBody `not { json`) | **400** | 400 | CLOSED (was 500) |
| A3 | p1 | POST | /api/books/{p1_book}/editorial/findings (rawBody `{bad json`) | **400** | 400 | CLOSED (extra route) |

All three return `{"error":"Invalid JSON in request body"}`. Root-cause fix confirmed in source: shared `src/lib/api/parse-json-body.ts` throws a typed `InvalidJsonBodyError`, mapped to 400 by `invalidJsonBodyResponse()` ahead of the generic 500 fallback. A3 (a route not in the baseline repro) confirms the fix is applied architecturally, not per-route.

## Phase B — Ownership sweep: p8 attacks p1-owned resources → uniform 404

| id | method | path | status | verdict |
|---|---|---|---|---|
| B1 | GET | /api/books/{p1_book} | 404 | BLOCKED |
| B2 | GET | /api/books/{p1_book}/chapters | 404 | BLOCKED |
| B3 | GET | /api/books/{p1_book}/chapters/{p1_chapter}/content | 404 | BLOCKED |
| B4 | GET | /api/books/{p1_book}/editorial/findings | 404 | BLOCKED |
| B5 | GET | /api/memory/stats?bookId={p1_book} | 404 | BLOCKED (IDOR fix holds) |
| B6 | PATCH | /api/books/{p1_book} | 404 | BLOCKED (no cross-tenant write) |
| B7 | PUT | /api/books/{p1_book}/chapters/{p1_chapter}/content | 404 | BLOCKED (no cross-tenant overwrite) |
| B8 | DELETE | /api/books/{p1_book} | 404 | BLOCKED (no cross-tenant delete) |
| B9 | GET | /api/books/{p1_book}/export | 404 | BLOCKED |
| B10 | GET | /api/books/{p1_book} **as p1** | 200 | SANITY — victim book intact (`name: "The Salt Letters QA P1 93181fd1"`) after all attacks |

Every blocking response is `{"error":"Book not found"}` (existence-hiding, never 403). B10 proves the DELETE (B8) was a true no-op.

## Phase C — Deep composite-key fence (confused deputy)

| id | actor | method | path | status | verdict |
|---|---|---|---|---|---|
| C0a | p2 | POST | /api/books/{p2_book}/style/lenses | 201 | seed victim lens `c57f6624…` owned by p2 |
| C1 | p3 | DELETE | /api/books/**{p3_own_book}**/style/lenses/**{p2_lens}** | 404 | BLOCKED — `{"error":"Lens not found"}` |
| C2 | p2 | GET | /api/books/{p2_book}/style/lenses | 200 | victim lens STILL PRESENT (verified id match) |

C1 is the load-bearing test: the attacker (p3) supplies its *own* book id in the URL but a *victim's* (p2's) lens id. The inner `deleteMany({ id, bookId })` composite where-clause matched zero rows → 404, and C2 confirms the victim lens survived. The inner fence is load-bearing on its own.

## Phase D — Tier / plan gates (interpreted vs CURRENT plan config)

Plan config has changed since baseline: **Free tier now grants `maxBooks: 1`** (card-free on-ramp, `src/lib/billing/free-tier.ts`), series/analytics remain a Professional wall, batch/overnight remains a paid wall. So a free user owning ≤1 book is **by design**, not a bypass.

| id | actor | method | path | status | expected | verdict |
|---|---|---|---|---|---|---|
| D1 | p8 (free, 0 books) | POST | /api/books | **201** | 201 | BY DESIGN (free on-ramp: 1st book allowed) |
| D2 | p8 (free, now 1 book) | POST | /api/books | **403** | 403 | GATE HOLDS — `Free plan includes 1 book…` |
| D3 | p5 (free, at cap) | POST | /api/books | **403** | 403 | GATE HOLDS |
| D4 | p8 (free) | POST | /api/series | **403** | 403 | GATE HOLDS — Pro wall |
| D5 | p1 (indie) | POST | /api/series | **403** | 403 | GATE HOLDS — Pro wall |
| D6 | p3 (professional) | POST | /api/series | **201** | 201 | positive control |
| D7 | p1 | GET | /api/series/{p3_series}/analytics | **404** | 404 | ownership fence fires before plan gate |
| D8 | p3 (owner) | GET | /api/series/{p3_series}/analytics | **200** | 200 | positive control (real analytics payload) |

No tier bypass. The gate denials are honest 403s with plain-language upgrade copy; the cross-tenant analytics probe fails closed as 404 (never leaks existence via 403).

## Phase E — Batch: D-56 ownership-before-validation + run_batch 429 (coverage gap CLOSED)

| id | actor | body | status | expected | verdict |
|---|---|---|---|---|---|
| E1 | p8 (non-owner) | valid `{workflowIds:["dev-edit"],…}` | **404** | 404 | D-56 ownership fence |
| E2 | p8 (non-owner) | rawBody `{not json` | **404** | 404 | ownership BEFORE json parse — no 400 oracle |
| E3 | p8 (non-owner) | invalid `{workflowIds:[]}` | **404** | 404 | **was 400 "Invalid input" (P8-03) → now 404** |
| E4 | p1 (**owner**) | invalid `{workflowIds:[]}` | **400** | 400 | owner gets validation — **uniform oracle proof** |
| E5 | p8 (**owner**, free) | valid `{workflowIds:["dev-edit"],…}` on p8's OWN book | **429** | 429 | run_batch paid wall — `Overnight batch runs are part of the Indie plan.` |

E1–E4 together prove the existence-hiding oracle is now uniform: a **non-owner always gets 404** regardless of body validity/parseability, while the **owner** of the same resource gets the real 400 validation error. This is exactly the D-56 fix (ownership fence moved above body parsing/validation).

E5 is new coverage the baseline explicitly could not reach: because free users previously owned no book, the `run_batch` 429 paid-wall could not be exercised over HTTP. Now that Free grants 1 book, p8 owns a book and the 429 fires deterministically (before any enqueue/worker involvement).

## Phase F — D-15 wiki: honest enveloped 4xx (was empty-body 500)

| id | actor | method | body | status | body shape | verdict |
|---|---|---|---|---|---|---|
| F1 | p2 | POST /wiki | `{}` | **400** | `{"error":"Invalid input","details":{…}}` | CLOSED (was 500 empty) |
| F2 | p2 | POST /wiki | `{type:"not-a-real-entity-type",name:"x"}` | **400** | enveloped + field errors | CLOSED |
| F3 | p2 | POST /wiki | `{type:"character",name:null}` | **400** | enveloped | CLOSED |
| F4 | p2 | GET /wiki?type=not-a-real-type | — | **400** | enveloped | CLOSED (query-param path) |
| F5a | p2 | POST /wiki | `{type:"character",name:"RJ Probe"}` | 201 | created row `6bf865d6…` | setup for real-row PATCH |
| F5b | p2 | PATCH /wiki/{id} | `{type:"not-a-real-entity-type"}` | **400** | enveloped, **against a REAL owned row** | CLOSED |
| F5c | p2 | DELETE /wiki/{id} | — | 200 | `{"ok":true}` | cleanup |

Every previously-empty-body 500 (POST/GET/PATCH) now returns a JSON envelope with a 400 and readable field errors. F5b confirms the fix on the "book found, valid Zod-parse fails" path (not just the pre-check path). Source: `wiki/route.ts` and `wiki/[entityId]/route.ts` now wrap the Zod `.parse()` in `zodErrorResponse`.

## Phase G — D-14 style/lens wrong-type input: honest 400 (was 401)

| id | actor | method | body | status | verdict |
|---|---|---|---|---|---|
| G1 | p2 | POST /style | `{name:"…",fingerprint:{nested:"obj"}}` | **400** | CLOSED (was 401 misclass) |
| G2 | p2 | POST /style/lenses | `{…,sensoryPriority:{x:"y"}}` | **400** | CLOSED (was 401 misclass) |
| G3 | p2 | POST /style | `{}` (missing name) | **400** | control (`Name is required`) |

Wrong-typed fields that reach Prisma as a client-side validation error are now classified 400 `Invalid input` via `legacyRouteErrorResponse()`, not the old blanket `catch { 401 }`. A legitimate caller no longer gets bounced into a bogus re-login flow on a type error.

## Phase H — Key confidentiality + BYOK disclosure

| id | actor | path | status | verdict |
|---|---|---|---|---|
| H1 | p8 | GET /api/settings/api-keys | 200 | maskedKey ONLY — no `encryptedKey`/plaintext (full body in trace) |
| H2 | p1 | GET /api/settings/api-keys | 200 | maskedKey only |

**BYOK disclosure (task requirement):** persona `user_qa_p8` holds one seeded key — `provider: openrouter`, `label: "qa"`, `isDefault: true`, `validatedAt: 2026-07-20T00:52:25Z`, `maskedKey: "sk-or-v...705e"`, usage `{totalTokens:0,totalCost:0,sessionCount:0}`. The **masked** form is exactly what the app returns (`maskApiKey` = first-7 + "..." + last-4); the raw key was never fetched, printed, or written. Confirms plan-free ≠ key-less.

## Phase I — Money-path: D-06 duplicate-checkout guard (was double-bill)

| id | actor | body | status | verdict |
|---|---|---|---|---|
| I1 | p3 (professional/active) | `{plan:"indie",billingInterval:"monthly"}` | **409** | CLOSED — `code:"already_subscribed"`, directs to billing portal |
| I2 | p3 | rawBody `{not json` | **400** | Invalid JSON (D-01 guard) |

I1 is the money-path fix: previously a writer with a live subscription could POST checkout and receive a 200 + a live `checkout.stripe.com` URL, spinning up a **second parallel subscription** (double-billing). The `hasLiveSubscription` guard now short-circuits to **409 before any Stripe API call** (pure-DB check — verified safe: no Stripe network traffic, no session created). I2 confirms malformed input is a 400, also before Stripe.

## Phase J — Health-probe honesty

| id | path | status | verdict |
|---|---|---|---|
| J1 | GET /api/health | 200 | real env status (`env.ok:true`, live timestamp) |
| J2 | GET /api/health/dependencies | 200 | 8 dependencies each with real, varying latency (postgres 98ms, schema 209ms, redis 93ms, s3 99ms, worker 62ms, qdrant 78ms, neo4j 112ms) — not a hardcoded stub; corroborates the single worker is live |

## Phase K — New adversarial probes

| id | actor | probe | status | verdict |
|---|---|---|---|---|
| K1 | p8 | GET /api/series/{p3_series} (cross-tenant) | 404 | BLOCKED (series ownership fence) |
| K2 | p8 | GET /api/series/{p3_series}/books | **405, empty body** | route is POST-only → framework 405; NOT an ownership leak (method-level, identical for any id). **Minor error-hygiene nit** (empty body / no envelope) — see defects.md N-1. |
| K3a | p2 | POST /api/series | 201 | seed a p2-owned series `1c210198…` |
| K3b | p3 | POST /api/books `{seriesId: p2_series}` | **404** | BLOCKED — cannot attach a new book to another user's series (`Series not found`). No cross-user seriesId smuggling. |
| K4 | attacker | GET /api/books with raw `x-e2e-clerk-id: user_hackerman_admin` (non-`user_qa_` prefix) | 200, `[]` | prefix guard forces the fixed fallback user; returns that user's (empty) list, **NOT** p1/p3 books. The shared E2E secret cannot impersonate an arbitrary victim clerkId. |

K3b and K4 are new no-bypass results that both hold. K2 is the only new observation of note (a cosmetic 405-with-empty-body), recorded as a low-severity error-hygiene item.

---

## Final tally
- **34 probes across 11 phases**; results dumped to `api-traces/_probe_results.json`; per-probe raw traces in `api-traces/<ID>_<label>.json`.
- **Every P8 baseline defect re-tested LIVE closed:** D-01 (A1–A3), D-56/P8-03 (E1–E4), D-15 (F1–F5b), D-14 (G1–G2), D-06 (I1). Uniform-404 oracle now provably uniform (E1–E4).
- **Every "confirmed clean" baseline sweep still clean:** ownership 10/10 + deep-fence (B/C), tier-gates (D), key confidentiality (H), health honesty (J).
- **Coverage gap closed:** run_batch 429 paid-wall exercised directly for the first time (E5).
- **New adversarial results:** cross-user seriesId smuggle blocked (K3b), E2E-secret prefix guard holds (K4); one minor new nit — 405 empty-body on a POST-only route (K2 / N-1).
- **Zero** cross-tenant leaks, **zero** tier-gate bypasses, **zero** raw-500-on-normal-input, **zero** key leaks, **zero** silent-allow.
