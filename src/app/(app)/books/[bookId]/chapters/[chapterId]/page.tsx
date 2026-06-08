import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ManuscriptEditor } from "@/components/editor/manuscript-editor";
import { SplitEditor } from "@/components/editor/split-editor";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ bookId: string; chapterId: string }>;
}

export default async function ChapterEditorPage({ params }: PageProps) {
  const user = await requireUser();
  const { bookId, chapterId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    include: {
      chapters: {
        orderBy: { chapterNumber: "asc" },
        select: {
          id: true,
          chapterNumber: true,
          title: true,
          status: true,
        },
      },
    },
  });

  if (!book) notFound();

  const chapter = book.chapters.find((ch) => ch.id === chapterId);
  if (!chapter) notFound();

  const allChapters = book.chapters.map((ch) => ({
    id: ch.id,
    chapterNumber: ch.chapterNumber,
    title: ch.title,
    status: ch.status,
  }));

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      <SplitEditor
        bookId={bookId}
        primaryChapterId={chapterId}
        primaryChapterNumber={chapter.chapterNumber}
        primaryChapterTitle={chapter.title ?? undefined}
        primaryChapterStatus={chapter.status}
        bookName={book.name}
        bookLanguage={book.language}
        allChapters={allChapters}
      >
        <ManuscriptEditor
          bookId={bookId}
          chapterId={chapterId}
          chapterNumber={chapter.chapterNumber}
          chapterTitle={chapter.title ?? undefined}
          chapterStatus={chapter.status}
          bookName={book.name}
          bookLanguage={book.language}
          allChapters={allChapters}
        />
      </SplitEditor>
    </div>
  );
}
