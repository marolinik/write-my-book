/**
 * Social Proof Section - Publisher logos and writer avatars
 * Shows trust indicators from the writing community
 */

import { CheckIcon } from "lucide-react";

export function SocialProof() {
  const publishers = [
    { name: "Independent Authors", icon: "✍️" },
    { name: "Writing Coaches", icon: "📚" },
    { name: "Publishing Houses", icon: "🏢" },
    { name: "Writing Workshops", icon: "🎓" },
  ];

  return (
    <section className="border-t bg-muted/30 py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground mb-8 text-center font-medium">
          TRUSTED BY WRITERS FROM
        </p>
        
        <div className="flex flex-wrap justify-center items-center gap-8 md:gap-12 opacity-60">
          {publishers.map((pub) => (
            <div
              key={pub.name}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <span className="text-2xl">{pub.icon}</span>
              <span className="text-sm font-medium">{pub.name}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CheckIcon className="size-4 text-green-500" />
            <span>2,500+ active writers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckIcon className="size-4 text-green-500" />
            <span>50,000+ chapters processed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckIcon className="size-4 text-green-500" />
            <span>14-day free trial</span>
          </div>
        </div>
      </div>
    </section>
  );
}
