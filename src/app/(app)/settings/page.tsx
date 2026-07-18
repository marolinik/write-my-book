"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/components/providers/language-provider";
import { useUpdateLanguage } from "@/hooks/use-language";
import {
  UI_SUPPORTED_LANGUAGES,
  isUiLanguageSupported,
} from "@/lib/i18n/ui-strings";
import { MemorySettings } from "@/components/memory/memory-settings";
import { ApiKeysSection } from "@/components/settings/api-keys-section";
import { ModelSelectionSection } from "@/components/settings/model-selection-section";

export default function SettingsPage() {
  const { language, t } = useLanguage();
  const updateLanguage = useUpdateLanguage();

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">
        {t.settings.title}
      </h1>
      <p className="text-muted-foreground">
        {t.settings.subtitle}
      </p>

      <Separator className="my-6" />

      {/* Language Preference */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.languagePreference}</CardTitle>
          <CardDescription>
            {t.settings.languageDescription}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* D-12: only offer languages the UI can actually render. Codes
              without a dictionary silently fell back to English while the
              save reported success. Book/prose language (all 14) is chosen
              per book. A stale persisted unsupported code displays as its
              effective UI language: English. */}
          <Select
            value={isUiLanguageSupported(language) ? language : "en"}
            onValueChange={(val) => updateLanguage.mutate(val)}
          >
            {/* Combobox triggers get no accessible name from their value text —
                name it explicitly (D-10, axe button-name). Localized like the
                neighboring header labels. */}
            <SelectTrigger
              className="w-48"
              aria-label={t.settings.languagePreference}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UI_SUPPORTED_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* API Keys */}
      <ApiKeysSection />

      <Separator className="my-6" />

      {/* Model Selection */}
      <ModelSelectionSection />

      <Separator className="my-6" />

      {/* Memory System */}
      <MemorySettings />

      <Separator className="my-6" />

      {/* BYOK Info */}
      <Card className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <CardContent className="py-4">
          <p className="text-sm">
            <strong>{t.settings.byokTitle}</strong> {t.settings.byokDescription}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
