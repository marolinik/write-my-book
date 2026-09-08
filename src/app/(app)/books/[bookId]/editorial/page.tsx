import { notFound } from "next/navigation";
import Link from "next/link";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getUIStrings } from "@/lib/i18n/ui-strings";
import { Button } from "@/components/ui/button";
import { EditorialPage } from "@/components/editorial/editorial-page";

export const dynamic = "force-dynamic";

export default async function EditorialReviewPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;
  const t = getUIStrings(user.preferredLanguage ?? "en");

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
    <div>
      {/* UDG round-6 (Luka): link to the printable/shareable editorial brief */}
      <div className="flex items-center justify-end px-6 pt-6 print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/books/${bookId}/editorial/snapshot`}>
            {t.snapshot.editorialLink}
          </Link>
        </Button>
      </div>
      <EditorialPage bookId={bookId} chapters={book.chapters} />
    </div>
  );
}
