"use client";

import { useMemo, useState } from "react";
import type { Editor } from "@tiptap/react";
import { EditorState } from "@tiptap/pm/state";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useEditorPaneStore,
  getOrCreatePaneStore,
} from "@/stores/editor-store";
import { useSaveChapterContent } from "@/hooks/use-documents";
import { ApiError } from "@/lib/api-client";
import { DiffView } from "./diff-view";
import { getMarkdownFromEditor } from "./editor-utils";

interface SaveConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  chapterId: string;
  paneId: string;
  editor: Editor | null;
}

/**
 * Resolves an optimistic-lock save conflict: the chapter was changed outside
 * this editor (agent rewrite, import, another tab) while local edits were
 * pending. Shows a diff (server version vs local editor content) and lets the
 * writer choose. Never opened automatically — only via the toast action or
 * the status-bar chip, so typing is never interrupted.
 */
export function SaveConflictDialog({
  open,
  onOpenChange,
  bookId,
  chapterId,
  paneId,
  editor,
}: SaveConflictDialogProps) {
  const saveConflict = useEditorPaneStore(paneId, (s) => s.saveConflict);
  const saveMutation = useSaveChapterContent(bookId, chapterId);
  const [isResolving, setIsResolving] = useState(false);

  // Local markdown snapshot — recomputed each time the dialog opens
  const localMarkdown = useMemo(
    () => (open && editor ? getMarkdownFromEditor(editor) : ""),
    [open, editor]
  );

  if (!saveConflict) return null;

  const paneStore = getOrCreatePaneStore(paneId);

  /** Drop the crash-safety draft once the conflict is explicitly resolved. */
  const clearConflictDraft = () => {
    try {
      localStorage.removeItem(`wmb-conflict-draft-${chapterId}`);
    } catch {
      // localStorage unavailable — best effort
    }
  };

  /** Re-save local content stamped with the server's version (CAS passes). */
  const handleKeepMine = async () => {
    if (!editor) return;
    setIsResolving(true);
    const md = getMarkdownFromEditor(editor);
    paneStore.getState().setSaving(true);

    try {
      const res = await saveMutation.mutateAsync({
        markdown: md,
        expectedVersion: saveConflict.serverVersion,
      });
      paneStore.getState().setDocumentVersion(res.version);
      paneStore.getState().setLastSaved(new Date());
      paneStore.getState().setSaveConflict(null);
      clearConflictDraft();
      onOpenChange(false);
      toast.success("Your version saved", {
        description: "The other version is preserved in version history.",
      });
    } catch (error) {
      paneStore.getState().setSaving(false);
      if (error instanceof ApiError && error.status === 409) {
        // The chapter moved again while the dialog was open — refresh the
        // conflict so the diff shows the newest server state.
        const body = error.body as {
          currentVersion?: number;
          serverContent?: string;
        } | null;
        if (
          typeof body?.currentVersion === "number" &&
          typeof body?.serverContent === "string"
        ) {
          paneStore.getState().setSaveConflict({
            serverContent: body.serverContent,
            serverVersion: body.currentVersion,
          });
        }
        toast.warning("Chapter changed again", {
          description: "The diff has been updated — please review once more.",
        });
      } else {
        toast.error("Failed to save your version", {
          description:
            error instanceof Error ? error.message : "Please try again.",
        });
      }
    } finally {
      setIsResolving(false);
    }
  };

  /**
   * Replace editor content with the server version (explicit choice only).
   * The local unsaved words are first snapshotted as an unguarded version so
   * the "the other version stays in version history" promise holds for this
   * choice too — without it, everything typed since the last successful
   * autosave would be irrecoverably destroyed.
   */
  const handleLoadTheirs = async () => {
    if (!editor) return;
    setIsResolving(true);

    try {
      // 1) Unguarded backup save (no expectedVersion → CAS skipped): the
      //    local words become a recoverable DocumentVersion.
      const backup = await saveMutation.mutateAsync({
        markdown: getMarkdownFromEditor(editor),
        changeSource: "conflict-backup",
      });

      // 2) Guarded save returning live content to the server version,
      //    stamped against the backup so a concurrent writer still 409s.
      const res = await saveMutation.mutateAsync({
        markdown: saveConflict.serverContent,
        expectedVersion: backup.version,
        changeSource: "conflict-resolve",
      });

      editor.commands.setContent(saveConflict.serverContent, {
        emitUpdate: false,
      });

      // Reset undo history exactly as the chapter-load effect does, so Ctrl+Z
      // cannot resurrect the replaced content into a confusing half-state.
      const freshState = EditorState.create({
        doc: editor.state.doc,
        plugins: editor.state.plugins,
      });
      editor.view.updateState(freshState);

      paneStore.getState().setDocumentVersion(res.version);
      paneStore.getState().markClean();
      paneStore.getState().setSaveConflict(null);
      clearConflictDraft();
      onOpenChange(false);
    } catch (error) {
      // Words stay safe: editor content and conflict state are untouched.
      toast.error("Could not back up your edits — nothing was changed", {
        description:
          error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Chapter changed outside this editor</DialogTitle>
          <DialogDescription>
            Another writer (an agent run, import, or another tab) saved version{" "}
            v{saveConflict.serverVersion} while you had unsaved edits here.
            Green lines are yours; red lines are theirs. Whichever you choose,
            the other version stays in version history.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="flex-1 mt-2 border rounded-md">
          <DiffView
            content={localMarkdown}
            oldContent={saveConflict.serverContent}
          />
        </ScrollArea>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isResolving}
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleLoadTheirs}
            disabled={isResolving || !editor}
          >
            Load theirs
          </Button>
          <Button onClick={handleKeepMine} disabled={isResolving || !editor}>
            Keep mine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
