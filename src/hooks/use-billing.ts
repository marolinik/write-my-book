"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () => {
      const res = await fetch("/api/billing/subscription");
      if (!res.ok) throw new Error("Failed to fetch subscription");
      return res.json();
    },
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: async (plan: string) => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
