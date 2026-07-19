# Contaminated-edge purge census

- Generated: 2026-07-19T09:30:21.050Z
- Mode: DRY-RUN (default — nothing written)
- NEO4J_URI: bolt://localhost:7687

Loaded metadata for 90 book(s) from Postgres.

## Class (a) — edges missing r.userId (legacy, pre-RC-6)

- Backfillable: **340**
- Un-backfillable (manual review): **0**

Sample of up to 20 backfills that WOULD be applied:

- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Milan -[PARTICIPATES_IN]-> What does Milan know? (book 137412c3-8b98-4b16-994d-4f02a2774f53, edge id 0) — owner of book 137412c3-8b98-4b16-994d-4f02a2774f53
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PARTICIPATES_IN]-> Discovery of the second letter (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 69) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PARTICIPATES_IN]-> Opening the first letter (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 68) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PARTICIPATES_IN]-> Arrival of the first letter (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 66) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[OPPOSES]-> Soft-handed Men (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 49) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PARTICIPATES_IN]-> Vera's Departure to Mainland (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 38) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PARTICIPATES_IN]-> Vera's 4000 Withdrawal (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 34) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[LOCATED_AT]-> The Island (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 29) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PART_OF]-> The Co-op (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 28) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[KNOWS]-> Vera's Father (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 26) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[KNOWS]-> Vera's Grandfather (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 25) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[KNOWS]-> Kova (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 24) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[KNOWS]-> Radmila (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 23) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[LOCATED_AT]-> The Harbor (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 21) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[LOCATED_AT]-> Radmila's Shop (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 1) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[OWNS]-> Lamp Log (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 12) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[OWNS]-> Weather Log (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 11) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[PARTICIPATES_IN]-> The Gale (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 9) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[APPEARS_IN]-> Lamp Room (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 5) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- WOULD SET r.userId=4611e6b9-0982-4443-9747-eccf4f36560e on Vera -[APPEARS_IN]-> Kitchen (book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, edge id 4) — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4


## Class (b) — cross-book-endpoint edges

- Delete (cross-user leak): **0**
- Delete (same user, non-series): **0**
- Series-exempt (kept, manual review): **0**
- Anomaly (book unresolved, kept, manual review): **0**


## Class (c) — case-variant duplicate relationship types

- Merge groups: **0**


## Informational — node userId coverage (NOT remediated here)

- 310 of 310 book-scoped nodes carry no userId. This script is EDGE-scoped; the RC-6 read guard (graph-queries.userGuard) keys off NODE userId, so a node backfill (same bookId → Book.userId join) is a recommended follow-up dispatch.

- 0 edge(s) have a NULL-bookId endpoint — outside all three scans above (not counted in any class, not remediated here). A non-zero value warrants a separate look.

## Summary

DRY-RUN: (a) 340 userId backfill(s) planned, 0 un-backfillable; (b) 0 cross-book edge(s) would be deleted, 0 series-exempt, 0 anomaly; (c) 0 case-variant merge group(s) planned.

Nothing was written. Re-run with --execute to apply.
