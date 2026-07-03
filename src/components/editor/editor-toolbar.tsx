"use client";

import { useRef, useState, useEffect } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo,
  Redo,
  Focus,
  History,
  Check,
  Loader2,
  AlertCircle,
  Sparkles,
  PenTool,
  Highlighter,
  Columns2,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Wand2,
  LibraryBig,
  Replace,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GraduatedFocus } from "./graduated-focus";
import type { FocusLevel } from "./graduated-focus";
import { AmbientSoundscape } from "./ambient-soundscape";
import { ReadAloud } from "./read-aloud";
import { useToolbarRoving } from "./use-toolbar-roving";

interface EditorToolbarProps {
  editor: Editor | null;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  paneId?: string;
  focusLevel?: FocusLevel;
  onFocusLevelChange?: (level: FocusLevel) => void;
  onEnterImmersive?: () => void;
  showHistory?: boolean;
  onToggleHistory?: () => void;
  showFindings?: boolean;
  onToggleFindings?: () => void;
  pendingFindingsCount?: number;
  showSeriesContext?: boolean;
  onToggleSeriesContext?: () => void;
  showAnnotations?: boolean;
  onToggleAnnotations?: () => void;
  isSaving?: boolean;
  isDirty?: boolean;
  lastSaved?: Date | null;
  onInlineEdit?: () => void;
  splitMode?: boolean;
  onToggleSplit?: () => void;
  showFloatingInput?: boolean;
  onToggleFloatingInput?: () => void;
  ghostTextEnabled?: boolean;
  onToggleGhostText?: () => void;
  onFindReplace?: () => void;
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  /** Toggle-button state; emits aria-pressed when provided. */
  pressed?: boolean;
  onClick: () => void;
}

function ToolbarButton({
  icon,
  label,
  isActive,
  pressed,
  onClick,
}: ToolbarButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={isActive ? "secondary" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={onClick}
          type="button"
          aria-label={label}
          aria-pressed={pressed}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// Two-stage priority collapse (spec §1.3):
// stage 1: secondary groups collapse into the "More tools" dropdown;
// stage 2: headings + Annotations/History toggles also move into the
// dropdown, audio tools hide (kept mounted), save badge goes icon-only.
// Thresholds sit ABOVE each stage's measured content width (full ≈ 890px,
// overflow ≈ 550px) — thresholds below content width produce clipping bands
// where buttons render outside the container but no stage change fires.
const TOOLBAR_OVERFLOW_THRESHOLD = 900;
const TOOLBAR_COMPACT_THRESHOLD = 560;

type ToolbarDensity = "full" | "overflow" | "compact";

function getToolbarDensity(width: number): ToolbarDensity {
  if (width < TOOLBAR_COMPACT_THRESHOLD) return "compact";
  if (width < TOOLBAR_OVERFLOW_THRESHOLD) return "overflow";
  return "full";
}

// Heading levels exposed in the toolbar (mirrors StarterKit heading config)
const HEADING_LEVELS = [1, 2, 3] as const;

// Graduated focus levels exposed in the overflow dropdown (level 3 is hidden —
// it ships paragraph-equivalent this phase, see graduated-focus.tsx)
const FOCUS_LEVEL_MENU_ITEMS: Array<{ level: FocusLevel; label: string }> = [
  { level: 0, label: "Normal" },
  { level: 1, label: "Focused" },
  { level: 2, label: "Paragraph" },
];

interface ToolbarGroup {
  id: string;
  priority: "primary" | "secondary";
  render: (ctx: ToolbarGroupContext) => React.ReactNode;
  renderDropdownItems: (ctx: ToolbarGroupContext) => React.ReactNode;
  label: string;
}

interface ToolbarGroupContext {
  editor: Editor;
  density: ToolbarDensity;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  paneId?: string;
  focusLevel?: FocusLevel;
  onFocusLevelChange?: (level: FocusLevel) => void;
  onEnterImmersive?: () => void;
  showHistory?: boolean;
  onToggleHistory?: () => void;
  showFindings?: boolean;
  onToggleFindings?: () => void;
  pendingFindingsCount?: number;
  showSeriesContext?: boolean;
  onToggleSeriesContext?: () => void;
  showAnnotations?: boolean;
  onToggleAnnotations?: () => void;
  onInlineEdit?: () => void;
  splitMode?: boolean;
  onToggleSplit?: () => void;
  showFloatingInput?: boolean;
  onToggleFloatingInput?: () => void;
  ghostTextEnabled?: boolean;
  onToggleGhostText?: () => void;
  onFindReplace?: () => void;
}

const TOOLBAR_GROUPS: ToolbarGroup[] = [
  // --- Primary groups: always inline ---
  {
    id: "formatting",
    priority: "primary",
    label: "Formatting",
    render: (ctx) => (
      <>
        <ToolbarButton
          icon={<Bold className="h-4 w-4" />}
          label="Bold (Ctrl+B)"
          isActive={ctx.editor.isActive("bold")}
          pressed={ctx.editor.isActive("bold")}
          onClick={() => ctx.editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={<Italic className="h-4 w-4" />}
          label="Italic (Ctrl+I)"
          isActive={ctx.editor.isActive("italic")}
          pressed={ctx.editor.isActive("italic")}
          onClick={() => ctx.editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={<Underline className="h-4 w-4" />}
          label="Underline (Ctrl+U)"
          isActive={ctx.editor.isActive("underline")}
          pressed={ctx.editor.isActive("underline")}
          onClick={() => ctx.editor.chain().focus().toggleUnderline().run()}
        />
      </>
    ),
    renderDropdownItems: () => null,
  },
  {
    id: "headings",
    priority: "primary",
    label: "Headings",
    render: (ctx) => (
      <>
        <ToolbarButton
          icon={<Heading1 className="h-4 w-4" />}
          label="Heading 1"
          isActive={ctx.editor.isActive("heading", { level: 1 })}
          pressed={ctx.editor.isActive("heading", { level: 1 })}
          onClick={() =>
            ctx.editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <ToolbarButton
          icon={<Heading2 className="h-4 w-4" />}
          label="Heading 2"
          isActive={ctx.editor.isActive("heading", { level: 2 })}
          pressed={ctx.editor.isActive("heading", { level: 2 })}
          onClick={() =>
            ctx.editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarButton
          icon={<Heading3 className="h-4 w-4" />}
          label="Heading 3"
          isActive={ctx.editor.isActive("heading", { level: 3 })}
          pressed={ctx.editor.isActive("heading", { level: 3 })}
          onClick={() =>
            ctx.editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />
      </>
    ),
    // Only reached at compact density — headings stay inline above 480px.
    renderDropdownItems: (ctx) => (
      <>
        {/* CheckboxItem exposes the active state to AT (aria-checked) — a
            bare aria-hidden Check icon conveys it visually only */}
        {HEADING_LEVELS.map((level) => (
          <DropdownMenuCheckboxItem
            key={level}
            checked={ctx.editor.isActive("heading", { level })}
            onClick={() =>
              ctx.editor.chain().focus().toggleHeading({ level }).run()
            }
          >
            Heading {level} (Ctrl+Alt+{level})
          </DropdownMenuCheckboxItem>
        ))}
      </>
    ),
  },

  // --- Secondary groups: collapse into dropdown when narrow ---
  {
    id: "blocks",
    priority: "secondary",
    label: "Lists & Blocks",
    render: (ctx) => (
      <>
        <ToolbarButton
          icon={<List className="h-4 w-4" />}
          label="Bullet List"
          isActive={ctx.editor.isActive("bulletList")}
          pressed={ctx.editor.isActive("bulletList")}
          onClick={() => ctx.editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={<ListOrdered className="h-4 w-4" />}
          label="Ordered List"
          isActive={ctx.editor.isActive("orderedList")}
          pressed={ctx.editor.isActive("orderedList")}
          onClick={() => ctx.editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={<Quote className="h-4 w-4" />}
          label="Blockquote"
          isActive={ctx.editor.isActive("blockquote")}
          pressed={ctx.editor.isActive("blockquote")}
          onClick={() => ctx.editor.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          icon={<Minus className="h-4 w-4" />}
          label="Scene Break"
          onClick={() =>
            ctx.editor.chain().focus().setHorizontalRule().run()
          }
        />
      </>
    ),
    renderDropdownItems: (ctx) => (
      <>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().toggleBulletList().run()}>
          <List className="mr-2 h-4 w-4" />
          Bullet List (Ctrl+Shift+8)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="mr-2 h-4 w-4" />
          Ordered List (Ctrl+Shift+7)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="mr-2 h-4 w-4" />
          Blockquote (Ctrl+Shift+B)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().setHorizontalRule().run()}>
          <Minus className="mr-2 h-4 w-4" />
          Scene Break
        </DropdownMenuItem>
      </>
    ),
  },
  {
    id: "history",
    priority: "secondary",
    label: "History",
    render: (ctx) => (
      <>
        <ToolbarButton
          icon={<Undo className="h-4 w-4" />}
          label="Undo (Ctrl+Z)"
          onClick={() => ctx.editor.chain().focus().undo().run()}
        />
        <ToolbarButton
          icon={<Redo className="h-4 w-4" />}
          label="Redo (Ctrl+Shift+Z)"
          onClick={() => ctx.editor.chain().focus().redo().run()}
        />
      </>
    ),
    renderDropdownItems: (ctx) => (
      <>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().undo().run()}>
          <Undo className="mr-2 h-4 w-4" />
          Undo (Ctrl+Z)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().redo().run()}>
          <Redo className="mr-2 h-4 w-4" />
          Redo (Ctrl+Shift+Z)
        </DropdownMenuItem>
      </>
    ),
  },
  {
    id: "tools",
    priority: "secondary",
    label: "Tools",
    render: (ctx) => (
      <>
        <ToolbarButton
          icon={<Focus className="h-4 w-4" />}
          label="Focus Mode"
          isActive={ctx.focusMode}
          pressed={ctx.focusMode}
          onClick={ctx.onToggleFocusMode}
        />
        <GraduatedFocus
          currentLevel={ctx.focusLevel}
          onChange={ctx.onFocusLevelChange}
          onEnterImmersive={ctx.onEnterImmersive}
        />
        {ctx.onFindReplace && (
          <ToolbarButton
            icon={<Replace className="h-4 w-4" />}
            label="Find & Replace (Ctrl+Shift+F)"
            onClick={ctx.onFindReplace}
          />
        )}
        {ctx.onInlineEdit && (
          <ToolbarButton
            icon={<Sparkles className="h-4 w-4" />}
            label="AI Rewrite (F2)"
            onClick={ctx.onInlineEdit}
          />
        )}
        {ctx.onToggleGhostText && (
          <ToolbarButton
            icon={<Wand2 className="h-4 w-4" />}
            label={
              ctx.ghostTextEnabled
                ? "AI Ghost Text (on)"
                : "AI Ghost Text (off)"
            }
            isActive={ctx.ghostTextEnabled}
            pressed={!!ctx.ghostTextEnabled}
            onClick={ctx.onToggleGhostText}
          />
        )}
        {ctx.onToggleFloatingInput && (
          <ToolbarButton
            icon={<MessageCircle className="h-4 w-4" />}
            label="Agent Quick Chat"
            isActive={ctx.showFloatingInput}
            pressed={!!ctx.showFloatingInput}
            onClick={ctx.onToggleFloatingInput}
          />
        )}
        {ctx.onToggleSplit && (
          <ToolbarButton
            icon={
              ctx.splitMode ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Columns2 className="h-4 w-4" />
              )
            }
            label={ctx.splitMode ? "Chapter Only" : "Split View"}
            isActive={ctx.splitMode}
            pressed={!!ctx.splitMode}
            onClick={ctx.onToggleSplit}
          />
        )}
      </>
    ),
    renderDropdownItems: (ctx) => (
      <>
        <DropdownMenuItem onClick={ctx.onToggleFocusMode}>
          <Focus className="mr-2 h-4 w-4" />
          Focus Mode
        </DropdownMenuItem>
        {/* Graduated focus levels survive overflow as checkable menu items */}
        {ctx.onFocusLevelChange &&
          FOCUS_LEVEL_MENU_ITEMS.map(({ level, label }) => (
            <DropdownMenuCheckboxItem
              key={level}
              checked={ctx.focusLevel === level}
              onClick={() => ctx.onFocusLevelChange?.(level)}
            >
              Focus: {label}
            </DropdownMenuCheckboxItem>
          ))}
        {ctx.onEnterImmersive && (
          <DropdownMenuItem onClick={ctx.onEnterImmersive}>
            <Maximize2 className="mr-2 h-4 w-4" />
            Immersive Mode
          </DropdownMenuItem>
        )}
        {ctx.onFindReplace && (
          <DropdownMenuItem onClick={ctx.onFindReplace}>
            <Replace className="mr-2 h-4 w-4" />
            Find &amp; Replace (Ctrl+Shift+F)
          </DropdownMenuItem>
        )}
        {ctx.onInlineEdit && (
          <DropdownMenuItem onClick={ctx.onInlineEdit}>
            <Sparkles className="mr-2 h-4 w-4" />
            AI Rewrite (F2)
          </DropdownMenuItem>
        )}
        {ctx.onToggleGhostText && (
          <DropdownMenuItem onClick={ctx.onToggleGhostText}>
            <Wand2 className="mr-2 h-4 w-4" />
            {ctx.ghostTextEnabled ? "Disable AI Ghost Text" : "Enable AI Ghost Text"}
          </DropdownMenuItem>
        )}
        {ctx.onToggleFloatingInput && (
          <DropdownMenuItem onClick={ctx.onToggleFloatingInput}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Agent Quick Chat
          </DropdownMenuItem>
        )}
        {ctx.onToggleSplit && (
          <DropdownMenuItem onClick={ctx.onToggleSplit}>
            {ctx.splitMode ? (
              <Maximize2 className="mr-2 h-4 w-4" />
            ) : (
              <Columns2 className="mr-2 h-4 w-4" />
            )}
            {ctx.splitMode ? "Chapter Only" : "Split View"}
          </DropdownMenuItem>
        )}
      </>
    ),
  },

  // --- Primary: panels always inline (at compact only Findings stays —
  // it carries the pending-count badge affordance; Annotations + History
  // move into the overflow dropdown) ---
  {
    id: "panels",
    priority: "primary",
    label: "Panels",
    render: (ctx) => (
      <>
        {ctx.density !== "compact" && ctx.onToggleAnnotations && (
          <ToolbarButton
            icon={<Highlighter className="h-4 w-4" />}
            label="Toggle Annotations"
            isActive={ctx.showAnnotations}
            pressed={!!ctx.showAnnotations}
            onClick={ctx.onToggleAnnotations}
          />
        )}
        {ctx.onToggleFindings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={ctx.showFindings ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 relative"
                onClick={ctx.onToggleFindings}
                type="button"
                aria-label={
                  !!ctx.pendingFindingsCount && ctx.pendingFindingsCount > 0
                    ? `Toggle findings, ${ctx.pendingFindingsCount} pending`
                    : "Toggle Findings"
                }
                aria-pressed={!!ctx.showFindings}
              >
                <PenTool className="h-4 w-4" />
                {!!ctx.pendingFindingsCount && ctx.pendingFindingsCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-0.5"
                  >
                    {ctx.pendingFindingsCount > 99
                      ? "99+"
                      : ctx.pendingFindingsCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Findings Panel</TooltipContent>
          </Tooltip>
        )}
        {ctx.onToggleSeriesContext && (
          <ToolbarButton
            icon={<LibraryBig className="h-4 w-4" />}
            label="Series Context"
            isActive={ctx.showSeriesContext}
            pressed={!!ctx.showSeriesContext}
            onClick={ctx.onToggleSeriesContext}
          />
        )}
        {ctx.density !== "compact" && ctx.onToggleHistory && (
          <ToolbarButton
            icon={<History className="h-4 w-4" />}
            label="Version History"
            isActive={ctx.showHistory}
            pressed={!!ctx.showHistory}
            onClick={ctx.onToggleHistory}
          />
        )}
      </>
    ),
    // Only reached at compact density — Annotations/History stay inline
    // above 480px. Findings never appears here (always inline).
    renderDropdownItems: (ctx) => {
      if (!ctx.onToggleAnnotations && !ctx.onToggleHistory) return null;
      return (
        <>
          {ctx.onToggleAnnotations && (
            <DropdownMenuItem onClick={ctx.onToggleAnnotations}>
              <Highlighter className="mr-2 h-4 w-4" />
              Toggle Annotations
            </DropdownMenuItem>
          )}
          {ctx.onToggleHistory && (
            <DropdownMenuItem onClick={ctx.onToggleHistory}>
              <History className="mr-2 h-4 w-4" />
              Version History
            </DropdownMenuItem>
          )}
        </>
      );
    },
  },
];

export function EditorToolbar({
  editor,
  focusMode,
  onToggleFocusMode,
  paneId,
  focusLevel,
  onFocusLevelChange,
  onEnterImmersive,
  showHistory,
  onToggleHistory,
  showFindings,
  onToggleFindings,
  pendingFindingsCount,
  showSeriesContext,
  onToggleSeriesContext,
  showAnnotations,
  onToggleAnnotations,
  isSaving,
  isDirty,
  lastSaved,
  onInlineEdit,
  splitMode,
  onToggleSplit,
  showFloatingInput,
  onToggleFloatingInput,
  ghostTextEnabled,
  onToggleGhostText,
  onFindReplace,
}: EditorToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [density, setDensity] = useState<ToolbarDensity>("full");

  // Roving tabindex: single Tab stop, Arrow/Home/End move between buttons.
  useToolbarRoving(containerRef);

  // ResizeObserver to detect container width and set toolbar density.
  // `editor` is a dependency so the observer attaches after the async TipTap
  // mount (the component renders null until the editor instance exists).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDensity(getToolbarDensity(entry.contentRect.width));
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [editor]);

  if (!editor) return null;

  const ctx: ToolbarGroupContext = {
    editor,
    density,
    focusMode,
    onToggleFocusMode,
    paneId,
    focusLevel,
    onFocusLevelChange,
    onEnterImmersive,
    showHistory,
    onToggleHistory,
    showFindings,
    onToggleFindings,
    pendingFindingsCount,
    showSeriesContext,
    onToggleSeriesContext,
    showAnnotations,
    onToggleAnnotations,
    onInlineEdit,
    splitMode,
    onToggleSplit,
    showFloatingInput,
    onToggleFloatingInput,
    ghostTextEnabled,
    onToggleGhostText,
    onFindReplace,
  };

  const primaryGroups = TOOLBAR_GROUPS.filter((g) => g.priority === "primary");
  const secondaryGroups = TOOLBAR_GROUPS.filter(
    (g) => g.priority === "secondary"
  );

  const isCompact = density === "compact";

  // Stage-2 reshuffle: headings leave the inline row; the panels group stays
  // inline but renders only Findings (see its density-aware render fn).
  const inlineGroups = isCompact
    ? primaryGroups.filter((g) => g.id !== "headings")
    : primaryGroups;

  // Dropdown contents — stage 1: secondary groups only; stage 2: headings
  // first (they just left the inline row), then secondary groups, then the
  // Annotations/History panel toggles.
  const dropdownGroups = isCompact
    ? [
        ...TOOLBAR_GROUPS.filter((g) => g.id === "headings"),
        ...secondaryGroups,
        ...TOOLBAR_GROUPS.filter((g) => g.id === "panels"),
      ]
    : secondaryGroups;

  // Render inline groups with separators between them
  const renderInlineGroups = (groups: ToolbarGroup[]) => {
    return groups.map((group, index) => (
      <div key={group.id} className="flex items-center">
        {index > 0 && (
          <Separator orientation="vertical" className="mx-1 h-6" />
        )}
        <div className="flex items-center gap-0.5">{group.render(ctx)}</div>
      </div>
    ));
  };

  return (
    <div
      ref={containerRef}
      role="toolbar"
      aria-label="Editor toolbar"
      className="flex items-center gap-0.5 border-b px-2 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10"
    >
      {/* Primary groups: always inline (headings drop out at compact) */}
      {renderInlineGroups(inlineGroups)}

      {/* Secondary groups: inline when wide, dropdown when narrow */}
      {density === "full" ? (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          {renderInlineGroups(secondaryGroups)}
        </>
      ) : (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                type="button"
                aria-label="More tools"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {dropdownGroups.map((group, index) => {
                const items = group.renderDropdownItems(ctx);
                if (!items) return null;
                return (
                  <div key={group.id}>
                    {index > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                    {items}
                  </div>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}

      {/* Audio tools: stable mount position regardless of overflow state so
          playback survives menu close and threshold crossings. Never inside
          the dropdown — Radix unmounts its children on close, which kills
          the AudioContext/speech. Primary pane only (split view). At compact
          density they hide via class (still mounted, playback continues). */}
      {paneId !== "secondary" && (
        <>
          <Separator
            orientation="vertical"
            className={isCompact ? "mx-1 h-6 hidden" : "mx-1 h-6"}
          />
          <AmbientSoundscape className={isCompact ? "hidden" : undefined} />
          <ReadAloud
            text={editor.getText()}
            className={isCompact ? "hidden" : undefined}
          />
        </>
      )}

      {/* Save indicator badge -- pushed to the right. Icon-only at compact
          density (sr-only text keeps the same words for AT). Deliberately
          NOT a live region: the status bar's save cluster already announces
          every transition, and two polite regions updating in lockstep
          double-announce each autosave (the live-announcer contract calls
          that a defect). This badge is the redundant visual twin. */}
      <div className="ml-auto">
        {isSaving ? (
          <Badge variant="secondary" className="gap-1 text-xs font-normal">
            <Loader2 className="h-3 w-3 animate-spin" />
            {isCompact ? <span className="sr-only">Saving...</span> : "Saving..."}
          </Badge>
        ) : isDirty ? (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700"
          >
            <AlertCircle className="h-3 w-3" />
            {isCompact ? <span className="sr-only">Unsaved</span> : "Unsaved"}
          </Badge>
        ) : lastSaved ? (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal text-green-600 dark:text-green-400 border-green-300 dark:border-green-700"
          >
            <Check className="h-3 w-3" />
            {isCompact ? <span className="sr-only">Saved</span> : "Saved"}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
