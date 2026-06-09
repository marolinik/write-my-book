import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
};

export default function PrivacyPage() {
  return (
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: March 2, 2026
        </p>
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          This policy is a template and should be reviewed by legal counsel
          before production use.
        </p>

        <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
          {/* 1. Information We Collect */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              1. Information We Collect
            </h2>
            <p className="mt-3">
              When you use WriteMyBook, we collect the following types of
              information:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">Account information</strong>{" "}
                &mdash; Your name, email address, and authentication credentials
                are managed by Clerk, our authentication provider.
              </li>
              <li>
                <strong className="text-foreground">Manuscript content</strong>{" "}
                &mdash; The books, chapters, documents, and editorial findings
                you create on the platform.
              </li>
              <li>
                <strong className="text-foreground">
                  API key configuration
                </strong>{" "}
                &mdash; If you provide AI provider API keys (Anthropic,
                OpenRouter), they are stored in encrypted form. See the BYOK
                section below.
              </li>
              <li>
                <strong className="text-foreground">Usage data</strong> &mdash;
                Aggregate metrics such as token usage, session counts, and
                feature usage for billing and analytics.
              </li>
            </ul>
          </section>

          {/* 2. BYOK Model */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              2. Bring Your Own Key (BYOK) Model
            </h2>
            <p className="mt-3">
              WriteMyBook operates on a BYOK model. You provide your own AI
              provider API keys to power AI agent workflows. Here is how we
              handle your keys:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                API keys are encrypted at rest using{" "}
                <strong className="text-foreground">AES-256 encryption</strong>{" "}
                before being stored in our database.
              </li>
              <li>
                Keys are decrypted only at the moment of making an API request
                to the AI provider on your behalf, and are never logged or
                cached in plaintext.
              </li>
              <li>
                You can delete your stored API keys at any time from the
                Settings page. Deletion is immediate and permanent.
              </li>
              <li>
                We never use your API keys for any purpose other than executing
                workflows you initiate.
              </li>
            </ul>
          </section>

          {/* 3. Third-Party Services */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              3. Third-Party Services
            </h2>
            <p className="mt-3">
              WriteMyBook integrates with the following third-party services:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">Clerk</strong> &mdash;
                Handles user authentication, session management, and account
                security. Clerk processes your email and login credentials.
              </li>
              <li>
                <strong className="text-foreground">Stripe</strong> &mdash;
                Processes subscription payments. We never see or store your
                full credit card details; all payment data is handled directly
                by Stripe.
              </li>
              <li>
                <strong className="text-foreground">
                  Anthropic / OpenRouter
                </strong>{" "}
                &mdash; AI providers that process your manuscript content when
                you run agent workflows. Your content is sent to these providers
                for processing only and is subject to their respective privacy
                policies.{" "}
                <strong className="text-foreground">
                  Your manuscripts are not used to train AI models.
                </strong>
              </li>
            </ul>
          </section>

          {/* 4. Data Storage */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              4. Data Storage
            </h2>
            <p className="mt-3">
              Your manuscripts and documents are stored encrypted at rest in
              S3-compatible object storage (MinIO). Metadata and structured data
              are stored in a PostgreSQL database. All data is hosted on
              infrastructure under our control.
            </p>
          </section>

          {/* 5. Data Retention & Deletion */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              5. Data Retention and Deletion
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                You can export all of your data (manuscripts, documents,
                editorial findings) at any time using the platform&apos;s export
                feature, regardless of your subscription status.
              </li>
              <li>
                Upon account deletion, all of your data &mdash; manuscripts,
                documents, API keys, editorial history, and usage records &mdash;
                is permanently purged from our systems.
              </li>
              <li>
                We retain aggregate, anonymized usage statistics for service
                improvement purposes only.
              </li>
            </ul>
          </section>

          {/* 6. No AI Training */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              6. No AI Training
            </h2>
            <p className="mt-3">
              We do not use your manuscripts, style fingerprint data, editorial
              findings, or any user-generated content to train, fine-tune, or
              improve AI models. Your creative work remains yours.
            </p>
          </section>

          {/* 7. Cookies */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              7. Cookies
            </h2>
            <p className="mt-3">WriteMyBook uses the following cookies:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">
                  Authentication session cookies
                </strong>{" "}
                &mdash; Managed by Clerk to maintain your login session.
              </li>
              <li>
                <strong className="text-foreground">Theme preference</strong>{" "}
                &mdash; Stores your light/dark mode preference locally.
              </li>
              <li>
                <strong className="text-foreground">Onboarding status</strong>{" "}
                &mdash; A cookie to track whether you have completed the
                onboarding wizard.
              </li>
            </ul>
            <p className="mt-3">
              We do not use tracking cookies, advertising cookies, or any
              third-party analytics cookies.
            </p>
          </section>

          {/* 8. Contact */}
          <section>
            <h2 className="text-xl font-semibold text-foreground">
              8. Contact
            </h2>
            <p className="mt-3">
              For privacy-related inquiries, please contact us at{" "}
              <a
                href="mailto:privacy@writemybook.app"
                className="text-primary underline underline-offset-4 hover:text-primary/80"
              >
                privacy@writemybook.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
