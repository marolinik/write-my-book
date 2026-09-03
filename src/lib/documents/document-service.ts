import { db } from "@/lib/db";
import { countWords } from "@/lib/utils";
import { getBookStorage, getSeriesStorage } from "@/lib/storage";
import type { StorageAdapter } from "@/lib/storage/types";
import type { DocumentType } from "@/generated/prisma/enums";
import { getStoragePath, getVersionStoragePath } from "./storage-keys";
import { changeTypeForSource } from "./change-type";
import { VersionManager } from "./version-manager";

export class DocumentService {
  private storage: StorageAdapter;

  constructor(
    private userId: string,
    private bookId?: string,
    private seriesId?: string
  ) {
    if (bookId) {
      this.storage = getBookStorage(userId, bookId);
    } else if (seriesId) {
      this.storage = getSeriesStorage(userId, seriesId);
    } else {
      throw new Error("Either bookId or seriesId is required");
    }
  }

  /**
   * Tenant fence for every id-addressed operation (H1 hardening). A raw
   * document id must belong to the book/series this service is scoped to,
   * AND that parent must be owned by this service's user. Routes already
   * pre-check the parent where they construct this service — but three GET
   * surfaces historically passed foreign doc ids straight through to
   * `read()`. Enforcing here makes the service safe by construction for
   * every current and future caller.
   */
  private scopedWhere(documentId: string) {
    return this.bookId
      ? { id: documentId, bookId: this.bookId, book: { userId: this.userId } }
      : { id: documentId, seriesId: this.seriesId!, series: { userId: this.userId } };
  }

  /**
   * Create a new document with initial content.
   *
   * D-199: `changeType` used to be hardcoded to "manual_edit" here, so every
   * created document — agent-written, imported, transcript-recovered — was
   * badged as the writer's own typing in Version History. Callers that know
   * better pass it; the rest get it derived from `changeSource` (see
   * change-type.ts for why the two columns are separate vocabularies).
   */
  async create(
    type: DocumentType,
    content: string,
    title?: string,
    chapterNumber?: number,
    actNumber?: number,
    changeSource: string = "user",
    changeType: string = changeTypeForSource(changeSource)
  ) {
    const storagePath = getStoragePath(type, chapterNumber, actNumber);

    // Write content to S3
    await this.storage.write(storagePath, content);

    // Create document record
    const document = await db.document.create({
      data: {
        bookId: this.bookId ?? null,
        seriesId: this.seriesId ?? null,
        type,
        title: title ?? null,
        storageKey: storagePath,
        currentVersion: 1,
        chapterNumber: chapterNumber ?? null,
      },
    });

    // Create initial version
    const versionPath = getVersionStoragePath(document.id, 1);
    await this.storage.write(versionPath, content);

    await db.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storageKey: versionPath,
        changeType,
        changeSource,
        wordCount: countWords(content),
      },
    });

    return document;
  }

  /**
   * Read a document and its current content.
   */
  async read(documentId: string) {
    const document = await db.document.findFirst({
      where: this.scopedWhere(documentId),
    });

    if (!document) return null;

    const content = await this.storage.read(document.storageKey);

    return { document, content: content ?? "" };
  }

  /**
   * Read content consistent with currentVersion. The live key is written
   * AFTER the version transaction commits (see update()), so DB-version +
   * live-key pairs can tear; the snapshot at currentVersion is written
   * inside the transaction (version-manager.ts) and cannot.
   */
  async readPinned(documentId: string) {
    const document = await db.document.findFirst({
      where: this.scopedWhere(documentId),
    });
    if (!document) return null;
    const snap = await this.storage.read(
      getVersionStoragePath(documentId, document.currentVersion)
    );
    if (snap !== null) return { document, content: snap };
    // Fallback: docs whose snapshot is missing (e.g. create()'s brief v1
    // window, or legacy/imported docs) — live key, best effort.
    const content = await this.storage.read(document.storageKey);
    return { document, content: content ?? "" };
  }

  /**
   * Update a document's content, creating a new version.
   *
   * When `expectedVersion` is provided, the write is optimistically locked:
   * a stale version throws `VersionConflictError` before any content is
   * written. Callers omitting it keep last-write-wins semantics.
   *
   * D-199: `changeType` defaulted to "manual_edit" whatever the source said,
   * and `PATCH /documents/:id` takes an optional changeType next to a
   * free-form changeSource — so a stated non-human source still logged as the
   * writer's own typing. Omitting it now derives from the source instead. (It
   * cannot be a parameter default: `changeType` is declared BEFORE
   * `changeSource`, and reordering would silently reassign every positional
   * caller's arguments.)
   */
  async update(
    documentId: string,
    content: string,
    title?: string,
    changeType?: string,
    changeSource: string = "user",
    expectedVersion?: number
  ) {
    const document = await db.document.findFirst({
      where: this.scopedWhere(documentId),
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Version first: the CAS may reject with VersionConflictError, in which
    // case current content must remain untouched.
    const vm = new VersionManager(documentId, this.storage);
    const version = await vm.createVersion(
      content,
      changeType ?? changeTypeForSource(changeSource),
      changeSource,
      expectedVersion
    );

    // Write live content only AFTER versioning succeeded, so a rejected CAS
    // never clobbers current content. (A post-CAS storage failure leaves the
    // live content one version behind the snapshot — recoverable via restore.)
    await this.storage.write(document.storageKey, content);

    // Update title if provided
    if (title !== undefined) {
      await db.document.updateMany({
        where: this.scopedWhere(documentId),
        data: { title },
      });
    }

    const updated = await db.document.findFirst({
      where: this.scopedWhere(documentId),
    });

    return { document: updated!, version };
  }

  /**
   * Delete a document and all its versions from DB and S3.
   */
  async delete(documentId: string) {
    const document = await db.document.findFirst({
      where: this.scopedWhere(documentId),
      include: { versions: true },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Delete all version files from S3
    for (const version of document.versions) {
      await this.storage.delete(version.storageKey);
    }

    // Delete the current content file
    await this.storage.delete(document.storageKey);

    // Delete DB records (versions cascade with document)
    await db.document.deleteMany({ where: this.scopedWhere(documentId) });
  }

  /**
   * Find a document by type and optional chapter number.
   *
   * Ordered oldest-first (D-16): should legacy duplicate rows exist for one
   * (bookId, type, chapterNumber), every reader and writer deterministically
   * lands on the SAME row instead of an arbitrary one — without ordering, GET
   * and PUT could resolve different rows and the CAS 409 could never fire.
   */
  async findByType(type: DocumentType, chapterNumber?: number) {
    const where: Record<string, unknown> = { type };

    if (this.bookId) where.bookId = this.bookId;
    if (this.seriesId) where.seriesId = this.seriesId;
    if (chapterNumber !== undefined) where.chapterNumber = chapterNumber;

    return db.document.findFirst({ where, orderBy: { createdAt: "asc" } });
  }

  /**
   * List documents with optional type filter.
   */
  async list(filter?: { type?: DocumentType; chapterNumber?: number }) {
    const where: Record<string, unknown> = {};

    if (this.bookId) where.bookId = this.bookId;
    if (this.seriesId) where.seriesId = this.seriesId;
    if (filter?.type) where.type = filter.type;
    if (filter?.chapterNumber !== undefined)
      where.chapterNumber = filter.chapterNumber;

    return db.document.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Get version history for a document.
   */
  async getVersions(documentId: string) {
    const scoped = await db.document.findFirst({
      where: this.scopedWhere(documentId),
      select: { id: true },
    });
    if (!scoped) return [];
    const vm = new VersionManager(documentId, this.storage);
    return vm.getVersions();
  }

  /**
   * Restore a specific version of a document.
   */
  async restoreVersion(documentId: string, version: number) {
    const document = await db.document.findFirst({
      where: this.scopedWhere(documentId),
    });

    if (!document) {
      throw new Error("Document not found");
    }

    const vm = new VersionManager(documentId, this.storage);
    const restoredVersion = await vm.restoreVersion(version, "user");

    // Also update the main storage path with the restored content
    const content = await vm.getVersionContent(version);
    if (content !== null) {
      await this.storage.write(document.storageKey, content);
    }

    const updated = await db.document.findFirst({
      where: this.scopedWhere(documentId),
    });

    return { document: updated!, version: restoredVersion };
  }

  /**
   * Get the content of a specific version.
   */
  async getVersionContent(documentId: string, version: number) {
    const scoped = await db.document.findFirst({
      where: this.scopedWhere(documentId),
      select: { id: true },
    });
    if (!scoped) return null;
    const vm = new VersionManager(documentId, this.storage);
    return vm.getVersionContent(version);
  }
}
