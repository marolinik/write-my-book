"use client";

import type { ReactNode } from "react";
import { useSubscription, useUpgradeModal } from "@/hooks/use-billing";
import { Lock } from "lucide-react";

/** Plan tier hierarchy for comparison. Higher index = higher tier. */
const PLAN_HIERARCHY: string[] = ["none", "indie", "professional", "publisher", "founder"];

/**
 * Check if the user's current plan has access to a required plan level.
 * Founder has equivalent access to Professional.
 */
function hasAccess(currentPlan: string, requiredPlan: string): boolean {
  const effective = currentPlan === "founder" ? "professional" : currentPlan;
  const required = requiredPlan === "founder" ? "professional" : requiredPlan;
  const currentIdx = PLAN_HIERARCHY.indexOf(effective);
  const requiredIdx = PLAN_HIERARCHY.indexOf(required);
  return currentIdx >= requiredIdx;
}

/**
 * Programmatic hook for checking plan access in components.
 */
export function usePlanAccess(requiredPlan: string) {
  const { data: subscription, isLoading } = useSubscription();
  const currentPlan = subscription?.plan ?? "none";
  const allowed = hasAccess(currentPlan, requiredPlan);

  return {
    allowed,
    isLoading,
    currentPlan,
    requiredPlan,
  };
}

/**
 * Wrapper component for plan-gated features.
 * Renders children if user has sufficient plan, otherwise shows lock overlay.
 *
 * Usage:
 *   <PlanGate requiredPlan="professional" feature="series">
 *     <SeriesManager />
 *   </PlanGate>
 */
export function PlanGate({
  requiredPlan,
  feature,
  children,
  fallback,
}: {
  requiredPlan: string;
  feature: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: subscription, isLoading } = useSubscription();
  const { show } = useUpgradeModal();
  const currentPlan = subscription?.plan ?? "none";
  const allowed = hasAccess(currentPlan, requiredPlan);

  // While loading, show children (optimistic)
  if (isLoading) return <>{children}</>;

  if (allowed) return <>{children}</>;

  // Custom fallback
  if (fallback) return <>{fallback}</>;

  // Default lock overlay
  return (
    <div className="relative">
      <div className="pointer-events-none opacity-40">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px] rounded-lg">
        <button
          onClick={() =>
            show(
              `${feature.charAt(0).toUpperCase() + feature.slice(1)} requires the ${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} plan or higher.`,
              requiredPlan
            )
          }
          className="flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Lock className="h-6 w-6" />
          <span className="text-sm font-medium">
            Requires {requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)}
          </span>
        </button>
      </div>
    </div>
  );
}
