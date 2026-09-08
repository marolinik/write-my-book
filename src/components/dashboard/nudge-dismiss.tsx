"use client";

// UDG round-5 (Nikola): "dismiss for now" on the dashboard Recommended nudge.
// The nudge card is server-rendered; this client wrapper lets the user hide it
// for today and undo. Persisted per (bookId:workflowId) in localStorage so a
// different book/recommendation still surfaces, and the nudge returns next day.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STORAGE_KEY = "wmb.nudgeDismissed";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readDismissed(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDismissed(map: Record<string, string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Storage full/unavailable — dismiss is best-effort.
  }
}

export function NudgeDismiss({
  dismissKey,
  children,
  dismissLabel,
  undoLabel,
}: {
  dismissKey: string;
  children: React.ReactNode;
  dismissLabel: string;
  undoLabel: string;
}) {
  const [dismissed, setDismissed] = useState(
    () => readDismissed()[dismissKey] === today()
  );
  const [dismissedForToday, setDismissedForToday] = useState(false);

  if (dismissed) {
    return (
      <Card className="border-primary/40 bg-primary/[0.03]">
        <CardContent className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">{dismissLabel}</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const map = readDismissed();
              delete map[dismissKey];
              writeDismissed(map);
              setDismissed(false);
              setDismissedForToday(true);
            }}
          >
            {undoLabel}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="relative">
      {children}
      {/* Undo hint after a fresh dismiss within the same visit */}
      {dismissedForToday && (
        <button
          type="button"
          aria-label={undoLabel}
          onClick={() => {
            const map = readDismissed();
            delete map[dismissKey];
            writeDismissed(map);
            setDismissed(false);
          }}
          className="absolute right-2 top-2 rounded p-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {undoLabel}
        </button>
      )}
      <button
        type="button"
        aria-label={dismissLabel}
        title={dismissLabel}
        onClick={() => {
          const map = readDismissed();
          map[dismissKey] = today();
          writeDismissed(map);
          setDismissed(true);
        }}
        className="absolute -top-2 right-2 rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      >
        {dismissLabel}
      </button>
    </div>
  );
}