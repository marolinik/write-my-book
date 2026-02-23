"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";

/**
 * Client wrapper that dynamically applies Clerk's dark theme
 * based on the current next-themes resolved theme.
 *
 * Must be rendered inside <ThemeProvider> so useTheme() works.
 */
export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <ClerkProvider
      appearance={resolvedTheme === "dark" ? { baseTheme: dark } : undefined}
    >
      {children}
    </ClerkProvider>
  );
}
