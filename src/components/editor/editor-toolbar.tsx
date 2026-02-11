"use client";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface EditorToolbarProps {
  editor: Editor | null;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  showHistory?: boolean;
  onToggleHistory?: () => void;
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
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function EditorToolbar({
  editor,
  focusMode,
  onToggleFocusMode,
  showHistory,
  onToggleHistory,
}: EditorToolbarProps) {
  if (!editor) return null;

  return (
    <div className="flex items-center gap-0.5 border-b px-2 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
      {/* Text formatting */}
      <ToolbarButton
        icon={<Bold className="h-4 w-4" />}
        label="Bold (Ctrl+B)"
        isActive={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        icon={<Italic className="h-4 w-4" />}
        label="Italic (Ctrl+I)"
        isActive={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        icon={<Underline className="h-4 w-4" />}
        label="Underline (Ctrl+U)"
        isActive={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Headings */}
      <ToolbarButton
        icon={<Heading1 className="h-4 w-4" />}
        label="Heading 1"
        isActive={editor.isActive("heading", { level: 1 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      />
      <ToolbarButton
        icon={<Heading2 className="h-4 w-4" />}
        label="Heading 2"
        isActive={editor.isActive("heading", { level: 2 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      />
      <ToolbarButton
        icon={<Heading3 className="h-4 w-4" />}
        label="Heading 3"
        isActive={editor.isActive("heading", { level: 3 })}
        onClick={() =>
          editor.chain().focus().toggleHeading({ level: 3 }).run()
        }
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Lists & blocks */}
      <ToolbarButton
        icon={<List className="h-4 w-4" />}
        label="Bullet List"
        isActive={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<ListOrdered className="h-4 w-4" />}
        label="Ordered List"
        isActive={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        icon={<Quote className="h-4 w-4" />}
        label="Blockquote"
        isActive={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        icon={<Minus className="h-4 w-4" />}
        label="Scene Break"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* Editing */}
      <ToolbarButton
        icon={<Undo className="h-4 w-4" />}
        label="Undo (Ctrl+Z)"
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        icon={<Redo className="h-4 w-4" />}
        label="Redo (Ctrl+Shift+Z)"
        onClick={() => editor.chain().focus().redo().run()}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarButton
        icon={<Focus className="h-4 w-4" />}
        label="Focus Mode"
        isActive={focusMode}
        onClick={onToggleFocusMode}
      />

      {onToggleHistory && (
        <>
          <Separator orientation="vertical" className="mx-1 h-6" />
          <ToolbarButton
            icon={<History className="h-4 w-4" />}
            label="Version History"
            isActive={showHistory}
            onClick={onToggleHistory}
          />
        </>
      )}
    </div>
  );
}
