import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LibraryPageClient } from "./library-client";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ bookId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export default async function LibraryPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { bookId } = await params;
  const { tab } = await searchParams;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { id: true, language: true },
  });

  if (!book) notFound();

  return (
    <LibraryPageClient
      bookId={bookId}
      language={book.language}
      initialTab={tab === "wiki" ? "wiki" : "documents"}
    />
  );
}
