"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/components/providers/language-provider";
import { useAgentUIStore } from "@/stores/agent-ui-store";

/**
 * O3 — documents written before the encoding and language fixes keep their
 * damage: U+FFFD cannot be reversed, so those documents can only be rewritten.
 * The writer had no way to see which ones were affected, and the app never
 * admitted the damage existed.
 *
 * The notice is quiet when there is nothing wrong, and every row offers the
 * workflow that rebuilds that document. Chapter prose is never listed: it is the
 * writer's own work and nothing here may offer to regenerate it.
 */

interface DamagedDocument {
  id: string;
  type: string;
  title: string | null;
  reasons: string[];
  recoverable: boolean;
  regenerateWorkflow: string;
}

const REASON_KEYS: Record<string, "reasonReplacement" | "reasonDoubleEncoded" | "reasonWrongLanguage" | "reasonEmpty" | "reasonStitched"> = {
  replacement_chars: "reasonReplacement",
  double_encoded: "reasonDoubleEncoded",
  wrong_language: "reasonWrongLanguage",
  empty: "reasonEmpty",
  stitched: "reasonStitched",
};

export function DamagedDocumentsNotice({ bookId }: { bookId: string }) {
  const { t } = useLanguage();
  const s = t.documentDamage;
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);

  const { data } = useQuery({
    queryKey: ["document-damage", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents/damage`);
      if (!res.ok) throw new Error("scan failed");
      return res.json() as Promise<{ damaged: DamagedDocument[] }>;
    },
    // The scan reads every book-level document out of storage, so it is not
    // something to repeat on every focus.
    staleTime: 10 * 60_000,
    retry: false,
  });

  const damaged = data?.damaged ?? [];
  if (damaged.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4">
      <div className="flex items-start gap-3">
        <AlertTriangleIcon className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-500" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="font-medium">
              {s.title.replace("{n}", String(damaged.length))}
            </p>
            <p className="text-sm text-muted-foreground">{s.body}</p>
          </div>

          <ul className="space-y-2">
            {damaged.map((doc) => (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">
                    {doc.title ?? doc.type}
                  </span>
                  {doc.reasons.map((reason) => (
                    <Badge key={reason} variant="outline" className="text-[10px]">
                      {s[REASON_KEYS[reason] ?? "reasonEmpty"]}
                    </Badge>
                  ))}
                  {!doc.recoverable && (
                    <span className="text-xs text-muted-foreground">
                      {s.unrecoverable}
                    </span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openWithWorkflow(doc.regenerateWorkflow)}
                >
                  <RefreshCwIcon className="mr-1.5 size-3.5" />
                  {s.regenerate}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
