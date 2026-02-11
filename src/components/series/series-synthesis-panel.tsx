"use client";

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

const ARTIFACT_TYPES = [
  { value: "STORY_BIBLE", label: "Story Bible" },
  { value: "ARCHITECTURE", label: "Architecture" },
  { value: "FINGERPRINT", label: "Fingerprint" },
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
        <span className="text-sm font-medium">Artifact type:</span>
        <Select value={artifactType} onValueChange={setArtifactType}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ARTIFACT_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-muted-foreground">
        Synthesize book-level artifacts up into the series document. Each
        book's contribution is added as a section in the series document.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading contributions...</p>
      ) : !contributions || contributions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No books in this series.
        </p>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Book</th>
                <th className="px-4 py-2 text-left font-medium">
                  Has Artifact
                </th>
                <th className="px-4 py-2 text-right font-medium">Action</th>
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
                        Yes
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <XIcon className="size-3" />
                        No
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
                        <UploadIcon className="mr-1 size-3" />
                        Synthesize
                      </Button>
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
