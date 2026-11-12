import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubEvent, sentryTraceRate } from "@/lib/sentry-scrub";

// P2-61: the shared scrubber redacts key patterns and sensitive fields in every
// part of an event, breadcrumbs included; 10% of traces in production.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: sentryTraceRate(),
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
