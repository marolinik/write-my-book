"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
}

const PLAN_ORDER = ["founder", "indie", "professional", "publisher"] as const;

function formatPrice(price: number): string {
  return `$${price}`;
}

function getAnnualMonthly(annualPrice: number): number {
  return Math.round((annualPrice / 12) * 100) / 100;
}

export function PricingSection({ plans }: PricingSectionProps) {
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
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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

          const interval = isFounder
            ? "monthly"
            : isAnnual && hasAnnual
              ? "annual"
              : "monthly";

          const ctaText = isFounder
            ? "Claim Founder Spot"
            : isPublisher
              ? "Contact Us"
              : "Start 14-Day Free Trial";

          const ctaHref = isPublisher
            ? "mailto:hello@writemybook.com?subject=Publisher%20Plan%20Inquiry"
            : `/signup?plan=${key}&interval=${interval}`;

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
                    Monthly only &mdash; locked in forever
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
                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <CheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter className="flex-col items-stretch gap-2">
                <Link
                  href={ctaHref}
                  className={`w-full rounded-md px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                    isFounder
                      ? "bg-primary text-primary-foreground hover:bg-primary/90"
                      : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  {ctaText}
                </Link>
                {/* D-52: the trial genuinely starts without a card
                    (checkout uses payment_method_collection "if_required"),
                    so disclose it honestly wherever the trial is advertised. */}
                {plan.trialDays > 0 && (
                  <p className="text-center text-xs text-muted-foreground">
                    No credit card required
                  </p>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
