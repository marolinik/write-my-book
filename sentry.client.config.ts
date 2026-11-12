import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, sentryTraceRate } from "@/lib/sentry-scrub";

// P2-61: the shared scrubber redacts key patterns and sensitive fields in every
// part of an event, breadcrumbs included; 10% of traces in production.
// D20: no session replay. There is no replayIntegration, so the replay sample
// rates that used to sit here did nothing; they are gone, and the privacy
// policy's "replays are off" stays true.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: sentryTraceRate(),
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
