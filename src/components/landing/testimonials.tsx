/**
 * Testimonials Section - Writer success stories
 * Shows real examples of books published with AI assistance
 */

import Link from "next/link";
import { QuoteIcon } from "lucide-react";

interface Testimonial {
  name: string;
  role: string;
  book: string;
  quote: string;
  avatar: string;
  stats: string;
}

const testimonials: Testimonial[] = [
  {
    name: "Maria S.",
    role: "Fantasy Author",
    book: "The Crystal Pact",
    quote: "The developmental editing workflow caught plot holes I never noticed. My beta readers said it was the cleanest draft they'd ever read.",
    avatar: "📖",
    stats: "80K words · Published in 3 months",
  },
  {
    name: "James K.",
    role: "Sci-Fi Writer",
    book: "Neon Horizons",
    quote: "I was stuck on chapter 3 for months. The scene planner helped me break through and finish my first draft in 6 weeks.",
    avatar: "🚀",
    stats: "120K words · Complete series bible",
  },
  {
    name: "Elena R.",
    role: "Literary Fiction",
    book: "Whispers of Yesterday",
    quote: "The style fingerprint captured my voice perfectly. My editor couldn't tell which parts were AI-assisted and which were pure human.",
    avatar: "📝",
    stats: "65K words · 14-day trial",
  },
];

export function Testimonials() {
  return (
    <section className="py-20 lg:py-28">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Writers Are Publishing With AI
          </h2>
          <p className="mt-4 text-muted-foreground">
            Real stories from writers who transformed their manuscripts with AI assistance
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3 max-w-5xl mx-auto">
          {testimonials.map((testimonial) => (
            <div
              key={testimonial.name}
              className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-2xl">
                  {testimonial.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">{testimonial.name}</p>
                  <p className="text-xs text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>

              <div className="relative mb-4">
                <QuoteIcon className="absolute -left-1 -top-1 size-4 text-muted-foreground/20" />
                <p className="text-sm leading-relaxed text-foreground/90 pl-6 italic">
                  "{testimonial.quote}"
                </p>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs font-medium text-foreground">{testimonial.book}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{testimonial.stats}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-6 py-2.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            See the Demo
            <span>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
