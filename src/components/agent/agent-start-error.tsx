"use client";

import Link from "next/link";
import { ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";
import type { AgentStartFailure } from "@/hooks/use-agent";

/**
 * Why an agent session did not start, under the panel.
 *
 * P1-S05: the Free session wall used to be a lone line of red text. The start
 * hooks open the upgrade modal for a plan denial; once the writer dismisses it
 * this line is all that is left, so a plan wall keeps its own way to the plans.
 */
export function AgentStartError({ error }: { error: AgentStartFailure | null }) {
  const { t } = useLanguage();
  if (!error) return null;

  return (
    <div className="border-t px-4 py-2 space-y-2">
      <p className="text-xs text-destructive">{error.message}</p>
      {error.upgradeToTier && (
        <Button asChild size="sm" variant="outline" className="h-7 text-xs">
          <Link href="/settings/billing">
            <ArrowUpCircle className="mr-1 size-3.5" />
            {t.appUI.viewPlans}
          </Link>
        </Button>
      )}
    </div>
  );
}
