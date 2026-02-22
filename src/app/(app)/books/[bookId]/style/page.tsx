"use client";

import { use } from "react";
import {
  Loader2,
  SparklesIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  ClockIcon,
  DownloadIcon,
  ArrowLeftIcon,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useStyleProfile } from "@/hooks/use-style";
import { useLanguage } from "@/components/providers/language-provider";
import { StyleProfileViewer } from "@/components/style/style-profile-viewer";
import { useAgentStore } from "@/stores/agent-store";

export default function StylePage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const searchParams = useSearchParams();
  const fromSetup = searchParams.get("from") === "setup";
  const { data, isLoading } = useStyleProfile(bookId);
  const openWithWorkflow = useAgentStore((s) => s.openWithWorkflow);
  const { t } = useLanguage();
  const s = t.stylePage;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const profiles = data?.profiles ?? [];
  const hasProfiles = profiles.length > 0;
  const latestProfile = hasProfiles ? profiles[0] : null;

  return (
    <div className="p-6 lg:p-8">
      {fromSetup && (
        <div className="pb-4">
          <Link
            href={`/books/${bookId}/setup`}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeftIcon className="size-3" />
            Back to Setup
          </Link>
        </div>
      )}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            {s.title}
          </h1>
          <p className="text-muted-foreground">
            {s.subtitle}
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
              {s.refreshStyle}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("evolve-style")}
            >
              <TrendingUpIcon className="mr-1 size-4" />
              {s.evolveStyle}
            </Button>
          </div>
        )}
      </div>

      <Separator className="my-6" />

      {/* Last Captured Timestamp */}
      {latestProfile && latestProfile.updatedAt && (
        <div className="flex items-center gap-2 mb-4 text-sm text-muted-foreground">
          <ClockIcon className="size-3.5" />
          <span>
            Style captured{" "}
            {new Date(latestProfile.updatedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        </div>
      )}

      {!hasProfiles && (
        <Card className="mb-6 border-dashed">
          <CardHeader className="text-center">
            <div className="mx-auto rounded-full bg-primary/10 p-4 w-fit mb-2">
              <SparklesIcon className="size-8 text-primary" />
            </div>
            <CardTitle>{s.noProfile}</CardTitle>
            <CardDescription>
              {s.noProfileDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => openWithWorkflow("capture-style")}>
              <SparklesIcon className="mr-2 size-4" />
              {s.captureStyle}
            </Button>
          </CardContent>
        </Card>
      )}

      <StyleProfileViewer profiles={profiles} />
    </div>
  );
}
