"use client";

import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCustomProviders } from "@/hooks/use-custom-providers";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, RefreshCw } from "lucide-react";

/**
 * Custom provider manager — add OpenAI-compatible endpoints (LAN vLLM,
 * corporate proxy, self-hosted hub). Discovery runs on save; the endpoint's
 * own model list is always what you see here (never stale).
 */
export function CustomProvidersSection() {
  const { data: providers } = useCustomProviders();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["custom-providers"] });
  }, [qc]);

  const add = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/custom-providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name.trim(),
          baseURL: baseURL.trim(),
          ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? `Discovery failed (${res.status})`);
        return;
      }
      setName("");
      setBaseURL("");
      setApiKey("");
      refresh();
    } finally {
      setBusy(false);
    }
  }, [name, baseURL, apiKey, refresh]);

  const remove = useCallback(async (id: string) => {
    setBusy(true);
    await fetch(`/api/settings/custom-providers?id=${id}`, { method: "DELETE" }).catch(() => {});
    refresh();
    setBusy(false);
  }, [refresh]);

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Custom providers (LAN / proxy / self-hosted)</p>
        <Button size="icon" variant="ghost" onClick={refresh} disabled={busy} aria-label="Refresh list">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {(providers ?? []).map((p) => (
        <div key={p.id} className="rounded-md border bg-card p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{p.displayName}</p>
              <p className="text-xs text-muted-foreground truncate">{p.baseURL}</p>
              {(p.models ?? []).length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {(p.models ?? []).map((m) => m.name ?? m.id).join(", ")}
                </p>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={() => remove(p.id)} disabled={busy} aria-label={`Delete ${p.displayName}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      {(!providers || providers.length === 0) && (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          No custom provider saved yet. Add a LAN box, a corporate proxy, or a self-hosted hub —
          the endpoint's own `/models` discovery decides what's available.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="cp-name" className="text-xs">Name</Label>
          <Input id="cp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="LAN box" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cp-url" className="text-xs">Base URL</Label>
          <Input id="cp-url" value={baseURL} onChange={(e) => setBaseURL(e.target.value)} placeholder="http://lan-box:8888/v1" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cp-key" className="text-xs">Key (optional)</Label>
          <Input id="cp-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-… if private" type="password" autoComplete="off" />
        </div>
      </div>
      <Button size="sm" onClick={add} disabled={busy || !name.trim() || !baseURL.trim()}>
        <Plus className="h-4 w-4" /> Add provider
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
