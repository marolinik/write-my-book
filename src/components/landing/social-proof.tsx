/**
 * Audience & Product Facts Section
 * Truthful claims only — verifiable product capabilities, never invented
 * user counts or customer logos (see docs/LAUNCH-REVIEW-2026-08-31.md §P0).
 */

import { CheckIcon } from "lucide-react";

export function SocialProof() {
  const audiences = [
    { name: "Independent Authors", icon: "✍️" },
    { name: "Writing Coaches", icon: "📚" },
    { name: "Series & Fiction Writers", icon: "🏢" },
    { name: "Writing Workshops", icon: "🎓" },
  ];

  const facts = [
    "14 AI specialist agents",
    "EPUB, PDF & DOCX export",
    "Interface in 7 languages",
    "14-day free trial",
  ];

  return (
    <section className="border-t bg-muted/30 py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground mb-8 text-center font-medium">
          BUILT FOR WRITERS LIKE
        </p>

        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
          {audiences.map((audience) => (
            <div
              key={audience.name}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <span className="text-2xl">{audience.icon}</span>
              <span className="text-sm font-medium">{audience.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          {facts.map((fact) => (
            <div key={fact} className="flex items-center gap-1.5">
              <CheckIcon className="size-4 text-green-500" />
              <span>{fact}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
