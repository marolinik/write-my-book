/**
 * Improved Hero Section with stronger value proposition
 * and better conversion focus
 */

import Link from "next/link";
import { ArrowRightIcon, SparklesIcon, CheckIcon } from "lucide-react";

export function ImprovedHero() {
  return (
    <section className="relative overflow-hidden py-20 lg:py-32">
      {/* Background gradient */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--primary-foreground)_0%,_transparent_60%)] opacity-10" />
      
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Social proof badge */}
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background/50 px-4 py-1.5 text-sm backdrop-blur">
            <SparklesIcon className="size-4 text-primary" />
            <span className="text-muted-foreground">
              <strong>2,500+</strong> writers trust WriteMyBook
            </span>
            <CheckIcon className="size-3.5 text-green-500" />
          </div>

          {/* Main headline */}
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Transform Your Manuscript
            <br />
            <span className="bg-gradient-to-r from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
              Into a Published Book
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
            The AI-powered writing platform with <strong>14 specialist agents</strong> that 
            handle everything from first draft to publishing-ready manuscript. 
            <em className="text-foreground">Your voice, amplified.</em>
          </p>

          {/* Key benefits */}
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
            {["Bring Your Own AI Key", "No Token Markup", "14-Day Free Trial"].map((benefit) => (
              <div key={benefit} className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-primary" />
                <span>{benefit}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-8 py-3.5 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105"
            >
              Start Writing Free
              <ArrowRightIcon className="size-4" />
            </Link>
            <Link
              href="#demo"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-8 py-3.5 text-base font-medium hover:bg-accent hover:text-accent-foreground transition-all"
            >
              See Demo
            </Link>
          </div>

          {/* Trust indicators */}
          <p className="mt-8 text-xs text-muted-foreground">
            No credit card required · Setup in 2 minutes · Cancel anytime
          </p>
        </div>

        {/* Product preview */}
        <div className="mx-auto mt-16 max-w-3xl">
          <div className="rounded-xl border bg-card shadow-lg overflow-hidden">
            <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-red-500/20" />
              <span className="size-2.5 rounded-full bg-yellow-500/20" />
              <span className="size-2.5 rounded-full bg-green-500/20" />
              <span className="ml-3 text-xs text-muted-foreground">
                Chapter 1 - The Opening
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_220px]">
              <div className="p-6 sm:p-8 font-serif text-sm leading-7 text-foreground/90 space-y-4">
                <p>
                  The letter arrived on a Tuesday, though Imogen knew it was significant 
                  even before she touched the envelope.
                </p>
                <p>
                  She sat very still for a long moment, the kettle hissing in the background 
                  until Eluned reached past her and switched it off.
                </p>
                <p className="text-muted-foreground italic">
                  "You're doing it again," Eluned said. "Counting the seconds."
                </p>
              </div>
              <div className="border-t sm:border-t-0 sm:border-l bg-muted/40 p-4 space-y-3 text-xs">
                <div className="rounded-md border bg-background p-2.5">
                  <p className="font-medium text-foreground">✓ Style Fingerprint</p>
                  <p className="mt-1 text-muted-foreground leading-relaxed">
                    Voice analyzed · 20+ dimensions
                  </p>
                </div>
                <div className="rounded-md border bg-background p-2.5">
                  <p className="font-medium text-foreground">✓ Dev Edit Complete</p>
                  <p className="mt-1 text-muted-foreground leading-relaxed">
                    5 findings · 1 critical
                  </p>
                </div>
                <div className="rounded-md border bg-background p-2.5">
                  <p className="font-medium text-foreground">✓ Continuity Check</p>
                  <p className="mt-1 text-muted-foreground leading-relaxed">
                    12 flags cleared
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
