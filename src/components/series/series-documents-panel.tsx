"use client";

import { FileTextIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface SeriesDocument {
  id: string;
  type: string;
  title: string | null;
  currentVersion: number;
  updatedAt: string;
}

interface SeriesDocumentsPanelProps {
  documents: SeriesDocument[];
}

export function SeriesDocumentsPanel({ documents }: SeriesDocumentsPanelProps) {
  if (documents.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No series documents yet. Use the agent panel to create series-level
        documents like a Series Bible or Series Architecture.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {documents.map((doc) => (
        <div
          key={doc.id}
          className="flex items-center gap-3 rounded-md border px-4 py-2.5"
        >
          <FileTextIcon className="size-4 text-muted-foreground" />
          <span className="flex-1 text-sm font-medium">
            {doc.title || doc.type.replace(/_/g, " ")}
          </span>
          <Badge variant="outline" className="text-xs">
            {doc.type.replace(/_/g, " ")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            v{doc.currentVersion}
          </span>
        </div>
      ))}
    </div>
  );
}
