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
  ScrollTextIcon,
  SparklesIcon,
  ShieldCheckIcon,
  BarChart3Icon,
  GlobeIcon,
  SettingsIcon,
  PencilIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAgentStore } from "@/stores/agent-store";
import { useLanguage } from "@/components/providers/language-provider";

// ─── Types ──────────────────────────────────────────────────────

interface DocItem {
  id: string;
  type: string;
  title: string | null;
  currentVersion: number;
  updatedAt: string;
  chapterNumber?: number | null;
}

// ─── Document type config ───────────────────────────────────────

const DOC_TYPE_LABELS: Record<string, string> = {
  CONCEPT: "Concept",
  STORY_BIBLE: "Story Bible",
  ARCHITECTURE: "Architecture",
  FINGERPRINT: "Style Fingerprint",
  CHAPTER_BRIEF: "Brief",
  CHAPTER_PLAN: "Plan",
  CHAPTER_CONTENT: "Content",
  DEV_EDIT_REPORT: "Dev Edit",
  LINE_EDIT_REPORT: "Line Edit",
  BETA_READ_REPORT: "Beta Read",
  CONTINUITY_REPORT: "Continuity Report",
  ANALYSIS_REPORT: "Analysis Report",
  MARKET_REPORT: "Market Report",
  EXPORT_CONFIG: "Export Config",
  FREEWRITE: "Freewrite",
};

const DOC_TYPE_ICONS: Record<string, React.ElementType> = {
  CONCEPT: ScrollTextIcon,
  STORY_BIBLE: BookOpenIcon,
  ARCHITECTURE: BuildingIcon,
  FINGERPRINT: FingerprintIcon,
  CHAPTER_BRIEF: FileTextIcon,
  CHAPTER_PLAN: FileTextIcon,
  CHAPTER_CONTENT: PencilIcon,
  DEV_EDIT_REPORT: PenLineIcon,
  LINE_EDIT_REPORT: PenLineIcon,
  BETA_READ_REPORT: ShieldCheckIcon,
  CONTINUITY_REPORT: SearchIcon,
  ANALYSIS_REPORT: BarChart3Icon,
  MARKET_REPORT: GlobeIcon,
  EXPORT_CONFIG: SettingsIcon,
  FREEWRITE: SparklesIcon,
};

// ─── Grouping definitions ───────────────────────────────────────

interface DocGroup {
  key: string;
  label: string;
  icon: React.ElementType;
  types: string[];
  /** If true, docs in this group are organized by chapter number */
  perChapter?: boolean;
}

const DOC_GROUPS: DocGroup[] = [
  {
    key: "setup",
    label: "Setup",
    icon: SparklesIcon,
    types: ["CONCEPT", "FINGERPRINT", "STORY_BIBLE", "ARCHITECTURE"],
  },
  {
    key: "chapters",
    label: "Chapters",
    icon: FileTextIcon,
    types: ["CHAPTER_BRIEF", "CHAPTER_PLAN", "CHAPTER_CONTENT"],
    perChapter: true,
  },
  {
    key: "editorial",
    label: "Editorial",
    icon: PenLineIcon,
    types: ["DEV_EDIT_REPORT", "LINE_EDIT_REPORT", "BETA_READ_REPORT"],
    perChapter: true,
  },
  {
    key: "reports",
    label: "Analysis & Reports",
    icon: BarChart3Icon,
    types: ["CONTINUITY_REPORT", "ANALYSIS_REPORT", "MARKET_REPORT"],
  },
  {
    key: "other",
    label: "Other",
    icon: SettingsIcon,
    types: ["EXPORT_CONFIG", "FREEWRITE"],
  },
];

// ─── Quick Actions ──────────────────────────────────────────────

const WORKFLOW_ACTIONS = [
  {
    label: "Create Story Bible",
    workflowId: "create-story-bible",
    icon: BookOpenIcon,
  },
  {
    label: "Build Architecture",
    workflowId: "build-architecture",
    icon: BuildingIcon,
  },
  {
    label: "Capture Style",
    workflowId: "capture-style",
    icon: FingerprintIcon,
  },
  {
    label: "Analyze Manuscript",
    workflowId: "analyze",
    icon: SearchIcon,
  },
];

// ─── Page ───────────────────────────────────────────────────────

export default function DocumentsListPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const openWithWorkflow = useAgentStore((s) => s.openWithWorkflow);
  const { t } = useLanguage();

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

  const docs: DocItem[] = documents?.documents ?? documents ?? [];

  // Build grouped structure
  const allDocTypes = new Set(DOC_GROUPS.flatMap((g) => g.types));
  const grouped = DOC_GROUPS.map((group) => {
    const groupDocs = docs.filter((d) => group.types.includes(d.type));
    return { ...group, docs: groupDocs };
  });

  // Catch any unknown types in "Other"
  const unknownDocs = docs.filter((d) => !allDocTypes.has(d.type));
  if (unknownDocs.length > 0) {
    const otherGroup = grouped.find((g) => g.key === "other");
    if (otherGroup) otherGroup.docs.push(...unknownDocs);
  }

  // Only show groups that have documents (except setup — always show)
  const visibleGroups = grouped.filter(
    (g) => g.docs.length > 0 || g.key === "setup"
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">
          {t.nav.documents}
        </h1>
        <p className="text-muted-foreground mt-1">
          {docs.length} document{docs.length !== 1 ? "s" : ""} — organized by
          workflow stage.
        </p>
      </div>

      {/* Quick actions (compact row) */}
      <div className="flex flex-wrap gap-2">
        {WORKFLOW_ACTIONS.map((action) => (
          <Button
            key={action.workflowId}
            variant="outline"
            size="sm"
            onClick={() => openWithWorkflow(action.workflowId)}
          >
            <action.icon className="mr-1.5 size-3.5" />
            {action.label}
          </Button>
        ))}
      </div>

      {/* Grouped document sections */}
      {docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileTextIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No documents yet. Use the quick actions above or run agent
              workflows to create documents.
            </p>
          </CardContent>
        </Card>
      ) : (
        visibleGroups.map((group) => (
          <DocumentGroupSection
            key={group.key}
            group={group}
            bookId={bookId}
          />
        ))
      )}
    </div>
  );
}

// ─── Group section ──────────────────────────────────────────────

function DocumentGroupSection({
  group,
  bookId,
}: {
  group: DocGroup & { docs: DocItem[] };
  bookId: string;
}) {
  const Icon = group.icon;

  if (group.docs.length === 0) {
    // Only for "setup" — show empty state
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-muted-foreground" />
            {group.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            No setup documents yet. Run a workflow to generate them.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Sort within group by the defined type order
  const typeOrder = group.types;
  const sortedDocs = [...group.docs].sort((a, b) => {
    // Primary: chapter number (for per-chapter groups)
    if (group.perChapter) {
      const ca = a.chapterNumber ?? 0;
      const cb = b.chapterNumber ?? 0;
      if (ca !== cb) return ca - cb;
    }
    // Secondary: type order within group
    const ia = typeOrder.indexOf(a.type);
    const ib = typeOrder.indexOf(b.type);
    if (ia !== ib) return ia - ib;
    // Tertiary: updated date descending
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  // For per-chapter groups, cluster by chapter number
  if (group.perChapter) {
    const chapters = new Map<number, DocItem[]>();
    const bookLevel: DocItem[] = [];

    for (const doc of sortedDocs) {
      if (doc.chapterNumber) {
        const arr = chapters.get(doc.chapterNumber) ?? [];
        arr.push(doc);
        chapters.set(doc.chapterNumber, arr);
      } else {
        bookLevel.push(doc);
      }
    }

    const sortedChapterNums = [...chapters.keys()].sort((a, b) => a - b);

    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-muted-foreground" />
            {group.label}
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {sortedDocs.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {bookLevel.length > 0 && (
            <div className="space-y-1">
              {bookLevel.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} bookId={bookId} />
              ))}
            </div>
          )}
          {sortedChapterNums.map((chNum) => (
            <div key={chNum}>
              <p className="text-xs font-medium text-muted-foreground mb-1 px-1">
                Chapter {chNum}
              </p>
              <div className="space-y-1">
                {chapters.get(chNum)!.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    bookId={bookId}
                    hideChapter
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Non-chapter group — flat list
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" />
          {group.label}
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            {sortedDocs.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {sortedDocs.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} bookId={bookId} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Document row ───────────────────────────────────────────────

function DocumentRow({
  doc,
  bookId,
  hideChapter,
}: {
  doc: DocItem;
  bookId: string;
  hideChapter?: boolean;
}) {
  const Icon = DOC_TYPE_ICONS[doc.type] ?? FileTextIcon;
  const label = DOC_TYPE_LABELS[doc.type] ?? doc.type;

  return (
    <Link
      href={`/books/${bookId}/documents/${doc.id}`}
      className="flex items-center justify-between rounded-md border p-2.5 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="size-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {doc.title || label}
          </p>
          <p className="text-xs text-muted-foreground">
            {label}
            {!hideChapter && doc.chapterNumber
              ? ` · Ch. ${doc.chapterNumber}`
              : ""}
            {" · v"}
            {doc.currentVersion}
          </p>
        </div>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 ml-2">
        {new Date(doc.updatedAt).toLocaleDateString()}
      </span>
    </Link>
  );
}
