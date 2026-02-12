"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { BotIcon } from "lucide-react";
import { useBook } from "@/hooks/use-books";
import { useSeriesDetail } from "@/hooks/use-series";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentPanel } from "./agent-panel";

interface AgentPanelWrapperProps {
  onClose: () => void;
}

/**
 * Wrapper that resolves bookId/seriesId from URL params and fetches chapters.
 * Shows a placeholder message when not on a book or series route.
 * For series routes, provides an "active book" selector for series workflows.
 */
export function AgentPanelWrapper({ onClose }: AgentPanelWrapperProps) {
  const params = useParams();
  const bookId = params?.bookId as string | undefined;
  const seriesId = params?.seriesId as string | undefined;

  const { data: book } = useBook(bookId ?? "");
  const { data: series } = useSeriesDetail(seriesId ?? "");

  // For series context: let the user pick the active book
  const [activeSeriesBookId, setActiveSeriesBookId] = useState<
    string | undefined
  >();

  // Determine the active book for agent context
  const seriesBooks = series?.books ?? [];
  const resolvedBookId =
    bookId ?? activeSeriesBookId ?? seriesBooks[0]?.id;

  const { data: activeBook } = useBook(
    !bookId && resolvedBookId ? resolvedBookId : ""
  );

  // No book or series context
  if (!bookId && !seriesId) {
    return (
      <div className="flex h-full w-full min-w-[280px] flex-col border-l bg-muted/30">
        <div className="flex h-12 items-center gap-2 border-b px-4">
          <BotIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate">Writing Agent</span>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-full bg-muted p-4">
            <BotIcon className="size-8 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            Open a book or series to use the agent
          </p>
          <p className="text-xs text-muted-foreground/70">
            Navigate to a book or series to access writing workflows.
          </p>
        </div>
      </div>
    );
  }

  // Series context — need to select an active book for the agent
  if (seriesId && !bookId) {
    const chapters = activeBook?.chapters?.map((ch) => ({
      chapterNumber: ch.chapterNumber,
      title: ch.title,
    })) ?? [];

    return (
      <div className="flex h-full w-full min-w-[280px] flex-col border-l bg-muted/30">
        {/* Book selector for series */}
        {seriesBooks.length > 0 && (
          <div className="border-b px-4 py-2">
            <label className="text-xs text-muted-foreground mb-1 block">
              Active book:
            </label>
            <Select
              value={resolvedBookId ?? ""}
              onValueChange={setActiveSeriesBookId}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select book..." />
              </SelectTrigger>
              <SelectContent>
                {seriesBooks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bookNumber}. {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {resolvedBookId ? (
          <AgentPanel
            bookId={resolvedBookId}
            chapters={chapters}
            onClose={onClose}
            seriesId={seriesId}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <BotIcon className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Add a book to this series to use the agent.
            </p>
          </div>
        )}
      </div>
    );
  }

  // Regular book context
  const chapters = (book?.chapters ?? []).map((ch) => ({
    chapterNumber: ch.chapterNumber,
    title: ch.title,
  }));

  return (
    <AgentPanel bookId={bookId!} chapters={chapters} onClose={onClose} />
  );
}
