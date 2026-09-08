"use client";

// UDG round-7 (Luka 12): create + copy an account-less share link for a snapshot.
import { useState } from "react";
import { toast } from "sonner";
import { Share2Icon, CheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

export function ShareSnapshotButton({
  bookId,
  kind = "book",
}: {
  bookId: string;
  kind?: "book" | "editorial";
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    setBusy(true);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, kind }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "share-failed");
      }
      const data = await res.json();
      const url = `${window.location.origin}${data.url}`;
      await navigator.clipboard.writeText(url);
      toast.success(t.snapshot.sharedLink + "\n" + url);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message !== "share-failed"
          ? error.message
          : t.snapshot.shareFailed
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void handleShare()} className="gap-1 print:hidden">
      {busy ? <CheckIcon className="size-4" /> : <Share2Icon className="size-4" />}
      {t.snapshot.shareLink}
    </Button>
  );
}