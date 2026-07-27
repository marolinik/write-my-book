# D-199 — every document's first version is badged "Manual", whatever wrote it

**Severity S3.** Found while DB-cross-checking the 50a capture that closed D-188.
Branch `qa/bulletproof-2026-07-17`. Not yet fixed.

## Symptom

`document_versions.change_type` is hardcoded for every newly created document, so
`Version History` labels agent-written, imported, and product-recovered documents as
if the writer typed them by hand.

Live rows from the 50a capture book `90436e20-ffc7-42ca-a39f-dc7d48cdda10`:

| document | change_type | change_source | word_count | actual origin |
|---|---|---|---|---|
| STORY_BIBLE | `manual_edit` | `transcript-recovery` | 777 | product recovered it from the transcript |
| FINGERPRINT | `manual_edit` | `agent` | 1352 | agent wrote it |
| CHAPTER_CONTENT ×8 | `manual_edit` | `import` | ~5200 ea | bulk import |

Three different provenances, one label. `change_source` carries the truth; the column
the UI actually renders does not.

## Root cause

`src/lib/documents/document-service.ts:64` — `create()` accepts a `changeSource`
parameter (line 35) but has **no `changeType` parameter**, and hardcodes:

```ts
changeType: "manual_edit",
changeSource,
```

The 29 correct `agent_write` rows in the DB all come from `update()` paths in
`src/lib/agents/tools.ts:1137,1258,1595` and `src/lib/series/series-synthesizer.ts:81`,
which pass `changeType` explicitly. `update()` does take the parameter
(`document-service.ts:120`, defaulting to `manual_edit`). Only the create path is blind.

`src/lib/agents/artifact-contract.ts:168-175` therefore cannot get this right — it calls
`create(expectedType, text, label, undefined, undefined, TRANSCRIPT_RECOVERY_SOURCE)`
and there is no slot to say "a machine wrote this".

## Where the writer sees it

`src/components/editor/version-history-panel.tsx:29-34` maps the value to a badge:

```ts
agent_write: { label: "AI", variant: "default" },
manual_edit: { label: "Manual", variant: "secondary" },
```

so the recovered 777-word Story Bible renders a **"Manual"** badge. The one surface a
writer would consult to ask "did I write this, or did the AI?" answers wrongly.

Second consumer: `src/lib/agents/chapter-evolution.ts:108` builds
`` `${changeType} (${changeSource})` `` into agent context, producing the
self-contradictory string `manual_edit (transcript-recovery)`.

## Why it matters here specifically

D-188 was the trust defect — an agent reporting a document it never wrote. The fix makes
the product own the miss and say so out loud. That honest recovery then lands in the
version log labelled as the writer's own manual edit, which quietly re-introduces a
smaller version of the same untruth on the audit surface.

## Suggested fix

Add `changeType?: string` to `create()` and derive a default from `changeSource`
(`user` -> `manual_edit`, everything else -> `agent_write`), or have the badge map read
`changeSource` instead. `src/lib/validation.ts:215` already enums
`["agent_write", "manual_edit", "revision"]`, so `import` and `transcript-recovery` would
need a badge entry either way — `import` is already mapped, `transcript-recovery` is not.

---

## FIXED and verified live — `dced6f0`

Fix shape: `src/lib/documents/change-type.ts` adds `changeTypeForSource()`, keeping the two
vocabularies separate rather than conflating them — `change_source` says WHO initiated the
write (open set, free to grow with new server-side jobs), `change_type` says WHAT KIND of
change it was (small closed set, the column Version History actually renders). `create()`
gains the parameter it never had; callers that state only a source get an honest default.

The fail-safe direction is the important part: unknown sources fall through to `agent_write`,
on the reasoning that the one label the product must never hand out by default is the claim
that a human typed it.

One deliberate exception, stated rather than derived: the orphan-reclaim branch in
`chapters/[chapterId]/content/route.ts` passes `"manual_edit"` explicitly, because the
`change_source` there is a server-side label (`ORPHAN_RECLAIM_SOURCE`) but the content really
is the writer's own markdown landing on a reclaimed row.

Suite after the fix: **1727/1727 across 211 files**, 0 failures (independently checked).

**Live verification** against the running build — three documents created through
`POST /api/books/:id/documents`, their version rows read straight from the database, then
deleted:

| `change_source` sent | `change_type` stored | badge rendered |
|---|---|---|
| `agent` | `agent_write` | "AI" |
| `import` | `import` | "Import" |
| `user` | `manual_edit` | "Manual" |

Before the fix all three stored `manual_edit`. Book counters were unchanged by the probe
churn (`14|1`), which incidentally re-exercises D-200's reconcile on the document routes.

**Residual, knowingly left open:** historical rows keep their wrong badge. No backfill was
written, so documents created before `dced6f0` — including the recovered Story Bible from the
50a capture — still show "Manual" in Version History.
