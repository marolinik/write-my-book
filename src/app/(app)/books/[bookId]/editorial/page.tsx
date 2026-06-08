import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EditorialPage } from "@/components/editorial/editorial-page";

export const dynamic = "force-dynamic";

export default async function EditorialReviewPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;

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

  return (
    <EditorialPage
      bookId={bookId}
      chapters={book.chapters}
    />
  );
}
