"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { FREE_TIER } from "@/lib/billing/free-tier";
import { FounderCounter } from "./founder-counter";

interface PlanData {
  name: string;
  monthlyPrice: number;
  annualPrice: number | null;
  maxBooks: number;
  maxSlots: number | null;
  trialDays: number;
  features: string[];
  gatedFeatures: string[];
  stripePriceIds: { monthly?: string; annual?: string };
}

interface PricingSectionProps {
  plans: Record<string, PlanData>;
  /**
   * True only when the deployment funds a small no-key AI allowance for Free
   * writers (`managedTierConfig()` returns a config). The Free card never
   * promises key-free AI unless it is actually on.
   */
  hostedAllowance?: boolean;
}

const PLAN_ORDER = ["founder", "indie", "professional", "publisher"] as const;

/** Every account starts on Free; upgrades happen from Billing in the app. */
const SIGNUP_HREF = "/signup";
const PUBLISHER_MAILTO =
  "mailto:hello@writemybook.app?subject=Publisher%20Plan%20Inquiry";

function formatPrice(price: number): string {
  return `$${price}`;
}

function getAnnualMonthly(annualPrice: number): number {
  return Math.round((annualPrice / 12) * 100) / 100;
}

/** The Free plan's limits, read from the same const the gates enforce. */
export function freePlanFeatures(hostedAllowance: boolean): string[] {
  const books = FREE_TIER.maxBooks === 1 ? "1 book" : `${FREE_TIER.maxBooks} books`;
  return [
    books,
    `${FREE_TIER.monthlyAgentSessions} agent sessions a month`,
    `AI on your first ${FREE_TIER.maxAiEligibleWords.toLocaleString("en-US")} words`,
    `${FREE_TIER.dailyGhostText} ghost-text suggestions and ${FREE_TIER.dailyInlineEdit} inline edits a day`,
    `${FREE_TIER.dailyPolishScene} scene polishes a day`,
    hostedAllowance
      ? "Try the AI without a key on a small daily allowance"
      : "Use your own AI provider key",
    "Export any time",
  ];
}

function FeatureList({ features }: { features: string[] }) {
  return (
    <ul className="space-y-2.5">
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2 text-sm">
          <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <span>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

function FreePlanCard({ hostedAllowance }: { hostedAllowance: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{FREE_TIER.name}</CardTitle>
        <div className="mt-2">
          <span className="text-3xl font-bold">$0</span>
          <span className="text-sm text-muted-foreground">/mo</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">No card needed</p>
      </CardHeader>
      <CardContent>
        <FeatureList features={freePlanFeatures(hostedAllowance)} />
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-2">
        <Link
          href={SIGNUP_HREF}
          className="w-full rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Start Writing Free
        </Link>
      </CardFooter>
    </Card>
  );
}

export function PricingSection({ plans, hostedAllowance = false }: PricingSectionProps) {
  const [isAnnual, setIsAnnual] = useState(false);

  return (
    <div>
      {/* Billing toggle */}
      <div className="flex items-center justify-center gap-3 mb-10">
        <span
          className={`text-sm font-medium ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}
        >
          Monthly
        </span>
        <Switch
          checked={isAnnual}
          onCheckedChange={setIsAnnual}
          aria-label="Toggle annual billing"
        />
        <span
          className={`text-sm font-medium ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}
        >
          Annual
          <span className="ml-1.5 text-xs text-primary font-semibold">Save up to 17%</span>
        </span>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <FreePlanCard hostedAllowance={hostedAllowance} />
        {PLAN_ORDER.map((key) => {
          const plan = plans[key];
          if (!plan) return null;

          const isFounder = key === "founder";
          const isPublisher = key === "publisher";
          const hasAnnual = plan.annualPrice !== null;
          const showAnnual = isAnnual && hasAnnual;

          const displayPrice = showAnnual
            ? getAnnualMonthly(plan.annualPrice!)
            : plan.monthlyPrice;

          const annualSavings =
            hasAnnual && plan.annualPrice !== null
              ? plan.monthlyPrice * 12 - plan.annualPrice
              : 0;

          return (
            <Card
              key={key}
              className={
                isFounder
                  ? "ring-2 ring-primary relative overflow-hidden"
                  : ""
              }
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isFounder && (
                    <Badge variant="destructive" className="text-[10px]">
                      Limited
                    </Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-3xl font-bold">
                    {formatPrice(displayPrice)}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                {isFounder && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Monthly only, locked in forever
                  </p>
                )}
                {!isFounder && isAnnual && hasAnnual && (
                  <p className="text-xs text-primary font-medium mt-1">
                    Save ${annualSavings}/year
                  </p>
                )}
                {!isFounder && isAnnual && !hasAnnual && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Monthly only
                  </p>
                )}
                {isFounder && <FounderCounter />}
              </CardHeader>

              <CardContent>
                <FeatureList features={plan.features} />
              </CardContent>

              <CardFooter className="flex-col items-stretch gap-2">
                <Link
                  href={isPublisher ? PUBLISHER_MAILTO : SIGNUP_HREF}
                  className="w-full rounded-md border border-input bg-background px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {isPublisher ? "Contact Us" : "Start Free, Upgrade Later"}
                </Link>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Every account starts on Free. Upgrade to a paid plan any time from
        Billing inside the app.
      </p>
    </div>
  );
}
