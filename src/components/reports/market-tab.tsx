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

export function MarketTab({ bookId }: { bookId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["market-report", bookId],
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

  if (data?.empty) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No market analysis report found. Run the market reader agent to generate one.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Market Analysis</CardTitle>
          <CardDescription>
            Genre positioning and cultural profile comparison
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data?.rawContent ? (
            <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap">
              {data.rawContent}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              Market analysis data will appear here after running the market reader agent.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
