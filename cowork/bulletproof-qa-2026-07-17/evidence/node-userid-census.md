# Node userId backfill census

- Generated: 2026-07-19T11:58:05.896Z
- Mode: EXECUTE (writes applied)
- NEO4J_URI: bolt://localhost:7687

Loaded owner for 90 book(s) from Postgres.

## Book-scoped nodes missing userId (legacy, pre-RC-6)

- Total book-scoped nodes: **310**
- Unstamped (userId IS NULL): **310**
- Backfillable: **310**
- Anomaly (book unresolved, kept, manual review): **0**

Sample of up to 20 backfills APPLIED:

- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Milan [book 137412c3-8b98-4b16-994d-4f02a2774f53, node id 0] — owner of book 137412c3-8b98-4b16-994d-4f02a2774f53
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Elara [book 137412c3-8b98-4b16-994d-4f02a2774f53, node id 1] — owner of book 137412c3-8b98-4b16-994d-4f02a2774f53
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (PlotThread) What does Milan know? [book 137412c3-8b98-4b16-994d-4f02a2774f53, node id 2] — owner of book 137412c3-8b98-4b16-994d-4f02a2774f53
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Milan [book 71adb6fa-638b-49dc-970f-f5bd3853377c, node id 3] — owner of book 71adb6fa-638b-49dc-970f-f5bd3853377c
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Chapter) Chapter 4 [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 4] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Vera [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 5] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Danilo [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 6] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Kova [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 7] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Character) Father [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 8] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Faction) Island Fishermen [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 9] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Faction) Coast Guard [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 10] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Location) Lighthouse [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 11] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Location) Lamp Room [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 12] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Location) Kitchen [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 13] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Location) Boathouse [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 14] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Location) Island [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 15] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Location) Mainland [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 16] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Event) The Gale [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 17] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Event) Morena Sinking [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 18] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4
- SET n.userId=4611e6b9-0982-4443-9747-eccf4f36560e on (Object) Third Letter [book 4a37715f-30ad-43d9-9960-3ba9c0d169a4, node id 19] — owner of book 4a37715f-30ad-43d9-9960-3ba9c0d169a4


## Summary

EXECUTE: 310 node(s) stamped (310 prop(s) set), 0 anomaly (book unresolved, not written).
