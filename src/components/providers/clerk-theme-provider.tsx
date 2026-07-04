"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { useTheme } from "next-themes";
import { isClerkPublishableKeyConfigured } from "@/lib/clerk-config";

/**
 * Client wrapper that dynamically applies Clerk's dark theme
 * based on the current next-themes resolved theme.
 *
 * Must be rendered inside <ThemeProvider> so useTheme() works.
 */
export function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  // Self-guard: under DEV_AUTH_BYPASS / local dev there is no real publishable
  // key, so mounting <ClerkProvider> just spams the console with failed Clerk
  // script-load retries (F4). Render children directly in that case. Prod, which
  // always ships a real key, is unaffected.
  if (!isClerkPublishableKeyConfigured()) {
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      appearance={resolvedTheme === "dark" ? { baseTheme: dark } : undefined}
    >
      {children}
    </ClerkProvider>
  );
}
