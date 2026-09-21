"use client";

// UDG round-4 (Milica/Viktor): pin a book so the dashboard "Continue /
// Recommended" nudge follows it instead of always the most recently updated.
import { PinIcon, PinOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import { useUpdateBook } from "@/hooks/use-books";

export function PinBookButton({
  bookId,
  pinned,
}: {
  bookId: string;
  pinned: boolean;
}) {
  const { mutate, isPending } = useUpdateBook(bookId);
  const { t } = useLanguage();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-7 text-muted-foreground"
      title={pinned ? t.bookUI.unpinFromDashboard : t.bookUI.pinToDashboard}
      aria-pressed={pinned}
      aria-label={pinned ? t.bookUI.unpinBook : t.bookUI.pinBook}
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