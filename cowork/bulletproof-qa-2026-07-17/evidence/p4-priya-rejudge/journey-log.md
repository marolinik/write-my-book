# P4 "Priya" — RE-JUDGE journey log (LIVE)

Target http://localhost:3002 | one worker src/worker.ts PID 58460 | user_qa_p4 | Book "Priya Rejudge ..." id 0b4a7b05-6b01-4098-8bdc-555065f1ae27 | 2026-07-20 UTC.
All calls raw HTTP via scripts/_client.ts (headers x-e2e-test-secret + x-e2e-clerk-id:user_qa_p4). Secret read from env, never printed. Latencies = dev-server; timing NOT isolation-guaranteed (shared worker, concurrent campaign agents).

## One-worker rule (GRADING-PROTOCOL §8)
Captured immediately before the healthy batch AND re-confirmed before the cap batch: exactly ONE leaf worker for wmb-pub — PID 58460 (node --require tsx/preflight.cjs ... src/worker.ts). The other two node PIDs matching worker.ts are the launch chain (npx -> tsx cli), not BullMQ consumers; a separate worker.ts leaf belongs to project waggle-os and is excluded by the wmb-pub path filter. Full proof: worker-proof.txt. VERDICT PASS.

## Day-0 setup
| id | method | path | status | verdict | trace |
|---|---|---|---|---|---|
| books-before | GET | /api/books | 200 (2 pre-existing) | PASS | 00_books_before.json |
| subscription | GET | /api/billing/subscription | 200 plan=professional status=active | PASS (tier gate present) | 00_subscription.json |
| api-keys | GET | /api/settings/api-keys | 200 openrouter validated | PASS (strict BYOK) | 00_apikeys_masked.json (masked: provider+validated only) |
| book-create | POST | /api/books | 201 | PASS | 01_book_create.json (returns firstChapterId; auto-creates placeholder ch1) |
| seed | PUT/POST x5 | chapters + .../content | 200/201 | PASS | 03_seed_results.json, 03_chapters_after_seed.json (3 chapters w/ rough prose) |

## D-18 / D-20 — chapter-collision (baseline: raw 500)
POST /api/books/{id}/chapters {chapterNumber:1} collides with the auto-created placeholder chapter 1.
Result: raw 500 {"error":"Failed to create chapter"} — STILL a raw 500, NOT a clean 4xx. Trace 02_d18_chapter1_collision.json.
Root cause (source read, no edit): src/app/api/books/[id]/chapters/route.ts POST catch handles invalid-JSON / Unauthorized / Zod, then falls through to generic 500 — no Prisma P2002 mapping. No fix commit exists. => baseline driver NOT closed. (Content seeded by PUTting onto the existing placeholder instead.)

## Core — D-17 LIVE (healthy batch, cap $10, dev-edit x 3 chapters)
| id | method | path | status | verdict | trace |
|---|---|---|---|---|---|
| batch-create | POST | /api/books/{id}/batch | 201, childCount 3 | PASS | 10_batch_healthy_create.json |
| batch-terminal | GET | .../batch/{id} | 200 status=done | PASS (structural) | 11_batch_healthy_terminal.json, 11_batch_healthy_transitions.json |

Digest honesty (11_batch_healthy_terminal.json): passes {total 3, completed 2, failed 1, skipped 0}; findings 43->11 total byChapter {1:10,2:1} bySeverity {critical 2, important 4, suggestion 5}; halted false, haltReason null (1 failure is below the 3-consecutive/5-total breaker threshold — correct); statusAutoAdvanceSuppressed true (chapters stayed "undiscussed"). One child (ch3) failed FAST with 0 turns / $0 cost — transient provider failure at spawn, honestly resolved to failed (D-36), zero charge. 3rd child sat queued ~270s before running (shared-worker contention).

FOUR-WAY SPEND AGREEMENT (13_threeway_spend_agreement.json) — the D-17 payoff:
  BatchRun.spentUsd    = 0.04786332
  digest.spentUsd      = 0.04786332
  DB actualCostUsd sum = 0.04786332
  notification message = "2/3 passes · 11 findings · $0.05 / $10.00 cap"  (parsed $0.05 == 0.0479 rounded)
  agreement: all_present true, nonzero true, batchRun_eq_digest true, notif_eq_batchRun_2dp true, db_eq_batchRun_2dp true.
The notification the writer actually sees (persisted BookNotification, 12_notifications_persisted.json) reports the REAL spend, NOT $0.00. => D-17 closed on live evidence (with healthy Redis; the Redis-failure path is covered by the GREEN unit lock).

## Power — Gate-4 LIVE budget-cap halt (cap $0.002, dev-edit x 3 chapters)
| id | method | path | status | verdict | trace |
|---|---|---|---|---|---|
| cap-create | POST | .../batch (cap $0.002) | 201, childCount 3 | PASS | 20_batch_cap_create.json |
| cap-terminal | GET | .../batch/{id} | 200 status=halted | PASS | 23_batch_cap_terminal_final.json |

Terminal (23_batch_cap_terminal_final.json): status halted, halted true, haltReason "budget_cap"; passes {completed 2, skipped 1, failed 0}; spent 0.15510135 == digest.spentUsd == DB sum; budgetCapUsd 0.002 correct in digest DATA. Over-cap child ch3 = skipped, $0 (22_/24_ analysis: skipped_never_spent true). Bounded overshoot: 2 children admitted concurrently (concurrency 2) completed before the halt landed ($0.109 + $0.046 = $0.155 on a $0.002 cap) — the documented cap + (concurrency-1)*maxPerSessionCap bound (batch-budget.ts), NOT a runaway; the 3rd was correctly skipped.
Notification (24_batch_cap_final_analysis.json): "2/3 passes · 1 skipped · 43 findings · $0.16 / $0.00 cap" — spend $0.16 honest (== $0.155 rounded); the "$0.00 cap" is the sub-cent formatting nit (NEW-2).
The last queued child took ~9 min to be picked up (single worker saturated by concurrent campaign agents) — the halt digest fired only after it was finally dispatched-and-skipped. Long queue latency = contention artifact, not a product fault.

## Not-testable / out-of-scope (honest)
- Redis-failure digest path (D-17 real outage): NOT driven live — killing shared Redis is destructive/out-of-scope; covered by the GREEN unit lock.
- Proration D-45 (Stripe webhook): NOT-TESTABLE read-only without real Stripe charges.
