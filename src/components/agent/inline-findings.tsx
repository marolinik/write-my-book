"use client";

import { useQuery } from "@tanstack/react-query";

import { useLanguage } from "@/components/providers/language-provider";
import { findingStatusLabel } from "@/lib/i18n/finding-labels";
import { FindingCard } from "@/components/editorial/finding-card";
import type { FindingItem } from "@/hooks/use-editorial";

/**
 * The findings a pass just produced, decidable where the writer is standing.
 *
 * A dev-edit, line-edit, beta-read or continuity check ends with a list of
 * problems and a suggestion for each. Sending the writer to another page to act
 * on them breaks the thread of what he has just read — the same complaint that
 * put the structural proposals in this panel (S3-19).
 *
 * Only PENDING findings appear: a decided one is history, and history belongs
 * on the editorial page. The cards are the editorial cards, so Apply and
 * Dismiss run through the same endpoints and the chapter list is invalidated
 * the same way.
 */
export function InlineFindings({
  bookId,
  chapterNumber,
}: {
  bookId: string;
  /** Limits the list to the chapter the pass ran on, when it ran on one. */
  chapterNumber?: number | null;
}) {
  const { language } = useLanguage();

  const { data } = useQuery({
    queryKey: ["inline-findings", bookId, chapterNumber ?? "book"],
    queryFn: async () => {
      const params = new URLSearchParams({ status: "pending" });
      if (chapterNumber) params.set("chapterNumber", String(chapterNumber));
      const res = await fetch(
        `/api/books/${bookId}/editorial/findings?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to load findings");
      return res.json() as Promise<{ findings?: FindingItem[] }>;
    },
  });

  const findings = (data?.findings ?? []).filter((f) => f.status === "pending");
  if (findings.length === 0) return null;

  // Enough to act on without turning the panel into the editorial page.
  const shown = findings.slice(0, 5);
  const rest = findings.length - shown.length;

  return (
    <div className="flex flex-col gap-2 rounded-md border bg-background/60 p-2">
      <span className="text-xs font-medium">
        {findingStatusLabel("pending", language)} · {findings.length}
      </span>

      {shown.map((finding) => (
        <FindingCard key={finding.id} finding={finding} bookId={bookId} />
      ))}

      {rest > 0 && (
        <a
          href={`/books/${bookId}/editorial`}
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          +{rest}
        </a>
      )}
    </div>
  );
}
