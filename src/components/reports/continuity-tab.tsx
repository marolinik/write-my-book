"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TRACKER_DOMAINS = [
  "Characters",
  "Timeline",
  "Geography",
  "Objects & Props",
  "Relationships",
  "World Rules",
];

export function ContinuityTab({ bookId }: { bookId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["continuity", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/analysis`);
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Continuity Tracker</CardTitle>
          <CardDescription>
            Domains tracked across your manuscript for consistency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TRACKER_DOMAINS.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <span className="text-sm font-medium">{domain}</span>
                <Badge variant="secondary">Tracked</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {data?.rawContent && (
        <Card>
          <CardHeader>
            <CardTitle>Report Content</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
              {data.rawContent}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
