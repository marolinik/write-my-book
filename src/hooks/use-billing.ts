"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { create } from "zustand";

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

export function useSubscription() {
  return useQuery<SubscriptionData>({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await fetch("/api/billing/subscription");
      if (!res.ok) throw new Error("Failed to fetch subscription");
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
      if (!res.ok) throw new Error("Failed to fetch founder count");
      return res.json() as Promise<{ claimed: number; total: number; available: number }>;
    },
    refetchInterval: 30000, // Refresh every 30s on pricing page
  });
}

// ─── Checkout ────────────────────────────────────────────────────
export function useCheckout() {
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
        throw new Error(data.error || "Failed to start checkout");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err) => toast.error(err.message),
  });
}

// ─── Manage Billing (Stripe Customer Portal) ────────────────────
export function useManageBilling() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      if (!res.ok) throw new Error("Failed to open portal");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () => toast.error("Failed to open billing portal"),
  });
}

// ─── Usage ───────────────────────────────────────────────────────
export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: async () => {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    },
  });
}

export function useBookUsage(bookId: string) {
  return useQuery({
    queryKey: ["usage", "book", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/usage/books/${bookId}`);
      if (!res.ok) throw new Error("Failed to fetch book usage");
      return res.json();
    },
    enabled: !!bookId,
  });
}
