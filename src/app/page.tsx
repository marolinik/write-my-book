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
  LayoutListIcon,
  AnchorIcon,
  UsersRoundIcon,
  WandSparklesIcon,
  ScanSearchIcon,
  MoonStarIcon,
  MessagesSquareIcon,
  GaugeIcon,
  CloudOffIcon,
} from "lucide-react";
import { PLANS } from "@/lib/billing/stripe-client";
import { FREE_TIER } from "@/lib/billing/free-tier";
import { PricingSection } from "@/components/landing/pricing-section";
import { FaqAccordion } from "@/components/landing/faq-accordion";
import { ImprovedHero } from "@/components/landing/improved-hero";
import { SocialProof } from "@/components/landing/social-proof";
import { PlatformPromise } from "@/components/landing/platform-promise";

const FEATURE_SECTIONS = [
  {
    icon: BotIcon,
    title: "14 AI Specialist Agents",
    description:
      "A complete publishing team at your fingertips. Writing Coach, Ghostwriter, Style Analyst, Story Architect, Scene Planner, Developmental Editor, Line Editor, Beta Reader Panel, Manuscript Analyst, Continuity Checker, Manuscript Reader, World Researcher, Market Reader, and Publishing Editor.",
    bullets: [
      "Each agent has deep expertise in their domain",
      "Orchestrated tool-use loops with approval gates",
      "You stay in control. Every major change needs your approval",
    ],
  },
  {
    icon: PenToolIcon,
    title: "Multi-Pass Editorial Pipeline",
    description:
      "A professional editing workflow: developmental edit, line edit, beta reading, and revision, the same order of passes a traditional publisher uses.",
    bullets: [
      "Finding tracking with severity and categories",
      "Discuss any finding with the agent that raised it",
      "Circuit breaker prevents runaway revision loops",
    ],
  },
  {
    icon: ArrowUpDownIcon,
    title: "Import and Export",
    description:
      "Import an existing manuscript as DOCX, Markdown, or plain text, with chapter detection that recognises common headings in several languages. Export to EPUB, PDF, or DOCX through Pandoc.",
    bullets: [
      "Export is never gated, even after cancellation",
      "Front matter and back matter included",
      "Your book and its export stay in the language you write in",
    ],
  },
  {
    icon: FingerprintIcon,
    title: "Style Fingerprint",
    description:
      "The Style Analyst captures how you write: sentence rhythm, vocabulary, dialogue patterns, narrative distance. The drafting agents write to that profile, so new prose sounds like you.",
    bullets: [
      "A measured profile of your voice",
      "Drafting agents write to match your style",
      "Polish Scene rewrites a selected scene, lightly or boldly, in your voice",
    ],
  },
  {
    icon: LibraryIcon,
    title: "Series Management",
    description:
      "Write a multi-book series with shared story bibles, cross-book continuity checking, series-level documents, and a knowledge graph of characters, places, and timelines. Series management is on the Professional and Founder plans.",
    bullets: [
      "The Shelf groups your books by series",
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
      "Import a DOCX, Markdown, or plain-text manuscript and the chapters are detected for you. Or start from scratch with the Story Architect to plan your structure.",
  },
  {
    step: "2",
    title: "Collaborate with AI Agents",
    description:
      "Run drafting, editing, and analysis workflows. 14 specialist agents handle everything from initial drafts to line-level polish. Review suggestions, approve changes, and iterate until it shines.",
  },
  {
    step: "3",
    title: "Export",
    description:
      "Export to EPUB, PDF, or DOCX with front matter and back matter, ready for whichever publishing route you choose.",
  },
];

/** Shipped features beyond the five headline sections. Each one exists in
 *  the app today; keep this list to things a writer can use, not roadmap. */
const MORE_FEATURES = [
  {
    icon: LayoutListIcon,
    title: "Developmental editor",
    body: "Reads the whole book's structure and proposes moves: reorder, merge, split, trim, expand. Trim and expand arrive as drafts you review before anything changes.",
  },
  {
    icon: AnchorIcon,
    title: "Book map and chapter hooks",
    body: "A map of the whole book, with each chapter's closing hook rated and drafts offered for the weak ones.",
  },
  {
    icon: UsersRoundIcon,
    title: "Genre-reader lens",
    body: "The developmental editor can read the book the way a reader of its genre would.",
  },
  {
    icon: WandSparklesIcon,
    title: "Polish Scene",
    body: "Right-click a scene in the editor for a light or bold rewrite in your voice.",
  },
  {
    icon: ScanSearchIcon,
    title: "Canon check while you write",
    body: "Changed paragraphs are checked against your story bible, and contradictions show up as continuity findings.",
  },
  {
    icon: MoonStarIcon,
    title: "Overnight batch runs",
    body: "Queue work across many chapters with a cost estimate up front, and come back to the results.",
  },
  {
    icon: MessagesSquareIcon,
    title: "Findings you can discuss",
    body: "Ask the agent why it flagged something, and push back before you accept or dismiss it.",
  },
  {
    icon: GaugeIcon,
    title: "Beta reader score",
    body: "The Beta Reader Panel gives the book a score alongside its reader notes.",
  },
  {
    icon: CloudOffIcon,
    title: "Offline autosave",
    body: "Edits are kept in your browser if the connection drops, so a lost network does not lose a paragraph.",
  },
];

/** Whether this deployment funds a small no-key AI allowance for Free writers.
 *  Loaded lazily: the module reaches the database client, and the landing
 *  must render even where that cannot load. */
async function isHostedAllowanceOn(): Promise<boolean> {
  try {
    const { managedTierConfig } = await import("@/lib/billing/managed-tier");
    return managedTierConfig() !== null;
  } catch {
    return false;
  }
}

const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const isClerkConfigured =
  clerkKey && clerkKey.length > 0 && !clerkKey.includes("REPLACE_ME");
const devBypass = process.env.DEV_AUTH_BYPASS === "true";

export default async function Home() {
  if (devBypass || !isClerkConfigured) {
    redirect("/dashboard");
  }

  // redirect() works by throwing, so it must stay outside the try: inside it
  // the catch swallowed the redirect and every signed-in visitor (and every
  // sign-in, which lands on "/") got the marketing page (UAT P4-S19).
  let userId: string | null = null;
  try {
    ({ userId } = await auth());
  } catch {
    // Clerk misconfigured: show landing page
  }
  if (userId) redirect("/dashboard");

  const hostedAllowance = await isHostedAllowanceOn();

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
                "AI-powered novel writing platform with 14 specialist agents for drafting, editing, and export. Free plan available; bring your own key from Anthropic, OpenAI, Google Gemini, xAI Grok, or OpenRouter.",
              url: "https://writemybook.app",
              offers: {
                "@type": "AggregateOffer",
                lowPrice: "0",
                highPrice: String(PLANS.publisher.monthlyPrice),
                priceCurrency: "USD",
                offerCount: 1 + Object.keys(PLANS).length,
              },
              featureList: [
                "14 AI specialist agents",
                `Free plan: ${FREE_TIER.maxBooks} book, ${FREE_TIER.monthlyAgentSessions} agent sessions a month`,
                "Multi-pass editorial pipeline",
                "Whole-book developmental editor with reviewable trim and expand drafts",
                "Polish Scene rewrite in the writer's voice",
                "Live canon check against the story bible",
                "Overnight batch runs",
                "DOCX, Markdown, and plain-text import; EPUB, PDF, and DOCX export",
                "Style fingerprint analysis",
                "Series management with cross-book continuity",
                "Bring Your Own Key (BYOK) model choice",
                "Offline autosave",
              ],
            }),
          }}
        />

        {/* Hero Section - Improved */}
        <ImprovedHero />

        {/* Social Proof Section */}
        <SocialProof />

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

                    {/* Visual: a real UI fragment in the product's own shape language */}
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
                Three steps from manuscript to export-ready book.
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

        {/* More in the app: shipped features beyond the headline five */}
        <section id="more" className="border-t py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-14">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                More in the App
              </h2>
              <p className="mt-4 text-muted-foreground">
                The tools writers reach for once the first draft exists.
              </p>
            </div>
            <div className="mx-auto max-w-5xl grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {MORE_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-4">
                    <div className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{feature.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {feature.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* BYOK Cost Explainer (LAND-03) */}
        <section className="border-t bg-muted/30 py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center mb-16">
              <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                What It Costs
              </h2>
              <p className="mt-4 text-muted-foreground">
                Two separate costs, and you can see both.
              </p>
            </div>

            <div className="mx-auto max-w-4xl grid grid-cols-1 gap-8 md:grid-cols-2">
              {/* Platform plan */}
              <div className="rounded-xl border bg-card p-8">
                <div className="inline-flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary mb-4">
                  <SparklesIcon className="size-5" />
                </div>
                <h3 className="text-xl font-semibold">Your Plan</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  Start on Free with no card: {FREE_TIER.maxBooks} book and{" "}
                  {FREE_TIER.monthlyAgentSessions} agent sessions a month. Paid
                  plans are a flat monthly fee that lifts the Free limits: Indie
                  covers {PLANS.indie.maxBooks} books, Professional and Founder
                  are unlimited.
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
                  Connect your own key from Anthropic, OpenAI, Google Gemini,
                  xAI Grok, or OpenRouter and pay the provider directly at its
                  published rates. We add no markup. Cost depends on the model
                  you pick, and the app shows an estimate before a batch run.
                  {hostedAllowance
                    ? " No key yet? Free accounts can try the AI on a small, capped daily allowance we pay for."
                    : ""}
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
                Every plan, Free included, has all 14 agents. Paid plans add
                books, sessions, and series tools.
              </p>
            </div>
            <PricingSection plans={PLANS} hostedAllowance={hostedAllowance} />
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
            <FaqAccordion hostedAllowance={hostedAllowance} />
          </div>
        </section>

        {/* Platform Promise Section (replaces fabricated testimonials) */}
        <PlatformPromise />

        {/* Final CTA */}
        <section className="py-20 lg:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Ready to Write Your Book?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Start on the Free plan, bring your manuscript, and see what the
              agents make of it. No card needed.
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
