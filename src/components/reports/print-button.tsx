"use client";

// UDG round-6 (Darko): a print/export action that triggers the browser print
// (Cmd+P). Works from a server-rendered snapshot page.
import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/components/providers/language-provider";

export function PrintButton() {
  const { t } = useLanguage();
  return (
    <Button size="sm" type="button" onClick={() => window.print()} className="gap-1">
      <PrinterIcon className="size-4" />
      {t.snapshot.print}
    </Button>
  );
}