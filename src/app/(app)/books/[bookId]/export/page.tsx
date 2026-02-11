import { ExportPage } from "@/components/import-export/export-page";

export default async function ExportPageRoute({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">Export Manuscript</h1>
      <ExportPage bookId={bookId} />
    </div>
  );
}
