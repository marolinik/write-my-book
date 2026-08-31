/**
 * Interactive Demo Page - Let visitors try the app without signing up
 * Shows AI agents in action with sample manuscript
 */

import Link from "next/link";
import { PlayIcon, ArrowLeftIcon } from "lucide-react";

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <ArrowLeftIcon className="size-4" />
            <span className="text-sm font-medium">Back to Home</span>
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Start Writing Free
          </Link>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mx-auto max-w-4xl">
          {/* Demo Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm mb-6">
              <PlayIcon className="size-4 text-primary" />
              <span className="font-medium">Interactive Demo</span>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              Try WriteMyBook <span className="text-primary">Without Signing Up</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              Explore the app with a pre-loaded sample manuscript. See how AI agents 
              collaborate to transform your writing.
            </p>
          </div>

          {/* Demo Features */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {[
              {
                icon: "📝",
                title: "Style Fingerprint",
                description: "See how AI captures your unique voice across 20+ dimensions",
                action: "Analyze Sample",
              },
              {
                icon: "✍️",
                title: "Dev Edit",
                description: "Watch AI find plot holes and pacing issues automatically",
                action: "Run Dev Edit",
              },
              {
                icon: "📖",
                title: "Line Editing",
                description: "See sentence-level improvements in real-time",
                action: "Start Line Edit",
              },
              {
                icon: "🔍",
                title: "Continuity Check",
                description: "Catch cross-chapter inconsistencies instantly",
                action: "Check Continuity",
              },
              {
                icon: "📚",
                title: "Story Bible",
                description: "Explore auto-generated story architecture",
                action: "View Bible",
              },
              {
                icon: "📤",
                title: "Export",
                description: "Preview professional formatting for EPUB/PDF/DOCX",
                action: "Try Export",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-xl border bg-card p-6 hover:shadow-md transition-all hover:-translate-y-1"
              >
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-2xl mb-4">
                  {feature.icon}
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {feature.description}
                </p>
                <button className="text-sm font-medium text-primary hover:underline">
                  {feature.action} →
                </button>
              </div>
            ))}
          </div>

          {/* Sample Manuscript Preview */}
          <div className="rounded-xl border bg-card shadow-lg overflow-hidden mb-12">
            <div className="flex items-center gap-1.5 border-b px-4 py-2.5 bg-muted/30">
              <div className="size-2.5 rounded-full bg-red-500/20" />
              <div className="size-2.5 rounded-full bg-yellow-500/20" />
              <div className="size-2.5 rounded-full bg-green-500/20" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">
                demo/chapter-1-opening.txt
              </span>
            </div>
            <div className="p-8 font-serif text-sm leading-7 text-foreground/90 space-y-4">
              <p>
                The letter arrived on a Tuesday, though Imogen knew it was significant 
                even before she touched the envelope. The handwriting was unfamiliar—sharp, 
                angular strokes that seemed to vibrate with urgency.
              </p>
              <p>
                She sat very still for a long moment, the kettle hissing in the background 
                until Eluned reached past her and switched it off.
              </p>
              <p className="text-muted-foreground italic border-l-2 border-primary/30 pl-4">
                "You're doing it again," Eluned said. "Counting the seconds before 
                you even open it."
              </p>
              <div className="mt-6 flex items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs">
                  <span className="size-2 rounded-full bg-green-500" />
                  <span className="text-muted-foreground">Style: 95% match</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5 text-xs">
                  <span>📝</span>
                  <span className="text-muted-foreground">3 findings</span>
                </div>
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center bg-muted/30 rounded-xl p-8">
            <h2 className="font-display text-2xl font-semibold mb-4">
              Ready to Transform Your Manuscript?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Start your 14-day free trial. No credit card required. 
              Bring your own AI key for full cost transparency.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-8 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Writing Free
              <span>→</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
