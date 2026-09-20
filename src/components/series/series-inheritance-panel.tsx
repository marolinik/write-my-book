"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useState } from "react";
import { DownloadIcon, CheckCircleIcon, AlertCircleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useInheritanceState, useApplyInheritance } from "@/hooks/use-series";

interface Book {
  id: string;
  bookNumber: number;
  name: string;
}

interface SeriesInheritancePanelProps {
  seriesId: string;
  books: Book[];
}

export function SeriesInheritancePanel({
  seriesId,
  books,
}: SeriesInheritancePanelProps) {
  const { t } = useLanguage();
  const [selectedBookId, setSelectedBookId] = useState<string | null>(
    books[0]?.id ?? null
  );

  const { data: states, isLoading } = useInheritanceState(
    seriesId,
    selectedBookId
  );
  const applyMutation = useApplyInheritance(seriesId);

  const handleApplyAll = () => {
    if (!selectedBookId) return;
    applyMutation.mutate({ bookId: selectedBookId });
  };

  const handleApplyOne = (seriesDocType: string) => {
    if (!selectedBookId) return;
    applyMutation.mutate({
      bookId: selectedBookId,
      documentTypes: [seriesDocType],
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{t.workspaceUI.inheritInto}</span>
        <Select
          value={selectedBookId ?? ""}
          onValueChange={setSelectedBookId}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder={t.workspaceUI.selectBookEllipsis} />
          </SelectTrigger>
          <SelectContent>
            {books.map((book) => (
              <SelectItem key={book.id} value={book.id}>
                Book {book.bookNumber}: {book.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedBookId ? (
        <p className="text-sm text-muted-foreground">{t.seriesUI.selectBookForInheritance}</p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">{t.workspaceUI.loading}</p>
      ) : !states || states.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.seriesUI.noInheritableDocuments}</p>
      ) : (
        <>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">{t.workspaceUI.document}</th>
                  <th className="px-4 py-2 text-left font-medium">{t.workspaceUI.status}</th>
                  <th className="px-4 py-2 text-left font-medium">{t.seriesUI.seriesVersion}</th>
                  <th className="px-4 py-2 text-left font-medium">{t.seriesUI.bookVersion}</th>
                  <th className="px-4 py-2 text-right font-medium">{t.workspaceUI.action}</th>
                </tr>
              </thead>
              <tbody>
                {states.map((state) => (
                  <tr key={state.seriesDocType} className="border-b last:border-0">
                    <td className="px-4 py-2">{state.label}</td>
                    <td className="px-4 py-2">
                      {state.status === "own" ? (
                        <Badge
                          variant="default"
                          className="gap-1 text-xs"
                        >
                          <CheckCircleIcon className="size-3" />
                          Own
                        </Badge>
                      ) : state.seriesVersion ? (
                        <Badge
                          variant="secondary"
                          className="gap-1 text-xs"
                        >
                          <AlertCircleIcon className="size-3" />{t.seriesUI.available}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{t.seriesUI.missing}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {state.seriesVersion ? `v${state.seriesVersion}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {state.bookVersion ? `v${state.bookVersion}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {state.status !== "own" && state.seriesVersion && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleApplyOne(state.seriesDocType)}
                          disabled={applyMutation.isPending}
                        >
                          <DownloadIcon className="mr-1 size-3" />{t.seriesUI.inherit}</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {states.some((s) => s.status !== "own" && s.seriesVersion) && (
            <Button
              variant="default"
              size="sm"
              onClick={handleApplyAll}
              disabled={applyMutation.isPending}
            >
              <DownloadIcon className="mr-1 size-4" />{t.seriesUI.applyAllAvailable}</Button>
          )}
        </>
      )}
    </div>
  );
}
