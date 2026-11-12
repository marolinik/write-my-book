"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P2-59: this page replaces the root layout, so no provider resolved the
 * writer's language; the browser's is the best signal left.
 */
function browserLanguage(): string {
  return typeof navigator === "undefined" ? "en" : navigator.language || "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  const t = getUIStrings(browserLanguage());

  return (
    <html lang={browserLanguage().split("-")[0]}>
      <body className="flex min-h-screen items-center justify-center bg-background font-sans text-foreground">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-4xl font-bold">{t.screens.somethingWentWrong}</h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t.screens.unexpectedErrorNotified}
          </p>
          <button
            onClick={() => reset()}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {t.common.tryAgain}
          </button>
        </div>
      </body>
    </html>
  );
}
