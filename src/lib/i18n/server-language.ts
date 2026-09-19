import "server-only";

import { getDbUser } from "@/lib/auth";
import { isUiLanguageSupported, localeFor } from "./ui-strings";

/**
 * The writer's interface language, resolved on the server.
 *
 * Every page used to render its chrome in English first and swap to Serbian
 * once `GET /api/settings/language` came back — a visible flash on every
 * navigation, because the language lived only in a client query. It also left
 * `<html lang>` hardcoded to "en", so the browser spellchecked Serbian prose as
 * English and screen readers announced it with an English voice.
 *
 * Safe before sign-in and when the database is unreachable: it answers "en"
 * rather than failing a page render.
 */
export async function getServerLanguage(): Promise<string> {
  try {
    const user = await getDbUser();
    const language = user?.preferredLanguage;
    // D-12: only a language with a complete dictionary may drive the chrome;
    // anything else would render English anyway and lie in <html lang>.
    if (language && isUiLanguageSupported(language)) return language;
  } catch {
    // Unauthenticated, or the database is unreachable — English is the honest
    // answer, and a page must not fail to render over a preference.
  }
  return "en";
}

/** The BCP-47 tag for `<html lang>`, e.g. "sr" -> "sr-Latn-RS". */
export async function getServerLocaleTag(): Promise<string> {
  return localeFor(await getServerLanguage());
}
