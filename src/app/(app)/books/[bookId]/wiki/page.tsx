import { redirect } from "next/navigation";

export default async function WikiPageRoute({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  redirect(`/books/${bookId}/library?tab=wiki`);
}
