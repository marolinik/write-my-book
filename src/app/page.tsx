import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BookOpenIcon,
  PenToolIcon,
  BarChart3Icon,
  ShieldCheckIcon,
  CheckIcon,
  PenLineIcon,
} from "lucide-react";

const FEATURES = [
  {
    icon: BookOpenIcon,
    title: "AI-Powered Drafting",
    description:
      "Ghostwriter agents produce chapters in your authentic voice, maintaining style consistency across your entire manuscript.",
  },
  {
    icon: PenToolIcon,
    title: "Multi-Pass Editing",
    description:
      "Developmental editing, line editing, and beta reading agents collaborate to polish your work to publishing standards.",
  },
  {
    icon: BarChart3Icon,
    title: "Manuscript Analytics",
    description:
      "Readability scores, pacing curves, dialogue distribution, and overuse detection give you actionable insights.",
  },
  {
    icon: ShieldCheckIcon,
    title: "You Stay in Control",
    description:
      "Approval gates, revision tracking, and full edit history mean you always have the final say.",
  },
];

const STEPS = [
  {
    step: "1",
    title: "Import or Start Fresh",
    description:
      "Import your existing DOCX manuscript or start a new book from scratch with concept planning.",
  },
  {
    step: "2",
    title: "Collaborate with AI Agents",
    description:
      "Run drafting, editing, and analysis workflows. Review suggestions, approve changes, and iterate.",
  },
  {
    step: "3",
    title: "Export & Publish",
    description:
      "Export to EPUB, PDF, or DOCX with professional formatting, front matter, and genre-appropriate typography.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["1 book", "BYOK only", "Basic export"],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "$9",
    period: "/month",
    features: ["5 books", "BYOK only", "All export formats", "Beta reader lab"],
    cta: "Start Free Trial",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$29",
    period: "/month",
    features: [
      "Unlimited books",
      "All export formats",
      "Beta reader lab",
      "Series manager",
      "Priority support",
    ],
    cta: "Start Free Trial",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "$99",
    period: "/month",
    features: [
      "Unlimited books",
      "All export formats",
      "Series manager",
      "Team collaboration",
      "Dedicated support",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
];

export default async function Home() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
              <PenLineIcon className="size-4" />
            </div>
            <span className="font-display text-lg font-semibold">
              WriteMyBook
            </span>
          </Link>
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
              Get Started
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="py-20 lg:py-32">
          <div className="container mx-auto px-4 text-center">
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              A Professional Publishing House
              <br />
              <span className="text-primary">In Your Browser</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
              AI agents handle drafting, editing, and quality assurance while you
              maintain creative control. From concept to export-ready manuscript.
            </p>
            <div className="mt-10 flex items-center justify-center gap-4">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Start Writing Free
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-base font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                Log In
              </Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="border-t bg-muted/50 py-20">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
              Everything You Need to Write a Novel
            </h2>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-lg border bg-card p-6"
                >
                  <feature.icon className="h-10 w-10 text-primary" />
                  <h3 className="mt-4 text-lg font-semibold">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
              How It Works
            </h2>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {STEPS.map((step) => (
                <div key={step.step} className="text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                    {step.step}
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="border-t bg-muted/50 py-20">
          <div className="container mx-auto px-4">
            <h2 className="font-display text-center text-3xl font-semibold tracking-tight">
              Simple, Transparent Pricing
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-center text-muted-foreground">
              All plans use Bring Your Own Key (BYOK) for AI — you pay Anthropic
              directly for token usage.
            </p>
            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-lg border bg-card p-6 ${
                    plan.highlighted ? "ring-2 ring-primary" : ""
                  }`}
                >
                  <h3 className="text-lg font-semibold">{plan.name}</h3>
                  <p className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">
                      {plan.period}
                    </span>
                  </p>
                  <ul className="mt-6 space-y-2">
                    {plan.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2 text-sm"
                      >
                        <CheckIcon className="h-4 w-4 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/signup"
                    className={`mt-6 block w-full rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                      plan.highlighted
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} WriteMyBook. AI-powered novel
            writing platform.
          </p>
        </div>
      </footer>
    </div>
  );
}
