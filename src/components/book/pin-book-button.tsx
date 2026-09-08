"use client";

// UDG round-4 (Milica/Viktor): pin a book so the dashboard "Continue /
// Recommended" nudge follows it instead of always the most recently updated.
import { PinIcon, PinOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdateBook } from "@/hooks/use-books";

export function PinBookButton({
  bookId,
  pinned,
}: {
  bookId: string;
  pinned: boolean;
}) {
  const { mutate, isPending } = useUpdateBook(bookId);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground"
      title={pinned ? "Unpin from dashboard" : "Pin to dashboard"}
      aria-pressed={pinned}
      aria-label={pinned ? "Unpin book" : "Pin book"}
      disabled={isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        mutate({ pinned: !pinned });
      }}
    >
      {pinned ? (
        <PinIcon className="size-3.5 text-primary" />
      ) : (
        <PinOffIcon className="size-3.5" />
      )}
    </Button>
  );
}