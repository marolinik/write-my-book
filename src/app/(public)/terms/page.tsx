import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
};

export default function TermsPage() {
  return (
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: March 2, 2026
        </p>
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          These terms are a template and should be reviewed by legal counsel
          before production use.
        </p>

        <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
          {/* 1. Service Description */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              1. Service Description
            </h2>
            <p className="mt-3">
              WriteMyBook is an AI-powered writing and editorial platform that
              helps authors create, edit, and publish manuscripts. The platform
              provides 14 specialist AI agents, a multi-pass editorial pipeline,
              import/export capabilities, and series management tools.
            </p>
            <p className="mt-3">
              WriteMyBook operates on a Bring Your Own Key (BYOK) model. Users
              provide their own AI provider API keys (Anthropic, OpenRouter) to
              power AI workflows. The platform subscription covers access to
              platform features; AI processing costs are billed separately by
              your chosen AI provider.
            </p>
          </section>

          {/* 2. Account Terms */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              2. Account Terms
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                You must be at least 18 years old to use WriteMyBook.
              </li>
              <li>
                You are responsible for maintaining the security of your account
                and all activity that occurs under it.
              </li>
              <li>
                Each account is intended for use by a single individual. Sharing
                account credentials is not permitted.
              </li>
              <li>
                You must provide accurate and complete information when creating
                your account.
              </li>
            </ul>
          </section>

          {/* 3. BYOK Terms */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              3. Bring Your Own Key (BYOK) Terms
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                You are solely responsible for the costs incurred through your
                AI provider API keys. WriteMyBook does not control, mark up, or
                subsidize AI processing costs.
              </li>
              <li>
                Your platform subscription covers access to all WriteMyBook
                features (agents, workflows, import/export, series management).
                AI usage is billed separately by your AI provider at their
                published rates.
              </li>
              <li>
                You are responsible for ensuring your API key usage complies
                with your AI provider&apos;s terms of service.
              </li>
              <li>
                WriteMyBook stores your API keys using AES-256 encryption and
                uses them exclusively to execute agent workflows you initiate.
              </li>
            </ul>
          </section>

          {/* 4. Content Ownership */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              4. Content Ownership
            </h2>
            <p className="mt-3">
              You retain full ownership of all manuscripts, documents, editorial
              findings, style profiles, and any other creative content you
              create or upload to WriteMyBook. We claim no intellectual property
              rights over your content.
            </p>
            <p className="mt-3">
              By using the platform, you grant WriteMyBook a limited license to
              store, process, and transmit your content solely for the purpose
              of providing the service (e.g., sending text to AI providers for
              analysis, storing documents in object storage).
            </p>
          </section>

          {/* 5. Export Guarantee */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Export Guarantee
            </h2>
            <p className="mt-3">
              Export functionality is never gated by subscription status. Even
              if your subscription expires, is canceled, or is downgraded, you
              can always export your manuscripts in EPUB, PDF, and DOCX
              formats. We will never hold your work hostage.
            </p>
          </section>

          {/* 6. Subscription & Billing */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              6. Subscription and Billing
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Subscriptions are managed through Stripe. All payment processing
                is handled by Stripe in accordance with their terms of service.
              </li>
              <li>
                Eligible plans include a 14-day free trial. You will not be
                charged during the trial period.
              </li>
              <li>
                You may cancel your subscription at any time. Upon cancellation,
                you retain access to your current plan until the end of the
                billing period.
              </li>
              <li>
                Refunds are handled on a case-by-case basis. Contact support for
                refund requests.
              </li>
              <li>
                Prices are subject to change with 30 days&apos; notice to
                existing subscribers.
              </li>
            </ul>
          </section>

          {/* 7. Acceptable Use */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              7. Acceptable Use
            </h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Use the platform to create, store, or distribute illegal
                content.
              </li>
              <li>
                Abuse AI provider APIs through the platform (e.g., generating
                content that violates AI provider terms of service).
              </li>
              <li>
                Use automated tools to scrape, crawl, or extract data from
                WriteMyBook.
              </li>
              <li>
                Attempt to gain unauthorized access to other users&apos;
                accounts, data, or manuscripts.
              </li>
              <li>
                Interfere with or disrupt the platform&apos;s infrastructure or
                other users&apos; experience.
              </li>
            </ul>
          </section>

          {/* 8. Data Handling */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              8. Data Handling
            </h2>
            <p className="mt-3">
              Your data is handled in accordance with our{" "}
              <a
                href="/privacy"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                Privacy Policy
              </a>
              . Key points:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Manuscripts are stored encrypted at rest in S3-compatible
                storage.
              </li>
              <li>
                API keys are encrypted with AES-256 before storage.
              </li>
              <li>
                We do not use your content to train AI models.
              </li>
              <li>
                You can export all your data at any time and request complete
                account deletion.
              </li>
            </ul>
          </section>

          {/* 9. Limitation of Liability */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              9. Limitation of Liability
            </h2>
            <p className="mt-3">
              WriteMyBook is provided &ldquo;as is&rdquo; without warranties of
              any kind, either express or implied. To the maximum extent
              permitted by law:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                We are not liable for any indirect, incidental, special, or
                consequential damages arising from your use of the platform.
              </li>
              <li>
                Our total liability for any claims related to the service shall
                not exceed the amount you paid for the service in the 12 months
                preceding the claim.
              </li>
              <li>
                We are not responsible for AI-generated content quality, AI
                provider availability, or costs incurred through your AI
                provider API keys.
              </li>
            </ul>
          </section>

          {/* 10. Modifications */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              10. Modifications to These Terms
            </h2>
            <p className="mt-3">
              We may update these terms from time to time. When we make material
              changes, we will notify you by email or by posting a notice on the
              platform at least 30 days before the changes take effect. Your
              continued use of the platform after the effective date constitutes
              acceptance of the updated terms.
            </p>
          </section>

          {/* 11. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              11. Contact
            </h2>
            <p className="mt-3">
              For questions about these terms, please contact us at{" "}
              <a
                href="mailto:legal@writemybook.app"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                legal@writemybook.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
