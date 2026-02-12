"use client";

import { use } from "react";
import {
  Loader2,
  SparklesIcon,
  RefreshCwIcon,
  TrendingUpIcon,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStyleProfile } from "@/hooks/use-style";
import { StyleProfileViewer } from "@/components/style/style-profile-viewer";
import { useAgentStore } from "@/stores/agent-store";

export default function StylePage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const { data, isLoading } = useStyleProfile(bookId);
  const openWithWorkflow = useAgentStore((s) => s.openWithWorkflow);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profiles = data?.profiles ?? [];
  const hasProfiles = profiles.length > 0;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Style Profile
          </h1>
          <p className="text-muted-foreground">
            Voice fingerprint and character differentiation
          </p>
        </div>
        {hasProfiles && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("refresh-style")}
            >
              <RefreshCwIcon className="mr-1 size-4" />
              Refresh Style
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("evolve-style")}
            >
              <TrendingUpIcon className="mr-1 size-4" />
              Evolve Style
            </Button>
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {!hasProfiles && (
        <Card className="mb-6 border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit mb-2">
              <SparklesIcon className="size-8 text-primary" />
            </div>
            <CardTitle>Capture Your Writing Style</CardTitle>
            <CardDescription>
              Analyze your writing samples to create a unique voice fingerprint.
              This helps the ghostwriter match your style.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => openWithWorkflow("capture-style")}>
              <SparklesIcon className="mr-2 size-4" />
              Analyze My Writing Style
            </Button>
          </CardContent>
        </Card>
      )}

      <StyleProfileViewer profiles={profiles} />
    </div>
  );
}
