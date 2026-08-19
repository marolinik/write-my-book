# P2 "Gerald" RE-JUDGE — Journey Log (2026-07-20)

Fresh, independent re-capture driving the LIVE product (no self-authored deltas;
every number below is a raw API/DB observation captured this session). Persona
`user_qa_p2` (Gerald — data-integrity / two-tab autosave / onboarding pro).

## Environment at capture
- Server `http://localhost:3002`, `/api/health/dependencies` = **ready**, all 8
  deps ok (postgres/schema/redis/s3/worker green; qdrant/neo4j green).
- **Worker: exactly ONE** runtime process (node + tsx loader + `src/worker.ts`,
  PID 61892). `worker-proof.txt`.
- Persona state (`api-traces/00-state-probe.txt`): internal id
  `e43ea68d-def6-4019-91fc-f85b8db2a4bf`, clerk `user_qa_p2`,
  `onboarding_complete=true`, `default_model=openrouter-qwen36/sonnet`,
  64 pre-existing books. **BYOK:** provider `openrouter`, `validated=true`,
  encrypted blob masked `7cae73b…6fbc` (212 ch — this is the encrypted-at-rest
  value, not the raw key). Secrets read from `process.env` only; never printed.
- **D-16 unique constraint PRESENT:** `documents_book_id_type_chapter_number_key`
  on `(book_id, type, chapter_number)`.

All drills used FRESH books created by this persona (`P2-REJUDGE-*`); no other
persona's data touched.

## Chronology

1. **State probe** (`00-state-probe.txt`) — health green, persona + BYOK state,
   D-16 constraint present.

2. **D-16 canonical constraint verify** (`05-verify-d16-constraint.txt`) — catalog
   PRESENT; duplicate insert rejected **P2002**; exit 0.

3. **D-16 live race drill** (`10-d16-race.txt`) — fresh book
   `3d2acb7f…`, ch1 `c56b64ff…`:
   - Pre-race content docs: 0.
   - **6 concurrent first-save PUTs** (distinct bodies, no `expectedVersion`) →
     statuses `[200,200,200,409,200,200]`; **exactly 1** documents row after
     (v5, one row), 0×500. Surviving content = intact raced body `RACE_5…`.
   - **Read-your-writes 10/10**: each PUT(expectedVersion)→GET echoed the written
     body with a stable `documentId`, version chain v5→v15 monotone.
   - **Two-tab CAS**: fresh tab 200→v16; stale tab → **409** with the winner's
     `serverContent` (no silent overwrite). Stampless interactive overwrite →
     **409** (D-47). Final row count: **1**.

4. **Adversarial probes** (`20-adversarial.txt`) — fresh book `9ca3d8b8…`:
   - **A. D-01** malformed JSON on 3 routes → all **400**, no leak.
   - **B. Body boundary**: 2,000,000 chars → **200**; 2,000,001 → **400** Zod
     (`Too big: expected string to have <=2000000 characters`).
   - **C. CAS storm** (10 concurrent PUTs, same expectedVersion) → **exactly one
     200**, 9×409, 0 errors, version +1, 1 row.
   - **D. Stampless storm** (8 concurrent, no version) → **all 409**; version
     unchanged.
   - **E. Autosave rapid-fire** (20 sequential stamped PUTs) → **20/20** monotone,
     content echoes each cycle, v3→v23.
   - **F. Delete-then-save** → PUT to deleted chapter = **404** (not 500); orphan
     `CHAPTER_CONTENT` row = **1** (see new defect). [DELETE here took 10,002 ms —
     one-off, see step 7.]
   - **G. Delete/save race** (concurrent DELETE+PUT) → DELETE 200, PUT 404, no 500.

5. **Orphan resurrection probe** (`25-orphan-resurrect.txt`) — fresh book
   `41a1e3f5…`: deleted ch#2 (with `GHOST_SECRET_9f3a` prose) leaves an orphan
   content doc; a **new** chapter reusing `chapterNumber=2` returns the deleted
   prose on GET and 409s (leaking the deleted text) on its first save. **NEW
   DEFECT (S3)** — the live instance of the deferred D-22 root cause.

6. **Onboarding + time-to-first-word** (`30-onboarding.txt`) — fresh book
   `c62ef6de…`:
   - Onboarding on-ramp: card-free/key-free (`POST /settings/onboarding`→200 with
     no key), `onboardingComplete:true, keyCount:1`.
   - Default-model surface: role round-trip PASS; **D-39 strict** unknown-key→400;
     unknown model id→400; default unchanged after bad requests.
   - **Time-to-first-word = 382 ms** (book-create→first word durably saved,
     read-back verified).
   - First AI touch (ghost-text, BYOK qwen) → **502 retryable** (reasoning-model
     60-tok budget exhausted; honest, not billed) — corroborates open **D-100**.

7. **BYOK AI control** (`35-ai-touch.txt`) — inline-edit (4096-tok) → **200** with
   3 real qwen suggestions in 22.2 s. BYOK AI on-ramp works; D-100 isolated to the
   ghost-text budget.

8. **Delete-latency repro** (`40-delete-latency.txt`) — 7 content-bearing chapter
   deletes: 113–194 ms (avg 156, 0/7 > 3 s). The step-4F 10 s stall was a one-off
   cold path, **not reproduced** → not filed.

## Net
P2's two baseline floor-drivers (D-16 S1 silent lost-update, D-01 500-not-400) are
both **CLOSED live**; the onboarding NO-EVIDENCE gap now has concrete API evidence
(382 ms time-to-first-word, card-free on-ramp, honest failure states). One new
S3 data-integrity defect (deleted-chapter prose resurrection) and one corroboration
of the known open D-100. No silent data loss observed in ~50 racing/adversarial
writes.
