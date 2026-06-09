"use client";

import { useState } from "react";
import {
  MegaphoneIcon,
  CopyIcon,
  CheckIcon,
  Loader2Icon,
  BookOpenIcon,
  TwitterIcon,
  MailIcon,
  FileTextIcon,
  SparklesIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchJson } from "@/lib/api-client";
import { toast } from "sonner";

/**
 * W: Marketing Kit Auto-Generation.
 * From manuscript, auto-generate:
 * - Back cover blurb (150-250 words)
 * - Amazon/store description (HTML-formatted)
 * - Comparison titles (3-5 comps)
 * - Social media posts (3 variants)
 * - Email launch announcement
 * - One-sentence logline
 */

interface MarketingKitData {
  logline: string;
  blurb: string;
  storeDescription: string;
  compTitles: string[];
  socialPosts: string[];
  emailAnnouncement: string;
  generatedAt: string;
}

interface MarketingKitProps {
  bookId: string;
  bookTitle: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  return (
    <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={handleCopy}>
      {copied ? <CheckIcon className="size-3 text-green-500" /> : <CopyIcon className="size-3" />}
    </Button>
  );
}

export function MarketingKit({ bookId, bookTitle }: MarketingKitProps) {
  const { data, isLoading } = useQuery<MarketingKitData | null>({
    queryKey: ["marketing-kit", bookId],
    queryFn: async () => {
      try {
        return await fetchJson(`/api/books/${bookId}/marketing-kit`);
      } catch {
        return null;
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      fetchJson(`/api/books/${bookId}/marketing-kit`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Marketing kit generated!");
    },
    onError: () => {
      toast.error("Failed to generate marketing kit");
    },
  });

  if (!data && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <MegaphoneIcon className="size-4" />
            Marketing Kit
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-6 space-y-3">
          <MegaphoneIcon className="size-10 mx-auto text-muted-foreground/20" />
          <div>
            <p className="text-sm font-medium">Generate your marketing kit</p>
            <p className="text-xs text-muted-foreground">
              AI will create a blurb, store description, social posts, and more from your manuscript.
            </p>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
          >
            {generateMutation.isPending ? (
              <Loader2Icon className="size-4 mr-1.5 animate-spin" />
            ) : (
              <SparklesIcon className="size-4 mr-1.5" />
            )}
            Generate Marketing Kit
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2Icon className="size-6 mx-auto animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <MegaphoneIcon className="size-4" />
            Marketing Kit — {bookTitle}
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            Generated {new Date(data.generatedAt).toLocaleDateString()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="blurb">
          <TabsList className="mb-3">
            <TabsTrigger value="blurb" className="text-xs">Blurb</TabsTrigger>
            <TabsTrigger value="store" className="text-xs">Store</TabsTrigger>
            <TabsTrigger value="social" className="text-xs">Social</TabsTrigger>
            <TabsTrigger value="email" className="text-xs">Email</TabsTrigger>
            <TabsTrigger value="comps" className="text-xs">Comps</TabsTrigger>
          </TabsList>

          <TabsContent value="blurb" className="space-y-2">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium">Logline</p>
              <CopyButton text={data.logline} />
            </div>
            <p className="text-sm italic border-l-2 border-primary pl-3">{data.logline}</p>

            <div className="flex items-start justify-between mt-4">
              <p className="text-xs font-medium">Back Cover Blurb</p>
              <CopyButton text={data.blurb} />
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-line bg-muted/30 rounded-md p-3">
              {data.blurb}
            </div>
          </TabsContent>

          <TabsContent value="store" className="space-y-2">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium">Amazon/Store Description (HTML)</p>
              <CopyButton text={data.storeDescription} />
            </div>
            <div className="text-sm leading-relaxed bg-muted/30 rounded-md p-3 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: data.storeDescription }}
            />
          </TabsContent>

          <TabsContent value="social" className="space-y-3">
            {data.socialPosts.map((post, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-start justify-between">
                  <Badge variant="outline" className="text-[10px]">Post {i + 1}</Badge>
                  <CopyButton text={post} />
                </div>
                <div className="text-sm bg-muted/30 rounded-md p-3 whitespace-pre-line">
                  {post}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="email" className="space-y-2">
            <div className="flex items-start justify-between">
              <p className="text-xs font-medium">Launch Announcement Email</p>
              <CopyButton text={data.emailAnnouncement} />
            </div>
            <div className="text-sm leading-relaxed bg-muted/30 rounded-md p-3 whitespace-pre-line">
              {data.emailAnnouncement}
            </div>
          </TabsContent>

          <TabsContent value="comps" className="space-y-2">
            <p className="text-xs font-medium">Comparison Titles</p>
            <div className="space-y-1.5">
              {data.compTitles.map((comp, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border p-2">
                  <BookOpenIcon className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm">{comp}</span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
