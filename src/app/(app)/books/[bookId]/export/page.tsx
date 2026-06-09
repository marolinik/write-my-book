import { redirect } from "next/navigation";

export default async function ExportPageRoute({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  redirect(`/books/${bookId}/transfer?tab=export`);
}
