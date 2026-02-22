"use client";

import { useMemo, useState } from "react";
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
  MessageSquareIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  PlusIcon,
  FilterIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";
import { useBookState } from "@/hooks/use-book-state";
import { getWorkflow } from "@/lib/agents/workflows";

// ─── Types ──────────────────────────────────────────────────────

interface DocItem {
  id: string;
  type: string;
  title: string | null;
  currentVersion: number;
  updatedAt: string;
  wordCount?: number;
  chapterNumber?: number | null;
  createdByAgent?: string | null;
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
  perChapter?: boolean;
  emptyWorkflow?: string;
  emptyLabel?: string;
}

const DOC_GROUPS: DocGroup[] = [
  {
    key: "setup",
    label: "Setup",
    icon: SparklesIcon,
    types: ["CONCEPT", "FINGERPRINT", "STORY_BIBLE", "ARCHITECTURE"],
    emptyWorkflow: "capture-style",
    emptyLabel: "Run Setup Wizard",
  },
  {
    key: "chapters",
    label: "Chapters",
    icon: FileTextIcon,
    types: ["CHAPTER_BRIEF", "CHAPTER_PLAN", "CHAPTER_CONTENT"],
    perChapter: true,
    emptyWorkflow: "discuss-chapter",
    emptyLabel: "Start Chapter Discussion",
  },
  {
    key: "editorial",
    label: "Editorial",
    icon: PenLineIcon,
    types: ["DEV_EDIT_REPORT", "LINE_EDIT_REPORT", "BETA_READ_REPORT"],
    perChapter: true,
    emptyWorkflow: "dev-edit",
    emptyLabel: "Run Dev Edit",
  },
  {
    key: "reports",
    label: "Analysis & Reports",
    icon: BarChart3Icon,
    types: ["CONTINUITY_REPORT", "ANALYSIS_REPORT", "MARKET_REPORT"],
    emptyWorkflow: "analyze",
    emptyLabel: "Run Analysis",
  },
  {
    key: "other",
    label: "Other",
    icon: SettingsIcon,
    types: ["EXPORT_CONFIG", "FREEWRITE"],
  },
];

// ─── Workflow icon map ──────────────────────────────────────────

const WORKFLOW_ICONS: Record<string, React.ElementType> = {
  "capture-style": FingerprintIcon,
  "refresh-style": FingerprintIcon,
  "evolve-style": FingerprintIcon,
  "create-story-bible": BookOpenIcon,
  "build-architecture": BuildingIcon,
  "read-manuscript": ScrollTextIcon,
  "new-novel": SparklesIcon,
  "discuss-chapter": MessageSquareIcon,
  "plan-chapter": FileTextIcon,
  "write-chapter": PencilIcon,
  "dev-edit": PenLineIcon,
  "line-edit": PenLineIcon,
  "beta-read": ShieldCheckIcon,
  "discuss-edits": MessageSquareIcon,
  "analyze": SearchIcon,
  "continuity-check": SearchIcon,
  "publishing-check": CheckCircleIcon,
  "market-analysis": GlobeIcon,
};

function relativeTime(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

// ─── DocumentsLibrary ───────────────────────────────────────────

export function DocumentsLibrary({ bookId }: { bookId: string }) {
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const { t } = useLanguage();
  const bookState = useBookState(bookId);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const { data: documents, isLoading } = useQuery({
    queryKey: ["book-documents", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/documents`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: !!bookId,
  });

  // Build context-aware quick actions from book state
  const quickActions = useMemo(() => {
    const actions: Array<{
      workflowId: string;
      label: string;
      description?: string;
      primary?: boolean;
    }> = [];

    if (bookState.nextRecommendedWorkflow) {
      const wf = getWorkflow(bookState.nextRecommendedWorkflow);
      if (wf) {
        actions.push({
          workflowId: wf.id,
          label: wf.label,
          description: wf.writerDescription,
          primary: true,
        });
      }
    }

    for (const sw of bookState.secondaryWorkflows) {
      const wf = getWorkflow(sw.id);
      if (wf) {
        actions.push({
          workflowId: wf.id,
          label: wf.label,
          description: sw.reason,
        });
      }
    }

    const shown = new Set(actions.map((a) => a.workflowId));
    for (const setupId of bookState.setupWorkflows) {
      if (shown.has(setupId)) continue;
      const wf = getWorkflow(setupId);
      if (wf) {
        actions.push({ workflowId: wf.id, label: wf.label });
      }
    }

    return actions;
  }, [bookState]);

  if (isLoading || bookState.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const docs: DocItem[] = documents?.documents ?? documents ?? [];

  // Apply search and filter
  const filteredDocs = docs.filter((d) => {
    if (typeFilter !== "all" && d.type !== typeFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const label = DOC_TYPE_LABELS[d.type] ?? d.type;
      if (
        !(d.title ?? "").toLowerCase().includes(q) &&
        !label.toLowerCase().includes(q) &&
        !d.type.toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    return true;
  });

  // Build grouped structure
  const allDocTypes = new Set(DOC_GROUPS.flatMap((g) => g.types));
  const grouped = DOC_GROUPS.map((group) => {
    const groupDocs = filteredDocs.filter((d) => group.types.includes(d.type));
    return { ...group, docs: groupDocs };
  });

  const unknownDocs = filteredDocs.filter((d) => !allDocTypes.has(d.type));
  if (unknownDocs.length > 0) {
    const otherGroup = grouped.find((g) => g.key === "other");
    if (otherGroup) otherGroup.docs.push(...unknownDocs);
  }

  // Show groups that have documents, or setup (always), or groups with emptyWorkflow CTAs
  const visibleGroups = grouped.filter(
    (g) => g.docs.length > 0 || g.key === "setup" || g.emptyWorkflow
  );

  // Unique types for filter dropdown
  const uniqueTypes = [...new Set(docs.map((d) => d.type))].sort();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-bold tracking-tight">
          {t.nav.documents}
        </h2>
        <p className="text-muted-foreground mt-1">
          {docs.length} document{docs.length !== 1 ? "s" : ""} — organized by
          workflow stage.
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <FilterIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {DOC_TYPE_LABELS[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" asChild>
          <Link href={`/books/${bookId}/documents/new`}>
            <PlusIcon className="size-3.5 mr-1.5" />
            New Document
          </Link>
        </Button>
      </div>

      {/* Context-aware quick actions */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => {
            const Icon = WORKFLOW_ICONS[action.workflowId] ?? SparklesIcon;
            return (
              <Button
                key={action.workflowId}
                variant={action.primary ? "default" : "outline"}
                size="sm"
                onClick={() => openWithWorkflow(action.workflowId)}
                title={action.description}
              >
                {action.primary && (
                  <ArrowRightIcon className="mr-1 size-3.5" />
                )}
                <Icon className="mr-1.5 size-3.5" />
                {action.label}
              </Button>
            );
          })}
        </div>
      )}

      {/* Grouped document sections */}
      {filteredDocs.length === 0 && searchQuery ? (
        <Card>
          <CardContent className="py-12 text-center">
            <SearchIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              No documents matching &quot;{searchQuery}&quot;
            </p>
          </CardContent>
        </Card>
      ) : docs.length === 0 ? (
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
            onStartWorkflow={openWithWorkflow}
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
  onStartWorkflow,
}: {
  group: DocGroup & { docs: DocItem[] };
  bookId: string;
  onStartWorkflow: (wfId: string) => void;
}) {
  const Icon = group.icon;

  if (group.docs.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-muted-foreground" />
            {group.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              No {group.label.toLowerCase()} documents yet.
            </p>
            {group.emptyWorkflow && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStartWorkflow(group.emptyWorkflow!)}
              >
                <SparklesIcon className="mr-1.5 size-3.5" />
                {group.emptyLabel ?? `Run ${group.label} workflow`}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  const typeOrder = group.types;
  const sortedDocs = [...group.docs].sort((a, b) => {
    if (group.perChapter) {
      const ca = a.chapterNumber ?? 0;
      const cb = b.chapterNumber ?? 0;
      if (ca !== cb) return ca - cb;
    }
    const ia = typeOrder.indexOf(a.type);
    const ib = typeOrder.indexOf(b.type);
    if (ia !== ib) return ia - ib;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

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
                  <DocumentRow key={doc.id} doc={doc} bookId={bookId} hideChapter />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

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
            {!hideChapter && doc.chapterNumber ? ` · Ch. ${doc.chapterNumber}` : ""}
            {doc.createdByAgent && ` · ${doc.createdByAgent}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 ml-2">
        {doc.wordCount != null && doc.wordCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {doc.wordCount.toLocaleString()}w
          </span>
        )}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          v{doc.currentVersion}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {relativeTime(doc.updatedAt)}
        </span>
      </div>
    </Link>
  );
}
