import { db } from "@/lib/db";
import { countWords } from "@/lib/utils";
import { getBookStorage, getSeriesStorage } from "@/lib/storage";
import type { StorageAdapter } from "@/lib/storage/types";
import type { DocumentType } from "@/generated/prisma/enums";
import { getStoragePath, getVersionStoragePath } from "./storage-keys";
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
   * Create a new document with initial content.
   */
  async create(
    type: DocumentType,
    content: string,
    title?: string,
    chapterNumber?: number,
    actNumber?: number,
    changeSource: string = "user"
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
        changeType: "manual_edit",
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
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) return null;

    const content = await this.storage.read(document.storageKey);

    return { document, content: content ?? "" };
  }

  /**
   * Update a document's content, creating a new version.
   */
  async update(
    documentId: string,
    content: string,
    title?: string,
    changeType: string = "manual_edit",
    changeSource: string = "user"
  ) {
    const document = await db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    // Write updated content to the document's storage path
    await this.storage.write(document.storageKey, content);

    // Create a new version
    const vm = new VersionManager(documentId, this.storage);
    const version = await vm.createVersion(content, changeType, changeSource);

    // Update title if provided
    if (title !== undefined) {
      await db.document.update({
        where: { id: documentId },
        data: { title },
      });
    }

    const updated = await db.document.findUnique({
      where: { id: documentId },
    });

    return { document: updated!, version };
  }

  /**
   * Delete a document and all its versions from DB and S3.
   */
  async delete(documentId: string) {
    const document = await db.document.findUnique({
      where: { id: documentId },
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
    await db.document.delete({ where: { id: documentId } });
  }

  /**
   * Find a document by type and optional chapter number.
   */
  async findByType(type: DocumentType, chapterNumber?: number) {
    const where: Record<string, unknown> = { type };

    if (this.bookId) where.bookId = this.bookId;
    if (this.seriesId) where.seriesId = this.seriesId;
    if (chapterNumber !== undefined) where.chapterNumber = chapterNumber;

    return db.document.findFirst({ where });
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
    const vm = new VersionManager(documentId, this.storage);
    return vm.getVersions();
  }

  /**
   * Restore a specific version of a document.
   */
  async restoreVersion(documentId: string, version: number) {
    const document = await db.document.findUnique({
      where: { id: documentId },
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

    const updated = await db.document.findUnique({
      where: { id: documentId },
    });

    return { document: updated!, version: restoredVersion };
  }

  /**
   * Get the content of a specific version.
   */
  async getVersionContent(documentId: string, version: number) {
    const vm = new VersionManager(documentId, this.storage);
    return vm.getVersionContent(version);
  }
}
