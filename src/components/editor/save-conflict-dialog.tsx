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
import {
  useSaveChapterContent,
  useSaveDocumentContent,
} from "@/hooks/use-documents";
import { ApiError } from "@/lib/api-client";
import { deleteDraft } from "@/lib/offline/draft-store";
import { DiffView } from "./diff-view";
import { getMarkdownFromEditor } from "./editor-utils";

interface SaveConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookId: string;
  chapterId: string;
  paneId: string;
  editor: Editor | null;
  /**
   * When set, the dialog resolves a *document* (story bible, architecture,
   * series doc) conflict via the documents PATCH route instead of the
   * chapter-content route. Chapter behaviour is byte-identical when omitted.
   */
  documentId?: string;
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
  documentId,
}: SaveConflictDialogProps) {
  const saveConflict = useEditorPaneStore(paneId, (s) => s.saveConflict);
  // Both hooks are called unconditionally (rules of hooks); only the one
  // matching the target is ever invoked. In chapter mode documentId is absent
  // so the document hook's URL is never fetched.
  const chapterSave = useSaveChapterContent(bookId, chapterId);
  const documentSave = useSaveDocumentContent(bookId, documentId ?? "");
  const isDocument = !!documentId;
  const noun = isDocument ? "Document" : "Chapter";
  /** Unified stamped save returning the new numeric version. */
  const saveResolved = (args: {
    markdown: string;
    expectedVersion?: number;
    changeSource?: string;
  }): Promise<{ version: number }> =>
    isDocument
      ? documentSave.mutateAsync({
          content: args.markdown,
          expectedVersion: args.expectedVersion,
          changeSource: args.changeSource,
        })
      : chapterSave.mutateAsync({
          markdown: args.markdown,
          expectedVersion: args.expectedVersion,
          changeSource: args.changeSource,
        });
  const [isResolving, setIsResolving] = useState(false);

  // Local markdown snapshot — recomputed each time the dialog opens
  const localMarkdown = useMemo(
    () => (open && editor ? getMarkdownFromEditor(editor) : ""),
    [open, editor]
  );

  if (!saveConflict) return null;

  const paneStore = getOrCreatePaneStore(paneId);

  /**
   * Drop the crash-safety drafts once the conflict is explicitly resolved —
   * the legacy localStorage snapshot and THIS TAB's IDB buffer row.
   * onlyIfMine is load-bearing: another tab's live offline draft sharing
   * this chapterId key is by definition NOT settled by this dialog, and
   * that tab's hash-skip means it would never rewrite a row it doesn't
   * know was deleted.
   */
  const clearConflictDraft = () => {
    // Document conflicts have no offline crash-draft (that machinery is
    // chapter-only); just clear the pane's draft stamp.
    if (!isDocument) {
      try {
        localStorage.removeItem(`wmb-conflict-draft-${chapterId}`);
      } catch {
        // localStorage unavailable — best effort
      }
      void deleteDraft(chapterId, { onlyIfMine: true });
    }
    paneStore.getState().setDraftSavedAt(null);
  };

  /** Re-save local content stamped with the server's version (CAS passes). */
  const handleKeepMine = async () => {
    if (!editor) return;
    setIsResolving(true);
    const md = getMarkdownFromEditor(editor);
    paneStore.getState().setSaving(true);

    try {
      const res = await saveResolved({
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
        toast.warning(`${noun} changed again`, {
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
      const backup = await saveResolved({
        markdown: getMarkdownFromEditor(editor),
        changeSource: "conflict-backup",
      });

      // 2) Guarded save returning live content to the server version,
      //    stamped against the backup so a concurrent writer still 409s.
      const res = await saveResolved({
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
          <DialogTitle>{noun} changed outside this editor</DialogTitle>
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
