"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { effectivePlanKey } from "@/lib/billing/effective-plan";
import { toast } from "sonner";
import { useLanguage } from "@/components/providers/language-provider";
import { create } from "zustand";
import { responseError, describeApiError } from "@/lib/api/describe-api-error";

// ─── Upgrade Modal Store ─────────────────────────────────────────
export const useUpgradeModal = create<{
  open: boolean;
  reason: string;
  upgradeToTier?: string;
  show: (reason: string, upgradeToTier?: string) => void;
  hide: () => void;
}>((set) => ({
  open: false,
  reason: "",
  upgradeToTier: undefined,
  show: (reason, upgradeToTier) => set({ open: true, reason, upgradeToTier }),
  hide: () => set({ open: false, reason: "", upgradeToTier: undefined }),
}));

// ─── Subscription Data ──────────────────────────────────────────
export type SubscriptionData = {
  plan: string;
  planName: string;
  monthlyPrice: number;
  annualPrice: number | null;
  features: string[];
  maxBooks: number;
  status: string;
  billingInterval: string;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeConfigured: boolean;
  currentPeriodEnd: string | null;
};

/**
 * While a writer waits for a paid checkout to land, ask again every 3 s until
 * the plan they paid for shows; then stop.
 */
export function paymentPollInterval(data: SubscriptionData | undefined): number | false {
  return data && effectivePlanKey(data) !== "none" ? false : 3000;
}

export function useSubscription(options: { pollUntilPaid?: boolean } = {}) {
  return useQuery<SubscriptionData>({
    queryKey: ["subscription"],
    refetchInterval: options.pollUntilPaid
      ? (query) => paymentPollInterval(query.state.data)
      : false,
    queryFn: async () => {
      const res = await fetch("/api/billing/subscription");
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
  });
}

// ─── Founder Counter ─────────────────────────────────────────────
export function useFounderCount() {
  return useQuery({
    queryKey: ["founder-count"],
    queryFn: async () => {
      const res = await fetch("/api/billing/founder-count");
      if (!res.ok) throw await responseError(res);
      return res.json() as Promise<{ claimed: number; total: number; available: number }>;
    },
    refetchInterval: 30000, // Refresh every 30s on pricing page
  });
}

// ─── Checkout ────────────────────────────────────────────────────
export function useCheckout() {
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async ({
      plan,
      billingInterval = "monthly",
    }: {
      plan: string;
      billingInterval?: string;
    }) => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingInterval }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw await responseError(res, data);
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err) => toast.error(describeApiError(err, t)),
  });
}

// ─── Manage Billing (Stripe Customer Portal) ────────────────────
export function useManageBilling() {
  const { t } = useLanguage();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () => toast.error(t.toasts.billingPortalFailed),
  });
}

// ─── Usage ───────────────────────────────────────────────────────
export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: async () => {
      const res = await fetch("/api/usage");
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
  });
}

export function useBookUsage(bookId: string) {
  return useQuery({
    queryKey: ["usage", "book", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/usage/books/${bookId}`);
      if (!res.ok) throw await responseError(res);
      return res.json();
    },
    enabled: !!bookId,
  });
}
