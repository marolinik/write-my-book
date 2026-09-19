import { getServerLanguage } from "@/lib/i18n/server-language";
import { AppShell } from "./app-shell";

/**
 * The app shell is a client component; this server layout exists to resolve the
 * writer's language BEFORE the first paint. It used to be fetched by a client
 * query, so every page load rendered its chrome in English and swapped to
 * Serbian a moment later.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const initialLanguage = await getServerLanguage();
  return <AppShell initialLanguage={initialLanguage}>{children}</AppShell>;
}
