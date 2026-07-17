# Vector-memory findings (P7 / D8 / W3) — verified 2026-07-17 with live OpenAI quota

Discovered during env-wiring; confirmed once the OpenAI embeddings key had quota (`text-embedding-3-small`, 1536-dim, live). Owner P7 (Bao) / dimension D8 (memory quality) + W3 (recall-at-scale). These are the vector side of the memory moat and are currently **non-functional in practice**.

## VM1 — Content save does NOT trigger indexing (S2)
**Observed:** PUT chapter content (200) → `GET /api/memory/stats?bookId=` returns `chunkCount: 0`, `lastIndexed: null`, even after a 3s wait. Only an explicit `POST /api/memory/rebuild` produces any chunks.
**Impact:** a writer's prose is never embedded as they write; vector recall is empty unless the user manually rebuilds (no UI affordance surfaced for that on the writing path). The "memory that compounds" pitch silently does nothing on the normal write loop.
**Root cause (to confirm in fix):** the chapter-content PUT path (`src/app/api/books/[id]/chapters/[chapterId]/content/route.ts`) has no `onDocumentChanged`/`indexDocument` call wired; `rebuildBookIndex` comments explicitly say it "relies on onDocumentChanged to be called when content is actually available."
**Repro:** seed persona P2 (pro), create book, PUT chapter markdown, poll stats → chunkCount stays 0.

## VM2 — `rebuildBookIndex` embeds a placeholder stub, not the prose (S2)
**Observed:** after rebuild, `chunkCount: 1`, `embeddingTokens: 38`. 38 tokens ≈ the literal placeholder string, not a 40-sentence chapter.
**Root cause (code-confirmed):** `src/lib/vector/cleanup.ts:149-162` — rebuild indexes
```
`[Document: ${doc.type}] Storage key: ${doc.storageKey}`
```
i.e. a metadata stub, NOT the S3 document content. The comments admit it: *"documents use S3 storageKey, so we skip direct content indexing here … placeholder that will work when DocumentService is wired in."*
**Impact:** even after a manual rebuild, vector search matches the storage-key stub, not the manuscript. Semantic recall (the moat) returns garbage-relevance. Any W3 recall-precision measurement on this path is meaningless until fixed.
**Next step for P7:** dump the Qdrant `wmb_memory` payload for the indexed point to show the stored text is the stub (evidence bundle), then fix rebuild to read content via DocumentService (S3) and chunk the real prose, AND wire on-save indexing (VM1).

## RESOLUTION (both FIXED + live-verified 2026-07-17)
- **VM1 FIXED** — the chapter-content PUT route now fires `onDocumentChanged(bookId, "CHAPTER_CONTENT", markdown, {chapterNumber, chapterId, seriesId, language, version})` (fire-and-forget, debounced), mirroring the documents-update and agent-write paths. **Live proof:** a fresh content save (no manual rebuild) produced `chunkCount: 2, embeddingTokens: 649` — real prose, vs the 38-token stub before.
- **VM2 FIXED** — `rebuildBookIndex` (cleanup.ts) now reads each document's real content via `DocumentService.read(doc.id)` and indexes THAT, skipping empty docs; no more `[Document: …] Storage key:` placeholder. **Live proof:** clear→rebuild produced `chunkCount: 2, embeddingTokens: 1350` (real prose). **Regression lock:** tests/unit/vector-rebuild-content.test.ts asserts indexDocument receives storage content, never a stub. VM1 is live-verified (its route mirrors the already-covered documents path; a full route unit-lock was deferred as low-risk).

## Severity + placement
Both S2 (journey-blocking for the memory moat, not data-loss). They gate D8 (memory quality) and W3 (longitudinal recall) — those cannot score until VM1+VM2 are fixed. NOT blocked by env anymore (OpenAI quota is live); this is a code gap. Added to the defect backlog for the P7 journey / Phase-4 fix loop.

Graph continuity (Neo4j, BYOK/qwen) is a SEPARATE path and works — P3 series continuity is unaffected by these.
