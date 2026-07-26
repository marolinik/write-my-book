"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import { EditorState } from "@tiptap/pm/state";
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react";
import {
  useEditorPaneStore,
  getOrCreatePaneStore,
} from "@/stores/editor-store";
import { useActiveEditorStore } from "@/stores/active-editor-store";
import {
  useChapterContent,
  useSaveChapterContent,
} from "@/hooks/use-documents";
import { useFindings } from "@/hooks/use-editorial";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useDraftBuffer } from "@/hooks/use-draft-buffer";
import { applyRecoveryDecision } from "./draft-recovery";
import { ApiError, isNetworkError } from "@/lib/api-client";
import { useServerSaveFlush } from "./save-flush";
import { cn, countWords } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { InlineEditPopup } from "./inline-edit-popup";
import { FindingsSheet } from "./findings-sheet";
import { LiveAnnouncer } from "@/components/editor/live-announcer";
import {
  useFindingNavigation,
  ownsEditorShortcut,
  EDITOR_PANE_ATTR,
} from "./use-finding-navigation";
import { EditorContextMenu } from "./editor-context-menu";
import { EditorToolbar } from "./editor-toolbar";
import { EditorStatusBar } from "./editor-status-bar";
import { SaveConflictDialog } from "./save-conflict-dialog";
import { FindReplaceDialog } from "./find-replace-dialog";
import { VersionHistoryPanel } from "./version-history-panel";
import { VersionHistorySheet } from "./version-history-sheet";
import { AmbientSeriesPanel } from "./ambient-series-panel";
import { EditorFindingsPanel } from "./editor-findings-panel";
import { AnnotationTooltip } from "./annotation-tooltip";
import { ChapterContextHeader } from "./chapter-context-header";
import { GutterMarkers } from "./gutter-markers";
import { FloatingAgentInput } from "./floating-agent-input";
import { AIGhostText } from "./ai-ghost-text";
import { ImmersiveFocusMode } from "./immersive-focus-mode";
import {
  createImmersiveSyncScheduler,
  type ImmersiveSyncScheduler,
} from "./immersive-sync-scheduler";
import { getFocusLevelClasses } from "./graduated-focus";
import { PacingHeatmap } from "./pacing-heatmap";
import { ProseSyntaxHighlight } from "./prose-syntax-highlight";
import { TypewriterMode } from "./typewriter-mode";
import { OverlappingFindingsPopover } from "./overlapping-findings-popover";
import {
  AnnotationExtension,
  annotationPluginKey,
  countAnnotations,
  findTextPositions,
} from "./annotation-extension";
import type { AnnotationType } from "./annotation-extension";
import type { FindingItem } from "@/hooks/use-editorial";
import { useApplyFinding, useDismissFinding } from "@/hooks/use-editorial";
import { useEditorialStore } from "@/stores/editorial-store";
import { getMarkdownFromEditor, sanitizeUnicode, useIsLg, findingsToAnnotations, createEditorExtensions, classifyFindingFreshness, getEditorContentAttributes, type TooltipState } from "./editor-utils";
import { useContinuityScan, useIdleContinuityScan } from "@/hooks/use-continuity-scan";
import { ContinuityIndicator } from "./continuity-indicator";
import { continuityFlagsToAnnotations } from "@/lib/continuity/flag-annotations";

// ProseMirror keeps the caret this clear of the scroll-container edge — on
// phones the virtual keyboard occludes the lower half of the viewport.
const CARET_SCROLL_CLEARANCE_PX = 80;
// Editor shortcuts (F2/F8) must not fire while focus is inside a form field
// or dialog. The contenteditable is intentionally NOT matched — it is the
// primary context for both shortcuts.
const SHORTCUT_GUARD_SELECTOR = 'input, textarea, [role="dialog"]';

// Immersive autosave sync cadence (S10): route active immersive editing into
// the main editor's hardened CAS autosave on a short trailing debounce, with a
// max-wait so unbroken typing still flushes at least this often — matching the
// main editor's ~2s save cadence instead of the old 30s periodic sync.
const IMMERSIVE_SYNC_DEBOUNCE_MS = 1200;
const IMMERSIVE_SYNC_MAX_WAIT_MS = 2500;

interface ChapterNavItem {
  id: string;
  chapterNumber: number;
  title: string | null;
  status: string;
}

interface ManuscriptEditorProps {
  bookId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle?: string;
  chapterStatus?: string;
  bookName?: string;
  bookLanguage?: string;
  allChapters?: ChapterNavItem[];
  paneId?: string;
  bookInSeries?: boolean;
}

// ── Component ────────────────────────────────────────────────

export function ManuscriptEditor({
  bookId,
  chapterId,
  chapterNumber,
  chapterTitle,
  chapterStatus,
  bookName,
  bookLanguage,
  allChapters,
  paneId = "primary",
  bookInSeries,
}: ManuscriptEditorProps) {
  const isPrimary = paneId === "primary";

  // Per-pane store selectors
  const paneBookId = useEditorPaneStore(paneId, (s) => s.bookId);
  const paneChapterId = useEditorPaneStore(paneId, (s) => s.chapterId);
  const paneDocumentId = useEditorPaneStore(paneId, (s) => s.documentId);
  const isDirty = useEditorPaneStore(paneId, (s) => s.isDirty);
  const isSaving = useEditorPaneStore(paneId, (s) => s.isSaving);
  const lastSaved = useEditorPaneStore(paneId, (s) => s.lastSaved);
  const saveConflict = useEditorPaneStore(paneId, (s) => s.saveConflict);
  const draftSavedAt = useEditorPaneStore(paneId, (s) => s.draftSavedAt);
  const lastSaveErrorKind = useEditorPaneStore(paneId, (s) => s.lastSaveErrorKind);
  const focusMode = useEditorPaneStore(paneId, (s) => s.focusMode);
  const focusLevel = useEditorPaneStore(paneId, (s) => s.focusLevel);
  const ghostTextEnabled = useEditorPaneStore(paneId, (s) => s.ghostTextEnabled);
  const showFindings = useEditorPaneStore(paneId, (s) => s.showFindings);
  const showSeriesContext = useEditorPaneStore(paneId, (s) => s.showSeriesContext);
  const showAnnotations = useEditorPaneStore(paneId, (s) => s.showAnnotations);
  const showFloatingInput = useEditorPaneStore(paneId, (s) => s.showFloatingInput);

  // Per-pane store actions
  const paneStore = getOrCreatePaneStore(paneId);
  const storeActions = paneStore.getState();

  // View-level state from active-editor-store
  const splitMode = useActiveEditorStore((s) => s.splitMode);
  const setSplitMode = useActiveEditorStore((s) => s.setSplitMode);
  const isMobile = useIsMobile();
  const router = useRouter();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Consecutive autosave failures (non-409) — drives exponential backoff so a
  // permanently failing save (400/401/500/offline) doesn't hammer the route
  // every ~2s via the isSaving effect-dep re-fire.
  const saveFailuresRef = useRef(0);
  const contentLoadedRef = useRef(false);
  // Offline resilience (Tier 2.2): connectivity in a ref so saveContent's
  // identity doesn't churn on connectivity flips (spec R5), plus once-per-load
  // guards for draft recovery and the offline toast.
  const isOnline = useOnlineStatus();
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;
  const prevOnlineRef = useRef(isOnline);
  const recoveryCheckedRef = useRef(false);
  const offlineToastShownRef = useRef(false);
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const editorAreaRef = useRef<HTMLDivElement>(null);
  // Pane column root — split-view shortcut ownership + scoped focus restore.
  const paneRootRef = useRef<HTMLDivElement>(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showSaveConflict, setShowSaveConflict] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showInlineEdit, setShowInlineEdit] = useState(false);
  const [inlineEditInstruction, setInlineEditInstruction] = useState<string | undefined>(undefined);
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const [overlappingState, setOverlappingState] = useState<{
    findings: FindingItem[];
    rect: DOMRect;
  } | null>(null);
  const [showFloatingAgentInput, setShowFloatingAgentInput] = useState(false);
  // Per-edit activity counter for the continuity idle-scan trigger — isDirty
  // is sticky (stays true across many keystrokes) so it can't debounce a scan
  // per-edit; this counter changes on every onUpdate call instead.
  const [editTick, setEditTick] = useState(0);
  // Immersive focus mode: content snapshot on enter; edits stream back into
  // tiptap through a debounced CAS sync during editing (S10) and on exit — not
  // per-keystroke setContent, which would churn undo history and markdown.
  const [immersive, setImmersive] = useState(false);
  const [immersiveContent, setImmersiveContent] = useState("");
  const immersiveHtmlRef = useRef("");
  // Mirror immersive state into a ref so the async save callback reads the
  // value at 409-resolution time, not at callback creation time
  const immersiveRef = useRef(false);
  immersiveRef.current = immersive;
  const isLg = useIsLg();

  // Findings for current chapter
  const { data: findingsData } = useFindings(bookId, { chapterNumber });
  const findings = findingsData?.findings ?? [];
  const pendingFindingsCount = findings.filter(
    (f) => f.status === "pending"
  ).length;

  // Auto-open findings panel when pending findings exist — desktop only.
  // Below lg the panel is a modal Sheet and must never self-summon
  // mid-typing; the toolbar badge is the affordance there (spec §1.2).
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!isLg) return;
    if (pendingFindingsCount > 0 && !autoOpenedRef.current && !showFindings) {
      paneStore.getState().toggleFindings();
      autoOpenedRef.current = true;
    }
  }, [pendingFindingsCount, isLg]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutations for tooltip accept/reject
  const applyMutation = useApplyFinding(bookId);
  const dismissMutation = useDismissFinding(bookId);

  // Live continuity net (Tier 4.4): book-wide scan, current-chapter inline
  // flags + [Go to Ch N] / [Intentional] actions via the tooltip.
  const {
    flags: continuityFlags,
    scanning: continuityScanning,
    scan: continuityScan,
    markIntentional,
  } = useContinuityScan(bookId);

  // Build annotations from findings + this chapter's continuity flags
  const annotations = useMemo(
    () =>
      showAnnotations
        ? [
            ...findingsToAnnotations(findings),
            ...continuityFlagsToAnnotations(continuityFlags, chapterNumber),
          ]
        : [],
    [findings, showAnnotations, continuityFlags, chapterNumber]
  );

  const annotationCounts = useMemo(
    () => (showAnnotations ? countAnnotations(annotations) : null),
    [annotations, showAnnotations]
  );

  // Handle annotation click → show tooltip (single) or overlapping popover (multiple)
  const handleAnnotationClick = useCallback(
    (
      annotationIds: string[],
      annotationTypes: AnnotationType[],
      rect: DOMRect,
      _event: MouseEvent
    ) => {
      // Close any existing overlapping popover
      setOverlappingState(null);

      // If multiple annotations at click position, show overlapping popover
      if (annotationIds.length > 1) {
        const overlappingFindings = annotationIds
          .map((id) => findings.find((f) => f.id === id.replace("finding-", "")))
          .filter(Boolean) as FindingItem[];
        if (overlappingFindings.length > 1) {
          setOverlappingState({ findings: overlappingFindings, rect });
          return;
        }
      }

      // Single annotation — show tooltip as before
      const annotationId = annotationIds[0];
      const annotationType = annotationTypes[0];
      if (!annotationId) return;

      // Guard: only strip the `finding-` prefix off ids that actually carry
      // it — a `continuity-<uuid>` id must pass through untouched so the
      // tooltip render site can resolve it against live continuity flags.
      const findingId = annotationId.startsWith("finding-")
        ? annotationId.replace("finding-", "")
        : annotationId;
      const finding = findings.find((f) => f.id === findingId) ?? null;

      // Signal the findings panel to scroll to and highlight this card
      if (finding) {
        useEditorialStore.getState().setHighlightedFinding(findingId);
        useEditorialStore.getState().setSelectedFinding(findingId);
      }

      setTooltipState({ annotationId, annotationType, rect, finding });
    },
    [findings]
  );

  const { data: chapterData, isLoading } = useChapterContent(
    bookId,
    chapterId
  );

  const saveMutation = useSaveChapterContent(bookId, chapterId);
  const saveMutationRef = useRef(saveMutation);
  saveMutationRef.current = saveMutation;

  // Prev/next chapter navigation
  const currentIdx = allChapters?.findIndex((ch) => ch.id === chapterId) ?? -1;
  const prevChapter = currentIdx > 0 ? allChapters![currentIdx - 1] : null;
  const nextChapter =
    allChapters && currentIdx >= 0 && currentIdx < allChapters.length - 1
      ? allChapters[currentIdx + 1]
      : null;

  // Accessible name for the contenteditable (spec §2) — includes the chapter
  // number/title so AT users hear which chapter they are editing.
  const editorAriaLabel = chapterTitle
    ? `Editing chapter ${chapterNumber}: ${chapterTitle}`
    : `Editing chapter ${chapterNumber}`;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions({
      placeholder: "Start writing your chapter...",
      onAnnotationClick: handleAnnotationClick,
    }),
    editorProps: {
      attributes: getEditorContentAttributes(focusMode, editorAriaLabel),
      scrollThreshold: CARET_SCROLL_CLEARANCE_PX,
      scrollMargin: CARET_SCROLL_CLEARANCE_PX,
    },
    onUpdate: () => {
      // TipTap is sole content source — just mark dirty in the pane store
      paneStore.getState().markDirty();
      // Per-edit activity signal for the continuity idle-scan debounce.
      setEditTick((n) => n + 1);
    },
  });

  // Keep ref in sync so callbacks can access editor without circular deps
  editorRef.current = editor;

  // Crash-safety draft persistence — IDB buffer (2s ticks + unload flush) plus
  // the synchronous per-keystroke localStorage mirror (D-24), and
  // recovery-on-load. Declared after useEditor so the hook can subscribe to
  // the live instance's update events. Server writes stay on the stamped PUT;
  // the buffer never saves anything itself.
  const { bufferNow, clearDraft, checkRecovery } = useDraftBuffer({
    paneStore,
    editorRef,
    editor,
    paneChapterId,
    bookId,
    onBufferWrite: (result) => {
      paneStore.getState().setDraftSavedAt(result.ok ? result.at : null);
    },
  });

  // Live continuity net: scan on chapter switch + ~20s after the last edit.
  useIdleContinuityScan({ chapterNumber, activityKey: editTick, scan: continuityScan });

  // Update editor class when focus mode changes. setOptions replaces the
  // whole editorProps object, so the scroll clearances must ride along.
  useEffect(() => {
    if (editor) {
      editor.setOptions({
        editorProps: {
          attributes: getEditorContentAttributes(focusMode, editorAriaLabel),
          scrollThreshold: CARET_SCROLL_CLEARANCE_PX,
          scrollMargin: CARET_SCROLL_CLEARANCE_PX,
        },
      });
    }
  }, [editor, focusMode, editorAriaLabel]);

  // Push annotations into the ProseMirror plugin when they change
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr.setMeta(annotationPluginKey, { annotations });
    editor.view.dispatch(tr);
  }, [editor, annotations]);

  // Toggle annotation visibility
  useEffect(() => {
    if (!editor) return;
    const tr = editor.state.tr.setMeta(annotationPluginKey, {
      enabled: showAnnotations,
    });
    editor.view.dispatch(tr);
  }, [editor, showAnnotations]);

  // Set chapter in pane store on mount; sync primary pane to active-editor-store
  useEffect(() => {
    paneStore.getState().setChapter(bookId, chapterId, chapterNumber);
    contentLoadedRef.current = false;
    saveFailuresRef.current = 0;
    recoveryCheckedRef.current = false;
    // Transient overlays belong to the previous chapter — a review tooltip
    // or popup surviving an in-place switch acts on the wrong document.
    setTooltipState(null);
    setOverlappingState(null);
    setShowInlineEdit(false);
    if (isPrimary) {
      useActiveEditorStore.getState().setActiveEditor(bookId, chapterId, chapterNumber);
    }
  }, [bookId, chapterId, chapterNumber, isPrimary, paneStore]);

  // Durable conflict affordance: toast with a Review action. The dialog is
  // NEVER auto-opened — typing must not be interrupted. (Declared before the
  // content-load effect — draft recovery surfaces conflicts during load.)
  const showConflictToast = useCallback(() => {
    toast.warning("Chapter changed outside this editor", {
      description:
        "Another writer (agent, import, or tab) saved a newer version. Your words are kept in this editor — review to resume saving.",
      action: {
        label: "Review",
        onClick: () => setShowSaveConflict(true),
      },
    });
  }, []);

  // Load content into editor when data arrives. Also clean-resync: adopt
  // first-party server-side rewrites (finding apply/undo, version restore,
  // agent/import writes) when the pane has nothing at risk — otherwise the
  // next autosave would 409 with a false "another writer" conflict caused by
  // buttons inside this very view.
  useEffect(() => {
    if (!chapterData || !editor) return;

    const paneState = paneStore.getState();
    const isInitialLoad = !contentLoadedRef.current;
    const isCleanResync =
      !isInitialLoad &&
      typeof chapterData.version === "number" &&
      chapterData.version !== paneState.documentVersion &&
      !paneState.isDirty &&
      !paneState.isSaving &&
      !paneState.saveConflict;

    if (!isInitialLoad && !isCleanResync) return;

    // Set content without emitting update (prevents unnecessary re-renders)
    editor.commands.setContent(chapterData.markdown || "", { emitUpdate: false });

    // Reset undo history: create fresh state with current doc but empty history.
    // This prevents Ctrl+Z from erasing pre-existing chapter content.
    const freshState = EditorState.create({
      doc: editor.state.doc,
      plugins: editor.state.plugins,
    });
    editor.view.updateState(freshState);

    contentLoadedRef.current = true;
    paneStore.getState().markClean();

    // Stamp the loaded version for optimistic locking on autosave
    paneStore.getState().setDocumentVersion(chapterData.version ?? null);

    if (chapterData.documentId) {
      paneStore.getState().setDocumentId(chapterData.documentId);
      if (isPrimary) {
        useActiveEditorStore.getState().setActiveDocumentId(chapterData.documentId);
      }
    }

    if (isInitialLoad) {
      // If scrollToText was set before content loaded (e.g. navigating from editorial page),
      // trigger it now by re-setting the same value so the subscriber picks it up.
      const pendingScroll = paneStore.getState().scrollToText;
      if (pendingScroll) {
        // Small delay to let annotations render first
        setTimeout(() => paneStore.getState().setScrollToText(pendingScroll), 150);
      }
    }

    // Offline draft recovery — a tab that closed/crashed during an outage
    // left its words only in IndexedDB. Strictly once per chapter load;
    // guards and application semantics live in applyRecoveryDecision.
    if (isInitialLoad && !recoveryCheckedRef.current) {
      recoveryCheckedRef.current = true;
      const loadedChapterId = paneStore.getState().chapterId;
      const serverMarkdown = chapterData.markdown || "";
      const serverVersion = chapterData.version ?? null;
      if (loadedChapterId) {
        void checkRecovery(loadedChapterId, serverMarkdown, serverVersion).then(
          (decision) =>
            applyRecoveryDecision({
              decision,
              editorRef,
              paneStore,
              chapterId: loadedChapterId,
              serverMarkdown,
              serverVersion,
              onConflictToast: showConflictToast,
              bufferNow,
              clearDraft,
            })
        );
      }
    }
  }, [chapterData, editor, isPrimary, paneStore, checkRecovery, bufferNow, clearDraft, showConflictToast]);

  // Navigating away silently clears a pending conflict (setChapter resets it)
  // and would strand words typed after the conflict (autosave is suspended) —
  // confirm before in-editor navigation while that risk exists.
  const guardedNavigate = useCallback(
    (href: string) => {
      const s = paneStore.getState();
      if (s.saveConflict && s.isDirty) {
        const proceed = window.confirm(
          "This chapter has an unresolved save conflict and unsaved words. " +
            "Leaving now discards them from the editor (a local draft snapshot is kept). Leave anyway?"
        );
        if (!proceed) return;
      }
      router.push(href);
    },
    [paneStore, router]
  );

  // Auto-save with 2s debounce. `options.keepalive` is set ONLY by the D-133
  // unload flush (useServerSaveFlush) so the PUT can complete after teardown;
  // normal autosaves call this with no args and never carry keepalive.
  const saveContent = useCallback(async (options?: { keepalive?: boolean }) => {
    if (!editor) return;

    const md = getMarkdownFromEditor(editor);
    // Capture the target chapter at dispatch time from the STORE (not the
    // prop — the closure's chapterId prop can go stale after in-place route
    // param updates).
    const dispatchedChapterId = paneStore.getState().chapterId;
    const dispatchedEpoch = paneStore.getState().loadEpoch;
    const expectedVersion = paneStore.getState().documentVersion ?? undefined;
    paneStore.getState().setSaving(true);

    // Chapter switched while the save was in flight — the store now belongs
    // to another chapter; drop the result (the server write already landed on
    // the correct chapter's route via the mutation captured at dispatch).
    // The epoch guards the A→B→A case: same chapterId, but the pane was
    // reloaded in between — adopting this result would stamp a version the
    // re-loaded editor content doesn't correspond to.
    const isStale = () =>
      paneStore.getState().chapterId !== dispatchedChapterId ||
      paneStore.getState().loadEpoch !== dispatchedEpoch;

    // The words are durable on the server only up to the dispatched payload.
    // If the editor moved on during the PUT flight, the pane must STAY dirty:
    // setLastSaved force-clears isDirty, which would tear down the draft
    // buffer interval and leave the newest keystrokes with no durable copy —
    // while the status bar lies "Saved".
    const settleDirtiness = () => {
      const ed = editorRef.current;
      if (ed && !ed.isDestroyed && getMarkdownFromEditor(ed) !== md) {
        paneStore.getState().markDirty();
      }
    };

    try {
      const res = await saveMutationRef.current.mutateAsync({
        markdown: md,
        expectedVersion,
        keepalive: options?.keepalive,
      });
      if (isStale()) {
        paneStore.getState().setSaving(false);
        return;
      }
      saveFailuresRef.current = 0;
      paneStore.getState().setDocumentVersion(res.version);
      paneStore.getState().setLastSaved(new Date());
      paneStore.getState().setLastSaveErrorKind(null);
      // The dispatched words are on the server — this tab's IDB mirror is
      // garbage now (onlyIfMine: another tab's offline draft must survive).
      // Keystrokes that arrived during the flight re-mark dirty below, which
      // keeps the buffer interval alive to immediately re-persist them.
      if (dispatchedChapterId) {
        clearDraft(dispatchedChapterId);
        paneStore.getState().setDraftSavedAt(null);
      }
      settleDirtiness();
    } catch (error) {
      if (isStale()) {
        paneStore.getState().setSaving(false);
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        const body = error.body as {
          currentVersion?: number;
          serverContent?: string;
        } | null;

        if (
          typeof body?.currentVersion === "number" &&
          typeof body?.serverContent === "string"
        ) {
          // No-op conflict: the server already holds identical content
          // (e.g. another tab saved the same text). Adopt its version and
          // clear dirty — no UI. Both sides sanitized for symmetry.
          if (sanitizeUnicode(body.serverContent) === sanitizeUnicode(md)) {
            saveFailuresRef.current = 0;
            paneStore.getState().setDocumentVersion(body.currentVersion);
            paneStore.getState().setLastSaved(new Date());
            paneStore.getState().setLastSaveErrorKind(null);
            if (dispatchedChapterId) {
              clearDraft(dispatchedChapterId);
              paneStore.getState().setDraftSavedAt(null);
            }
            settleDirtiness();
            return;
          }

          // Real conflict: record it (suspends autosave; local words stay
          // safe in the editor) and surface a non-blocking toast. A 409
          // proves connectivity — clear any stale network-error state.
          saveFailuresRef.current = 0;
          paneStore.getState().setLastSaveErrorKind(null);
          paneStore.getState().setSaveConflict({
            serverContent: body.serverContent,
            serverVersion: body.currentVersion,
          });
          paneStore.getState().setSaving(false);

          // Crash/nav safety: snapshot the unsaved words — autosave is
          // suspended while the conflict is pending, so this draft is the
          // only persistence they have. Cleared on dialog resolution.
          if (dispatchedChapterId) {
            try {
              localStorage.setItem(
                `wmb-conflict-draft-${dispatchedChapterId}`,
                md
              );
            } catch {
              // localStorage unavailable/full — draft is best-effort
            }
          }

          // In immersive mode the toast/dialog would render under the
          // z-[100] overlay — defer surfacing to exitImmersive.
          if (!immersiveRef.current) {
            showConflictToast();
          }
          return;
        }
      }
      // Non-409 failure: count it for autosave backoff and surface a hint
      // once per failure streak. Network-level failures drive the
      // "Sync pending" indicator; the streak toast is suppressed offline
      // (the dedicated offline toast already covers it).
      saveFailuresRef.current += 1;
      paneStore
        .getState()
        .setLastSaveErrorKind(isNetworkError(error) ? "network" : "http");
      if (saveFailuresRef.current === 3 && isOnlineRef.current) {
        toast.error("Autosave is failing — check your connection.");
      }
      paneStore.getState().setSaving(false);
    }
  }, [editor, paneStore, showConflictToast, clearDraft]);

  useEffect(() => {
    if (!isDirty || !paneChapterId) return;
    // Guard against same-stamp overlap: a save scheduled while another is in
    // flight would carry the same expectedVersion and 409 against itself.
    // isSaving is a dep so this effect re-fires once the in-flight save lands.
    if (isSaving) return;
    // Suspend autosave while a conflict is unresolved — typing continues,
    // content stays safe in the editor, and the route isn't hammered.
    if (saveConflict) {
      // Refresh the crash/nav-safety draft so words typed after the conflict
      // survive tab close or navigation (best-effort, per effect re-run).
      const ed = editorRef.current;
      if (ed) {
        try {
          localStorage.setItem(
            `wmb-conflict-draft-${paneChapterId}`,
            getMarkdownFromEditor(ed)
          );
        } catch {
          // localStorage unavailable/full — draft is best-effort
        }
      }
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Exponential backoff on consecutive non-409 failures (2s, 4s, 8s, ...
    // capped at 60s) so a permanent 400/500/offline doesn't hammer the route
    // every ~2s; transient failures still self-heal.
    const delay = Math.min(2000 * 2 ** saveFailuresRef.current, 60_000);
    saveTimerRef.current = setTimeout(() => {
      saveContent();
    }, delay);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [isDirty, isSaving, saveConflict, paneChapterId, saveContent]);

  // Reconnect short-circuit: the backoff timer can sit at up to 60s — when
  // connectivity returns, save immediately through the normal stamped PUT
  // (a stale expectedVersion lands in the existing 409 machinery).
  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (wasOnline || !isOnline) return;

    // Reset the backoff streak unconditionally on reconnect — the failures
    // were the outage's. An early return below (e.g. a save mid-flight) must
    // not leave the next retry parked at the 60s cap.
    saveFailuresRef.current = 0;
    const s = paneStore.getState();
    if (!s.isDirty || s.saveConflict || s.isSaving) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void saveContent();
  }, [isOnline, paneStore, saveContent]);

  // One-time reassurance when going offline with unsaved words; re-arms on
  // reconnect so the next outage informs again.
  useEffect(() => {
    if (isOnline) {
      offlineToastShownRef.current = false;
      return;
    }
    if (isDirty && !offlineToastShownRef.current) {
      offlineToastShownRef.current = true;
      toast.info(
        "You're offline. Your words are kept on this device and will sync when you reconnect."
      );
    }
  }, [isOnline, isDirty]);

  // While a conflict is pending with unsaved words, nothing persists them to
  // the server (autosave is suspended) — same while offline or behind a dead
  // router (navigator.onLine true but saves failing at the network level).
  // Prompt before tab close/reload; the IDB draft is the safety net either
  // way (spec §4.1).
  useEffect(() => {
    const atRisk =
      isDirty &&
      (!!saveConflict || !isOnline || lastSaveErrorKind === "network");
    if (!atRisk) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [saveConflict, isDirty, isOnline, lastSaveErrorKind]);

  // F2 shortcut: open inline AI edit when text is selected
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F2" && !showInlineEdit) {
        if ((e.target as HTMLElement | null)?.closest(SHORTCUT_GUARD_SELECTOR)) {
          return;
        }
        // Split view: both panes listen at document level — only the pane
        // that owns focus handles the press (primary when focus is outside
        // every pane).
        if (!ownsEditorShortcut(e.target, paneRootRef.current, isPrimary)) {
          return;
        }
        e.preventDefault();
        const { from, to } = editor.state.selection;
        if (from === to) {
          toast.info("Select some text first, then press F2.");
          return;
        }
        setInlineEditInstruction(undefined);
        setShowInlineEdit(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, showInlineEdit, isPrimary]);

  // Ctrl+Shift+F: open Find & Replace. Guarded identically to F2 so it never
  // fires from inside a form field or an already-open dialog.
  useEffect(() => {
    if (!editor) return;
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.shiftKey &&
        (e.key === "F" || e.key === "f")
      ) {
        if ((e.target as HTMLElement | null)?.closest(SHORTCUT_GUARD_SELECTOR)) {
          return;
        }
        if (!ownsEditorShortcut(e.target, paneRootRef.current, isPrimary)) {
          return;
        }
        e.preventDefault();
        setShowFindReplace(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editor, isPrimary]);

  // Watch for finding-card clicks → open inline edit popup
  const pendingInlineEditFinding = useEditorPaneStore(paneId, (s) => s.pendingInlineEditFinding);

  useEffect(() => {
    if (!pendingInlineEditFinding || !editor) return;

    const finding = pendingInlineEditFinding;
    // Clear immediately to avoid re-triggering
    paneStore.getState().setPendingInlineEditFinding(null);

    // Small delay to let scrollToText complete first
    setTimeout(() => {
      const searchText = finding.originalText ?? finding.locationStart ?? "";
      if (searchText) {
        const positions = findTextPositions(editor.state.doc, searchText);
        if (positions.length > 0) {
          editor.commands.setTextSelection(positions[0]);
        }
      }
      const instruction = finding.suggestion ?? finding.description;
      setInlineEditInstruction(instruction);
      setShowInlineEdit(true);
    }, 200);
  }, [pendingInlineEditFinding, editor, paneStore]);

  // "Show in text" — scrollToText subscriber from pane store
  const scrollToText = useEditorPaneStore(paneId, (s) => s.scrollToText);

  useEffect(() => {
    if (!scrollToText || !editor) return;

    const positions = findTextPositions(editor.state.doc, scrollToText);
    if (positions.length > 0) {
      const pos = positions[0];
      editor.commands.setTextSelection(pos);
      editor.commands.scrollIntoView();

      // Pulse highlight on the matched text
      requestAnimationFrame(() => {
        try {
          const domAtPos = editor.view.domAtPos(pos.from);
          const targetNode = domAtPos.node.parentElement;
          if (targetNode) {
            targetNode.classList.add("anno-underline-pulse");
            setTimeout(() => targetNode.classList.remove("anno-underline-pulse"), 800);
          }
        } catch {
          // domAtPos can throw if position is stale — silently ignore
        }
      });
    } else {
      toast.info("Could not find the referenced text in the current chapter. It may have been edited.");
    }

    paneStore.getState().setScrollToText(null);
  }, [scrollToText, editor, paneStore]);

  // ── Stale finding detection ──────────────────────────────────
  const findingFreshness = useMemo(() => {
    if (!editor || findings.length === 0) return new Map<string, "fresh" | "stale" | "unanchored">();
    return classifyFindingFreshness(findings, editor.state.doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings]);

  // ── scrollToFinding: card -> editor direction ────────────────
  const scrollToFinding = useCallback(
    (finding: FindingItem) => {
      if (!editor) return;
      const searchText = finding.originalText;
      if (!searchText) {
        toast.info("This finding has no anchored text to navigate to.");
        return;
      }

      const positions = findTextPositions(editor.state.doc, searchText);
      if (positions.length === 0) {
        toast.info(
          "Original text has changed -- could not locate passage."
        );
        return;
      }

      const pos = positions[0];
      editor.commands.setTextSelection(pos);

      // Scroll the matched position to center of viewport
      requestAnimationFrame(() => {
        try {
          const domResult = editor.view.domAtPos(pos.from);
          const targetEl =
            domResult.node instanceof HTMLElement
              ? domResult.node
              : domResult.node.parentElement;
          if (!targetEl) return;

          // Find the editor scroll container (overflow-y-auto div)
          const scrollContainer = editor.view.dom.closest(
            ".overflow-y-auto"
          );
          if (scrollContainer) {
            const containerRect = scrollContainer.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const scrollTop = scrollContainer.scrollTop;
            const desiredTop =
              targetRect.top -
              containerRect.top +
              scrollTop -
              containerRect.height / 2;
            scrollContainer.scrollTo({
              top: desiredTop,
              behavior: "smooth",
            });
          }

          // Add pulse animation to the annotation span
          const annoSpan = editorAreaRef.current?.querySelector(
            `[data-annotation-id="finding-${finding.id}"]`
          ) as HTMLElement | null;
          if (annoSpan) {
            annoSpan.classList.add("anno-underline-pulse");
            setTimeout(
              () => annoSpan.classList.remove("anno-underline-pulse"),
              800
            );
          }
        } catch {
          // domAtPos can throw if position is stale
        }
      });
    },
    [editor]
  );

  // ── Immersive focus mode: snapshot on enter, debounced CAS sync while
  //    editing (S10), reconcile on exit ─────────────────────────
  const enterImmersive = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    immersiveHtmlRef.current = html;
    setImmersiveContent(html);
    setImmersive(true);
  }, [editor]);

  // Single reconcile point: push the freshest immersive buffer into tiptap
  // (the single source of truth for content + version) and markDirty so the
  // SAME debounced, version-stamped CAS autosave persists it — no second save
  // path, timer, or version stamp. Change-guarded via lastImmersiveSyncRef so
  // the keystroke scheduler, the unload flush, and exit never double-apply the
  // identical HTML or move the hidden editor needlessly. (Compare against
  // lastImmersiveSyncRef, not editor.getHTML(): tiptap normalizes HTML and
  // would trigger spurious syncs. The overlay renders from immersiveContent
  // state, so the hidden setContent never moves the caret.)
  const lastImmersiveSyncRef = useRef("");
  const syncSchedulerRef = useRef<ImmersiveSyncScheduler | null>(null);
  const syncImmersiveToEditor = useCallback(() => {
    if (!editor) return;
    if (immersiveHtmlRef.current === lastImmersiveSyncRef.current) return;
    lastImmersiveSyncRef.current = immersiveHtmlRef.current;
    editor.commands.setContent(immersiveHtmlRef.current);
    paneStore.getState().markDirty();
  }, [editor, paneStore]);

  const exitImmersive = useCallback(() => {
    setImmersive(false);
    // Reconcile any keystrokes that landed after the last scheduled flush
    // (change-guarded: a no-op if the scheduler already synced them).
    syncSchedulerRef.current?.cancel();
    syncImmersiveToEditor();
    // A conflict detected during immersive mode was deferred (toast/dialog
    // would have rendered under the z-[100] overlay) — surface it now.
    if (paneStore.getState().saveConflict) {
      showConflictToast();
    }
  }, [syncImmersiveToEditor, paneStore, showConflictToast]);

  // S10: route ACTIVE immersive editing through the main editor's hardened CAS
  // autosave. A keystroke-driven scheduler flushes the buffer into tiptap on a
  // short trailing debounce — and at least every IMMERSIVE_SYNC_MAX_WAIT_MS of
  // unbroken typing; the markDirty inside syncImmersiveToEditor then drives the
  // existing debounced, stamped PUT with its 409 / offline / backoff handling.
  // This shrinks the worst-case active-editing loss window from the old 30s
  // periodic sync to the main editor's ~2s cadence. (While a save conflict is
  // pending autosave is suspended, so persistence still falls back to the
  // localStorage conflict draft + beforeunload prompt until exit resolves it.)
  useEffect(() => {
    if (!immersive || !editor) {
      syncSchedulerRef.current = null;
      return;
    }
    // Baseline the sync guard to the enter snapshot so the first real edit —
    // not the initial content — triggers the first flush.
    lastImmersiveSyncRef.current = immersiveHtmlRef.current;
    const scheduler = createImmersiveSyncScheduler({
      onFlush: syncImmersiveToEditor,
      delayMs: IMMERSIVE_SYNC_DEBOUNCE_MS,
      maxWaitMs: IMMERSIVE_SYNC_MAX_WAIT_MS,
    });
    syncSchedulerRef.current = scheduler;
    return () => {
      scheduler.cancel();
      syncSchedulerRef.current = null;
    };
  }, [immersive, editor, syncImmersiveToEditor]);

  // Loss-window guard (S10): the overlay's unload listeners call this to route
  // the latest immersive edits into tiptap + markDirty on tab close/hide,
  // shrinking worst-case loss to ~0. Cancels any queued trailing flush so it
  // cannot re-fire after the overlay unmounts.
  const flushImmersiveToEditor = useCallback(() => {
    syncSchedulerRef.current?.cancel();
    syncImmersiveToEditor();
  }, [syncImmersiveToEditor]);

  // D-133: flush the SAME stamped CAS save on pagehide / visibilitychange:hidden
  // so an accepted sentence typed seconds before the phone backgrounds reaches
  // the SERVER, not just the local draft mirror (which only recovers on the same
  // browser profile). keepalive lets the PUT complete after teardown; when the
  // page survives (the common phone-backgrounding case) the response flows back
  // through saveContent's normal 409 / dirtiness-settlement / draft-clear path,
  // so CAS state is never corrupted.
  useServerSaveFlush({
    paneStore,
    isOnlineRef,
    cancelPendingSave: () => {
      // The flush carries the same expectedVersion as the queued debounce —
      // let it fire and a stray debounce would 409 against it.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    },
    reconcileBeforeFlush: () => {
      // Ordering hazard: read the editor only AFTER immersive reconciles its
      // buffer into tiptap, else the newest immersive keystrokes miss the PUT.
      if (immersiveRef.current) flushImmersiveToEditor();
    },
    flushSave: ({ keepalive }) => {
      void saveContent({ keepalive });
    },
  });

  // ── F8 / Shift+F8 keyboard navigation (use-finding-navigation.ts) ──
  useFindingNavigation({
    editor,
    editorRef,
    editorAreaRef,
    paneRootRef,
    isPrimary,
    findings,
    scrollToFinding,
    setTooltipState,
  });

  // Show floating agent input when text is selected (not during inline edit)
  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      const { from, to } = editor.state.selection;
      setShowFloatingAgentInput(from !== to);
    };
    editor.on("selectionUpdate", handler);
    return () => { editor.off("selectionUpdate", handler); };
  }, [editor]);

  // Word count — use DB word count until editor content is loaded, then compute from editor
  const editorWordCount = editor && contentLoadedRef.current
    ? countWords(getMarkdownFromEditor(editor))
    : null;
  const wordCount = editorWordCount ?? chapterData?.wordCount ?? 0;

  if (isLoading) {
    return (
      <div
        role="status"
        className="flex items-center justify-center h-full text-muted-foreground"
      >
        Loading chapter...
      </div>
    );
  }

  // Live continuity net: resolve the tooltip's live flag by id at RENDER time
  // (not inside handleAnnotationClick's closure — that closure is frozen at
  // editor construction, before any scan has populated continuityFlags).
  const continuityFlag =
    tooltipState?.annotationType === "continuity"
      ? continuityFlags.find((f) => `continuity-${f.id}` === tooltipState.annotationId)
      : undefined;

  // ── Shared editor column JSX ─────────────────────────────────
  const editorColumn = (
    <div
      ref={paneRootRef}
      {...{ [EDITOR_PANE_ATTR]: paneId }}
      className={cn(
        "flex flex-col flex-1 min-w-0 h-full",
        getFocusLevelClasses(focusLevel)
      )}
    >
      {/* Breadcrumb + nav header */}
      <div className="px-4 py-3 border-b space-y-1">
        {/* Breadcrumb trail */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0"
            onClick={() => guardedNavigate(`/books/${bookId}`)}
            title="Back to book"
            aria-label="Back to book"
          >
            <ArrowLeftIcon className="size-3.5" />
          </Button>
          <Link
            href={`/books/${bookId}`}
            onClick={(e) => {
              e.preventDefault();
              guardedNavigate(`/books/${bookId}`);
            }}
            className="hover:text-foreground transition-colors truncate"
          >
            {bookName ?? "Book"}
          </Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate">
            Ch. {chapterNumber}
            {chapterTitle ? `: ${chapterTitle}` : ""}
          </span>
        </div>

        {/* Chapter title + prev/next */}
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-display font-semibold flex-1 min-w-0 truncate">
            Chapter {chapterNumber}
            {chapterTitle ? `: ${chapterTitle}` : ""}
          </h1>

          {allChapters && allChapters.length > 1 && (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!prevChapter}
                onClick={() =>
                  prevChapter &&
                  guardedNavigate(`/books/${bookId}/chapters/${prevChapter.id}`)
                }
                aria-label="Previous chapter"
                title={
                  prevChapter
                    ? `Ch. ${prevChapter.chapterNumber}${prevChapter.title ? `: ${prevChapter.title}` : ""}`
                    : "No previous chapter"
                }
              >
                <ChevronLeftIcon className="size-4" />
              </Button>
              {/* sr-only twin — aria-label on a generic span is prohibited
                  ARIA (1.2) and ignored by AT */}
              <span className="text-xs text-muted-foreground tabular-nums">
                <span aria-hidden="true">
                  {currentIdx + 1}/{allChapters.length}
                </span>
                <span className="sr-only">
                  Chapter {currentIdx + 1} of {allChapters.length}
                </span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!nextChapter}
                onClick={() =>
                  nextChapter &&
                  guardedNavigate(`/books/${bookId}/chapters/${nextChapter.id}`)
                }
                aria-label="Next chapter"
                title={
                  nextChapter
                    ? `Ch. ${nextChapter.chapterNumber}${nextChapter.title ? `: ${nextChapter.title}` : ""}`
                    : "No next chapter"
                }
              >
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {chapterStatus && (
        <ChapterContextHeader
          bookId={bookId}
          chapterId={chapterId}
          chapterNumber={chapterNumber}
          chapterTitle={chapterTitle}
          status={chapterStatus}
          wordCount={wordCount}
          language={bookLanguage}
        />
      )}

      <EditorToolbar
        editor={editor}
        focusMode={focusMode}
        onToggleFocusMode={() => paneStore.getState().toggleFocusMode()}
        paneId={paneId}
        focusLevel={focusLevel}
        onFocusLevelChange={(level) => paneStore.getState().setFocusLevel(level)}
        onEnterImmersive={enterImmersive}
        ghostTextEnabled={ghostTextEnabled}
        onToggleGhostText={() => paneStore.getState().toggleGhostText()}
        showHistory={showVersionHistory}
        onToggleHistory={() => setShowVersionHistory((v) => !v)}
        showFindings={showFindings}
        onToggleFindings={() => paneStore.getState().toggleFindings()}
        pendingFindingsCount={pendingFindingsCount}
        showSeriesContext={showSeriesContext}
        onToggleSeriesContext={
          bookInSeries ? () => paneStore.getState().toggleSeriesContext() : undefined
        }
        showAnnotations={showAnnotations}
        onToggleAnnotations={() => paneStore.getState().toggleAnnotations()}
        isSaving={isSaving}
        isDirty={isDirty}
        lastSaved={lastSaved}
        onInlineEdit={() => {
          if (!editor) return;
          const { from, to } = editor.state.selection;
          if (from === to) {
            toast.info("Select some text first, then press F2 or click AI Rewrite.");
            return;
          }
          setInlineEditInstruction(undefined);
          setShowInlineEdit(true);
        }}
        splitMode={splitMode}
        onToggleSplit={
          isMobile ? undefined : () => setSplitMode(!splitMode)
        }
        showFloatingInput={showFloatingInput}
        onToggleFloatingInput={() => paneStore.getState().toggleFloatingInput()}
        onFindReplace={() => setShowFindReplace(true)}
      />

      {/* Live continuity net (Tier 4.4): quiet status beside the toolbar's panel toggles */}
      <div className="flex items-center justify-end px-2 pt-1">
        <ContinuityIndicator
          flags={continuityFlags}
          currentChapter={chapterNumber}
          scanning={continuityScanning}
        />
      </div>

      {/* Prose analysis strip: collapsed = ghost buttons; expanded pushes content down */}
      {editor && (
        <div className="flex gap-2 px-2 py-1">
          <PacingHeatmap text={getMarkdownFromEditor(editor)} />
          <ProseSyntaxHighlight text={getMarkdownFromEditor(editor)} />
        </div>
      )}

      <EditorContextMenu
        bookId={bookId}
        editor={editor}
        onInlineEdit={(instruction) => {
          if (!editor) return;
          const { from, to } = editor.state.selection;
          if (from === to) return;
          setInlineEditInstruction(instruction);
          setShowInlineEdit(true);
        }}
      >
        <div className="flex-1 overflow-y-auto relative" ref={editorAreaRef}>
          <GutterMarkers
            editor={editor}
            findings={findings}
            visible={showAnnotations}
            onMarkerClick={(findingId, rect) => {
              const finding = findings.find((f) => f.id === findingId) ?? null;
              if (finding) {
                // Signal the findings panel to scroll to and highlight this card
                useEditorialStore.getState().setHighlightedFinding(findingId);
                useEditorialStore.getState().setSelectedFinding(findingId);

                setTooltipState({
                  annotationId: `finding-${findingId}`,
                  annotationType: finding.newText ? "ai" : "comment",
                  rect,
                  finding,
                });
              }
            }}
          />
          <EditorContent editor={editor} />
          {showFloatingAgentInput &&
            showFloatingInput &&
            !showInlineEdit &&
            editor && (
              <FloatingAgentInput
                editor={editor}
                bookId={bookId}
                autoFocus={false}
                onClose={() => setShowFloatingAgentInput(false)}
              />
            )}
          {editor && (
            <AIGhostText
              editor={editor}
              bookId={bookId}
              chapterNumber={chapterNumber}
              enabled={ghostTextEnabled}
              // D-137: while immersive is open the debounced immersive→tiptap
              // setContent sync still fires editor "update" events, but the
              // ghost overlay/wall live under the z-[100] immersive surface and
              // are invisible with no accept path. Pass immersive so ghost
              // fetching is suppressed at its root — no billable-but-invisible
              // suggestion, no silent cap wall behind the overlay.
              immersive={immersive}
            />
          )}
          {showInlineEdit && editor && (
            <InlineEditPopup
              editor={editor}
              bookId={bookId}
              onClose={() => {
                setShowInlineEdit(false);
                setInlineEditInstruction(undefined);
              }}
              initialInstruction={inlineEditInstruction}
            />
          )}
          {tooltipState && editorAreaRef.current && (
            <AnnotationTooltip
              annotationId={tooltipState.annotationId}
              annotationType={tooltipState.annotationType}
              description={
                continuityFlag?.description ?? tooltipState.finding?.description ?? "Annotation"
              }
              originalText={tooltipState.finding?.originalText}
              newText={tooltipState.finding?.newText}
              anchorRect={tooltipState.rect}
              containerRect={editorAreaRef.current.getBoundingClientRect()}
              jumpChapter={continuityFlag?.jumpChapter ?? null}
              onIntentional={
                continuityFlag ? () => markIntentional(continuityFlag.id) : undefined
              }
              onGoToChapter={
                continuityFlag &&
                continuityFlag.jumpChapter != null &&
                continuityFlag.jumpChapter !== chapterNumber
                  ? () => {
                      const target = allChapters?.find(
                        (c) => c.chapterNumber === continuityFlag.jumpChapter
                      );
                      if (!target) return;
                      paneStore.getState().setScrollToText(continuityFlag.anchor ?? "");
                      guardedNavigate(`/books/${bookId}/chapters/${target.id}`);
                    }
                  : undefined
              }
              onAccept={() => {
                if (tooltipState.finding) {
                  applyMutation.mutate(tooltipState.finding.id);
                }
                setTooltipState(null);
              }}
              onReject={() => {
                if (tooltipState.finding) {
                  dismissMutation.mutate({
                    findingId: tooltipState.finding.id,
                  });
                }
                setTooltipState(null);
              }}
              onClose={() => setTooltipState(null)}
              onDiscuss={() => {
                useEditorialStore.getState().setSelectedFinding(tooltipState.annotationId);
                useEditorialStore.getState().setConversationFinding(tooltipState.annotationId);
                // Open the findings panel/sheet so the conversation is actually visible
                // (same auto-open pattern as pendingFindingsCount above).
                if (!paneStore.getState().showFindings) {
                  paneStore.getState().toggleFindings();
                }
                setTooltipState(null); // close tooltip; the panel/sheet takes over
              }}
            />
          )}
          {overlappingState && editorAreaRef.current && (
            <OverlappingFindingsPopover
              findings={overlappingState.findings}
              anchorRect={overlappingState.rect}
              containerRect={editorAreaRef.current.getBoundingClientRect()}
              onSelect={(finding) => {
                setOverlappingState(null);
                useEditorialStore.getState().setHighlightedFinding(finding.id);
                useEditorialStore.getState().setSelectedFinding(finding.id);
              }}
              onClose={() => setOverlappingState(null)}
            />
          )}
        </div>
      </EditorContextMenu>

      {/* Typewriter mode: keeps current line centered */}
      <TypewriterMode editor={editor} enabled={focusMode} />

      <EditorStatusBar
        wordCount={wordCount}
        isSaving={isSaving}
        isDirty={isDirty}
        lastSaved={lastSaved}
        annotationCounts={annotationCounts}
        hasSaveConflict={!!saveConflict}
        onReviewConflict={() => setShowSaveConflict(true)}
        isOnline={isOnline}
        draftSavedAt={draftSavedAt}
        lastSaveErrorKind={lastSaveErrorKind}
      />

      {/* sr-only polite live region — F8 navigation, immersive enter/exit.
          Primary pane only: announce() writes one module-level store, so a
          second mount in split view would double-announce every message. */}
      {isPrimary && <LiveAnnouncer />}
    </div>
  );

  // ── Findings panel JSX ────────────────────────────────────────
  const findingsPanel = (
    <EditorFindingsPanel
      bookId={bookId}
      chapterNumber={chapterNumber}
      onClose={() => paneStore.getState().toggleFindings()}
      paneId={paneId}
      onJumpToFinding={scrollToFinding}
      freshnessMap={findingFreshness}
    />
  );

  return (
    <div className="flex h-full">
      {/* Immersive focus mode: full-screen overlay, content syncs back on exit */}
      {immersive && (
        <ImmersiveFocusMode
          content={immersiveContent}
          // D-23: on an intermittent overlay remount, mount re-seeds from
          // this live buffer (updated every keystroke below) instead of the
          // stale enter-time snapshot — typed words survive.
          liveContentRef={immersiveHtmlRef}
          onContentChange={(html) => {
            // Keystroke: update the buffer and (re)arm the debounced CAS sync
            // so active editing reaches the hardened autosave within ~2s (S10).
            immersiveHtmlRef.current = html;
            syncSchedulerRef.current?.schedule();
          }}
          onExit={exitImmersive}
          onFlush={flushImmersiveToEditor}
        />
      )}

      {/* Editor + findings: ResizablePanelGroup on lg+ when findings are shown */}
      {isLg && showFindings ? (
        <ResizablePanelGroup orientation="horizontal" id="editor-findings-split" className="flex-1">
          <ResizablePanel id="editor-main" defaultSize={60} minSize={35}>
            {editorColumn}
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel id="findings-panel" defaultSize={40} minSize={25}>
            <div className="flex flex-col h-full overflow-y-auto">
              {findingsPanel}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        editorColumn
      )}

      {/* Findings — modal Sheet below lg: bottom on phone, right on tablet */}
      {!isLg && (
        <FindingsSheet
          open={showFindings}
          onOpenChange={(open) => {
            if (!open && paneStore.getState().showFindings) {
              paneStore.getState().toggleFindings();
            }
          }}
          side={isMobile ? "bottom" : "right"}
          paneRootRef={paneRootRef}
        >
          {findingsPanel}
        </FindingsSheet>
      )}

      {/* Save-conflict resolution — opened only via toast action or status-bar chip */}
      <SaveConflictDialog
        open={showSaveConflict}
        onOpenChange={setShowSaveConflict}
        bookId={bookId}
        chapterId={chapterId}
        paneId={paneId}
        editor={editor}
      />

      {/* Find & Replace — toolbar "More tools" or Ctrl+Shift+F */}
      <FindReplaceDialog
        open={showFindReplace}
        onOpenChange={setShowFindReplace}
        bookId={bookId}
        chapterId={chapterId}
      />

      {/* Version history sidebar — inline on lg+, Sheet on smaller screens */}
      {isLg ? (
        showVersionHistory && (
          <div className="w-64 border-l flex flex-col">
            <VersionHistoryPanel
              bookId={bookId}
              documentId={paneDocumentId}
            />
          </div>
        )
      ) : (
        <VersionHistorySheet
          open={showVersionHistory}
          onOpenChange={setShowVersionHistory}
          bookId={bookId}
          documentId={paneDocumentId}
          documentTitle={
            chapterTitle
              ? `Chapter ${chapterNumber}: ${chapterTitle}`
              : `Chapter ${chapterNumber}`
          }
        />
      )}

      {/* Ambient series context — inline column on lg+, Sheet on smaller screens */}
      {isLg ? (
        showSeriesContext && (
          <div className="w-72 border-l flex flex-col">
            <AmbientSeriesPanel
              bookId={bookId}
              chapterNumber={chapterNumber}
              onClose={() => paneStore.getState().toggleSeriesContext()}
            />
          </div>
        )
      ) : (
        <FindingsSheet
          open={showSeriesContext}
          onOpenChange={(open) => {
            if (!open && paneStore.getState().showSeriesContext) {
              paneStore.getState().toggleSeriesContext();
            }
          }}
          side={isMobile ? "bottom" : "right"}
          paneRootRef={paneRootRef}
        >
          <AmbientSeriesPanel bookId={bookId} chapterNumber={chapterNumber} />
        </FindingsSheet>
      )}
    </div>
  );
}
