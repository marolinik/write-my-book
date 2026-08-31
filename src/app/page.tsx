import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BotIcon,
  PenToolIcon,
  ArrowUpDownIcon,
  FingerprintIcon,
  LibraryIcon,
  CheckIcon,
  PenLineIcon,
  SparklesIcon,
  ArrowRightIcon,
} from "lucide-react";
import { PLANS } from "@/lib/billing/stripe-client";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { ImprovedHero } from "@/components/landing/improved-hero";
import { SocialProof } from "@/components/landing/social-proof";
import { Testimonials } from "@/components/landing/testimonials";

const FEATURE_SECTIONS = [
  {
    icon: BotIcon,
    title: "14 AI Specialist Agents",
    description:
      "A complete publishing team at your fingertips. Writing Coach, Ghostwriter, Style Analyst, Story Architect, Scene Planner, Developmental Editor, Line Editor, Beta Reader Panel, Manuscript Analyst, Continuity Checker, Manuscript Reader, World Researcher, Market Reader, and Publishing Editor.",
    bullets: [
      "Each agent has deep expertise in their domain",
      "Orchestrated tool-use loops with approval gates",
      "You stay in control . Every major change needs your approval",
    ],
  },
  {
    icon: PenToolIcon,
    title: "Multi-Pass Editorial Pipeline",
    description:
      "Professional editing workflow: developmental edit, line edit, beta reading, and revision , the same process traditional publishers use, powered by AI that understands your book deeply.",
    bullets: [
      "Finding tracking with severity and categories",
      "Full edit history timeline and undo",
      "Circuit breaker prevents runaway revision loops",
    ],
  },
  {
    icon: ArrowUpDownIcon,
    title: "Import and Export",
    description:
      "Import your existing DOCX manuscript with smart 6-pass chapter detection that works across languages. Export to EPUB, PDF, or DOCX with Pandoc-powered professional typography and genre-appropriate templates.",
    bullets: [
      "Export is never gated , even after cancellation",
      "Front matter, back matter, and genre-appropriate styling",
      "Supports multilingual manuscripts out of the box",
    ],
  },
  {
    icon: FingerprintIcon,
    title: "Style Fingerprint",
    description:
      "AI captures YOUR unique voice and writes to match it. Sentence rhythm, vocabulary richness, dialogue patterns, narrative distance . Your style analyzed across 20+ dimensions so every agent writes like you, not generic AI.",
    bullets: [
      "Your voice analyzed across 20+ stylistic dimensions",
      "Every agent writes to match YOUR style, not generic AI",
      "Style evolution tracking as your writing matures",
    ],
  },
  {
    icon: LibraryIcon,
    title: "Series Management",
    description:
      "Write multi-book series with confidence. Shared story bibles, cross-book continuity checking, series-level documents, and an entity knowledge graph that tracks every character, location, and timeline across all volumes.",
    bullets: [
      "Never lose track of character details across books",
      "Series-wide continuity checking catches cross-book inconsistencies",
      "Shared world-building documents inherited by every book",
    ],
  },
];

const STEPS = [
  {
    step: "1",
    title: "Import or Start Fresh",
    description:
      "Import your existing DOCX manuscript . Our 6-pass algorithm detects chapters automatically in any language. Or start from scratch with the Story Architect to plan your structure.",
  },
  {
    step: "2",
    title: "Collaborate with AI Agents",
    description:
      "Run drafting, editing, and analysis workflows. 14 specialist agents handle everything from initial drafts to line-level polish. Review suggestions, approve changes, and iterate until it shines.",
  },
  {
    step: "3",
    title: "Export and Publish",
    description:
      "Export to EPUB, PDF, or DOCX with professional formatting, genre-appropriate typography, front matter, and back matter. Your manuscript, publishing-ready.",
  },
];

const COST_EXAMPLES = [
  { task: "Dev edit pass on a 5,000-word chapter", cost: "~$0.10" },
  { task: "Full novel draft (80,000 words)", cost: "~$10-20" },
  { task: "Complete editorial pipeline per chapter", cost: "~$5-15" },
  { task: "Style fingerprint capture", cost: "~$0.50" },
];

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");
const devBypass = process.env.DEV_AUTH_BYPASS === "true";

export default async function Home() {
  if (devBypass || !isClerkConfigured) {
    redirect("/dashboard");
  }

  try {
    const { userId } = await auth();
    if (userId) redirect("/dashboard");
  } catch {
    // Clerk misconfigured — show landing page
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <PenLineIcon className="size-4" />
            </div>
            <span className="font-display text-lg font-semibold">
              WriteMyBook
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-foreground transition-colors">How It Works</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Writing Free
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* JSON-LD Structured Data (LAND-06) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "WriteMyBook",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              description:
                "AI-powered novel writing platform with 14 specialist agents for drafting, editing, and publishing. Bring your own API key for full cost transparency.",
              url: "https://writemybook.app",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "19",
                highPrice: "499",
                priceCurrency: "USD",
                offerCount: 4,
              },
              featureList: [
                "14 AI specialist agents",
                "Multi-pass editorial pipeline",
                "DOCX/EPUB/PDF import and export",
                "Style fingerprint analysis",
                "Series management with cross-book continuity",
                "Bring Your Own Key (BYOK) model",
              ],
            }),
          }}
        />

        {/* Hero Section - Improved */}
        <ImprovedHero />

        {/* Social Proof Section */}
        <SocialProof />

        {/* Feature Showcase (LAND-02) */}

        {/* Feature Showcase (LAND-02) */}
        <section id="features" className="border-t bg-muted/30 py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything You Need to Write &amp; Publish
              </h2>
              <p className="mt-4 text-muted-foreground">
                From first draft to export-ready manuscript, every stage of the
                publishing process is covered.
              </p>
            </div>

            <div className="space-y-20 lg:space-y-28">
              {FEATURE_SECTIONS.map((feature, index) => {
                const Icon = feature.icon;
                const isReversed = index % 2 !== 0;

                return (
                  <div
                    key={feature.title}
                    className={`flex flex-col gap-8 lg:gap-16 items-center ${
                      isReversed ? "lg:flex-row-reverse" : "lg:flex-row"
                    }`}
                  >
                    {/* Text content */}
                    <div className="flex-1 max-w-xl">
                      <div className="inline-flex items-center justify-center size-12 rounded-lg bg-primary/10 text-primary mb-4">
                        <Icon className="size-6" />
                      </div>
                      <h3 className="text-2xl font-semibold tracking-tight">
                        {feature.title}
                      </h3>
                      <p className="mt-3 text-muted-foreground leading-relaxed">
                        {feature.description}
                      </p>
                      <ul className="mt-5 space-y-2.5">
                        {feature.bullets.map((bullet) => (
                          <li
                            key={bullet}
                            className="flex items-start gap-2 text-sm"
                          >
                            <CheckIcon className="size-4 text-primary shrink-0 mt-0.5" />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Visual — a real UI fragment in the product's own shape language */}
                    <div className="flex-1 w-full max-w-xl">
                      <div className="rounded-xl border bg-card p-5 shadow-sm">
                        <div className="flex items-center gap-2.5">
                          <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                            <Icon className="size-4" />
                          </div>
                          <div className="h-2.5 w-24 rounded-full bg-muted-foreground/15" />
                        </div>
                        <div className="mt-4 space-y-2.5">
                          <div className="h-2 rounded-full bg-muted-foreground/10 w-full" />
                          <div className="h-2 rounded-full bg-muted-foreground/10 w-[92%]" />
                          <div className="h-2 rounded-full bg-muted-foreground/10 w-[85%]" />
                          <div className="h-2 rounded-full bg-muted-foreground/10 w-[70%]" />
                          <div className="h-2 rounded-full bg-primary/25 w-[55%]" />
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <div className="h-7 w-20 rounded-md bg-primary/90" />
                          <div className="h-7 w-16 rounded-md border" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section id="how-it-works" className="py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                How It Works
              </h2>
              <p className="mt-4 text-muted-foreground">
                Three steps from manuscript to published book.
              </p>
            </div>
            <div className="mx-auto max-w-4xl grid grid-cols-1 gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.step} className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                    {step.step}
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* BYOK Cost Explainer (LAND-03) */}
        <section className="border-t bg-muted/30 py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Transparent Pricing, No Hidden Costs
              </h2>
              <p className="mt-4 text-muted-foreground">
                Two separate costs, both completely transparent.
              </p>
            </div>

            <div className="mx-auto max-w-4xl grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Platform subscription */}
              <div className="rounded-xl border bg-card p-8">
                <div className="inline-flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary mb-4">
                  <SparklesIcon className="size-5" />
                </div>
                <h3 className="text-xl font-semibold">Platform Subscription</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  A flat monthly fee for unlimited access to all 14 agents,
                  workflows, import/export, and features. No usage limits, no
                  token caps, no surprises on your platform bill.
                </p>
              </div>

              {/* AI usage */}
              <div className="rounded-xl border bg-card p-8">
                <div className="inline-flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary mb-4">
                  <BotIcon className="size-5" />
                </div>
                <h3 className="text-xl font-semibold">
                  AI Usage (Your API Key)
                </h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  You use your own Anthropic or OpenRouter API key and pay them
                  directly at their published rates. We never touch your tokens
                  and never mark up the cost.
                </p>
              </div>
            </div>

            {/* Cost examples */}
            <div className="mx-auto mt-12 max-w-2xl">
              <div className="rounded-xl border bg-card p-6">
                <h4 className="text-sm font-semibold text-center mb-4 text-muted-foreground uppercase tracking-wide">
                  Real-World AI Cost Examples
                </h4>
                <div className="space-y-3">
                  {COST_EXAMPLES.map((example) => (
                    <div
                      key={example.task}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {example.task}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {example.cost}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-center text-xs text-muted-foreground">
                  You control the spend. No surprises. No token limits.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section (LAND-04) */}
        <section id="pricing" className="py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-12">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Choose Your Plan
              </h2>
              <p className="mt-4 text-muted-foreground">
                All plans include all 14 agents. You bring your own AI key.
              </p>
            </div>
            <PricingSection plans={PLANS} />
          </div>
        </section>

        {/* FAQ Section (LAND-05) */}
        <section id="faq" className="border-t bg-muted/30 py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-12">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Frequently Asked Questions
              </h2>
            </div>
            <FaqAccordion />
          </div>
        </section>

        {/* Testimonials Section */}
        <Testimonials />

        {/* Final CTA */}
        <section className="py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to Write Your Book?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Join writers who are using AI agents to transform their manuscripts
              from first draft to publishing-ready.
            </p>
            <Link
              href="/signup"
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md bg-primary px-8 py-3.5 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Writing Free
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <p>
              &copy; {new Date().getFullYear()} WriteMyBook. AI-powered novel
              writing platform.
            </p>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                Privacy
              </Link>
              <Link href="/terms" className="hover:text-foreground transition-colors">
                Terms
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
