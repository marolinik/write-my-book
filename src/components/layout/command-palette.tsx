"use client";

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

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboardIcon, path: "/dashboard" },
  { label: "Books", icon: BookOpenIcon, path: "/books" },
  { label: "Series", icon: LibraryIcon, path: "/series" },
  { label: "Settings", icon: SettingsIcon, path: "/settings" },
  { label: "Billing", icon: BarChartIcon, path: "/settings/billing" },
];

function getBookNavItems(bookId: string) {
  return [
    { label: "Book Overview", icon: BookOpenIcon, path: `/books/${bookId}` },
    { label: "Setup", icon: SparklesIcon, path: `/books/${bookId}/setup` },
    { label: "Documents", icon: FileTextIcon, path: `/books/${bookId}/documents` },
    { label: "Editorial", icon: PenToolIcon, path: `/books/${bookId}/editorial` },
    { label: "Reports", icon: BarChartIcon, path: `/books/${bookId}/reports` },
    { label: "Style", icon: PaletteIcon, path: `/books/${bookId}/style` },
    { label: "Dashboard", icon: LayoutDashboardIcon, path: `/books/${bookId}/dashboard` },
    { label: "Wiki", icon: BookMarkedIcon, path: `/books/${bookId}/wiki` },
    { label: "Import", icon: ImportIcon, path: `/books/${bookId}/import` },
    { label: "Export", icon: DownloadIcon, path: `/books/${bookId}/export` },
  ];
}

const ACTION_ITEMS = [
  { label: "New Book", icon: PlusIcon, action: "new-book" as const },
  { label: "Keyboard Shortcuts", icon: KeyboardIcon, action: "keyboard-shortcuts" as const },
];

export function CommandPalette() {
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

  const bookNavItems = useMemo(
    () => (bookId ? getBookNavItems(bookId) : []),
    [bookId]
  );

  const workflowItems = useMemo(
    () =>
      getAllWorkflows().map((wf) => ({
        id: wf.id,
        label: wf.label,
        description: wf.writerDescription,
        category: wf.category,
      })),
    []
  );

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
      <CommandInput placeholder="Search commands, chapters, workflows..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Navigation */}
        <CommandGroup heading="Pages">
          {NAV_ITEMS.map((item) => (
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
            <CommandGroup heading="Current Book">
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
        <CommandGroup heading="Workflows">
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
        <CommandGroup heading="Actions">
          {ACTION_ITEMS.map((item) => (
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
