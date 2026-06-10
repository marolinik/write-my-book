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
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { GraduatedFocus } from "./graduated-focus";
import type { FocusLevel } from "./graduated-focus";
import { AmbientSoundscape } from "./ambient-soundscape";
import { ReadAloud } from "./read-aloud";

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
}

interface ToolbarButtonProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, label, isActive, onClick }: ToolbarButtonProps) {
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
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// Overflow threshold: below this width, secondary groups collapse into dropdown
const OVERFLOW_THRESHOLD = 650;

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
  showAnnotations?: boolean;
  onToggleAnnotations?: () => void;
  onInlineEdit?: () => void;
  splitMode?: boolean;
  onToggleSplit?: () => void;
  showFloatingInput?: boolean;
  onToggleFloatingInput?: () => void;
  ghostTextEnabled?: boolean;
  onToggleGhostText?: () => void;
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
          onClick={() => ctx.editor.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          icon={<Italic className="h-4 w-4" />}
          label="Italic (Ctrl+I)"
          isActive={ctx.editor.isActive("italic")}
          onClick={() => ctx.editor.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          icon={<Underline className="h-4 w-4" />}
          label="Underline (Ctrl+U)"
          isActive={ctx.editor.isActive("underline")}
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
          onClick={() =>
            ctx.editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <ToolbarButton
          icon={<Heading2 className="h-4 w-4" />}
          label="Heading 2"
          isActive={ctx.editor.isActive("heading", { level: 2 })}
          onClick={() =>
            ctx.editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarButton
          icon={<Heading3 className="h-4 w-4" />}
          label="Heading 3"
          isActive={ctx.editor.isActive("heading", { level: 3 })}
          onClick={() =>
            ctx.editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        />
      </>
    ),
    renderDropdownItems: () => null,
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
          onClick={() => ctx.editor.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          icon={<ListOrdered className="h-4 w-4" />}
          label="Ordered List"
          isActive={ctx.editor.isActive("orderedList")}
          onClick={() => ctx.editor.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          icon={<Quote className="h-4 w-4" />}
          label="Blockquote"
          isActive={ctx.editor.isActive("blockquote")}
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
          Bullet List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="mr-2 h-4 w-4" />
          Ordered List
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().toggleBlockquote().run()}>
          <Quote className="mr-2 h-4 w-4" />
          Blockquote
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
          Undo
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => ctx.editor.chain().focus().redo().run()}>
          <Redo className="mr-2 h-4 w-4" />
          Redo
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
          onClick={ctx.onToggleFocusMode}
        />
        <GraduatedFocus
          currentLevel={ctx.focusLevel}
          onChange={ctx.onFocusLevelChange}
          onEnterImmersive={ctx.onEnterImmersive}
        />
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
            onClick={ctx.onToggleGhostText}
          />
        )}
        {ctx.onToggleFloatingInput && (
          <ToolbarButton
            icon={<MessageCircle className="h-4 w-4" />}
            label="Agent Quick Chat"
            isActive={ctx.showFloatingInput}
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
        {/* Graduated focus levels survive overflow as flat menu items */}
        {ctx.onFocusLevelChange &&
          FOCUS_LEVEL_MENU_ITEMS.map(({ level, label }) => (
            <DropdownMenuItem
              key={level}
              onClick={() => ctx.onFocusLevelChange?.(level)}
            >
              {ctx.focusLevel === level ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <span className="mr-2 inline-block h-4 w-4" />
              )}
              Focus: {label}
            </DropdownMenuItem>
          ))}
        {ctx.onEnterImmersive && (
          <DropdownMenuItem onClick={ctx.onEnterImmersive}>
            <Maximize2 className="mr-2 h-4 w-4" />
            Immersive Mode
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

  // --- Primary: panels always inline ---
  {
    id: "panels",
    priority: "primary",
    label: "Panels",
    render: (ctx) => (
      <>
        {ctx.onToggleAnnotations && (
          <ToolbarButton
            icon={<Highlighter className="h-4 w-4" />}
            label="Toggle Annotations"
            isActive={ctx.showAnnotations}
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
                aria-label="Toggle Findings"
              >
                <PenTool className="h-4 w-4" />
                {!!ctx.pendingFindingsCount && ctx.pendingFindingsCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground px-0.5">
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
        {ctx.onToggleHistory && (
          <ToolbarButton
            icon={<History className="h-4 w-4" />}
            label="Version History"
            isActive={ctx.showHistory}
            onClick={ctx.onToggleHistory}
          />
        )}
      </>
    ),
    renderDropdownItems: () => null,
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
}: EditorToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [showOverflow, setShowOverflow] = useState(false);

  // ResizeObserver to detect container width and toggle overflow mode
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setShowOverflow(width < OVERFLOW_THRESHOLD);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!editor) return null;

  const ctx: ToolbarGroupContext = {
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
    showAnnotations,
    onToggleAnnotations,
    onInlineEdit,
    splitMode,
    onToggleSplit,
    showFloatingInput,
    onToggleFloatingInput,
    ghostTextEnabled,
    onToggleGhostText,
  };

  const primaryGroups = TOOLBAR_GROUPS.filter((g) => g.priority === "primary");
  const secondaryGroups = TOOLBAR_GROUPS.filter(
    (g) => g.priority === "secondary"
  );

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
      className="flex items-center gap-0.5 border-b px-2 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10"
    >
      {/* Primary groups: always inline */}
      {renderInlineGroups(primaryGroups)}

      {/* Secondary groups: inline when wide, dropdown when narrow */}
      {!showOverflow ? (
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
              {secondaryGroups.map((group, index) => {
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
          the AudioContext/speech. Primary pane only (split view). */}
      {paneId !== "secondary" && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <AmbientSoundscape />
          <ReadAloud text={editor.getText()} />
        </>
      )}

      {/* Save indicator badge -- pushed to the right */}
      <div className="ml-auto">
        {isSaving ? (
          <Badge variant="secondary" className="gap-1 text-xs font-normal">
            <Loader2 className="h-3 w-3 animate-spin" />
            Saving...
          </Badge>
        ) : isDirty ? (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700"
          >
            <AlertCircle className="h-3 w-3" />
            Unsaved
          </Badge>
        ) : lastSaved ? (
          <Badge
            variant="outline"
            className="gap-1 text-xs font-normal text-green-600 dark:text-green-400 border-green-300 dark:border-green-700"
          >
            <Check className="h-3 w-3" />
            Saved
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
