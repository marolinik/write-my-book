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
  NetworkIcon,
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
import { DamagedDocumentsNotice } from "@/components/book/damaged-documents-notice";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage, useLocale } from "@/components/providers/language-provider";
import { getDocumentTypeLabels } from "@/lib/agents/tool-labels";
import { countWithNoun } from "@/lib/i18n/plural";
import { getAgentStrings, workflowLabel } from "@/lib/i18n/agent-strings";
import {
  groupDocuments,
  type DocumentGroup,
} from "@/lib/documents/library-groups";
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

const DOC_TYPE_ICONS: Record<string, React.ElementType> = {
  CONCEPT: ScrollTextIcon,
  SYNOPSIS: ScrollTextIcon,
  BOOK_PLAN: FileTextIcon,
  WORLD_RESEARCH: GlobeIcon,
  TOPIC_RESEARCH: SearchIcon,
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
  STRUCTURE_PROPOSAL: NetworkIcon,
  MARKET_REPORT: GlobeIcon,
  EXPORT_CONFIG: SettingsIcon,
  FREEWRITE: SparklesIcon,
};

// ─── Group presentation ────────────────────────────────────────
//
// WHICH groups exist, in WHAT order, and which types each one owns lives in
// lib/documents/library-groups.ts — it is the same spine the Razvoj board
// walks, and a test holds it against the Prisma enum. Only the icons and the
// label lookup belong here.

const GROUP_ICONS: Record<string, React.ElementType> = {
  foundation: SparklesIcon,
  structure: BuildingIcon,
  research: SearchIcon,
  chapters: FileTextIcon,
  analysis: BarChart3Icon,
  editorial: PenLineIcon,
  publishing: GlobeIcon,
  notes: PencilIcon,
};

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

function relativeTime(
  date: string,
  locale: string,
  s: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string }
): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return s.justNow;
  if (mins < 60) return s.minutesAgo.replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return s.hoursAgo.replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  if (days < 7) return s.daysAgo.replace("{n}", String(days));
  return new Date(date).toLocaleDateString(locale);
}

// ─── DocumentsLibrary ───────────────────────────────────────────

export function DocumentsLibrary({ bookId }: { bookId: string }) {
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const { t, language } = useLanguage();
  // tool-labels.ts already carries every document type in all seven languages;
  // the library used to keep a second, English-only copy that had never heard
  // of SYNOPSIS (S3-2).
  const typeLabels = getDocumentTypeLabels(language);
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
      const label = typeLabels[d.type] ?? d.type;
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

  // Grouped in flow order; an unrecognised type lands in "notes" rather than
  // disappearing (see lib/documents/library-groups.ts).
  const grouped = groupDocuments(filteredDocs);

  // A group earns its card when it holds something, or when it can offer the
  // workflow that fills it.
  const visibleGroups = grouped.filter(
    (g) => g.docs.length > 0 || g.emptyWorkflow
  );

  // Unique types for filter dropdown
  const uniqueTypes = [...new Set(docs.map((d) => d.type))].sort();

  return (
    <div className="space-y-6">
      {/* O3: documents written before the encoding and language fixes carry
          damage the app used to say nothing about. */}
      <DamagedDocumentsNotice bookId={bookId} />

      <div>
        <h2 className="text-2xl font-display font-bold tracking-tight">
          {t.nav.documents}
        </h2>
        <p className="text-muted-foreground mt-1">
          {countWithNoun(docs.length, t.docLibrary.docOne, t.docLibrary.docMany, {
            few: t.docLibrary.docFew,
            language,
          })}{" — "}
          {t.docLibrary.organisedBy}
        </p>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder={t.appUI.searchDocuments}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-9">
            <FilterIcon className="size-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder={t.appUI.allTypes} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.appUI.allTypes}</SelectItem>
            {uniqueTypes.map((type) => (
              <SelectItem key={type} value={type}>
                {typeLabels[type] ?? type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" asChild>
          <Link href={`/books/${bookId}/documents/new`}>
            <PlusIcon className="size-3.5 mr-1.5" />
            {t.docLibrary.newDocument}
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
              {t.docLibrary.noMatch.replace("{q}", searchQuery)}
            </p>
          </CardContent>
        </Card>
      ) : docs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileTextIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {t.docLibrary.noneYet}
            </p>
          </CardContent>
        </Card>
      ) : (
        visibleGroups.map((group) => (
          <DocumentGroupSection
            key={group.key}
            group={group}
            bookId={bookId}
            label={t.docLibrary[group.key]}
            chapterHeading={t.docLibrary.chapterN}
            emptyText={t.docLibrary.emptyGroup}
            startText={t.docLibrary.startWorkflow}
            workflowLabel={
              group.emptyWorkflow
                ? (workflowLabel(getAgentStrings(language), group.emptyWorkflow) ??
                  group.emptyWorkflow)
                : ""
            }
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
  label,
  chapterHeading,
  emptyText,
  startText,
  workflowLabel,
  onStartWorkflow,
}: {
  group: DocumentGroup & { docs: DocItem[] };
  bookId: string;
  label: string;
  /** Carries an {n} placeholder for the chapter number. */
  chapterHeading: string;
  /** Carries a {group} placeholder. */
  emptyText: string;
  /** Carries a {workflow} placeholder. */
  startText: string;
  workflowLabel: string;
  onStartWorkflow: (wfId: string) => void;
}) {
  const Icon = GROUP_ICONS[group.key] ?? FileTextIcon;

  if (group.docs.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Icon className="size-4 text-muted-foreground" />
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground mb-3">
              {emptyText.replace("{group}", label)}
            </p>
            {group.emptyWorkflow && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onStartWorkflow(group.emptyWorkflow!)}
              >
                <SparklesIcon className="mr-1.5 size-3.5" />
                {startText.replace("{workflow}", workflowLabel)}
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
            {label}
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
                {chapterHeading.replace("{n}", String(chNum))}
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
          {label}
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
  const locale = useLocale();
  const { t, language } = useLanguage();
  const Icon = DOC_TYPE_ICONS[doc.type] ?? FileTextIcon;
  const label = getDocumentTypeLabels(language)[doc.type] ?? doc.type;

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
            {doc.wordCount.toLocaleString(locale)}w
          </span>
        )}
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          v{doc.currentVersion}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {relativeTime(doc.updatedAt, locale, t.docLibrary)}
        </span>
      </div>
    </Link>
  );
}
