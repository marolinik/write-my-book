# P8 "Rita" — Ownership / Cross-Tenant Matrix

Attacker in every row: `user_qa_p8` (unsubscribed, owns nothing), unless otherwise noted. Victim resources owned by `user_qa_p1` (indie) or, for the deep-fence test, `user_qa_p2` (professional). Expected result for every row: the resource is fully invisible/immutable to the non-owner — 404, never 403 (403 would leak existence), never 200.

| # | Resource | Operation | Endpoint | Attacker | Owner | Result | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | Book | Read | GET /api/books/{id} | p8 | p1 | 404 | BLOCKED |
| 2 | Book's chapter list | Read | GET /api/books/{id}/chapters | p8 | p1 | 404 | BLOCKED |
| 3 | Chapter | Read | GET /api/books/{id}/chapters/{chapterId} | p8 | p1 | 404 | BLOCKED |
| 4 | Chapter content (manuscript text) | Read | GET /api/books/{id}/chapters/{chapterId}/content | p8 | p1 | 404 | BLOCKED |
| 5 | Editorial findings | Read | GET /api/books/{id}/editorial/findings | p8 | p1 | 404 | BLOCKED |
| 6 | Memory/vector stats (bookId-scoped) | Read | GET /api/memory/stats?bookId={id} | p8 | p1 | 404 | BLOCKED — *fix-verification* |
| 7 | Chapter | Modify (metadata) | PATCH /api/books/{id}/chapters/{chapterId} | p8 | p1 | 404 | BLOCKED |
| 8 | Chapter content | Modify (overwrite manuscript) | PUT /api/books/{id}/chapters/{chapterId}/content | p8 | p1 | 404 | BLOCKED |
| 9 | Book | Modify (metadata) | PATCH /api/books/{id} | p8 | p1 | 404 | BLOCKED |
| 10 | Style lens | Create (into victim's book) | POST /api/books/{id}/style/lenses | p8 | p1 | 404 | BLOCKED |
| 11 | Style lens | Delete | DELETE /api/books/{id}/style/lenses/{lensId} | p8 | p1 | 404 | BLOCKED — *fix-verification* |
| 12 | Book exports | Read | GET /api/books/{id}/export | p8 | p1 | 404 | BLOCKED |
| 13 | Book | Delete | DELETE /api/books/{id} | p8 | p1 | 404 | BLOCKED (confirmed non-destructive: victim's book verified intact afterward) |
| 14 | Style lens (deep/composite fence) | Delete (attacker owns the *book* in the URL, but supplies a *victim's* lens id — the "confused deputy" shape) | DELETE /api/books/{attacker_own_book}/style/lenses/{victim_lens_id} | p1 (using own book, targeting p2's lens) | p2 | 404, victim lens confirmed still present | BLOCKED — deepest test in the sweep, isolates the inner `{id, bookId}` composite where-clause from the outer book-ownership check |
| 15 | Own API key list | Read (negative control) | GET /api/settings/api-keys | p8 | p8 (self) | 200, own list only (empty), no cross-tenant entries | CORRECT (self-access works, no leak) |

## Summary

- **15/15 rows blocked or correctly scoped.** No resource type tested was readable, writable, or deletable across the tenant boundary.
- Every blocking response was **404 (Not Found)**, never 403 (Forbidden) — this is the correct choice: 403 would confirm the resource *exists* under that id for a different owner, an information leak in itself. All routes tested fail closed with existence-hiding semantics.
- Row 14 is the load-bearing test: it proves the fence lives on the *child resource's* ownership check (`{id, bookId}` in the `deleteMany` where-clause), not merely on the parent book's ownership check — an attacker who legitimately owns *a* book cannot use it as a lever to reach another owner's child resources by id-guessing.
- Row 13's sanity companion (`own-14-sanity` in journey-log.md) confirms the blocked DELETE was a true no-op, not a masked partial failure.
- No route returned partial data, a stack trace, or a different error shape that would let an attacker distinguish "resource doesn't exist" from "resource exists but isn't yours" — both collapse to the same 404 body across all 15 rows.
