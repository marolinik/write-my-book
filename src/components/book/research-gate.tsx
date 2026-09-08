"use client";

// UDG round-4 (Petar): the hub Research card's "no research provider key yet"
// state, extracted into a client component. Research is gated by *server*
// process.env keys (Perplexity/Serper/Firecrawl), which don't change within a
// running page view, so the honest live behavior is that this block hides the
// moment the server bool `hasResearchProvider` becomes true (passed from the
// hub page). Keeping it as a client component lets the hub refresh cleanly.
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function ResearchGate({
  hasResearchProvider,
  hint,
  apiKeysLabel,
  href,
}: {
  hasResearchProvider: boolean;
  hint: string;
  apiKeysLabel: string;
  href: string;
}) {
  if (!hasResearchProvider) {
    return (
      <>
        <p className="mt-2 text-[11px] leading-relaxed text-amber-700 dark:text-amber-500">
          {hint}
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 gap-1"
          asChild
        >
          <Link href={href}>{apiKeysLabel}</Link>
        </Button>
      </>
    );
  }
  return null;
}