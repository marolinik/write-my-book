"use client";

import { useEffect, useState } from "react";

interface FounderCountData {
  claimed: number;
  total: number;
  available: number;
}

export function FounderCounter() {
  const [data, setData] = useState<FounderCountData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/billing/founder-count");
        if (!res.ok) return;
        const json = (await res.json()) as FounderCountData;
        if (!cancelled) setData(json);
      } catch {
        // Graceful degradation -- render nothing on error
      }
    }

    fetchCount();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;

  if (data.available <= 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        All Founder spots claimed
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs font-semibold text-destructive">
      Only {data.available} of {data.total} Founder spots remaining
    </p>
  );
}
