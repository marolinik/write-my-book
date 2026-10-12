/**
 * Audience & Product Facts Section
 * Truthful claims only: verifiable product capabilities, never invented
 * user counts or customer logos (see docs/LAUNCH-REVIEW-2026-08-31.md §P0).
 * The product is single-user, so the audience list names individual writers.
 */

import { BookOpenIcon, CheckIcon, LibraryIcon, PenLineIcon, RotateCcwIcon } from "lucide-react";

// The app's UI dictionaries: src/lib/i18n/ui-strings/{en,sr,de,es,fr,ru,zh}.ts
const APP_INTERFACE_LANGUAGES = 7;

export function SocialProof() {
  const audiences = [
    { name: "Independent Authors", icon: PenLineIcon },
    { name: "Series Writers", icon: LibraryIcon },
    { name: "Novelists Revising a Draft", icon: RotateCcwIcon },
    { name: "First-Time Fiction Writers", icon: BookOpenIcon },
  ];

  const facts = [
    "14 AI specialist agents",
    "EPUB, PDF & DOCX export",
    `App interface in ${APP_INTERFACE_LANGUAGES} languages`,
    "Free plan, no card needed",
  ];

  return (
    <section className="border-t bg-muted/30 py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground mb-8 text-center font-medium">
          BUILT FOR WRITERS LIKE
        </p>

        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
          {audiences.map((audience) => {
            const Icon = audience.icon;
            return (
              <div
                key={audience.name}
                className="flex items-center gap-2 text-muted-foreground"
              >
                <Icon className="size-5" />
                <span className="text-sm font-medium">{audience.name}</span>
              </div>
            );
          })}
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
