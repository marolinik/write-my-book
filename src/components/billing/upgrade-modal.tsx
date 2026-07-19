"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpgradeModal } from "@/hooks/use-billing";
import { ArrowUpCircle } from "lucide-react";

const TIER_DESCRIPTIONS: Record<string, string> = {
  indie:
    "The Indie Author plan gives you 2 active books, unlimited AI sessions and words, overnight batch runs, and no daily limits. Your writing, autosave, and export are always free.",
  professional:
    "The Professional plan unlocks unlimited books, series management, and advanced analytics.",
  publisher:
    "The Publisher plan includes everything in Professional plus priority support and upcoming multi-user seats.",
  founder:
    "The Founder plan locks in $19/mo forever with unlimited books and all Pro features.",
};

export function UpgradeModal() {
  const router = useRouter();
  const { open, reason, upgradeToTier, hide } = useUpgradeModal();

  const tierDescription = upgradeToTier
    ? TIER_DESCRIPTIONS[upgradeToTier] ?? ""
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && hide()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />
            Upgrade Required
          </DialogTitle>
          <DialogDescription className="space-y-2">
            <span className="block">{reason}</span>
            {tierDescription && (
              <span className="block text-sm text-muted-foreground">
                {tierDescription}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={hide}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              hide();
              router.push("/settings/billing");
            }}
          >
            View Plans
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
