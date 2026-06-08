"use client";

import { createContext, useContext, useMemo } from "react";
import { useUserLanguage } from "@/hooks/use-language";
import { getUIStrings, type UIStrings } from "@/lib/i18n/ui-strings";

interface LanguageContextValue {
  language: string;
  t: UIStrings;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: "en",
  t: getUIStrings("en"),
  isLoading: false,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useUserLanguage();
  const language = data?.language ?? "en";

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      t: getUIStrings(language),
      isLoading,
    }),
    [language, isLoading]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
