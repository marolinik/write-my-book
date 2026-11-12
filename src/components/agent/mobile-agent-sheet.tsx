"use client";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLanguage } from "@/components/providers/language-provider";

interface MobileAgentSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * P2-53: the phone agent panel is a modal bottom sheet. It used to be bare
 * divs (no dialog role, no focus trap, no Escape, a backdrop only a pointer
 * could dismiss). Radix Sheet gives all of that; the panel renders its own
 * visible header, so the title is for screen readers.
 */
export function MobileAgentSheet({ open, onClose, children }: MobileAgentSheetProps) {
  const { t } = useLanguage();
  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="h-[60vh] gap-0 rounded-t-xl p-0 flex flex-col"
      >
        <SheetTitle className="sr-only">{t.nav.agent}</SheetTitle>
        <div aria-hidden="true" className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mt-2 shrink-0" />
        <div className="flex-1 overflow-hidden">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
