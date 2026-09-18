# Live-testing backlog — S3, 2026-09-18

Second live pass, the owner writing in the product against the local fleet
(`user_marko`, DeepSeek V4.1 Flash) on the real Legat trilogy. Items are listed
in the order he reported them and are fixed in that order.

Status legend: **DONE** (fixed + verified), **OPEN**, **PARTIAL**.

| # | What | Status |
|---|---|---|
| S3-1 | `/books` died on a client hook | **DONE** — D-206, commit `4371e35` |
| S3-2 | Library groups do not follow the flow; "Other" is a dumping ground | **DONE** |
| S3-3 | The library surface is still hardcoded English | PARTIAL — group labels, empty states and type names done; page chrome left |

---

## S3-1 — /books threw for every writer (DONE)

**D-206.** The i18n sweep gave the shelf card's `PrimaryCta` a `useLanguage()`
call. The book list is server rendered and that is a client hook, so the page
died inside its error boundary — "Nešto je pošlo naopako", no hint of a cause,
at request time rather than build time.

Fixed in `4371e35`: the strings travel as props from `books/page.tsx`, which
already resolves the dictionary with `getUIStrings`. Two English leftovers in
the same component were translated on the way through (continue-to-chapter,
"Review feedback"). `tests/unit/client-hook-boundary.test.ts` guards the class
of mistake by walking the import graph out from every server entry, stopping at
the first `"use client"` module.

---

## S3-2 — the library groups do not follow the flow (DONE)

> "redosled grupisanja artifakata bi idealno bio kao u flow u od početka do
> kraja... ovako je malo konfuzno, ovo other.. i sl..."

`DOC_GROUPS` in `src/components/book/documents-library.tsx` names five groups —
Setup, Chapters, Editorial, Analysis & Reports, Other — and lists the types each
one owns. Anything it does not list falls through to **Other**:

```ts
const unknownDocs = filteredDocs.filter((d) => !allDocTypes.has(d.type));
if (unknownDocs.length > 0) {
  const otherGroup = grouped.find((g) => g.key === "other");
  if (otherGroup) otherGroup.docs.push(...unknownDocs);
}
```

Four real document types are missing from every group, so the writer finds them
under a gear icon labelled "Other":

| Type | Where it comes from | Where it lands today |
|---|---|---|
| `SYNOPSIS` | `write-synopsis` — the spine of the book | Other |
| `BOOK_PLAN` | `plan-chapters-from-synopsis` | Other |
| `WORLD_RESEARCH` | `research` workflows | Other |
| `TOPIC_RESEARCH` | `research` workflows | Other |

They are also missing from `DOC_TYPE_LABELS` and `DOC_TYPE_ICONS`, which is why
the synopsis card shows the raw enum name `SYNOPSIS` as its subtitle instead of
a title, with a generic file icon.

The ordering problem is separate from the missing homes. The product already
states its own order twice, and the library agrees with neither:

- `development-stages.ts` (greenfield): idea → synopsis → structure → research
  → plan → draft
- `manuscript-stages.ts` (importer): read → style → bible → architecture →
  analyze → restructure → edit

Both put **analysis before editorial** — `analyze` suggests `restructure`, which
suggests `dev-edit`, and the Razvoj board renders them 5, 6, 7 in that order.
The library puts Editorial before Analysis & Reports.

**The fix:** one spine that both boards fold into, every `DocumentType` given a
home, and "Other" kept only for a genuinely unrecognised type.

| # | Group | Types |
|---|---|---|
| 1 | Idea & voice | `CONCEPT`, `FINGERPRINT`, `STORY_BIBLE` |
| 2 | Structure | `SYNOPSIS`, `ARCHITECTURE`, `BOOK_PLAN` |
| 3 | Research | `WORLD_RESEARCH`, `TOPIC_RESEARCH` |
| 4 | Chapters | `CHAPTER_BRIEF`, `CHAPTER_PLAN`, `CHAPTER_CONTENT` |
| 5 | Analysis | `ANALYSIS_REPORT`, `CONTINUITY_REPORT`, `STRUCTURE_PROPOSAL` |
| 6 | Editorial | `DEV_EDIT_REPORT`, `LINE_EDIT_REPORT`, `BETA_READ_REPORT` |
| 7 | Publishing | `MARKET_REPORT`, `EXPORT_CONFIG` |
| 8 | Notes | `FREEWRITE` |

**Shipped.** The spine moved out of the component into
`src/lib/documents/library-groups.ts`, which is plain data plus a pure
`groupDocuments()` — no React, so it is testable directly.
`tests/unit/library-groups.test.ts` parses the `DocumentType` enum out of
`schema.prisma` and asserts every book-level value is claimed by exactly one
group, so a type added later fails the build instead of quietly reappearing
under "Other". An unrecognised type now lands in Notes: a document the writer
can still see beats one that vanishes.

The component kept only the icons and the label lookup. Its private
`DOC_TYPE_LABELS` — English-only, and it had never heard of `SYNOPSIS` — was
deleted in favour of `getDocumentTypeLabels()` in `tool-labels.ts`, which
already carried every type in all seven languages. `BOOK_PLAN` was missing
there and was added.

Verified live on *Legat - Zakletva*: Zamisao i glas → Struktura → Poglavlja →
Analiza → Redakcija, the synopsis filed under Struktura, and no "Other".

---

## S3-3 — the library surface is hardcoded English (PARTIAL)

Visible in the same screenshot, in an otherwise Serbian app: the group headings
("Analysis & Reports", "Other"), every entry in `DOC_TYPE_LABELS` ("Continuity
Report", "Analysis Report"), and the empty-state CTAs ("Run Dev Edit", "Run
Setup Wizard", "No editorial documents yet"). The component is already a client
module holding `useLanguage()`, so this is dictionary work, not plumbing.

**Done as part of S3-2**, because the groups were being renamed anyway: the
eight group labels (new `docLibrary` dictionary section, seven languages), the
empty-state sentence, the CTA — which reuses the already-translated workflow
names from `getAgentStrings().workflows` rather than adding a string per group
— and the document type names.

**Still English on that page:** the header ("Documents", "39 documents —
organized by workflow stage."), the quick-action buttons ("New Document", "Dev
Edit", "Discuss Edits"), the per-chapter headings ("Chapter 1"), the relative
timestamps ("16h ago"), and the search/empty copy. Also `SYNOPSIS` reads
"Synopsis" in the Serbian dictionary — untranslated, not missing.

Part of the O1 remainder, but it sits on a daily surface rather than on
marketing copy, so it belongs here rather than in the tail.

---

## Carried from earlier today

Found while rehearsing the structural revision pass; see
`BACKLOG-LIVE-TESTING.md` for the full write-ups.

| # | What | Severity |
|---|---|---|
| D-204 | Applied structure moves render their `resultSummary` in English | LOW |
| D-205 | Accept-then-undo drifts `book.wordCount` though the prose is byte-identical | LOW |
| — | Shelf card subtitle still English ("56.874 words · drafted 31/31 · last touched today") | LOW |
| — | "3 knjiga" should be "3 knjige" — Serbian needs a third plural form the dictionaries do not carry | LOW |
