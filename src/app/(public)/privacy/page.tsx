import type { Metadata } from "next";
import Link from "next/link";

const PAGE_TITLE = "Privacy Policy";
const PAGE_DESCRIPTION =
  "How WriteMyBook handles your account, your manuscripts and the text sent to AI providers: what we collect, why, who processes it, how long we keep it and your rights.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `${PAGE_TITLE} | WriteMyBook`,
    description: PAGE_DESCRIPTION,
    url: "/privacy",
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

function PrivacyEmail() {
  return (
    <a href="mailto:privacy@writemybook.app" className={LINK_CLASS}>
      privacy@writemybook.app
    </a>
  );
}

interface Processor {
  name: string;
  purpose: string;
  data: string;
  location: string;
}

const PROCESSORS: readonly Processor[] = [
  {
    name: "[Hosting provider: to be completed]",
    purpose:
      "Runs the servers that host our application, database (PostgreSQL), file storage (MinIO), vector search (Qdrant), story graph (Neo4j), job queue (Redis) and backups",
    data: "Everything stored in the service",
    location: "[to be completed]",
  },
  {
    name: "Clerk",
    purpose: "Sign-up, sign-in and session management",
    data: "Name, email address, sign-in method, IP address, device and browser data",
    location: "United States",
  },
  {
    name: "Stripe",
    purpose: "Subscription payments and invoices",
    data: "Name, email address, payment card and billing details, plan and payment history",
    location: "[to be confirmed: Ireland / United States]",
  },
  {
    name: "Sentry",
    purpose: "Error monitoring and performance traces",
    data: "Error reports: page or API address, browser data, technical context of the error",
    location: "[to be confirmed: depends on the Sentry account region]",
  },
  {
    name: "OpenAI",
    purpose:
      "Turns passages of your book into search vectors so agents can recall earlier parts of it (memory)",
    data: "Passages of your manuscript and planning documents",
    location: "United States",
  },
  {
    name: "OpenRouter, and the model host it routes to",
    purpose:
      "Only for the platform-funded AI allowance on the Free plan, when it is offered",
    data: "The parts of your book and instructions an AI feature needs",
    location:
      "United States (OpenRouter); the model host depends on the model, and for DeepSeek models may be outside the EU and the United States",
  },
  {
    name: "Perplexity, Serper, DuckDuckGo, Firecrawl",
    purpose: "Web research when an agent looks something up for you",
    data: "Search queries and web addresses written by the agent, which may mention topics from your book",
    location: "United States",
  },
];

export default function PrivacyPage() {
  return (
    <div className="py-16 lg:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">Last updated: October 12, 2026</p>

        <div className="mt-12 space-y-10 text-base leading-relaxed text-muted-foreground">
          <Section title="1. Who we are">
            <p className="mt-3">
              WriteMyBook is operated by{" "}
              <Term>[Company legal name, registered address and company number: to be completed]</Term>{" "}
              (&ldquo;we&rdquo;, &ldquo;us&rdquo;). We are the controller of the personal data
              described in this policy. You can reach us about anything in it at <PrivacyEmail />.
            </p>
            <p className="mt-3">
              Data protection officer or EU representative, if one is required:{" "}
              <Term>[to be completed]</Term>.
            </p>
            <p className="mt-3">
              This policy applies under the EU General Data Protection Regulation (GDPR) and the
              Serbian Law on Personal Data Protection (ZZPL).
            </p>
          </Section>

          <Section title="2. What we collect">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>Account data.</Term> Your name and email address, and an identifier from
                Clerk, our sign-in provider. Clerk handles your password or social sign-in; we
                never receive your password.
              </li>
              <li>
                <Term>Your writing.</Term> Books, chapters, files you import (DOCX, Markdown,
                plain text), planning documents such as the story bible, outline and style
                fingerprint, editorial findings, your conversations with the agents, notes and
                rules you give them, cover images, and any read-only share links you create.
              </li>
              <li>
                <Term>Settings.</Term> Interface and writing language, the AI models you pick,
                AI provider keys you add (stored encrypted, see section 9) and the addresses of
                any custom AI endpoints you add.
              </li>
              <li>
                <Term>Billing data.</Term> Your plan, subscription status and Stripe customer
                identifier. Card details go directly to Stripe; we do not see or store them.
              </li>
              <li>
                <Term>Usage data.</Term> Which model ran, token counts, estimated AI cost, number
                of agent sessions and the daily and monthly counters that enforce Free plan
                limits.
              </li>
              <li>
                <Term>Technical data.</Term> IP address (used to rate-limit public share links
                and to protect the service), and error reports (see Sentry in section 5).
              </li>
            </ul>
          </Section>

          <Section title="3. Where your text goes when you use AI">
            <p className="mt-3">
              When you run an AI feature (an agent, ghost text, inline edit, scene polish,
              continuity check and so on), the parts of your book and planning documents that the
              feature needs are sent to the AI model in use. Which company receives them depends on
              how that model is reached:
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>Your own API key.</Term> If you add a key for Anthropic, OpenRouter, OpenAI,
                Google Gemini or xAI Grok, your text goes to that provider on your key and under
                your own agreement with them. Their terms decide whether they keep your text and
                whether they may train on it. OpenAI, Gemini and Grok keys are relayed through a
                translation service we run on our own servers. With OpenRouter, OpenRouter chooses
                which company hosts the model unless your OpenRouter account settings restrict it;
                we do not add routing restrictions of our own.
              </li>
              <li>
                <Term>Custom endpoints.</Term> If you add a custom AI endpoint, your text goes to
                the address you entered.
              </li>
              <li>
                <Term>The default model.</Term> Until you choose one, AI features use DeepSeek V4.1
                Flash through OpenRouter on your OpenRouter key.
              </li>
              <li>
                <Term>Platform-funded allowance (Free plan).</Term> When we offer it, a Free
                writer without a key can run agents on our own key, up to a small daily and
                monthly cost. On this route your text is sent to our AI provider under our
                agreement with it. See section 4 before using it for sensitive work.
              </li>
              <li>
                <Term>Self-hosted models.</Term> Where we offer models labelled local or
                self-hosted, your text is processed on servers we operate and is not sent to an
                outside AI company.
              </li>
              <li>
                <Term>Memory.</Term> So agents can recall earlier chapters, passages of your book
                are sent to OpenAI on our key to be turned into search vectors. The passages and
                vectors are stored in our vector database. This happens whichever model you chose.
                Names of characters, places and their relationships are also stored in a story
                graph on our servers.
              </li>
              <li>
                <Term>Web research.</Term> When an agent researches a question, the search query
                it writes is sent to Perplexity, Serper (Google results) or DuckDuckGo, and the
                pages it reads are fetched directly or through Firecrawl. Queries can mention
                topics from your book; they do not contain your manuscript.
              </li>
            </ul>
          </Section>

          <Section title="4. AI training">
            <p className="mt-3">
              We do not use your manuscripts, documents, findings or conversations to train or
              fine-tune any AI model, and we do not sell them.
            </p>
            <p className="mt-3">
              What outside providers do is governed by their terms. With your own key, that is
              your agreement with the provider. For memory, we use OpenAI&apos;s API, whose
              terms state that API data is not used for training by default. For the
              platform-funded Free allowance we have not yet restricted routing to model hosts
              that commit not to keep or train on prompts, so we cannot promise that for that
              route today. If that matters for a piece of work, use your own key with a provider
              whose terms you accept, or a self-hosted model.
            </p>
          </Section>

          <Section title="5. Who processes your data">
            <p className="mt-3">
              These companies process personal data for us. Providers you connect with your own
              key work for you, not for us, and are not on this list.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b text-foreground">
                    <th className="py-2 pr-4 font-semibold">Company</th>
                    <th className="py-2 pr-4 font-semibold">Purpose</th>
                    <th className="py-2 pr-4 font-semibold">Data</th>
                    <th className="py-2 font-semibold">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {PROCESSORS.map((p) => (
                    <tr key={p.name} className="border-b align-top">
                      <td className="py-2 pr-4 text-foreground">{p.name}</td>
                      <td className="py-2 pr-4">{p.purpose}</td>
                      <td className="py-2 pr-4">{p.data}</td>
                      <td className="py-2">{p.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3">
              We do not use advertising networks or third-party analytics. Sentry does not record
              session replays of your screen.
            </p>
          </Section>

          <Section title="6. Why we process it (legal bases)">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>To provide the service you signed up for</Term>: your account, storing your
                writing, running the AI features you ask for, memory, export and share links.
                Basis: performance of our contract with you (GDPR Art. 6(1)(b); ZZPL Art. 12).
              </li>
              <li>
                <Term>To bill you and keep accounting records</Term>. Basis: contract, and our
                legal obligations under tax and accounting law (Art. 6(1)(c)).
              </li>
              <li>
                <Term>To keep the service secure and working</Term>: sign-in protection, rate
                limits, error monitoring and backups. Basis: our legitimate interest in a secure,
                reliable service (Art. 6(1)(f)).
              </li>
              <li>
                <Term>To enforce plan limits and the Free allowance</Term>. Basis: contract.
              </li>
              <li>
                <Term>To answer your messages</Term>. Basis: contract, or our legitimate interest
                in replying when you are not a customer.
              </li>
            </ul>
            <p className="mt-3">
              We do not send marketing email and do not make decisions about you by automated
              means that have legal or similarly significant effects.
            </p>
          </Section>

          <Section title="7. International transfers">
            <p className="mt-3">
              Several of the companies in section 5 are in the United States, and a model host
              reached through OpenRouter may be elsewhere. Where personal data leaves Serbia or the
              European Economic Area, we rely on an adequacy decision where one exists (including
              the EU-US Data Privacy Framework for certified companies) or on standard contractual
              clauses. <Term>[Transfer mechanism for each provider: to be confirmed]</Term>. You
              can ask us for a copy of the safeguards at <PrivacyEmail />.
            </p>
          </Section>

          <Section title="8. How long we keep it">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>Your writing and account</Term>: for as long as you keep them. Cancelling a
                paid plan does not delete anything; you move to the Free plan.
              </li>
              <li>
                <Term>A deleted book</Term> is removed from our database, file storage and memory
                vectors when you delete it. Entries for it in the story graph are not yet removed
                automatically; we remove them on request.
              </li>
              <li>
                <Term>A deleted account</Term>: your account and all database records, including
                books and documents, are deleted. Files and memory vectors are removed when each
                book is deleted, so delete your books first, or email us and we will remove the
                rest.
              </li>
              <li>
                <Term>Backups</Term> of the database are kept for up to about four weeks (24
                hourly, 7 daily, 4 weekly) and then overwritten.
              </li>
              <li>
                <Term>Billing records</Term>: for the period tax and accounting law requires{" "}
                <Term>[period: to be completed]</Term>.
              </li>
              <li>
                <Term>Usage records</Term>: for the life of your account.
              </li>
              <li>
                <Term>Error reports</Term> in Sentry: <Term>[period: to be completed]</Term>.
              </li>
              <li>
                <Term>Share links</Term>: until you revoke them or they expire.
              </li>
              <li>
                Text sent to an AI provider is kept according to that provider&apos;s terms.
              </li>
            </ul>
          </Section>

          <Section title="9. Security">
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                AI provider keys, and keys for custom endpoints, are encrypted with AES-256-GCM
                before they are stored, and are decrypted only to make AI requests for you.
              </li>
              <li>
                Traffic between your browser and WriteMyBook is encrypted with HTTPS.
              </li>
              <li>
                Our databases are not exposed to the internet and every request is checked
                against the account that owns the book.
              </li>
              <li>
                Your manuscripts are not encrypted by the application itself; they are protected
                by these access controls and by the hosting provider&apos;s storage security{" "}
                <Term>[disk encryption at the host: to be confirmed]</Term>.
              </li>
            </ul>
          </Section>

          <Section title="10. Your rights">
            <p className="mt-3">You have the right to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>Access</Term> the personal data we hold about you and get a copy.
              </li>
              <li>
                <Term>Rectify</Term> it. You can change your name and email in your account
                settings.
              </li>
              <li>
                <Term>Erase</Term> it. You can delete books in the app and your account from{" "}
                <em>Manage account</em>, or ask us.
              </li>
              <li>
                <Term>Portability</Term>. You can export any book as EPUB, PDF or DOCX on
                every plan, and ask us for your other data in a machine-readable format.
              </li>
              <li>
                <Term>Object</Term> to processing based on our legitimate interests, and ask us
                to <Term>restrict</Term> processing.
              </li>
              <li>
                <Term>Complain</Term> to a supervisory authority: in Serbia, the Commissioner for
                Information of Public Importance and Personal Data Protection (Poverenik,{" "}
                <a href="https://www.poverenik.rs" className={LINK_CLASS}>
                  www.poverenik.rs
                </a>
                ); in the EU, the data protection authority of the country where you live or work.
              </li>
            </ul>
            <p className="mt-3">
              Write to <PrivacyEmail /> to use any of these rights. We answer within 30 days.
            </p>
          </Section>

          <Section title="11. Cookies and browser storage">
            <p className="mt-3">
              We use only storage the service needs to work. There are no advertising or
              analytics cookies, so we do not ask for cookie consent.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <Term>Clerk session cookies</Term> keep you signed in.
              </li>
              <li>
                <Term>wmb_onboarded</Term> (1 year) remembers that you finished setup.
              </li>
              <li>
                <Term>sidebar_state</Term> (7 days) remembers whether the sidebar is open.
              </li>
              <li>
                <Term>Local storage on your device</Term> keeps your theme, panel layout and
                dismissed notices, and a copy of unsaved edits so a lost connection does not lose
                your writing. It stays in your browser and is not sent to us until it is saved.
              </li>
            </ul>
          </Section>

          <Section title="12. Children">
            <p className="mt-3">
              WriteMyBook is for adults aged 18 and over. We do not knowingly collect data from
              children. If you believe a child has an account, tell us and we will delete it.
            </p>
          </Section>

          <Section title="13. Share links">
            <p className="mt-3">
              A share link makes a read-only copy of the text you chose visible to anyone who has
              the link. You can revoke it at any time.
            </p>
          </Section>

          <Section title="14. Changes to this policy">
            <p className="mt-3">
              When we change this policy we update the date above. If a change affects how your
              writing is processed or who receives it, we tell you in the app before it takes
              effect.
            </p>
          </Section>

          <Section title="15. Contact">
            <p className="mt-3">
              Privacy questions and requests: <PrivacyEmail />. Our{" "}
              <Link href="/terms" className={LINK_CLASS}>
                Terms of Service
              </Link>{" "}
              cover the rest of our agreement with you.
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
