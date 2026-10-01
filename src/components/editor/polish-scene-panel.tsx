"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { Feather, Loader2 } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AIRewriteComparison } from "./ai-rewrite-comparison";
import { PolishSceneError, usePolishScene } from "@/hooks/use-polish-scene";
import {
  POLISH_MAX_FOCUS_CHARS,
  POLISH_MAX_SELECTION_CHARS,
  polishFitsBudget,
} from "@/lib/polish/limits";
import { applySceneRewrite, captureSceneRange } from "@/lib/polish/editor-range";
import type { PolishSceneVersion } from "@/lib/validation";

interface PolishScenePanelProps {
  editor: Editor;
  bookId: string;
  onClose: () => void;
}

/** The writer's language for a failed polish; the server's message is English. */
function failureMessage(err: unknown, t: ReturnType<typeof useLanguage>["t"]): string {
  if (!(err instanceof PolishSceneError)) return t.polishScene.failed;
  if (err.status === 429) return t.polishScene.limitReached;
  if (err.code === "MODEL_NO_POLISH") return t.polishScene.modelCannotPolish;
  if (err.code === "SCENE_TOO_LONG") return t.polishScene.tooLong;
  return t.polishScene.failed;
}

type Phase = "ready" | "loading" | "results";

/**
 * Polish Scene: a light and a bold rewrite of the selected scene, side by side
 * with the original. The chosen version replaces exactly the selected range,
 * and only while that range still holds the text that was sent.
 */
export function PolishScenePanel({ editor, bookId, onClose }: PolishScenePanelProps) {
  const { t } = useLanguage();
  const polish = usePolishScene(bookId);
  // The scene as it stood when the panel opened, widened to whole paragraphs:
  // what is sent, and what an accepted version replaces.
  const [scene] = useState(() => captureSceneRange(editor));
  const [focus, setFocus] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [versions, setVersions] = useState<PolishSceneVersion[]>([]);
  const [partial, setPartial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const tooLong =
    scene.markdown.length > POLISH_MAX_SELECTION_CHARS || !polishFitsBudget(scene.markdown);

  const cancelInFlight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const cancelAndClose = useCallback(() => {
    cancelInFlight();
    onClose();
  }, [cancelInFlight, onClose]);

  // A parent can drop the panel without going through a close path.
  useEffect(() => cancelInFlight, [cancelInFlight]);

  const handleStart = useCallback(async () => {
    if (tooLong || !scene.markdown.trim()) return;
    cancelInFlight();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setPhase("loading");

    try {
      const result = await polish.mutateAsync({
        selectedText: scene.markdown,
        contextBefore: scene.contextBefore || undefined,
        contextAfter: scene.contextAfter || undefined,
        focus: focus.trim() || undefined,
        signal: controller.signal,
      });
      if (abortRef.current === controller) abortRef.current = null;
      setVersions(result.versions);
      setPartial(result.failed.length > 0);
      setPhase("results");
    } catch (err) {
      // The writer cancelled: the panel is closing, nothing to report.
      if (controller.signal.aborted) return;
      if (abortRef.current === controller) abortRef.current = null;
      setError(failureMessage(err, t));
      setPhase("ready");
    }
  }, [tooLong, scene, focus, polish, cancelInFlight, t]);

  const handleAccept = useCallback(
    (text: string) => {
      if (applySceneRewrite(editor, scene, text) === "changed") {
        setError(t.polishScene.textChanged);
        return;
      }
      onClose();
    },
    [editor, scene, onClose, t]
  );

  const intensityLabel = (version: PolishSceneVersion) =>
    version.intensity === "light" ? t.polishScene.light : t.polishScene.bold;

  return (
    <Dialog open onOpenChange={(open) => !open && cancelAndClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Feather className="size-4" />
            {t.polishScene.title}
          </DialogTitle>
          <DialogDescription>{t.polishScene.intro}</DialogDescription>
        </DialogHeader>

        {phase === "ready" && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleStart();
            }}
          >
            {tooLong ? (
              <p role="alert" className="text-sm text-destructive">
                {t.polishScene.tooLong}
              </p>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="polish-scene-focus">{t.polishScene.focusLabel}</Label>
                <Input
                  id="polish-scene-focus"
                  value={focus}
                  maxLength={POLISH_MAX_FOCUS_CHARS}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder={t.polishScene.focusPlaceholder}
                  autoFocus
                />
              </div>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cancelAndClose}>
                {t.common.cancel}
              </Button>
              <Button type="submit" disabled={tooLong}>
                <Feather className="size-4" />
                {t.polishScene.start}
              </Button>
            </div>
          </form>
        )}

        {phase === "loading" && (
          <div className="flex items-center justify-between gap-4 py-6">
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t.polishScene.working}
            </p>
            <Button variant="outline" onClick={cancelAndClose}>
              {t.common.cancel}
            </Button>
          </div>
        )}

        {phase === "results" && versions.length > 0 && (
          <div className="space-y-3">
            {partial && <p className="text-sm text-muted-foreground">{t.polishScene.onlyOneVersion}</p>}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Tabs defaultValue={versions[0].intensity}>
              <TabsList>
                {versions.map((version) => (
                  <TabsTrigger key={version.intensity} value={version.intensity}>
                    {intensityLabel(version)}
                  </TabsTrigger>
                ))}
              </TabsList>
              {versions.map((version) => (
                <TabsContent key={version.intensity} value={version.intensity}>
                  <AIRewriteComparison
                    original={scene.markdown}
                    rewrite={version.text}
                    rewriteLabel={intensityLabel(version)}
                    onAccept={(text) => handleAccept(text)}
                    onReject={cancelAndClose}
                    onRegenerate={() => void handleStart()}
                    allowEdit
                    paneHeightClassName="h-[45vh]"
                  />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
