"use client";

import { use, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpenIcon,
  UploadIcon,
  PaletteIcon,
  BookMarkedIcon,
  LayoutIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  ChevronLeftIcon,
  SparklesIcon,
  Loader2Icon,
  AlertTriangleIcon,
  RefreshCwIcon,
  MessageCircleIcon,
  CircleDashedIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useAgentSessionStore } from "@/stores/agent-session-store";
import { useBook, useUpdateBook } from "@/hooks/use-books";
import { useBookState, getFirstIncompleteStep } from "@/hooks/use-book-state";
import { useCreateChapter } from "@/hooks/use-chapters";
import { useLanguage } from "@/components/providers/language-provider";
import { ImportWizard } from "@/components/import-export/import-wizard";
import { fetchJson } from "@/lib/api-client";
import { countWithNoun } from "@/lib/i18n/plural";
import {
  SETUP_STEP_TOTAL,
  countSetupStepsDone,
  pickStartWritingChapter,
} from "@/lib/onboarding/setup-surface";

export default function SetupPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const router = useRouter();
  const { t } = useLanguage();
  const s = t.setup;

  const [currentStep, setCurrentStep] = useState(0);
  const [hasAutoResumed, setHasAutoResumed] = useState(false);
  const [confirmWorkflow, setConfirmWorkflow] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);
  const sessions = useAgentSessionStore((st) => st.sessions);
  const { data: book } = useBook(bookId);
  const updateBook = useUpdateBook(bookId);
  const bookState = useBookState(bookId);
  const createChapter = useCreateChapter(bookId);

  const STEPS = useMemo(
    () => [
      { id: "basics", title: s.basics, icon: BookOpenIcon, description: s.basicsDesc, time: "~1 min" },
      { id: "import", title: s.importStep, icon: UploadIcon, description: s.importDesc, time: "~2 min" },
      { id: "style", title: s.styleStep, icon: PaletteIcon, description: s.styleDesc, time: "~3 min" },
      { id: "bible", title: s.storyBible, icon: BookMarkedIcon, description: s.storyBibleDesc, time: "~5 min" },
      { id: "architecture", title: s.architecture, icon: LayoutIcon, description: s.architectureDesc, time: "~5 min" },
      { id: "done", title: s.doneStep, icon: CheckCircle2Icon, description: s.doneDesc, time: "" },
    ],
    [s]
  );

  // Auto-resume from first incomplete step on mount
  useEffect(() => {
    if (!bookState.isLoading && !hasAutoResumed) {
      const firstIncomplete = getFirstIncompleteStep(bookState.setupProgress);
      setCurrentStep(firstIncomplete);
      setHasAutoResumed(true);
    }
  }, [bookState.isLoading, bookState.setupProgress, hasAutoResumed]);

  // Check if any agent session is currently running
  const hasRunningSession = Object.values(sessions).some(
    (sess) => sess.status === "running"
  );

  const [name, setName] = useState("");
  const [genre, setGenre] = useState("");
  const [language, setLanguage] = useState("en");
  const [description, setDescription] = useState("");
  const [styleSample, setStyleSample] = useState("");

  useEffect(() => {
    if (book) {
      setName(book.name ?? "");
      setGenre(book.genre ?? "");
      setLanguage(book.language ?? "en");
    }
  }, [book]);

  const step = STEPS[currentStep];

  const next = useCallback(() => setCurrentStep((v) => Math.min(v + 1, STEPS.length - 1)), [STEPS.length]);
  const prev = useCallback(() => setCurrentStep((v) => Math.max(v - 1, 0)), []);

  const handleSaveBasics = async () => {
    await updateBook.mutateAsync({
      name: name || undefined,
      genre: genre || undefined,
      language: language || undefined,
    });
    next();
  };

  /** Skip import step — mark as skipped in book settings. */
  const handleSkipImport = useCallback(async () => {
    try {
      await fetchJson(`/api/books/${bookId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupImportSkipped: true }),
      });
    } catch {
      // Non-fatal — user can still proceed
    }
    next();
  }, [bookId, next]);

  /**
   * Mark setup complete and land the writer IN the editor (D-161).
   *
   * The CTA used to drop onto the book overview, costing a locate-row + Edit
   * hop before the first word. Resolution mirrors the overview's own Edit
   * action (open a chapter by id) with create-or-open semantics: open the
   * lowest-numbered chapter, create Chapter 1 when the book has none, and fall
   * back to the overview only when no chapter can be resolved at all.
   */
  const handleFinishSetup = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      await fetchJson(`/api/books/${bookId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupComplete: true }),
      });
    } catch (err) {
      // Never a silent no-op: say why setup could not be saved.
      toast.error(`Failed to complete setup: ${(err as Error).message}`);
      setFinishing(false);
      return;
    }

    let target: { id: string } | null = pickStartWritingChapter(book?.chapters ?? []);
    if (!target) {
      try {
        // Cache said "no chapters" — confirm against the server before creating
        // one, so a stale/unloaded book query can never mint a duplicate.
        const fresh = await fetchJson<Array<{ id: string; chapterNumber: number }>>(
          `/api/books/${bookId}/chapters`
        );
        target =
          pickStartWritingChapter(fresh) ??
          (await createChapter.mutateAsync({ chapterNumber: 1, actNumber: 1 }));
      } catch (err) {
        // Setup itself IS saved — say what happened instead of swallowing it,
        // then land on the overview rather than stranding them on the wizard.
        toast.error(
          `Setup saved, but the first chapter could not be opened: ${(err as Error).message}`
        );
      }
    }

    toast.success("Setup complete! Your book is ready.");
    router.push(
      target ? `/books/${bookId}/chapters/${target.id}` : `/books/${bookId}`
    );
    setFinishing(false);
  }, [bookId, router, book?.chapters, createChapter, finishing]);

  /** Start a workflow, with confirmation if document already exists. */
  const handleStartWorkflow = useCallback(
    (workflowId: string, existsAlready: boolean) => {
      if (existsAlready && confirmWorkflow !== workflowId) {
        setConfirmWorkflow(workflowId);
        return;
      }
      setConfirmWorkflow(null);
      // For capture-style, pass the writing sample as initial context
      if (workflowId === "capture-style" && styleSample.trim()) {
        openWithWorkflow(workflowId, `Here is a sample of my writing for style analysis:\n\n${styleSample.trim()}`);
      } else {
        openWithWorkflow(workflowId);
      }
    },
    [openWithWorkflow, confirmWorkflow, styleSample]
  );

  // D-160: the SAME five-step accounting the overview banner and the sidebar
  // use. The "Done" card is a confirmation of these five, not a sixth unit of
  // work — counting it produced the old "2/6" vs banner "2/5" disagreement.
  const completedCount = countSetupStepsDone(bookState.setupProgress);
  const progress = bookState.setupProgress;

  /** Determine step completion status for the step bar. */
  function stepStatus(i: number): "complete" | "current" | "incomplete" | "pending" {
    if (i === currentStep) return "current";
    switch (i) {
      case 0: return progress.basicsComplete ? "complete" : "incomplete";
      case 1: return progress.importComplete ? "complete" : "incomplete";
      case 2: return progress.styleComplete ? "complete" : "incomplete";
      case 3: return progress.bibleComplete ? "complete" : "incomplete";
      case 4: return progress.archComplete ? "complete" : "incomplete";
      case 5: return progress.reviewComplete ? "complete" : "incomplete";
      default: return "pending";
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="font-display text-2xl font-bold">{s.title}</h1>
        <Badge variant="outline" className="text-xs">
          {completedCount}/{SETUP_STEP_TOTAL} steps done
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mb-4">{s.subtitle}</p>

      {/* Conversational alternative */}
      <div className="mb-8 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-primary/10 p-2 shrink-0">
            <MessageCircleIcon className="size-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Prefer to chat?</p>
            <p className="text-xs text-muted-foreground">
              Tell the Writing Coach about your book and let it guide the setup for you.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => openWithWorkflow("onboard-new-book")}
          >
            Chat with Coach
          </Button>
        </div>
      </div>

      {/* Step indicator bar */}
      <div className="flex items-center gap-1 mb-8">
        {STEPS.map((st, i) => {
          const Icon = st.icon;
          const status = stepStatus(i);
          return (
            <div key={st.id} className="flex items-center flex-1">
              <button
                onClick={() => setCurrentStep(i)}
                className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors w-full ${
                  status === "current"
                    ? "bg-primary text-primary-foreground"
                    : status === "complete"
                      ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                      : status === "incomplete"
                        ? "bg-muted text-muted-foreground border border-dashed border-muted-foreground/30"
                        : "bg-muted text-muted-foreground"
                }`}
              >
                {status === "complete" ? (
                  <CheckCircle2Icon className="size-3.5 shrink-0" />
                ) : status === "incomplete" && i !== currentStep ? (
                  <CircleDashedIcon className="size-3.5 shrink-0" />
                ) : (
                  <Icon className="size-3.5 shrink-0" />
                )}
                <span className="hidden sm:inline truncate">{st.title}</span>
              </button>
              {i < STEPS.length - 1 && (
                <ChevronRightIcon className="size-3 text-muted-foreground mx-0.5 shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <step.icon className="size-5" />
            {step.title}
          </CardTitle>
          <CardDescription>{step.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step.id === "basics" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{s.bookName}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="genre">{s.genre}</Label>
                <Input
                  id="genre"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  placeholder={s.genrePlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="language">{s.language}</Label>
                <p className="text-xs text-muted-foreground">{s.languageHint}</p>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger id="language">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="sr">Serbian (Latin)</SelectItem>
                    <SelectItem value="de">German (Deutsch)</SelectItem>
                    <SelectItem value="es">Spanish (Espanol)</SelectItem>
                    <SelectItem value="fr">French (Francais)</SelectItem>
                    <SelectItem value="it">Italian (Italiano)</SelectItem>
                    <SelectItem value="pt">Portuguese (Portugues)</SelectItem>
                    <SelectItem value="ru">Russian</SelectItem>
                    <SelectItem value="zh">Chinese</SelectItem>
                    <SelectItem value="ja">Japanese</SelectItem>
                    <SelectItem value="ko">Korean</SelectItem>
                    <SelectItem value="nl">Dutch (Nederlands)</SelectItem>
                    <SelectItem value="pl">Polish (Polski)</SelectItem>
                    <SelectItem value="sv">Swedish (Svenska)</SelectItem>
                    <SelectItem value="tr">Turkish (Turkce)</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                    <SelectItem value="hi">Hindi</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{s.descriptionOptional}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={s.descriptionPlaceholder}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button onClick={handleSaveBasics} disabled={updateBook.isPending}>
                  {s.saveAndContinue}
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "import" && (
            <div className="space-y-4">
              {bookState.hasChapters && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 dark:bg-green-950/30 p-3">
                  <CheckCircle2Icon className="size-4 text-green-600 dark:text-green-400 shrink-0" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-300">
                    {s.manuscriptImported} --{" "}
                    {countWithNoun(bookState.chapterCount, s.chapterOne, s.chapterMany)}
                  </span>
                </div>
              )}

              <ImportWizard
                bookId={bookId}
                onComplete={() => next()}
                autoAnalyze={false}
              />

              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  {s.back}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bookState.hasChapters ? next : handleSkipImport}
                >
                  {bookState.hasChapters ? s.continueStep : s.skip}
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "style" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{s.styleInfo}</p>
              {bookState.hasFingerprint && confirmWorkflow !== "capture-style" && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                  <CheckCircle2Icon className="size-3" />
                  {s.fingerprintCaptured}
                </Badge>
              )}

              {/* Writing sample textarea — paste or type text for style analysis */}
              {!bookState.hasChapters && confirmWorkflow !== "capture-style" && (
                <div className="space-y-2">
                  <Label htmlFor="style-sample" className="text-sm font-medium">
                    {book?.language === "sr"
                      ? "Uzorak vašeg pisanja"
                      : "Your writing sample"}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {book?.language === "sr"
                      ? "Nalepite ili otkucajte odlomak iz svog rada (500+ reči je idealno). Ako ste uvezli rukopis, ovaj korak možete preskočiti."
                      : "Paste or type a passage from your work (500+ words is ideal). If you imported a manuscript, you can skip this."}
                  </p>
                  <Textarea
                    id="style-sample"
                    value={styleSample}
                    onChange={(e) => setStyleSample(e.target.value)}
                    placeholder={
                      book?.language === "sr"
                        ? "Nalepite odlomak iz svog romana, priče ili drugog rada..."
                        : "Paste a passage from your novel, story, or other writing..."
                    }
                    rows={8}
                    className="resize-y min-h-[120px] max-h-[400px] text-sm"
                  />
                  {styleSample.trim().length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {styleSample.trim().split(/\s+/).length}{" "}
                      {book?.language === "sr" ? "reči" : "words"}
                    </p>
                  )}
                </div>
              )}

              {/* If chapters exist, note that they'll be used */}
              {bookState.hasChapters && confirmWorkflow !== "capture-style" && (
                <p className="text-xs text-muted-foreground rounded-md bg-muted/50 p-2">
                  {/* D-163: the count picks its own noun form per sentence
                      language — this read "(1 chapters)" before. */}
                  {book?.language === "sr"
                    ? `Agent će analizirati vaš uvezeni rukopis (${countWithNoun(bookState.chapterCount, "poglavlje", "poglavlja")}) za stil.`
                    : `The agent will analyze your imported manuscript (${countWithNoun(bookState.chapterCount, "chapter", "chapters")}) for style.`}
                </p>
              )}

              {confirmWorkflow === "capture-style" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <AlertTriangleIcon className="size-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">{s.fingerprintCaptured}</p>
                    <p className="text-muted-foreground">{s.overwriteWarning}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => handleStartWorkflow("capture-style", true)}>
                        <RefreshCwIcon className="mr-1 size-3" />
                        {s.reCapture}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmWorkflow(null)}>
                        {s.cancel}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {confirmWorkflow !== "capture-style" && (
                <Button
                  onClick={() => handleStartWorkflow("capture-style", bookState.hasFingerprint)}
                  disabled={hasRunningSession || (!bookState.hasChapters && !styleSample.trim())}
                >
                  {hasRunningSession ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      {s.agentRunning}
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="mr-2 size-4" />
                      {bookState.hasFingerprint ? s.reCaptureStyle : s.captureStyle}
                    </>
                  )}
                </Button>
              )}
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  {s.back}
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  {bookState.hasFingerprint ? s.continueStep : s.skip}
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "bible" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{s.bibleInfo}</p>
              {bookState.hasStoryBible && confirmWorkflow !== "create-story-bible" && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                  <CheckCircle2Icon className="size-3" />
                  {s.bibleCreated}
                </Badge>
              )}
              {confirmWorkflow === "create-story-bible" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <AlertTriangleIcon className="size-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">{s.bibleCreated}</p>
                    <p className="text-muted-foreground">{s.overwriteWarning}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => handleStartWorkflow("create-story-bible", true)}>
                        <RefreshCwIcon className="mr-1 size-3" />
                        {s.reCreate}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmWorkflow(null)}>
                        {s.cancel}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {confirmWorkflow !== "create-story-bible" && (
                <Button
                  onClick={() => handleStartWorkflow("create-story-bible", bookState.hasStoryBible)}
                  disabled={hasRunningSession}
                >
                  {hasRunningSession ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      {s.agentRunning}
                    </>
                  ) : (
                    <>
                      <BookMarkedIcon className="mr-2 size-4" />
                      {bookState.hasStoryBible ? s.reCreateBible : s.createBible}
                    </>
                  )}
                </Button>
              )}
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  {s.back}
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  {bookState.hasStoryBible ? s.continueStep : s.skip}
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "architecture" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{s.archInfo}</p>
              {bookState.hasArchitecture && confirmWorkflow !== "build-architecture" && (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                  <CheckCircle2Icon className="size-3" />
                  {s.archCreated}
                </Badge>
              )}
              {confirmWorkflow === "build-architecture" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-300/50 bg-amber-50/50 dark:bg-amber-950/20 p-3">
                  <AlertTriangleIcon className="size-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium">{s.archCreated}</p>
                    <p className="text-muted-foreground">{s.overwriteWarning}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" onClick={() => handleStartWorkflow("build-architecture", true)}>
                        <RefreshCwIcon className="mr-1 size-3" />
                        {s.reBuild}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmWorkflow(null)}>
                        {s.cancel}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              {confirmWorkflow !== "build-architecture" && (
                <Button
                  onClick={() => handleStartWorkflow("build-architecture", bookState.hasArchitecture)}
                  disabled={hasRunningSession}
                >
                  {hasRunningSession ? (
                    <>
                      <Loader2Icon className="mr-2 size-4 animate-spin" />
                      {s.agentRunning}
                    </>
                  ) : (
                    <>
                      <LayoutIcon className="mr-2 size-4" />
                      {bookState.hasArchitecture ? s.reBuildArch : s.buildArch}
                    </>
                  )}
                </Button>
              )}
              <div className="flex justify-between pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  {s.back}
                </Button>
                <Button variant="outline" size="sm" onClick={next}>
                  {bookState.hasArchitecture ? s.continueStep : s.skip}
                  <ChevronRightIcon className="ml-1 size-4" />
                </Button>
              </div>
            </div>
          )}

          {step.id === "done" && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="space-y-2 text-sm">
                <SummaryRow label="Book name" value={bookState.bookName} done={progress.basicsComplete} />
                {/* D-163: the row label already says "Chapters" — repeating the
                    noun in the value is what produced "Chapters: 1 chapters". */}
                <SummaryRow label="Chapters" value={bookState.hasChapters ? String(bookState.chapterCount) : "Skipped"} done={progress.importComplete} />
                <SummaryRow label="Style Fingerprint" value={bookState.hasFingerprint ? "Captured" : "Not captured"} done={progress.styleComplete} />
                <SummaryRow label="Story Bible" value={bookState.hasStoryBible ? "Created" : "Not created"} done={progress.bibleComplete} />
                <SummaryRow label="Architecture" value={bookState.hasArchitecture ? "Created" : "Not created"} done={progress.archComplete} />
              </div>

              <Button onClick={handleFinishSetup} className="w-full" disabled={finishing}>
                <SparklesIcon className="mr-2 size-4" />
                Start Writing!
              </Button>

              <div className="flex justify-start pt-4 border-t">
                <Button variant="ghost" size="sm" onClick={prev}>
                  <ChevronLeftIcon className="mr-1 size-4" />
                  {s.back}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  done,
}: {
  label: string;
  value: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-dashed last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-medium">{value}</span>
        {done ? (
          <CheckCircle2Icon className="size-3.5 text-green-600" />
        ) : (
          <CircleDashedIcon className="size-3.5 text-muted-foreground" />
        )}
      </div>
    </div>
  );
}
