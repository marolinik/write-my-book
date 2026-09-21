"use client";

/**
 * M-4 — the language a series is written in was invisible.
 *
 * `Series.language` is set once when the series is created and was never
 * shown or editable again, while the composer that writes series documents
 * guessed the language from the first sibling book. A writer whose first book
 * happened to be English got an English-structured document for a Serbian
 * series and no way to say otherwise. This is that way.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateSeries } from "@/hooks/use-series";
import { useLanguage } from "@/components/providers/language-provider";
import { BOOK_LANGUAGES } from "@/lib/i18n/book-languages";

export function SeriesLanguageSection({
  seriesId,
  initialLanguage,
}: {
  seriesId: string;
  initialLanguage: string | null;
}) {
  const { t } = useLanguage();
  const updateSeries = useUpdateSeries(seriesId);
  const [language, setLanguage] = useState(initialLanguage ?? "en");

  // Re-seed if the series changes underneath us (another tab).
  useEffect(() => {
    setLanguage(initialLanguage ?? "en");
  }, [initialLanguage]);

  const save = () => {
    updateSeries.mutate(
      { language },
      {
        onSuccess: () => toast.success(t.toasts.seriesLanguageSaved),
        onError: () => toast.error(t.toasts.seriesLanguageFailed),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.setup.language}</CardTitle>
        <CardDescription>{t.setup.languageHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label htmlFor="series-language" className="sr-only">
            {t.setup.language}
          </Label>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger id="series-language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BOOK_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={save}
          disabled={updateSeries.isPending || language === (initialLanguage ?? "en")}
        >
          {t.common.save}
        </Button>
      </CardContent>
    </Card>
  );
}
