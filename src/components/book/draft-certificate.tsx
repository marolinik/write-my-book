"use client";

import { useRef } from "react";
import {
  AwardIcon,
  DownloadIcon,
  ShareIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * V: First Draft Complete Certificate.
 * A beautiful, printable certificate celebrating manuscript completion.
 * Generated client-side as HTML, downloadable as image.
 */

interface DraftCertificateProps {
  bookTitle: string;
  authorName: string;
  wordCount: number;
  chapterCount: number;
  completionDate: string;
  daysToComplete: number;
}

export function DraftCertificate({
  bookTitle,
  authorName,
  wordCount,
  chapterCount,
  completionDate,
  daysToComplete,
}: DraftCertificateProps) {
  const certRef = useRef<HTMLDivElement>(null);

  const handleShare = async () => {
    const text = `🏆 I completed the first draft of "${bookTitle}"!\n${wordCount.toLocaleString()} words | ${chapterCount} chapters | ${daysToComplete} days\n#amwriting #FirstDraft #WritingCommunity`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      toast.success("Certificate text copied to clipboard!");
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* Certificate */}
      <div
        ref={certRef}
        className="mx-auto max-w-lg rounded-xl border-4 border-double border-amber-500/30 bg-gradient-to-br from-amber-50 via-white to-amber-50 dark:from-amber-950/20 dark:via-background dark:to-amber-950/20 p-8 text-center space-y-6"
      >
        {/* Ornamental top */}
        <div className="flex justify-center">
          <AwardIcon className="size-16 text-amber-500" />
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.3em] text-amber-700 dark:text-amber-400">
            Certificate of Completion
          </p>
          <div className="h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
        </div>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">This certifies that</p>
          <p className="text-2xl font-serif font-bold">{authorName}</p>
          <p className="text-sm text-muted-foreground">has completed the first draft of</p>
          <p className="text-xl font-serif font-semibold italic">&ldquo;{bookTitle}&rdquo;</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold tabular-nums">{wordCount.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Words</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{chapterCount}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Chapters</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{daysToComplete}</p>
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Days</p>
          </div>
        </div>

        <div className="space-y-1">
          <div className="h-px bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
          <p className="text-xs text-muted-foreground">
            Completed on {new Date(completionDate).toLocaleDateString(undefined, {
              year: "numeric", month: "long", day: "numeric",
            })}
          </p>
          <p className="text-[9px] text-muted-foreground/50">WriteMyBook &bull; writemybook.com</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-center gap-2">
        <Button variant="outline" size="sm" onClick={handleShare}>
          <ShareIcon className="size-3 mr-1.5" />
          Share
        </Button>
      </div>
    </div>
  );
}
