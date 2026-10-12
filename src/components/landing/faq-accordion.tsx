"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FREE_TIER } from "@/lib/billing/free-tier";
import { MAX_IMPORT_FILE_MB } from "@/lib/import-export/upload-limits";

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  /** True only when the deployment funds a no-key allowance for Free writers. */
  hostedAllowance?: boolean;
}

const PROVIDER_LIST = "Anthropic, OpenAI, Google Gemini, xAI Grok, or OpenRouter";

export function buildFaqItems(hostedAllowance: boolean): FaqItem[] {
  const noKey = hostedAllowance
    ? " If you have no key yet, a Free account can try the AI on a small, capped daily allowance that we pay for."
    : "";

  return [
    {
      question: "Is there a free plan?",
      answer: `Yes. Every account starts on Free, with no card. Free includes ${FREE_TIER.maxBooks} book, ${FREE_TIER.monthlyAgentSessions} agent sessions a month, AI on your first ${FREE_TIER.maxAiEligibleWords.toLocaleString("en-US")} words, ${FREE_TIER.dailyGhostText} ghost-text suggestions and ${FREE_TIER.dailyInlineEdit} inline edits a day, and ${FREE_TIER.dailyPolishScene} scene polishes a day. You can upgrade to a paid plan from Billing inside the app whenever you want more.`,
    },
    {
      question: "What is BYOK (Bring Your Own Key)?",
      answer: `You connect your own API key from ${PROVIDER_LIST}, and you pay that provider directly at its published rates. We add no markup on tokens. The plan you pick covers the platform itself: the agents, workflows, editor, and export.${noKey}`,
    },
    {
      question: "How much does AI usage cost?",
      answer:
        "It depends on the model you choose and how much you run. Prices differ widely between the cheapest and the most capable models, so the same edit can cost cents on one and much more on another. Before you queue an overnight batch the app shows an estimated cost, and the Billing page shows what your runs actually spent.",
    },
    {
      question: "What manuscript formats are supported?",
      answer: `You can import a manuscript as DOCX, Markdown, or plain text, up to ${MAX_IMPORT_FILE_MB} MB per file. Chapter detection recognises common chapter headings in several languages, and you can review the split before anything is saved. Export produces EPUB, PDF, or DOCX through Pandoc, with front matter and back matter.`,
    },
    {
      question: "Which languages does it support?",
      answer:
        "The app's interface is available in English, Serbian, German, Spanish, French, Russian, and Chinese. You can set your book's language separately, and the agents write and edit in that language. This website is in English for now.",
    },
    {
      question: "Is my manuscript data safe?",
      answer:
        "Your API keys are encrypted with AES-256-GCM before they are stored, and they are never shown back in plain text. We do not use your manuscripts to train AI models. When you run an agent, the relevant text is sent to the AI provider you chose and is handled under that provider's terms. You can export your full manuscript at any time.",
    },
    {
      question: "Can I cancel anytime?",
      answer:
        "Yes. Cancel from your account settings and you keep your paid plan until the end of the billing period. After that the account moves to the Free plan: your books stay, export stays open, and AI features continue within the Free plan's limits.",
    },
    {
      question: "How many AI agents are included?",
      answer:
        "Every plan includes all 14 specialist AI agents: Writing Coach, Ghostwriter, Style Analyst, Story Architect, Scene Planner, Developmental Editor, Line Editor, Beta Reader Panel, Manuscript Analyst, Continuity Checker, Manuscript Reader, World Researcher, Market Reader, and Publishing Editor. There are no agent add-ons.",
    },
    {
      question: "What is the Founder plan?",
      answer:
        "The Founder plan is a limited offer for our first 200 subscribers. For $19/month you get the Professional plan's features: unlimited books, all 14 agents, series management, and advanced analytics. The price is locked in and will not increase for Founder members. Once all 200 spots are claimed, the plan closes.",
    },
  ];
}

export function FaqAccordion({ hostedAllowance = false }: FaqAccordionProps) {
  const items = buildFaqItems(hostedAllowance);
  return (
    <div className="mx-auto max-w-3xl">
      <Accordion type="single" collapsible className="w-full">
        {items.map((item, index) => (
          <AccordionItem key={item.question} value={`faq-${index}`}>
            <AccordionTrigger className="text-left text-base">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
