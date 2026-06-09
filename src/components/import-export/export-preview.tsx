"use client";

import { useState, useMemo } from "react";
import {
  TabletSmartphoneIcon,
  BookOpenIcon,
  MonitorIcon,
  SmartphoneIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

/**
 * Gap 9: Export Format Preview (Vellum-style)
 * Shows a simulated preview of how the book will look in different formats.
 * Uses CSS-only rendering (no actual file generation) for instant preview.
 * Supports: Print (PDF), Kindle, iPad, Phone views.
 */

type PreviewDevice = "print" | "kindle" | "ipad" | "phone";

interface ExportPreviewProps {
  bookTitle: string;
  authorName?: string;
  /** Chapter titles for TOC preview */
  chapters: Array<{ number: number; title: string | null }>;
  /** Sample chapter content (first chapter, plain text) */
  sampleContent?: string;
  /** Selected export format */
  format: "pdf" | "epub" | "docx";
}

const DEVICE_SIZES: Record<PreviewDevice, { width: number; height: number; label: string }> = {
  print: { width: 360, height: 540, label: "Print (6×9)" },
  kindle: { width: 280, height: 400, label: "Kindle" },
  ipad: { width: 380, height: 520, label: "iPad" },
  phone: { width: 220, height: 400, label: "Phone" },
};

const DEVICE_ICONS: Record<PreviewDevice, React.ElementType> = {
  print: BookOpenIcon,
  kindle: TabletSmartphoneIcon,
  ipad: MonitorIcon,
  phone: SmartphoneIcon,
};

export function ExportPreview({
  bookTitle,
  authorName,
  chapters,
  sampleContent,
  format,
}: ExportPreviewProps) {
  const [device, setDevice] = useState<PreviewDevice>(
    format === "pdf" ? "print" : "kindle"
  );
  const [page, setPage] = useState<"title" | "toc" | "chapter">("title");

  const size = DEVICE_SIZES[device];

  // Generate sample paragraphs from content
  const paragraphs = useMemo(() => {
    if (!sampleContent) return ["Sample text would appear here..."];
    return sampleContent.split("\n\n").filter((p) => p.trim().length > 0);
  }, [sampleContent]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <TabletSmartphoneIcon className="size-4" />
            Preview
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {format.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Device selector */}
        <div className="flex gap-1">
          {(Object.keys(DEVICE_SIZES) as PreviewDevice[]).map((d) => {
            const Icon = DEVICE_ICONS[d];
            return (
              <Button
                key={d}
                variant={device === d ? "secondary" : "ghost"}
                size="sm"
                className="h-7 text-[10px] gap-1"
                onClick={() => setDevice(d)}
              >
                <Icon className="size-3" />
                {DEVICE_SIZES[d].label}
              </Button>
            );
          })}
        </div>

        {/* Page selector */}
        <div className="flex gap-1">
          {(["title", "toc", "chapter"] as const).map((p) => (
            <Button
              key={p}
              variant={page === p ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] capitalize"
              onClick={() => setPage(p)}
            >
              {p === "toc" ? "Contents" : p}
            </Button>
          ))}
        </div>

        {/* Preview frame */}
        <div className="flex justify-center">
          <div
            className="border-2 rounded-sm bg-white dark:bg-stone-50 shadow-lg overflow-hidden"
            style={{
              width: size.width,
              height: size.height,
              minHeight: size.height,
            }}
          >
            <ScrollArea className="h-full">
              <div
                className="text-black font-serif"
                style={{
                  padding: device === "phone" ? "16px" : "24px",
                  fontSize: device === "phone" ? "10px" : device === "kindle" ? "11px" : "12px",
                  lineHeight: 1.6,
                }}
              >
                {/* Title page */}
                {page === "title" && (
                  <div className="flex flex-col items-center justify-center text-center min-h-[300px] gap-8">
                    <div className="space-y-3">
                      <h1
                        className="font-bold"
                        style={{ fontSize: device === "phone" ? "16px" : "22px" }}
                      >
                        {bookTitle}
                      </h1>
                      {authorName && (
                        <p className="text-gray-500" style={{ fontSize: device === "phone" ? "10px" : "13px" }}>
                          {authorName}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Table of Contents */}
                {page === "toc" && (
                  <div className="space-y-1">
                    <h2 className="font-bold mb-4" style={{ fontSize: "14px" }}>
                      Contents
                    </h2>
                    {chapters.map((ch) => (
                      <div
                        key={ch.number}
                        className="flex items-baseline justify-between border-b border-dotted border-gray-200 py-1"
                      >
                        <span className="text-xs">
                          {ch.title || `Chapter ${ch.number}`}
                        </span>
                        <span className="text-[9px] text-gray-400 ml-2">
                          {ch.number * 12 + 3}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Chapter preview */}
                {page === "chapter" && (
                  <div>
                    <h2
                      className="font-bold text-center mb-6"
                      style={{ fontSize: "15px" }}
                    >
                      {chapters[0]?.title || "Chapter 1"}
                    </h2>
                    {paragraphs.slice(0, 8).map((p, i) => (
                      <p
                        key={i}
                        className="mb-3"
                        style={{
                          textIndent: i === 0 ? "0" : "1.5em",
                        }}
                      >
                        {i === 0 && (
                          <span
                            className="float-left font-bold mr-1"
                            style={{
                              fontSize: "28px",
                              lineHeight: "24px",
                            }}
                          >
                            {p.charAt(0)}
                          </span>
                        )}
                        {i === 0 ? p.slice(1, 200) : p.slice(0, 200)}
                        {p.length > 200 ? "..." : ""}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
