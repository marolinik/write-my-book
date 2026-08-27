import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { updateChapterContentSchema } from "@/lib/validation";
import { DocumentService, VersionConflictError } from "@/lib/documents";
import {
  isOrphanedChapterContent,
  ORPHAN_RECLAIM_SOURCE,
} from "@/lib/documents/orphan-chapter-content";
import { DocumentType } from "@/generated/prisma/enums";
import { countWords } from "@/lib/utils";
import { onDocumentChanged } from "@/lib/vector/memory-manager";
import { canIndexProseForUser } from "@/lib/vector/indexing-gate";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";
import { zodErrorResponse } from "@/lib/api/zod-error";

/** Replace U+FFFD replacement characters with em dash (most common corruption case). */
function sanitizeUnicode(text: string): string {
  return text.replace(/\uFFFD/g, '\u2014');
}

/**
 * D-47 \u2014 trusted non-interactive writers allowed to overwrite existing chapter
 * content WITHOUT an optimistic-lock stamp (`expectedVersion`).
 *
 * The optimistic-lock CAS added in 29af79e is OPT-IN: it only fires when the
 * client stamps `expectedVersion`. A raw client \u2014 or a stale browser tab \u2014
 * that omits the stamp used to silently last-write-wins (P7-func J-4: 5
 * concurrent PUTs all 200, 4 versions vanished). We now REQUIRE the stamp for
 * interactive writers (`user`/`manual`/default) when overwriting a document
 * that already exists, rejecting a stampless overwrite with 409 + current
 * server state instead of clobbering.
 *
 * These sources bypass that requirement because none is the "stale tab"
 * scenario D-47 targets, and rejecting them would break a real flow:
 *   - `conflict-backup`  the save-conflict dialog's OWN backup step
 *     (handleLoadTheirs) \u2014 an intentionally unguarded save whose sole job is to
 *     preserve the local unsaved words as a recoverable version BEFORE the
 *     guarded resolve re-applies the CAS. Rejecting it would destroy words.
 *   - `agent`/`import`/`restore`/`system`/`migration`  server-side, single-
 *     writer operations that deliberately replace content wholesale with no
 *     competing human editor; they intentionally last-write-wins.
 *
 * Safe because `changeSource` is the same field the DocumentVersion audit trail
 * already records, and every write is ownership-fenced to the caller's own book
 * \u2014 a spoofed source can only self-clobber, never damage another user. The
 * threat mitigated here is ACCIDENTAL concurrency (two tabs), not a malicious
 * self-overwrite. `user`/`manual` are deliberately NOT in this set.
 */
const TRUSTED_VERSIONLESS_SOURCES = new Set<string>([
  "conflict-backup",
  "agent",
  "import",
  "restore",
  "system",
  "migration",
]);

type RouteParams = { params: Promise<{ id: string; chapterId: string }> };

/** GET /api/books/:id/chapters/:chapterId/content — get chapter markdown. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, chapterId } = await params;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, bookId },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, bookId);
    const doc = await svc.findByType(
      DocumentType.CHAPTER_CONTENT,
      chapter.chapterNumber
    );

    // D-190/D-115: a document left behind by a DELETED chapter that used to
    // hold this number is not this chapter's prose. Serve the chapter as what
    // it is — empty — and withhold the orphan's id and version so the editor
    // cannot stamp a save against it or present its history as this chapter's.
    if (
      doc &&
      isOrphanedChapterContent({
        docCreatedAt: doc.createdAt,
        chapterCreatedAt: chapter.createdAt,
        chapterWordCount: chapter.wordCount,
      })
    ) {
      return NextResponse.json({ markdown: "", wordCount: 0 });
    }

    if (!doc) {
      return NextResponse.json({ markdown: "", wordCount: 0 });
    }

    // readPinned: pair currentVersion with that exact version's snapshot so
    // the client's initial version stamp matches the content it loaded.
    const result = await svc.readPinned(doc.id);

    const rawContent = result?.content ?? "";
    return NextResponse.json({
      markdown: sanitizeUnicode(rawContent),
      wordCount: chapter.wordCount,
      documentId: doc.id,
      version: result?.document.currentVersion ?? doc.currentVersion,
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error(
      "GET /api/books/:id/chapters/:chapterId/content error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}

/** PUT /api/books/:id/chapters/:chapterId/content — save chapter markdown. */
export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, chapterId } = await params;
    const body = await parseJsonBody(req);
    const parsed = updateChapterContentSchema.parse(body);
    // DX alias: `content` normalizes to `markdown` (see validation.ts).
    const data = { ...parsed, markdown: parsed.markdown ?? parsed.content! };

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
    });

    if (!book) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const chapter = await db.chapter.findFirst({
      where: { id: chapterId, bookId },
    });

    if (!chapter) {
      return NextResponse.json(
        { error: "Chapter not found" },
        { status: 404 }
      );
    }

    const svc = new DocumentService(user.id, bookId);
    const existingDoc = await svc.findByType(
      DocumentType.CHAPTER_CONTENT,
      chapter.chapterNumber
    );

    const wordCount = countWords(data.markdown);

    /**
     * Update an existing document (optimistically locked when the client
     * stamps expectedVersion; legacy bodies stay last-write-wins). Returns the
     * new version number, or the 409 response when the CAS rejects.
     */
    const updateExisting = async (doc: {
      id: string;
      currentVersion: number;
    }): Promise<number | NextResponse> => {
      try {
        const result = await svc.update(
          doc.id,
          data.markdown,
          undefined,
          // D-199: this route serves every TRUSTED_VERSIONLESS_SOURCE too, so
          // a hardcoded "manual_edit" badged agent/system/import saves as the
          // writer's own typing. Let the service derive it from the source.
          undefined,
          data.changeSource ?? "user",
          data.expectedVersion
        );
        // Stamp the client with the DocumentVersion row created inside the
        // CAS transaction (always expectedVersion+1 under the lock) — NOT the
        // re-read document.currentVersion, which can already reflect a
        // concurrent unguarded writer and would convert a detectable 409
        // into a silent overwrite on the next stamped save.
        return result.version.version;
      } catch (error) {
        if (error instanceof VersionConflictError) {
          // CAS rejected — nothing was written. Return the server's current
          // state before any word-count mutation. Sanitize identically to
          // GET so client equality checks are symmetric. readPinned pairs
          // currentVersion with that exact version's snapshot content (the
          // live key may not be written yet by the winning writer).
          const current = await svc.readPinned(doc.id);
          return NextResponse.json(
            {
              error: "version_conflict",
              currentVersion:
                current?.document.currentVersion ?? doc.currentVersion,
              serverContent: sanitizeUnicode(current?.content ?? ""),
            },
            { status: 409 }
          );
        }
        throw error;
      }
    };

    let version: number;

    // D-190/D-115: the row found here can be the leftover content of a DELETED
    // chapter that used to hold this number (GET withheld it, so this client
    // never saw it and carries no stamp). Treat the save as this chapter's
    // genuine FIRST save: reclaim the row by overwriting it wholesale — no CAS
    // stamp demanded (the phantom 409 that leaked `serverContent` in the
    // registered repro is exactly this branch) and no merge, so the deleted
    // prose cannot re-enter the manuscript. The reclaim is labelled in version
    // history; the dead chapter's older versions are left intact for restore.
    const reclaimingOrphan =
      !!existingDoc &&
      isOrphanedChapterContent({
        docCreatedAt: existingDoc.createdAt,
        chapterCreatedAt: chapter.createdAt,
        chapterWordCount: chapter.wordCount,
      });

    if (existingDoc && reclaimingOrphan) {
      const result = await svc.update(
        existingDoc.id,
        data.markdown,
        undefined,
        // Stated, not derived (D-199): the SOURCE is a server-side label, but
        // the content is the writer's own markdown — this is a manual edit
        // that happens to land on a reclaimed row.
        "manual_edit",
        ORPHAN_RECLAIM_SOURCE
      );
      version = result.version.version;
    } else if (existingDoc) {
      // D-47: overwriting an ALREADY-EXISTING document without an
      // optimistic-lock stamp is a silent last-write-wins (J-4). Require the
      // stamp for interactive writers; trusted non-interactive writers bypass
      // (see TRUSTED_VERSIONLESS_SOURCES). Reject with the SAME 409 envelope the
      // stale-CAS path returns, so the editor's existing conflict dialog
      // resolves it — never a silent clobber. (The P2002 first-save convergence
      // below is intentionally NOT guarded: that client omits the version
      // because it was creating a new document, not overwriting a loaded one.)
      if (
        data.expectedVersion === undefined &&
        !TRUSTED_VERSIONLESS_SOURCES.has(data.changeSource ?? "user")
      ) {
        const current = await svc.readPinned(existingDoc.id);
        return NextResponse.json(
          {
            error: "version_conflict",
            currentVersion:
              current?.document.currentVersion ?? existingDoc.currentVersion,
            serverContent: sanitizeUnicode(current?.content ?? ""),
          },
          { status: 409 }
        );
      }

      const updated = await updateExisting(existingDoc);
      if (updated instanceof NextResponse) return updated;
      version = updated;
    } else {
      // Create new document. Two first-saves can race this check-then-create:
      // the DB unique on (bookId, type, chapterNumber) makes the loser's
      // INSERT fail with P2002 instead of minting a duplicate row (D-16) —
      // the loser re-fetches the winner's row and converges through the
      // normal existing-doc update path, CAS included.
      try {
        await svc.create(
          DocumentType.CHAPTER_CONTENT,
          data.markdown,
          chapter.title ?? `Chapter ${chapter.chapterNumber}`,
          chapter.chapterNumber,
          chapter.actNumber,
          data.changeSource ?? "user"
        );
        version = 1;
      } catch (error) {
        if ((error as { code?: string })?.code !== "P2002") throw error;
        const winner = await svc.findByType(
          DocumentType.CHAPTER_CONTENT,
          chapter.chapterNumber
        );
        // Unique violation with no row visible would mean the winner vanished
        // between INSERT and re-read — surface the original error.
        if (!winner) throw error;
        const updated = await updateExisting(winner);
        if (updated instanceof NextResponse) return updated;
        version = updated;
      }
    }

    // Update chapter and book word counts
    const oldWordCount = chapter.wordCount;
    const wordDelta = wordCount - oldWordCount;

    await db.chapter.update({
      where: { id: chapterId },
      data: { wordCount },
    });

    await db.book.update({
      where: { id: bookId },
      data: { wordCount: { increment: wordDelta } },
    });

    // Index the saved prose into vector memory (fire-and-forget, debounced).
    // The agent-write and document-update paths already do this; the human
    // editor's chapter-content save did NOT, so a manually-written manuscript
    // was never embedded and semantic recall stayed empty (VM1).
    //
    // Indexing is the ONLY per-free-user platform-LLM spend (OpenAI
    // embeddings), so it is gated behind the Free-tier word cap (A9). The
    // content SAVE above is already committed and is NEVER blocked — only this
    // fire-and-forget indexing side-effect pauses past the cap. Queries stay
    // ungated, so the moat remains demo-able.
    void canIndexProseForUser(user.id)
      .then((ok) => {
        if (!ok) return;
        return onDocumentChanged(bookId, "CHAPTER_CONTENT", data.markdown, {
          userId: user.id,
          chapterId,
          chapterNumber: chapter.chapterNumber,
          seriesId: book.seriesId,
          language: book.language,
          version,
        });
      })
      .catch(() => {});

    // book.wordCount is the pre-update value (fetched above); wordDelta is this
    // save's change — their sum is the new cumulative total the client needs.
    return NextResponse.json({
      wordCount,
      version,
      bookWordCount: book.wordCount + wordDelta,
    });
  } catch (error) {
    const invalidJson = invalidJsonBodyResponse(error);
    if (invalidJson) return invalidJson;
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const zodRes = zodErrorResponse(error);
    if (zodRes) return zodRes;
    console.error(
      "PUT /api/books/:id/chapters/:chapterId/content error:",
      error
    );
    return NextResponse.json(
      { error: "Failed to save content" },
      { status: 500 }
    );
  }
}
