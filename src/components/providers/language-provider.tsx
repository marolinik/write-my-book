"use client";

import { createContext, useContext, useMemo } from "react";
import {
  useUserLanguage,
  useLanguageBroadcast,
} from "@/hooks/use-language";
import { getUIStrings, localeFor, type UIStrings } from "@/lib/i18n/ui-strings";

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

export function LanguageProvider({
  children,
  /**
   * The writer's language, resolved on the server. Without it the first paint
   * is English on every page load and swaps once the client query lands, which
   * is a visible flash on every navigation.
   */
  initialLanguage,
}: {
  children: React.ReactNode;
  initialLanguage?: string;
}) {
  const { data, isLoading } = useUserLanguage(initialLanguage);
  const language = data?.language ?? initialLanguage ?? "en";

  // UDG round-5 (Hana): live locale refresh across open tabs via BroadcastChannel.
  useLanguageBroadcast();

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

/**
 * Resolve the active user's BCP-47 locale tag for number/date formatting.
 * Prefer this over bare `toLocaleString()` in client components so output
 * follows the user's preferred language instead of the server/system locale.
 */
export function useLocale() {
  return localeFor(useLanguage().language);
}
