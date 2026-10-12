/**
 * Platform Promise Section: honest commitments grounded in how the product
 * actually works (BYOK billing, ungated export, a card-free Free plan).
 * Replaces the fabricated testimonials removed in the 2026-08-31 launch
 * hardening pass; real quotes from actual writers will come back here once
 * they exist and are permissioned.
 */

import Link from "next/link";
import { KeyRoundIcon, DownloadIcon, CreditCardIcon, ArrowRightIcon } from "lucide-react";

const promises = [
  {
    icon: KeyRoundIcon,
    title: "Bring Your Own Key",
    body: "Use your own Anthropic, OpenAI, Google Gemini, xAI Grok, or OpenRouter key and pay provider rates directly. We add no markup on tokens.",
  },
  {
    icon: DownloadIcon,
    title: "Export Is Never Gated",
    body: "EPUB, PDF, and DOCX export are available at any time, even after you cancel. Your manuscript always leaves with you.",
  },
  {
    icon: CreditCardIcon,
    title: "Free Without a Card",
    body: "Every account starts on the Free plan with no payment details. If you cancel a paid plan, the account drops back to Free. No surprise charge.",
  },
];

export function PlatformPromise() {
  return (
    <section className="py-20 lg:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            What You Can Count On
          </h2>
          <p className="mt-4 text-muted-foreground">
            Three commitments the product actually enforces.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
          {promises.map((promise) => {
            const Icon = promise.icon;
            return (
              <div
                key={promise.title}
                className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="mb-4 inline-flex items-center justify-center size-12 rounded-full bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="font-semibold">{promise.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {promise.body}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Take the Product Tour
            <ArrowRightIcon className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
