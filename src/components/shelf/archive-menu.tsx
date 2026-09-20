"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { MoreVerticalIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ArchiveMenuProps {
  bookId: string;
  archived: boolean;
}

export function ArchiveMenu({ bookId, archived }: ArchiveMenuProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function setArchived(next: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/books/${bookId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success(next ? "Book archived" : "Book restored");
      router.refresh();
    } catch {
      toast.error(next ? "Couldn't archive the book" : "Couldn't restore the book");
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label={t.appUI.bookActions}
          >
            <MoreVerticalIcon className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {archived ? (
            <DropdownMenuItem disabled={busy} onSelect={() => setArchived(false)}>{t.common.restore}</DropdownMenuItem>
          ) : (
            <DropdownMenuItem disabled={busy} onSelect={() => setConfirmOpen(true)}>{t.bookUI.archive}</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.appUI.archiveThisBook}</DialogTitle>
            <DialogDescription>{t.bookUI.archiveHint}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmOpen(false)}>{t.common.cancel}</Button>
            <Button disabled={busy} onClick={() => setArchived(true)}>{t.bookUI.archive}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
