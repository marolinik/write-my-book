import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { ManuscriptEditor } from "@/components/editor/manuscript-editor";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ bookId: string; chapterId: string }>;
}

export default async function ChapterEditorPage({ params }: PageProps) {
  const user = await requireUser();
  const { bookId, chapterId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
  });

  if (!book) notFound();

  const chapter = await db.chapter.findFirst({
    where: { id: chapterId, bookId },
  });

  if (!chapter) notFound();

  return (
    <div className="h-screen flex flex-col">
      <ManuscriptEditor
        bookId={bookId}
        chapterId={chapterId}
        chapterNumber={chapter.chapterNumber}
        chapterTitle={chapter.title ?? undefined}
      />
    </div>
  );
}
