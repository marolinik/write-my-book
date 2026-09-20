"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  LayoutDashboardIcon,
  BookOpenIcon,
  FileTextIcon,
  PenToolIcon,
  SettingsIcon,
  ImportIcon,
  DownloadIcon,
  BarChartIcon,
  PaletteIcon,
  PlusIcon,
  SparklesIcon,
  LibraryIcon,
  BookMarkedIcon,
  KeyboardIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { getAllWorkflows } from "@/lib/agents/workflows";
import {
  getAgentStrings,
  workflowLabel,
  workflowDescription,
} from "@/lib/i18n/agent-strings";
import type { UIStrings } from "@/lib/i18n/ui-strings";

/**
 * H-3: every label in this palette was an English literal, and the
 * translations were sitting unused two files away — `commandPalette.pages`,
 * `.workflows` and `.actions` had no reader at all, and the workflow rows were
 * built from the registry's English `label`/`writerDescription` rather than
 * the localized workflow tables. The Ctrl+K palette is the fastest surface in
 * the product and it was the only one still speaking English.
 */
function navItems(t: UIStrings) {
  return [
    { label: t.nav.dashboard, icon: LayoutDashboardIcon, path: "/dashboard" },
    { label: t.nav.books, icon: BookOpenIcon, path: "/books" },
    { label: t.nav.series, icon: LibraryIcon, path: "/series" },
    { label: t.nav.settings, icon: SettingsIcon, path: "/settings" },
    { label: t.nav.billing, icon: BarChartIcon, path: "/settings/billing" },
  ];
}

function bookNavItemsFor(t: UIStrings, bookId: string) {
  return [
    { label: t.nav.overview, icon: BookOpenIcon, path: `/books/${bookId}` },
    { label: t.nav.setup, icon: SparklesIcon, path: `/books/${bookId}/setup` },
    { label: t.nav.documents, icon: FileTextIcon, path: `/books/${bookId}/documents` },
    { label: t.nav.editorial, icon: PenToolIcon, path: `/books/${bookId}/editorial` },
    { label: t.nav.reports, icon: BarChartIcon, path: `/books/${bookId}/reports` },
    { label: t.nav.style, icon: PaletteIcon, path: `/books/${bookId}/style` },
    { label: t.nav.dashboard, icon: LayoutDashboardIcon, path: `/books/${bookId}/dashboard` },
    { label: t.wiki.title, icon: BookMarkedIcon, path: `/books/${bookId}/wiki` },
    { label: t.nav.import, icon: ImportIcon, path: `/books/${bookId}/import` },
    { label: t.nav.export, icon: DownloadIcon, path: `/books/${bookId}/export` },
  ];
}

function actionItems(t: UIStrings) {
  return [
    { label: t.bookList.newBook, icon: PlusIcon, action: "new-book" as const },
    {
      label: t.appUI.keyboardShortcuts,
      icon: KeyboardIcon,
      action: "keyboard-shortcuts" as const,
    },
  ];
}

export function CommandPalette() {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const params = useParams();
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);

  const bookId = typeof params?.bookId === "string" ? params.bookId : null;

  // Ctrl+K / Cmd+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const pages = useMemo(() => navItems(t), [t]);
  const actions = useMemo(() => actionItems(t), [t]);

  const bookNavItems = useMemo(
    () => (bookId ? bookNavItemsFor(t, bookId) : []),
    [bookId, t]
  );

  const workflowItems = useMemo(() => {
    const strings = getAgentStrings(language);
    return getAllWorkflows().map((wf) => ({
      id: wf.id,
      // The registry's own label is the English fallback of last resort; the
      // localized table is the source, exactly as the workflow selector uses it.
      label: workflowLabel(strings, wf.id) ?? wf.label,
      description: workflowDescription(strings, wf.id) ?? wf.writerDescription,
      category: wf.category,
    }));
  }, [language]);

  const handleSelect = useCallback(
    (value: string) => {
      setOpen(false);

      // Navigation
      if (value.startsWith("/")) {
        router.push(value);
        return;
      }

      // Actions
      if (value === "new-book") {
        router.push("/books?new=true");
        return;
      }

      if (value === "keyboard-shortcuts") {
        const win = window as unknown as Record<string, (() => void) | undefined>;
        win.__openKeyboardShortcuts?.();
        return;
      }

      // Workflow — starts with "workflow:"
      if (value.startsWith("workflow:")) {
        const workflowId = value.replace("workflow:", "");
        openWithWorkflow(workflowId);
        return;
      }
    },
    [router, openWithWorkflow]
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder={t.appUI.searchCommands} />
      <CommandList>
        <CommandEmpty>{t.appUI.noResults}</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading={t.commandPalette.pages}>
          {pages.map((item) => (
            <CommandItem
              key={item.path}
              value={`nav-${item.label}`}
              onSelect={() => handleSelect(item.path)}
            >
              <item.icon className="mr-2 size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Book-specific navigation */}
        {bookNavItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t.commandPalette.currentBook}>
              {bookNavItems.map((item) => (
                <CommandItem
                  key={item.path}
                  value={`book-${item.label}`}
                  onSelect={() => handleSelect(item.path)}
                >
                  <item.icon className="mr-2 size-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Workflows */}
        <CommandSeparator />
        <CommandGroup heading={t.commandPalette.workflows}>
          {workflowItems.map((wf) => (
            <CommandItem
              key={wf.id}
              value={`wf-${wf.label}`}
              onSelect={() => handleSelect(`workflow:${wf.id}`)}
            >
              <SparklesIcon className="mr-2 size-4" />
              <div className="flex flex-col">
                <span>{wf.label}</span>
                {wf.description && (
                  <span className="text-xs text-muted-foreground">
                    {wf.description}
                  </span>
                )}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Actions */}
        <CommandSeparator />
        <CommandGroup heading={t.commandPalette.actions}>
          {actions.map((item) => (
            <CommandItem
              key={item.action}
              value={`action-${item.label}`}
              onSelect={() => handleSelect(item.action)}
            >
              <item.icon className="mr-2 size-4" />
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
