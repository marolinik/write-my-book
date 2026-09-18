import { notFound } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MarketingKit } from "@/components/book/marketing-kit";

export const dynamic = "force-dynamic";

/**
 * The marketing kit is work that starts when the manuscript is finished, so it
 * belongs in Publish, beside Export — not in the writing dashboard, where it
 * sat between a sprint timer and the day's word count and asked the writer to
 * think about blurbs mid-draft (S3-12).
 */
export default async function MarketingPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const user = await requireUser();
  const { bookId } = await params;

  const book = await db.book.findFirst({
    where: { id: bookId, userId: user.id },
    select: { id: true, name: true },
  });
  if (!book) notFound();

  return (
    <div className="p-6 lg:p-8">
      <MarketingKit bookId={book.id} bookTitle={book.name} />
    </div>
  );
}
