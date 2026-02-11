"use client";

import { useState } from "react";
import { History, RotateCcw, Eye } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useDocumentVersions,
  useVersionContent,
  useRestoreVersion,
} from "@/hooks/use-documents";
import { DiffView } from "./diff-view";

interface VersionHistoryPanelProps {
  bookId: string;
  documentId: string | null;
}

const changeTypeBadge: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  agent_write: { label: "AI", variant: "default" },
  manual_edit: { label: "Manual", variant: "secondary" },
  revision: { label: "Restore", variant: "outline" },
  import: { label: "Import", variant: "secondary" },
};

export function VersionHistoryPanel({
  bookId,
  documentId,
}: VersionHistoryPanelProps) {
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [diffOpen, setDiffOpen] = useState(false);

  const { data: versions, isLoading } = useDocumentVersions(
    bookId,
    documentId
  );

  const { data: versionData } = useVersionContent(
    bookId,
    documentId,
    viewVersion
  );

  const restoreMutation = useRestoreVersion(bookId, documentId);

  if (!documentId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <History className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Save content to see version history</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">Loading versions...</p>
      </div>
    );
  }

  const versionList = versions ?? [];

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <History className="h-4 w-4" />
          <span className="text-sm font-medium">Version History</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            {versionList.length}
          </Badge>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {versionList.map((v, idx) => {
              const badge = changeTypeBadge[v.changeType] ?? {
                label: v.changeType,
                variant: "outline" as const,
              };
              const prevVersion = versionList[idx + 1];
              const wordDelta = prevVersion
                ? v.wordCount - prevVersion.wordCount
                : v.wordCount;

              return (
                <div
                  key={v.id}
                  className="flex flex-col gap-1 p-2 rounded-md hover:bg-muted/50 group"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      v{v.version}
                    </span>
                    <Badge variant={badge.variant} className="text-[10px] px-1.5 py-0">
                      {badge.label}
                    </Badge>
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {wordDelta > 0 ? "+" : ""}
                      {wordDelta !== 0 ? `${wordDelta}w` : ""}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(v.createdAt).toLocaleString([], {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setViewVersion(v.version);
                          setDiffOpen(true);
                        }}
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                      {idx > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => restoreMutation.mutate(v.version)}
                          disabled={restoreMutation.isPending}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Version {viewVersion}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 mt-2">
            {versionData ? (
              <DiffView content={versionData.content} />
            ) : (
              <p className="text-sm text-muted-foreground p-4">Loading...</p>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
