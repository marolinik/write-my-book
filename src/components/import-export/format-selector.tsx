"use client";

import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/components/providers/language-provider";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { FileTextIcon, FileIcon, BookOpenIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type ExportFormat = "docx" | "pdf" | "epub";

interface FormatSelectorProps {
  selected: ExportFormat;
  onSelect: (format: ExportFormat) => void;
}

const formats: {
  id: ExportFormat;
  label: string;
  desc: (t: UIStrings) => string;
  icon: typeof FileTextIcon;
}[] = [
  {
    id: "docx",
    label: "DOCX",
    desc: (t: UIStrings) => t.importExportUI.formatDocxDesc,
    icon: FileTextIcon,
  },
  {
    id: "pdf",
    label: "PDF",
    desc: (t: UIStrings) => t.importExportUI.formatPdfDesc,
    icon: FileIcon,
  },
  {
    id: "epub",
    label: "EPUB",
    desc: (t: UIStrings) => t.importExportUI.formatEpubDesc,
    icon: BookOpenIcon,
  },
];

export function FormatSelector({ selected, onSelect }: FormatSelectorProps) {
  const { t } = useLanguage();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {formats.map((fmt) => (
        <Card
          key={fmt.id}
          className={cn(
            "cursor-pointer transition-colors",
            selected === fmt.id
              ? "ring-2 ring-primary bg-primary/5"
              : "hover:bg-muted/50"
          )}
          onClick={() => onSelect(fmt.id)}
        >
          <CardContent className="flex flex-col items-center p-4 text-center">
            <fmt.icon className="mb-2 size-6" />
            <span className="font-medium">{fmt.label}</span>
            <span className="mt-1 text-xs text-muted-foreground">
              {fmt.desc(t)}
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
