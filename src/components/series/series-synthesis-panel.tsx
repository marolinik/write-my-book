"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useState } from "react";
import { UploadIcon, CheckIcon, XIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSynthesize, type BookContributionItem } from "@/hooks/use-series";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";

/**
 * The three synthesis artifacts. The label is a lookup rather than a string,
 * because this table is built once at module load, before any language is
 * known.
 */
const ARTIFACT_TYPES: ReadonlyArray<{
  value: string;
  label: (t: UIStrings) => string;
}> = [
  { value: "STORY_BIBLE", label: (t) => t.setup.storyBible },
  { value: "ARCHITECTURE", label: (t) => t.setup.architecture },
  { value: "FINGERPRINT", label: (t) => t.seriesUI.artifactFingerprint },
];

interface SeriesSynthesisPanelProps {
  seriesId: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export function SeriesSynthesisPanel({ seriesId }: SeriesSynthesisPanelProps) {
  const { t } = useLanguage();
  const [artifactType, setArtifactType] = useState("STORY_BIBLE");

  const { data: contributions, isLoading } = useQuery({
    queryKey: ["series", seriesId, "synthesize", artifactType],
    queryFn: () =>
      fetchJson<BookContributionItem[]>(
        `/api/series/${seriesId}/synthesize?artifactType=${artifactType}`
      ),
    enabled: !!seriesId,
  });

  const synthesizeMutation = useSynthesize(seriesId);

  const handleSynthesize = (
    bookId: string,
    bookNumber: number
  ) => {
    synthesizeMutation.mutate({ bookId, bookNumber, artifactType });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{t.workspaceUI.artifactType}</span>
        <Select value={artifactType} onValueChange={setArtifactType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARTIFACT_TYPES.map((artifact) => (
              <SelectItem key={artifact.value} value={artifact.value}>
                {artifact.label(t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">{t.seriesUI.synthesizeHint}</p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t.workspaceUI.loadingContributions}</p>
      ) : !contributions || contributions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.seriesUI.noBooksInSeriesShort}</p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">{t.workspaceUI.book}</th>
                <th className="px-4 py-2 text-left font-medium">{t.seriesUI.hasArtifact}</th>
                <th className="px-4 py-2 text-right font-medium">{t.workspaceUI.action}</th>
              </tr>
            </thead>
            <tbody>
              {contributions.map((c) => (
                <tr key={c.bookId} className="border-b last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">
                    {c.bookNumber}
                  </td>
                  <td className="px-4 py-2">{c.bookName}</td>
                  <td className="px-4 py-2">
                    {c.hasArtifact ? (
                      <Badge variant="default" className="gap-1 text-xs">
                        <CheckIcon className="size-3" />
                        {t.common.yes}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <XIcon className="size-3" />
                        {t.common.no}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {c.hasArtifact && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() =>
                          handleSynthesize(c.bookId, c.bookNumber)
                        }
                        disabled={synthesizeMutation.isPending}
                      >
                        <UploadIcon className="mr-1 size-3" />{t.seriesUI.synthesize}</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
