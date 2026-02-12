"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  FileTextIcon,
  Loader2Icon,
  BookOpenIcon,
  BuildingIcon,
  FingerprintIcon,
  PenLineIcon,
  SearchIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAgentStore } from "@/stores/agent-store";

const DOC_TYPE_LABELS: Record<string, string> = {
  CONCEPT: "Concept",
  STORY_BIBLE: "Story Bible",
  ARCHITECTURE: "Architecture",
  FINGERPRINT: "Fingerprint",
  CHAPTER_BRIEF: "Chapter Brief",
  CHAPTER_PLAN: "Chapter Plan",
  CHAPTER_CONTENT: "Chapter Content",
  DEV_EDIT_REPORT: "Dev Edit Report",
  LINE_EDIT_REPORT: "Line Edit Report",
  BETA_READ_REPORT: "Beta Read Report",
  CONTINUITY_REPORT: "Continuity Report",
  ANALYSIS_REPORT: "Analysis Report",
  MARKET_REPORT: "Market Report",
  EXPORT_CONFIG: "Export Config",
  FREEWRITE: "Freewrite",
};

const WORKFLOW_ACTIONS = [
  {
    label: "Create Story Bible",
    description: "Define characters, settings, and world-building",
    workflowId: "create-story-bible",
    icon: BookOpenIcon,
  },
  {
    label: "Build Architecture",
    description: "Plan story structure, arcs, and plot points",
    workflowId: "build-architecture",
    icon: BuildingIcon,
  },
  {
    label: "Capture Style",
    description: "Analyze and capture your writing fingerprint",
    workflowId: "capture-style",
    icon: FingerprintIcon,
  },
  {
    label: "Analyze Manuscript",
    description: "Deep analysis of themes, pacing, and structure",
    workflowId: "analyze",
    icon: SearchIcon,
  },
  {
    label: "Read Manuscript",
    description: "Beta reader perspective on your work",
    workflowId: "read-manuscript",
    icon: PenLineIcon,
  },
];

export default function DocumentsListPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const openWithWorkflow = useAgentStore((s) => s.openWithWorkflow);

  const { data: documents, isLoading } = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: !!bookId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const docs: Array<{
    id: string;
    type: string;
    title: string | null;
    currentVersion: number;
    updatedAt: string;
    chapterNumber?: number;
  }> = documents?.documents ?? documents ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          Documents
        </h1>
        <p className="text-muted-foreground mt-1">
          All documents associated with this book. Click to open and edit.
        </p>
      </div>

      {/* Workflow action cards */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          Quick Actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {WORKFLOW_ACTIONS.map((action) => (
            <Button
              key={action.workflowId}
              variant="outline"
              className="h-auto flex-col items-start gap-1 p-4 text-left"
              onClick={() => openWithWorkflow(action.workflowId)}
            >
              <div className="flex items-center gap-2">
                <action.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{action.label}</span>
              </div>
              <span className="text-xs text-muted-foreground font-normal">
                {action.description}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Documents list */}
      <Card>
        <CardHeader>
          <CardTitle>All Documents</CardTitle>
          <CardDescription>
            {docs.length} document{docs.length !== 1 ? "s" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docs.length === 0 ? (
            <div className="text-center py-12">
              <FileTextIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No documents yet. Use the quick actions above or run agent
                workflows to create documents.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {docs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/books/${bookId}/documents/${doc.id}`}
                  className="flex items-center justify-between rounded-md border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <FileTextIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {doc.title ||
                          DOC_TYPE_LABELS[doc.type] ||
                          doc.type}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {DOC_TYPE_LABELS[doc.type] || doc.type}
                        {doc.chapterNumber
                          ? ` — Ch. ${doc.chapterNumber}`
                          : ""}
                        {" · v"}
                        {doc.currentVersion}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
