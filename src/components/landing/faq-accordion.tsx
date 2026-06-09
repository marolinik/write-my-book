"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQ_ITEMS = [
  {
    question: "What is BYOK (Bring Your Own Key)?",
    answer:
      "WriteMyBook uses a Bring Your Own Key model. You pay a flat monthly platform subscription for access to all 14 AI agents, workflows, and features. For the actual AI processing, you provide your own Anthropic or OpenRouter API key. This means you pay the AI provider directly for token usage at their published rates -- no markups, no middleman. You stay in full control of your AI spend.",
  },
  {
    question: "How much does AI usage cost?",
    answer:
      "AI costs depend on how much you use and which models you choose. Here are some real-world examples: a developmental edit pass on a 5,000-word chapter costs roughly $0.10. A full novel draft of 80,000 words runs about $10-20. A complete editorial pipeline (dev edit, line edit, beta read) costs $5-15 per chapter. Most authors spend $20-50 per month on AI usage for active writing projects. You can monitor your exact usage at any time in your dashboard.",
  },
  {
    question: "What manuscript formats are supported?",
    answer:
      "You can import existing manuscripts in DOCX format. Our smart chapter detection uses a 6-pass multilingual algorithm to correctly split your manuscript into chapters regardless of language or formatting style. For export, we support EPUB, PDF, and DOCX with professional typography, genre-appropriate styling, front matter, and back matter -- all powered by Pandoc for publishing-quality output.",
  },
  {
    question: "Is my manuscript data safe?",
    answer:
      "Absolutely. Your manuscripts are stored with encryption at rest. API keys are encrypted with AES-256 before storage -- we never see them in plaintext. Your content is never used to train AI models. You can export your full manuscript at any time, and export is never gated -- even if you cancel your subscription, you can always download your work.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. You can cancel your subscription at any time from your account settings. When you cancel, you retain access through the end of your current billing period. After that, your account becomes read-only -- you can still view and export your manuscripts, but you cannot run new AI workflows. Export is never gated, so your work is always accessible.",
  },
  {
    question: "How many AI agents are included?",
    answer:
      "Every plan includes all 14 specialist AI agents: Writing Coach, Ghostwriter, Style Analyst, Story Architect, Scene Planner, Developmental Editor, Line Editor, Beta Reader Panel, Manuscript Analyst, Continuity Checker, Manuscript Reader, World Researcher, Market Reader, and Publishing Editor. There are no agent add-ons or premium tiers for specific agents.",
  },
  {
    question: "What is the Founder plan?",
    answer:
      "The Founder plan is a limited-time offer for our first 200 users. For $19/month, you get all Professional-tier features -- unlimited books, all 14 agents, series management, and advanced analytics. The price is locked in forever: it will never increase for Founder members, even as we add new features and raise regular prices. Once all 200 spots are claimed, this plan is gone for good.",
  },
];

export function FaqAccordion() {
  return (
    <div className="mx-auto max-w-3xl">
      <Accordion type="single" collapsible className="w-full">
        {FAQ_ITEMS.map((item, index) => (
          <AccordionItem key={index} value={`faq-${index}`}>
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
