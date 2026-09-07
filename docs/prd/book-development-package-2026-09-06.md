# PRD — Book Development Package (Idea → Synopsis → Structure → Research → Draft)

- **Status:** Implemented
- **Date:** 2026-09-06
- **Scope owner:** WriteMyBook product
- **Related docs:** `docs/PRODUCTION-SIGNOFF-2026-09-04.md`, `docs/HARDENING-2026-09-02.md`

## 1. Problem / motivation

The product launches a book through a greenfield (new novel) or brownfield (imported
manuscript) on-ramp and then into a blank editor. Reviewing the pipeline the author
expects from "idea" to "draft" — **idea → synopsis → structure → planning → research →
draft** — exposed two gaps and one engine upgrade:

1. **There was no SYNOPSIS stage.** A `CONCEPT` document type existed, but the
   `new-novel` workflow only talked about premise/characters conversationally and did
   **not persist** a concept. There was no `SYNOPSIS` document type, no workflow, and no
   journey checkpoint between "idea" and "structure". Structure (`ARCHITECTURE`),
   planning (`CHAPTER_PLAN`), research (`WORLD_RESEARCH`/`TOPIC_RESEARCH`) and draft
   (`CHAPTER_CONTENT`) all existed and still work.
2. **The "idea → concept" step was not an artifact.** `new-novel`/`onboard-new-book` were
   conversational-only, so a writer's premise vanished unless they manually saved it.
3. **Web research used only Serper/DDG.** `WebSearch` was Serper-primary with a
   DuckDuckGo HTML fallback; `FetchWebPage` did an in-process HTML scrape. The team asked
   to add **Perplexity** (synthesized answers + citations) and **Firecrawl** (clean
   markdown) as provider options.

## 2. Goals

- Add a first-class **Synopsis** stage: a persisted `SYNOPSIS` document, a
  `write-synopsis` workflow/agent prompt, and a journey checkpoint in the
  `new-novel` path.
- Make **CONCEPT** a real persisted artifact written by the onboarding flows, feeding
  the Synopsis.
- Add **Provider-selectable web research**: Perplexity for search, Firecrawl for page
  fetching, with graceful fallback to the existing Serper/DDG + in-process scrape.
- Do it with the same rigor as the prior hardening pass: schema migration, type-safe
  wiring, unit tests, full suite green, type-check clean, e2e still green.

## 3. Non-goals

- ~~No new separate "Book Development" hub UI in v1~~ → **delivered (2026-09-07, commit
  `f37c00d`):** a dedicated hub at `/books/[bookId]/dev` renders Idea → Synopsis →
  Structure → Research → Plan → Draft as state-aware cards.
- No changes to the two-mandatory-processes deployment contract.
- No removal of the existing Serper/DDG or in-process fetch paths (kept as fallbacks).

## 4. Detailed design

### 4.1 New `SYNOPSIS` document type

DB enum (`prisma/schema.prisma`), generated Prisma client, `S3` storage path, and the
REST `createDocumentSchema` enum:

```
enum DocumentType { CONCEPT, SYNOPSIS, STORY_BIBLE, ... }
```

- Storage path: `.planning/SYNOPSIS.md` (book-level singleton).
- `SYNOPSIS` is **book-scoped** (not chapter-scoped), so it is not in
  `CHAPTER_SCOPED_DOC_TYPES` and carries no chapterNumber.

### 4.2 Synopsis workflow + prompts

- New workflow `write-synopsis` (category `setup`, `producesDocument: SYNOPSIS`,
  prerequisite `CONCEPT` via `new-novel`), primary agent **scene-planner** (has
  `ReadDocument`/`WriteDocument`/`ListDocuments` — sufficient to write the doc).
- New `WORKFLOW_INSTRUCTION_OVERRIDES["write-synopsis"]` prompt specifying the synopsis
  structure (Logline → Opening → Inciting Incident → Rising Action → Climax →
  Resolution → Themes), size ~800–1800 words, requirement to `WriteDocument` with
  `documentType='SYNOPSIS'`.
- Coach delegation entry (`COACH_DECISION_MAP["write-synopsis"]`) and journey wiring
  (`new-novel` journey inserts `write-synopsis` after `new-novel`).
- Journey completion: `StepCompletionInput.hasSynopsis` drives `isStepComplete`.
- Downstream context: agents with `contextProfile.synopsis='full'` (ghostwriter,
  story-architect) receive the synopsis as `<story_synopsis>...</story_synopsis>` in
  their prompt context.

### 4.3 CONCEPT persistence

- `new-novel` coach prompt now requires `WriteDocument(documentType='CONCEPT')`.
- `onboard-new-book` PHASE 2 writes a CONCEPT doc first, then delegates to
  style / story-bible / synopsis / architecture.

### 4.4 Web research providers

- `WebSearch`: **Perplexity** (when `PERPLEXITY_API_KEY` set) → **Serper** →
  **DuckDuckGo**. Perplexity returns a synthesized, citation-tagged answer; citations are
  renumbered and appended as a `CITATIONS` list.
- `FetchWebPage`: **Firecrawl** (when `FIRECRAWL_API_KEY` set) → in-process
  `safeExternalFetch` + HTML→text. Firecrawl returns clean LLM-ready markdown; SSRF guard
  remains enforced because the URL is still validated by our policy before Firecrawl is
  called only on the *origin* — the external fetch to Firecrawl itself is whitelisted.
- New env vars (all optional, in `.env.example`): `PERPLEXITY_API_KEY`,
  `PERPLEXITY_API_URL`, `PERPLEXITY_MODEL`, `FIRECRAWL_API_KEY`, `FIRECRAWL_API_URL`.

### 4.5 Security notes

- `FetchWebPage` still refuses private/internal targets (SSRF) before any provider call.
- The new keys are optional; production validation (`env.ts`) is unchanged — no new
  required secrets are introduced.
- Agent tools: the `SYNOPSIS` doc is written only via the locked `WriteDocument` tool;
  no new privileges.

## 5. Implementation checklist (done)

- [x] `prisma/schema.prisma`: add `SYNOPSIS` to `DocumentType`; `prisma generate`.
- [x] `src/lib/documents/storage-keys.ts`: `SYNOPSIS → .planning/SYNOPSIS.md`.
- [x] `src/lib/validation.ts`: add `SYNOPSIS` to `createDocumentSchema` enum.
- [x] `src/lib/agents/tool-labels.ts`: `CONCEPT` + `SYNOPSIS` labels (en fallback).
- [x] `src/lib/agents/types.ts`: add `synopsis` to `AgentContextProfile` and
      `AgentContext`.
- [x] `src/lib/agents/definitions.ts`: `synopsis` per-agent (full for ghostwriter +
      story-architect, none otherwise).
- [x] `src/lib/agents/workflows.ts`: `write-synopsis` workflow.
- [x] `src/lib/agents/journeys.ts`: journey step, `emit`/`hasSynopsis`, nav + labels.
- [x] `src/lib/agents/prompt-assembler.ts`: `write-synopsis` override + coach map,
      `new-novel` CONCEPT persistence, `onboard-new-book` CONCEPT + synopsis, synopsis
      context section.
- [x] `src/lib/agents/tools.ts`: Perplexity (WebSearch) + Firecrawl (FetchWebPage).
- [x] `src/hooks/use-book-state.ts`: `hasSynopsis` signal wired into journey progress.
- [x] `.env.example`: document the new optional search keys.

## 6. Acceptance criteria

1. A new book → `new-novel` persists a `CONCEPT` document.
2. `write-synopsis` (manual or in the `new-novel` journey) writes a `SYNOPSIS` document;
   the journey marks it complete via `hasSynopsis`.
3. Story-Architect architect runs `build-architecture` with the synopsis in context.
4. `WebSearch` honors `PERPLEXITY_API_KEY` (citations) and falls back to Serper/DDG.
5. `FetchWebPage` honors `FIRECRAWL_API_KEY` (markdown) and falls back to the in-process
   path.
6. `tsc --noEmit` clean; full unit suite passes; browser e2e still green in CI.

## 7. Known follow-ups (tracked)

- ~~Add a dedicated **Book Development hub** UI~~ → **delivered (2026-09-07)** at
  `/books/[bookId]/dev` (see §3). Remaining ideas if useful:
  - Make the hub tabs raise the individual stage workflows from one place (Idea ↔ Concept,
    Synopsis, Structure, Research, Plan, Draft).
  - Highlight the recommended next stage based on the journey recommendation.
- Optionally feed SYNopsis to more agents (dev-editor, continuity-checker) if it helps
  chapter-level review.