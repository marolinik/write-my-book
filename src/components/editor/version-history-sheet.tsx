"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { VersionHistoryPanel } from "./version-history-panel";

interface VersionHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  documentId: string | null;
  documentTitle?: string;
}

export function VersionHistorySheet({
  open,
  onOpenChange,
  bookId,
  documentId,
  documentTitle,
}: VersionHistorySheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-72 p-0">
        <SheetHeader className="px-3 pt-4 pb-0">
          <SheetTitle className="text-sm">
            {documentTitle ? `History: ${documentTitle}` : "Version History"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-hidden h-[calc(100%-3rem)]">
          <VersionHistoryPanel bookId={bookId} documentId={documentId} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
