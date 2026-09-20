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
import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings";
import { useUpgradeModal } from "@/hooks/use-billing";
import { ArrowUpCircle } from "lucide-react";

/** The plan blurbs follow the writer's language like the rest of the modal. */
const TIER_DESCRIPTIONS = (t: UIStrings): Record<string, string> => ({
  professional: t.appUI.tierProfessional,
  publisher: t.appUI.tierPublisher,
  founder: t.appUI.tierFounder,
});

export function UpgradeModal() {
  const { t } = useLanguage();
  const router = useRouter();
  const { open, reason, upgradeToTier, hide } = useUpgradeModal();

  const tierDescription = upgradeToTier
    ? TIER_DESCRIPTIONS(t)[upgradeToTier] ?? ""
    : "";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && hide()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-primary" />{t.appUI.upgradeRequired}</DialogTitle>
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
          <Button variant="outline" onClick={hide}>{t.common.cancel}</Button>
          <Button
            onClick={() => {
              hide();
              router.push("/settings/billing");
            }}
          >{t.appUI.viewPlans}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
