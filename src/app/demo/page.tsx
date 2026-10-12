/**
 * Product tour: a static, signed-out overview of what the app does.
 * Nothing on this page runs an agent or loads a real manuscript, so the copy
 * calls it a tour, never a live demo, and shows no invented scores.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  FileOutputIcon,
  FingerprintIcon,
  LayoutListIcon,
  PenLineIcon,
  ScanSearchIcon,
} from "lucide-react";

const TOUR_TITLE = "Product Tour";
const TOUR_DESCRIPTION =
  "A look at what WriteMyBook does with a manuscript: style fingerprint, developmental and line editing, continuity checks, the story bible, and export.";

export const metadata: Metadata = {
  title: TOUR_TITLE,
  description: TOUR_DESCRIPTION,
  alternates: { canonical: "/demo" },
  openGraph: {
    title: `${TOUR_TITLE} | WriteMyBook`,
    description: TOUR_DESCRIPTION,
    url: "/demo",
  },
  twitter: {
    title: `${TOUR_TITLE} | WriteMyBook`,
    description: TOUR_DESCRIPTION,
  },
};

const TOUR_STOPS = [
  {
    icon: FingerprintIcon,
    title: "Style Fingerprint",
    description:
      "The Style Analyst measures how you write, and the drafting agents write to that profile.",
  },
  {
    icon: LayoutListIcon,
    title: "Developmental Edit",
    description:
      "A whole-book structure pass proposes moves. Trim and expand drafts wait for your review before they change anything.",
  },
  {
    icon: PenLineIcon,
    title: "Line Editing and Polish",
    description:
      "Sentence-level notes from the Line Editor, and a light or bold Polish Scene rewrite in your voice.",
  },
  {
    icon: ScanSearchIcon,
    title: "Continuity Check",
    description:
      "Flags passages that contradict your story bible or earlier chapters, as findings you can discuss and resolve.",
  },
  {
    icon: BookOpenIcon,
    title: "Story Bible",
    description:
      "Characters, places, and facts the agents read before they write, kept in one document you control.",
  },
  {
    icon: FileOutputIcon,
    title: "Export",
    description: "EPUB, PDF, or DOCX through Pandoc, with front matter and back matter.",
  },
];

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
          {/* Tour Header */}
          <div className="text-center mb-12">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              A Tour of <span className="text-primary">WriteMyBook</span>
            </h1>
            <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
              What the agents do with a manuscript, from voice to export. To
              try it on your own book, start on the Free plan.
            </p>
          </div>

          {/* Tour stops */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-12">
            {TOUR_STOPS.map((stop) => {
              const Icon = stop.icon;
              return (
                <div key={stop.title} className="rounded-xl border bg-card p-6">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="font-semibold mb-2">{stop.title}</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {stop.description}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Sample passage */}
          <div className="rounded-xl border bg-card shadow-lg overflow-hidden mb-12">
            <div className="flex items-center gap-1.5 border-b px-4 py-2.5 bg-muted/30">
              <div className="size-2.5 rounded-full bg-red-500/20" />
              <div className="size-2.5 rounded-full bg-yellow-500/20" />
              <div className="size-2.5 rounded-full bg-green-500/20" />
              <span className="ml-3 text-xs text-muted-foreground">
                Example passage
              </span>
            </div>
            <div className="p-8 font-serif text-sm leading-7 text-foreground/90 space-y-4">
              <p>
                The letter arrived on a Tuesday, though Imogen knew it was significant
                even before she touched the envelope. The handwriting was unfamiliar:
                sharp, angular strokes that seemed to vibrate with urgency.
              </p>
              <p>
                She sat very still for a long moment, the kettle hissing in the background
                until Eluned reached past her and switched it off.
              </p>
              <p className="text-muted-foreground italic border-l-2 border-primary/30 pl-4">
                &ldquo;You&rsquo;re doing it again,&rdquo; Eluned said. &ldquo;Counting the
                seconds before you even open it.&rdquo;
              </p>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center bg-muted/30 rounded-xl p-8">
            <h2 className="font-display text-2xl font-semibold mb-4">
              Try It on Your Own Manuscript
            </h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              The Free plan needs no credit card. Connect your own AI key and
              import a chapter to see the agents work on your writing.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-8 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Writing Free
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
