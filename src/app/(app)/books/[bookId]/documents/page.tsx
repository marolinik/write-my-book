import { redirect } from "next/navigation";

export default async function DocumentsListPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  redirect(`/books/${bookId}/library`);
}
