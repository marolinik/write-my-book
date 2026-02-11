import { ImportWizard } from "@/components/import-export/import-wizard";

export default async function ImportPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;

  return (
    <div className="container py-6">
      <h1 className="mb-6 text-2xl font-bold">Import Manuscript</h1>
      <ImportWizard bookId={bookId} />
    </div>
  );
}
