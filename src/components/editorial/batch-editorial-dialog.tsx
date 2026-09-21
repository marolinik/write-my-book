"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { getAgentStrings, workflowLabel } from "@/lib/i18n/agent-strings";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClockIcon, Loader2Icon, MoonIcon, ZapIcon } from "lucide-react";

import { isTerminalBatchStatus } from "@/lib/batch/batch-status";
import type { UIStrings } from "@/lib/i18n/ui-strings/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The batch's own status, in the writer's language. The API returns the
 * `BatchStatus` enum member, which is a stored value in English; the badge
 * printed it raw, so a Serbian writer read "queued" and then "running".
 */
function batchStatusLabel(status: string | undefined, t: UIStrings): string {
  const s = t.editorialUI;
  const labels: Record<string, string> = {
    queued: s.statusQueued,
    running: s.statusRunning,
    needs_approval: s.statusNeedsApproval,
    halted: s.statusHalted,
    done: s.statusDone,
    failed: s.statusFailed,
    cancelled: s.statusCancelled,
  };
  return labels[status ?? "queued"] ?? s.statusQueued;
}

/** The four v1 batch-eligible (non-prose-mutating) editorial passes. */
const BATCH_PASSES: ReadonlyArray<{ id: string; perChapter: boolean }> = [
  { id: "dev-edit", perChapter: true },
  { id: "line-edit", perChapter: true },
  { id: "beta-read", perChapter: true },
  { id: "analyze", perChapter: false },
];

const DEFAULT_CAP_USD = 10;
const MAX_CAP_USD = 25;
/**
 * Smallest cap the field offers, in cents (D-125). The API accepts any finite
 * `0 < cap <= 25`; the field previously rendered `min={1} step={1}`, which made
 * every sub-dollar cap look forbidden even though the batch guard, the digest
 * and the notification copy all support one. A cent-scale cap is the ONLY way
 * to observe the budget-halt path without hand-rolling an API call, so it must
 * be typable here.
 */
const MIN_CAP_USD = 0.01;
const CAP_STEP_USD = 0.01;

/**
 * One message for every rejected cap — the bounds are stated, not implied.
 * The sentence comes from the caller's dictionary; the bounds are filled in
 * here, so no surface can advertise a range the gate does not enforce.
 */
function capRangeMessage(template: string): string {
  return template
    .replace("{min}", `$${MIN_CAP_USD.toFixed(2)}`)
    .replace("{max}", `$${MAX_CAP_USD.toFixed(2)}`);
}

/**
 * Validate the typed cap against the SAME bounds the field advertises (D-125).
 * Returns the parsed dollar amount or the reason it was refused — never a
 * silent coercion (an empty field used to become `Number("") === 0`, which the
 * old gate then rejected with a toast that named "$0" as if 0 were allowed).
 */
export function parseBatchCapUsd(
  raw: string,
  rangeTemplate: string
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, error: capRangeMessage(rangeTemplate) };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < MIN_CAP_USD || value > MAX_CAP_USD) {
    return { ok: false, error: capRangeMessage(rangeTemplate) };
  }
  return { ok: true, value };
}

interface BatchStatusCounts {
  total: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  skipped: number;
}

interface BatchStatusResponse {
  batch: {
    id: string;
    status: string;
    budgetCapUsd: number;
    spentUsd: number;
    halted: boolean;
    haltReason: string | null;
    childCount: number;
    scheduledFor: string | null;
    digest: unknown;
  };
  counts: BatchStatusCounts;
}

interface BatchEditorialDialogProps {
  bookId: string;
  chapterNumbers: number[];
  /**
   * Opened from outside — the editorial header does this when the writer has
   * "all chapters" selected and presses a single-pass button. Running one
   * chapter and calling it done was the old behaviour (S3-14).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Pre-tick the pass the writer actually asked for. */
  initialPasses?: string[];
  /** Hide the dialog's own trigger when the caller supplies the button. */
  hideTrigger?: boolean;
}

/**
 * "Batch editorial" action + status view (BATCH-SPEC §7.3). Pick non-mutating
 * passes over a chapter range, set a dollar cap, and run now or tonight at 2am.
 * v1 worker concurrency is 2, so passes serialize ~2-at-a-time — the copy says
 * so honestly, and the cap is an ESTIMATE, not billed actuals.
 */
export function BatchEditorialDialog({
  bookId,
  chapterNumbers,
  open: controlledOpen,
  onOpenChange,
  initialPasses,
  hideTrigger,
}: BatchEditorialDialogProps) {
  const { t, language } = useLanguage();
  // The same names the rest of the app uses for these passes.
  const agentStrings = getAgentStrings(language);
  const minChapter = chapterNumbers.length ? chapterNumbers[0] : 1;
  const maxChapter = chapterNumbers.length ? chapterNumbers[chapterNumbers.length - 1] : 1;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [passes, setPasses] = useState<Set<string>>(
    new Set(initialPasses ?? ["dev-edit"])
  );
  const [start, setStart] = useState(minChapter);
  const [end, setEnd] = useState(maxChapter);
  // The cap is held as the RAW string the writer typed (D-125): a number state
  // conflates "" with 0 and fights every intermediate decimal keystroke, which
  // is half of why a sub-dollar cap was unreachable from the UI.
  const [capInput, setCapInput] = useState(String(DEFAULT_CAP_USD));
  const [capError, setCapError] = useState<string | null>(null);
  const capInputRef = useRef<HTMLInputElement>(null);
  const [schedule, setSchedule] = useState<"now" | "tonight">("now");
  const [submitting, setSubmitting] = useState(false);

  const [batchId, setBatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<BatchStatusResponse | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/books/${bookId}/batch/${id}`);
        if (!res.ok) return;
        const data: BatchStatusResponse = await res.json();
        setStatus(data);
        // ONE shared terminal set (D-186c). The local copy this replaced omitted
        // `halted`, so a budget-cap halt — reconciled and final — was polled
        // every 3s forever and still offered "Cancel batch".
        if (isTerminalBatchStatus(data.batch.status)) stopPolling();
      } catch {
        // Transient poll error — keep the last known status.
      }
    },
    [bookId, stopPolling]
  );

  useEffect(() => {
    if (!batchId) return;
    poll(batchId);
    pollRef.current = setInterval(() => poll(batchId), 3000);
    return stopPolling;
  }, [batchId, poll, stopPolling]);

  function togglePass(id: string) {
    setPasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Compute the next local 2am as an absolute instant (tz-correct, §3.4). */
  function nextTwoAmIso(): string {
    const now = new Date();
    const target = new Date(now);
    target.setHours(2, 0, 0, 0);
    if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
    return target.toISOString();
  }

  async function submit() {
    if (passes.size === 0) {
      toast.error(t.toasts.pickOnePass);
      return;
    }
    // D-125: same bounds the field advertises, refused where the writer is
    // looking (inline alert + aria-invalid + focus) instead of by a toast that
    // named a range the code did not enforce.
    const parsedCap = parseBatchCapUsd(capInput, t.batchEditorial.capRange);
    if (!parsedCap.ok) {
      setCapError(parsedCap.error);
      capInputRef.current?.focus();
      return;
    }
    setCapError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowIds: Array.from(passes),
          chapterStart: start,
          chapterEnd: end,
          budgetCapUsd: parsedCap.value,
          scheduleMode: schedule,
          ...(schedule === "tonight" ? { scheduledFor: nextTwoAmIso() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? t.bookUI.batchFailed);
        return;
      }
      toast.success(
        schedule === "tonight"
          ? t.bookUI.batchScheduled.replace("{n}", String(body.childCount))
          : t.bookUI.batchQueued.replace("{n}", String(body.childCount))
      );
      setBatchId(body.batchId);
    } catch {
      toast.error(t.bookUI.batchFailed);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancel() {
    if (!batchId) return;
    try {
      const res = await fetch(`/api/books/${bookId}/batch/${batchId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error(t.toasts.batchCancelFailed);
        return;
      }
      toast.success(t.toasts.batchCancelled);
      poll(batchId);
    } catch {
      toast.error(t.toasts.batchCancelFailed);
    }
  }

  function reset() {
    stopPolling();
    setBatchId(null);
    setStatus(null);
  }

  const done = status ? status.counts.completed + status.counts.failed + status.counts.skipped : 0;
  const total = status?.batch.childCount ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const isTerminal = status ? isTerminalBatchStatus(status.batch.status) : false;
  // Cap shown while the first poll is still in flight: the value that was
  // actually submitted (the server row wins the moment it arrives).
  const parsedCap = parseBatchCapUsd(capInput, t.batchEditorial.capRange);
  const submittedCapUsd = parsedCap.ok ? parsedCap.value : DEFAULT_CAP_USD;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarClockIcon className="mr-1.5 size-3.5" />
            {t.bookUI.batchEditorial}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        {!batchId ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.batchEditorial.title}</DialogTitle>
              <DialogDescription>
                {t.bookUI.batchWhat}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Passes */}
              <div className="space-y-2">
                <Label>{t.batchEditorial.passes}</Label>
                <div className="flex flex-wrap gap-2">
                  {BATCH_PASSES.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant={passes.has(p.id) ? "default" : "outline"}
                      onClick={() => togglePass(p.id)}
                    >
                      {workflowLabel(agentStrings, p.id) ?? p.id}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Chapter range */}
              <div className="space-y-2">
                <Label>{t.batchEditorial.chapters}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={minChapter}
                    max={maxChapter}
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                    className="w-20"
                    aria-label={t.batchEditorial.firstChapter}
                  />
                  <span className="text-muted-foreground text-sm">{t.bookUI.batchTo}</span>
                  <Input
                    type="number"
                    min={minChapter}
                    max={maxChapter}
                    value={end}
                    onChange={(e) => setEnd(Number(e.target.value))}
                    className="w-20"
                    aria-label={t.batchEditorial.lastChapter}
                  />
                  <span className="text-muted-foreground text-xs">
                    ({t.bookUI.batchRange
                      .replace("{a}", String(minChapter))
                      .replace("{b}", String(maxChapter))})
                  </span>
                </div>
              </div>

              {/* Budget cap */}
              <div className="space-y-2">
                <Label htmlFor="batch-cap">{t.batchEditorial.budgetCap}</Label>
                <Input
                  id="batch-cap"
                  ref={capInputRef}
                  type="number"
                  inputMode="decimal"
                  min={MIN_CAP_USD}
                  max={MAX_CAP_USD}
                  step={CAP_STEP_USD}
                  value={capInput}
                  onChange={(e) => {
                    setCapInput(e.target.value);
                    if (capError) setCapError(null);
                  }}
                  aria-invalid={capError ? true : undefined}
                  aria-describedby={
                    capError ? "batch-cap-error" : "batch-cap-hint"
                  }
                  className="w-28"
                />
                {capError && (
                  <p
                    id="batch-cap-error"
                    role="alert"
                    className="text-destructive text-xs"
                  >
                    {capError}
                  </p>
                )}
                <p id="batch-cap-hint" className="text-muted-foreground text-xs">
                  {t.bookUI.batchCapNote} ${MIN_CAP_USD.toFixed(2)}–$
                  {MAX_CAP_USD}.
                </p>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <Label>{t.batchEditorial.run}</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={schedule === "now" ? "default" : "outline"}
                    onClick={() => setSchedule("now")}
                  >
                    <ZapIcon className="mr-1.5 size-3.5" />
                    {t.bookUI.batchNow}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={schedule === "tonight" ? "default" : "outline"}
                    onClick={() => setSchedule("tonight")}
                  >
                    <MoonIcon className="mr-1.5 size-3.5" />
                    {t.bookUI.batchTonight}
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={submit} disabled={submitting || passes.size === 0}>
                {submitting && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                {t.bookUI.batchQueue}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t.batchEditorial.status}</DialogTitle>
              <DialogDescription>
                {status?.batch.scheduledFor && !isTerminal
                  ? t.editorialUI.batchScheduledNote
                  : t.bookUI.batchStatusNote}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={isTerminal ? "secondary" : "outline"}>
                  {batchStatusLabel(status?.batch.status, t)}
                </Badge>
                <span className="text-muted-foreground text-sm">
                  ${(status?.batch.spentUsd ?? 0).toFixed(2)} / $
                  {(status?.batch.budgetCapUsd ?? submittedCapUsd).toFixed(2)}
                </span>
              </div>

              <Progress value={pct} />
              <p className="text-muted-foreground text-xs">
                {t.editorialUI.passesDone
                  .replace("{done}", String(done))
                  .replace("{total}", String(total))}
                {status && status.counts.skipped > 0
                  ? ` · ${t.editorialUI.passesSkipped.replace("{count}", String(status.counts.skipped))}`
                  : ""}
                {status && status.counts.failed > 0
                  ? ` · ${t.editorialUI.passesFailed.replace("{count}", String(status.counts.failed))}`
                  : ""}
                {status?.batch.halted && status.batch.haltReason
                  ? ` · ${t.editorialUI.haltedWithReason.replace("{reason}", status.batch.haltReason)}`
                  : ""}
              </p>
            </div>

            <DialogFooter className="gap-2">
              {!isTerminal && (
                <Button variant="outline" size="sm" onClick={cancel}>
                  {t.bookUI.batchCancel}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={reset}>
                {t.bookUI.batchNew}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
