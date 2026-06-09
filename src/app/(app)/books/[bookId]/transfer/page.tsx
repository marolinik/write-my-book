"use client";

import { use, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UploadIcon, DownloadIcon, ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { ImportWizard } from "@/components/import-export/import-wizard";
import { ExportPage } from "@/components/import-export/export-page";
import { useSearchParams } from "next/navigation";

export default function TransferPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const searchParams = useSearchParams();
  const fromSetup = searchParams.get("from") === "setup";
  const initialTab = searchParams.get("tab") === "export" ? "export" : "import";
  const [tab, setTab] = useState(initialTab);

  return (
    <div className="mx-auto max-w-5xl p-6">
      {fromSetup && (
        <div className="pb-4">
          <Link
            href={`/books/${bookId}/setup`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-3" />
            Back to Setup
          </Link>
        </div>
      )}
      <Tabs value={tab} onValueChange={(v) => setTab(v as "import" | "export")}>
        <TabsList className="mb-6">
          <TabsTrigger value="import" className="gap-1.5">
            <UploadIcon className="size-3.5" />
            Import
          </TabsTrigger>
          <TabsTrigger value="export" className="gap-1.5">
            <DownloadIcon className="size-3.5" />
            Export
          </TabsTrigger>
        </TabsList>
        <TabsContent value="import" className="mt-0">
          <ImportWizard bookId={bookId} />
        </TabsContent>
        <TabsContent value="export" className="mt-0">
          <ExportPage bookId={bookId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
