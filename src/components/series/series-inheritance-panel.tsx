"use client";

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
        <span className="text-sm font-medium">Inherit into:</span>
        <Select
          value={selectedBookId ?? ""}
          onValueChange={setSelectedBookId}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select a book..." />
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
        <p className="text-sm text-muted-foreground">
          Select a book to check inheritance state.
        </p>
      ) : isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : !states || states.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No inheritable documents found.
        </p>
      ) : (
        <>
          <div className="rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-2 text-left font-medium">Document</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">
                    Series Ver.
                  </th>
                  <th className="px-4 py-2 text-left font-medium">
                    Book Ver.
                  </th>
                  <th className="px-4 py-2 text-right font-medium">Action</th>
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
                          <AlertCircleIcon className="size-3" />
                          Available
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          Missing
                        </Badge>
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
                          <DownloadIcon className="mr-1 size-3" />
                          Inherit
                        </Button>
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
              <DownloadIcon className="mr-1 size-4" />
              Apply All Available
            </Button>
          )}
        </>
      )}
    </div>
  );
}
