import type { Metadata } from "next";
import Link from "next/link";

const PAGE_TITLE = "Terms of Service";
const PAGE_DESCRIPTION =
  "The agreement between you and WriteMyBook: accounts, the Free and paid plans, AI keys and costs, who owns your manuscripts, acceptable use and liability.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `${PAGE_TITLE} | WriteMyBook`,
    description: PAGE_DESCRIPTION,
    url: "/terms",
    siteName: "WriteMyBook",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${PAGE_TITLE} | WriteMyBook`,
    description: PAGE_DESCRIPTION,
  },
};

const LINK_CLASS = "text-primary underline underline-offset-4 hover:text-primary/80";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Term({ children }: { children: React.ReactNode }) {
  return <strong className="text-foreground">{children}</strong>;
}

function PrivacyLink() {
  return (
    <Link href="/privacy" className={LINK_CLASS}>
      Privacy Policy
    </Link>
  );
}

interface PaidPlan {
  name: string;
  price: string;
  note: string;
}

const PAID_PLANS: readonly PaidPlan[] = [
  {
    name: "Founder",
    price: "$19 per month, monthly billing only",
    note: "Unlimited books, series and analytics. Limited to the first 200 subscribers. The $19 price stays for as long as that subscription remains active without interruption.",
  },
  {
    name: "Indie Author",
    price: "$49 per month or $490 per year",
    note: "Up to 2 books; series and analytics are not included.",
  },
  {
    name: "Professional",
    price: "$99 per month or $990 per year",
    note: "Unlimited books, series and analytics.",
  },
  {
    name: "Publisher",
    price: "$499 per month or $4,990 per year",
    note: "Everything in Professional plus priority support. Features marked “Coming Soon” are not part of the plan until they are released.",
  },
];

export default function TermsPage() {
  return (
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: October 12, 2026</p>

        <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
          <Section title="1. Who you are contracting with">
            <p className="mt-3">
              These terms are an agreement between you and{" "}
              <Term>[Company legal name, registered address and company number: to be completed]</Term>{" "}
              (&ldquo;we&rdquo;, &ldquo;us&rdquo;), which operates WriteMyBook. By creating an
              account you accept them. Our <PrivacyLink /> explains how we handle personal data.
            </p>
          </Section>

          <Section title="2. The service">
            <p className="mt-3">
              WriteMyBook is a writing and editing platform for novelists. It stores your
              manuscripts and planning documents and lets you run AI agents that draft, edit,
              check continuity and review your work, on AI models you choose. Features change as
              we improve the product.
            </p>
          </Section>

          <Section title="3. Your account">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>You must be at least 18 years old.</li>
              <li>An account is for one person. Do not share your sign-in.</li>
              <li>Give accurate information and keep your email address current.</li>
              <li>
                You are responsible for activity under your account and for keeping your sign-in
                and any AI provider keys you add secure.
              </li>
            </ul>
          </Section>

          <Section title="4. The Free plan">
            <p className="mt-3">
              Every account starts on the Free plan. It needs no card. It currently includes:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>1 book;</li>
              <li>AI features on the first 40,000 words of your writing;</li>
              <li>20 agent sessions per month, one running at a time;</li>
              <li>100 ghost-text suggestions, 50 inline edits and 5 scene polishes per day.</li>
            </ul>
            <p className="mt-3">
              Writing, saving and export are never limited on Free. We may change Free limits; a
              change applies from the next day or month and does not delete anything you have
              written.
            </p>
          </Section>

          <Section title="5. Paid plans and billing">
            <ul className="mt-3 list-disc space-y-3 pl-6">
              {PAID_PLANS.map((plan) => (
                <li key={plan.name}>
                  <Term>{plan.name}</Term>: {plan.price}. {plan.note}
                </li>
              ))}
            </ul>
            <ul className="mt-4 list-disc space-y-2 pl-6">
              <li>
                Prices are in US dollars. <Term>[Whether prices include VAT or other taxes: to be completed]</Term>.
              </li>
              <li>
                Payments are processed by Stripe. A subscription is charged in advance and renews
                automatically each month or year until you cancel.
              </li>
              <li>
                If a plan is offered with a trial, its length is shown at checkout. A trial is
                available once per account. If you have not added a payment method when it ends,
                the subscription ends and your account returns to Free.
              </li>
              <li>
                You can cancel at any time from the billing page in Settings. Your paid plan
                continues until the end of the period you have paid for; after that your account
                moves to the Free plan. Nothing you have written is deleted.
              </li>
              <li>
                Refunds: <Term>[refund policy: to be completed]</Term>. This does not limit any
                right of withdrawal or refund that consumer law gives you.
              </li>
              <li>
                We will give existing subscribers at least 30 days&apos; notice of a price change
                before it applies to their next renewal.
              </li>
            </ul>
          </Section>

          <Section title="6. AI models, keys and costs">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>Your own key.</Term> You can add keys for Anthropic, OpenRouter, OpenAI,
                Google Gemini, xAI Grok or a custom endpoint. The provider bills you directly at
                its own rates; your subscription does not include AI usage. We do not mark up
                provider costs. You are responsible for following the provider&apos;s terms.
              </li>
              <li>
                We use your key only for AI work you start, including batch or overnight runs you
                schedule. You can remove a key at any time in Settings.
              </li>
              <li>
                <Term>Platform-funded allowance.</Term> Where we offer it, a Free writer without a
                key can run agents on our key up to $0.50 of AI cost per day and $3 per month. We
                may change or end this allowance at any time.
              </li>
              <li>
                Cost estimates shown in the app are estimates; the provider&apos;s bill is what
                counts.
              </li>
            </ul>
          </Section>

          <Section title="7. Your work is yours">
            <p className="mt-3">
              You own the manuscripts, documents and other content you write or upload, and, as
              between you and us, the text the AI produces for you. We claim no rights in them and
              do not use them to train AI models.
            </p>
            <p className="mt-3">
              You give us a limited licence to store, copy, process and transmit your content only
              as needed to run the service for you: saving it, backing it up, sending it to the AI
              providers described in the <PrivacyLink />, and showing it to people you share it
              with. The licence ends when you delete the content, except for backups until they
              expire.
            </p>
            <p className="mt-3">
              Whether AI-generated text can be protected by copyright depends on the law where you
              publish and on how much of it is your own creative work. AI output may resemble text
              produced for others, and we cannot promise it is unique.
            </p>
          </Section>

          <Section title="8. Export">
            <p className="mt-3">
              You can export your books as EPUB, PDF or DOCX on every plan, including
              Free and after cancelling a paid plan.
            </p>
          </Section>

          <Section title="9. Share links">
            <p className="mt-3">
              A share link lets anyone who has it read the text you chose. You are responsible for
              what you share and with whom. You can revoke a link at any time.
            </p>
          </Section>

          <Section title="10. Acceptable use">
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>upload or produce content that is illegal or infringes someone else&apos;s rights;</li>
              <li>use the service to violate an AI provider&apos;s usage policies;</li>
              <li>
                access other people&apos;s accounts or data, probe or attack the service, or get
                around plan limits or the Free allowance (for example with multiple accounts);
              </li>
              <li>scrape the service or resell access to it;</li>
              <li>overload or disrupt the service or other writers&apos; use of it.</li>
            </ul>
          </Section>

          <Section title="11. AI output">
            <p className="mt-3">
              AI output can be wrong, inconsistent, or similar to existing works. Editorial
              findings, continuity checks, research results and scores are suggestions, not
              professional, legal or factual advice, and can miss problems. Review anything before
              you rely on it or publish it. You are responsible for what you publish.
            </p>
          </Section>

          <Section title="12. Availability and changes">
            <p className="mt-3">
              We work to keep WriteMyBook available but do not guarantee it will be uninterrupted
              or error-free. AI providers we do not control can be slow or unavailable. We may add,
              change or remove features; if we remove something central to a paid plan we will
              tell you in advance.
            </p>
          </Section>

          <Section title="13. Ending the agreement">
            <p className="mt-3">
              You can stop using WriteMyBook and delete your account at any time. We may suspend
              or close an account that seriously or repeatedly breaks these terms. Except in cases
              of illegal content or a threat to the service, we will tell you first and give you
              time to export your work.
            </p>
          </Section>

          <Section title="14. Warranties and liability">
            <p className="mt-3">
              The service is provided &ldquo;as is&rdquo;. To the extent the law allows:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                we are not liable for indirect or consequential loss, lost profits, or the cost of
                AI usage on your own keys;
              </li>
              <li>
                our total liability for any claim is limited to the amount you paid us in the 12
                months before the claim.
              </li>
            </ul>
            <p className="mt-3">
              Nothing in these terms limits liability for death or personal injury caused by
              negligence, for fraud, or any right you have as a consumer that cannot be limited
              by contract.
            </p>
          </Section>

          <Section title="15. Governing law and disputes">
            <p className="mt-3">
              These terms are governed by <Term>[governing law: to be completed]</Term>, and
              disputes go to <Term>[competent courts: to be completed]</Term>. If you are a
              consumer, you also keep the protection of the mandatory laws of the country where
              you live and can bring a claim there.
            </p>
          </Section>

          <Section title="16. Changes to these terms">
            <p className="mt-3">
              If we make a material change we will tell you in the app at least 30 days before it
              takes effect. If you do not accept it, you can cancel before then. Continuing to use
              the service after that date means you accept the new terms.
            </p>
          </Section>

          <Section title="17. Contact">
            <p className="mt-3">
              Questions about these terms:{" "}
              <a href="mailto:legal@writemybook.app" className={LINK_CLASS}>
                legal@writemybook.app
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
