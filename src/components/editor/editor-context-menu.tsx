"use client";

import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import {
  Expand,
  Shrink,
  RefreshCw,
  Sun,
  MessageCircle,
  SparklesIcon,
  PenLineIcon,
  ZapIcon,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useAgentUIStore } from "@/stores/agent-ui-store";

interface EditorContextMenuProps {
  children: React.ReactNode;
  bookId: string;
  editor: Editor | null;
  onInlineEdit: (instruction: string) => void;
}

export function EditorContextMenu({
  children,
  bookId,
  editor,
  onInlineEdit,
}: EditorContextMenuProps) {
  const openWithMessage = useAgentUIStore((s) => s.openWithMessage);

  const getSelectedText = useCallback((): string => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    if (from === to) return "";
    return editor.state.doc.textBetween(from, to, "\n");
  }, [editor]);

  const handleAskCoach = useCallback(() => {
    const selectedText = getSelectedText();
    if (selectedText.trim()) {
      openWithMessage(bookId, `About this passage:\n\n"${selectedText}"`);
    } else {
      openWithMessage(bookId, "I have a question about my writing.");
    }
  }, [getSelectedText, openWithMessage, bookId]);

  const hasSelection = editor
    ? editor.state.selection.from !== editor.state.selection.to
    : false;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {hasSelection && (
          <>
            <ContextMenuItem
              onClick={() =>
                onInlineEdit(
                  "Expand this passage with more detail and description"
                )
              }
            >
              <Expand className="size-4" />
              Expand this passage
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                onInlineEdit(
                  "Make this more concise while preserving meaning"
                )
              }
            >
              <Shrink className="size-4" />
              Tighten this
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                onInlineEdit(
                  "Rewrite this passage in a different point of view"
                )
              }
            >
              <RefreshCw className="size-4" />
              Change POV
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                onInlineEdit(
                  "Add rich sensory details (sight, sound, smell, touch, taste)"
                )
              }
            >
              <Sun className="size-4" />
              Add sensory details
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                onInlineEdit(
                  "Increase the emotional tension and stakes"
                )
              }
            >
              <ZapIcon className="size-4" />
              Increase tension
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() =>
                onInlineEdit(
                  "Show this through action and dialogue instead of telling"
                )
              }
            >
              <PenLineIcon className="size-4" />
              Show, don&apos;t tell
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              onClick={() => onInlineEdit("")}
            >
              <SparklesIcon className="size-4" />
              Describe your change...
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onClick={handleAskCoach}>
          <MessageCircle className="size-4" />
          Ask Writing Coach{hasSelection ? " about this" : ""}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
