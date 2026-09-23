/**
 * What a judge reads before it answers: the chapter's prose and the writer's
 * captured voice. Shared by every judged pass over a chapter, so each asks
 * against the same evidence read the same way.
 */

export async function readChapterText(
  bookId: string,
  chapterNumber: number
): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const doc = await db.document.findFirst({
    where: { bookId, type: "CHAPTER_CONTENT", chapterNumber },
    select: { storageKey: true, book: { select: { userId: true } } },
  });
  if (!doc?.book) return null;
  const { getBookStorage } = await import("@/lib/storage");
  return getBookStorage(doc.book.userId, bookId).read(doc.storageKey);
}

export async function readVoiceFingerprint(bookId: string): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const doc = await db.document.findFirst({
    where: { bookId, type: "FINGERPRINT" },
    select: { storageKey: true, book: { select: { userId: true } } },
  });
  if (!doc?.book) return null;
  const { getBookStorage } = await import("@/lib/storage");
  return getBookStorage(doc.book.userId, bookId).read(doc.storageKey);
}

/** The book's canon, when it has one. */
export async function readStoryBible(bookId: string): Promise<string | null> {
  const { db } = await import("@/lib/db");
  const doc = await db.document.findFirst({
    where: { bookId, type: "STORY_BIBLE" },
    select: { storageKey: true, book: { select: { userId: true } } },
  });
  if (!doc?.book) return null;
  const { getBookStorage } = await import("@/lib/storage");
  return getBookStorage(doc.book.userId, bookId).read(doc.storageKey);
}
