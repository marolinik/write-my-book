"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CalendarClockIcon, Loader2Icon, MoonIcon, ZapIcon } from "lucide-react";

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

/** The four v1 batch-eligible (non-prose-mutating) editorial passes. */
const BATCH_PASSES: ReadonlyArray<{ id: string; label: string; perChapter: boolean }> = [
  { id: "dev-edit", label: "Dev Edit", perChapter: true },
  { id: "line-edit", label: "Line Edit", perChapter: true },
  { id: "beta-read", label: "Beta Read", perChapter: true },
  { id: "analyze", label: "Analyze", perChapter: false },
];

const DEFAULT_CAP_USD = 10;
const MAX_CAP_USD = 25;

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

const TERMINAL = new Set(["done", "failed", "cancelled"]);

interface BatchEditorialDialogProps {
  bookId: string;
  chapterNumbers: number[];
}

/**
 * "Batch editorial" action + status view (BATCH-SPEC §7.3). Pick non-mutating
 * passes over a chapter range, set a dollar cap, and run now or tonight at 2am.
 * v1 worker concurrency is 2, so passes serialize ~2-at-a-time — the copy says
 * so honestly, and the cap is an ESTIMATE, not billed actuals.
 */
export function BatchEditorialDialog({ bookId, chapterNumbers }: BatchEditorialDialogProps) {
  const minChapter = chapterNumbers.length ? chapterNumbers[0] : 1;
  const maxChapter = chapterNumbers.length ? chapterNumbers[chapterNumbers.length - 1] : 1;

  const [open, setOpen] = useState(false);
  const [passes, setPasses] = useState<Set<string>>(new Set(["dev-edit"]));
  const [start, setStart] = useState(minChapter);
  const [end, setEnd] = useState(maxChapter);
  const [cap, setCap] = useState(DEFAULT_CAP_USD);
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
        if (TERMINAL.has(data.batch.status)) stopPolling();
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
      toast.error("Pick at least one editorial pass.");
      return;
    }
    if (cap <= 0 || cap > MAX_CAP_USD) {
      toast.error(`Budget cap must be between $0 and $${MAX_CAP_USD}.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/books/${bookId}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowIds: Array.from(passes),
          chapterStart: start,
          chapterEnd: end,
          budgetCapUsd: cap,
          scheduleMode: schedule,
          ...(schedule === "tonight" ? { scheduledFor: nextTwoAmIso() } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Failed to queue batch.");
        return;
      }
      toast.success(
        schedule === "tonight"
          ? `Batch scheduled — ${body.childCount} passes will run tonight.`
          : `Batch queued — ${body.childCount} passes running.`
      );
      setBatchId(body.batchId);
    } catch {
      toast.error("Failed to queue batch. Please try again.");
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
        toast.error("Failed to cancel batch.");
        return;
      }
      toast.success("Batch cancelled — remaining passes will be skipped.");
      poll(batchId);
    } catch {
      toast.error("Failed to cancel batch.");
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
  const isTerminal = status ? TERMINAL.has(status.batch.status) : false;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarClockIcon className="mr-1.5 size-3.5" />
          Batch editorial
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {!batchId ? (
          <>
            <DialogHeader>
              <DialogTitle>Batch editorial</DialogTitle>
              <DialogDescription>
                Queue non-mutating editorial passes over a range of chapters. Your
                prose is never rewritten. Runs ~2 passes at a time.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Passes */}
              <div className="space-y-2">
                <Label>Passes</Label>
                <div className="flex flex-wrap gap-2">
                  {BATCH_PASSES.map((p) => (
                    <Button
                      key={p.id}
                      type="button"
                      size="sm"
                      variant={passes.has(p.id) ? "default" : "outline"}
                      onClick={() => togglePass(p.id)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Chapter range */}
              <div className="space-y-2">
                <Label>Chapters</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={minChapter}
                    max={maxChapter}
                    value={start}
                    onChange={(e) => setStart(Number(e.target.value))}
                    className="w-20"
                    aria-label="First chapter"
                  />
                  <span className="text-muted-foreground text-sm">to</span>
                  <Input
                    type="number"
                    min={minChapter}
                    max={maxChapter}
                    value={end}
                    onChange={(e) => setEnd(Number(e.target.value))}
                    className="w-20"
                    aria-label="Last chapter"
                  />
                  <span className="text-muted-foreground text-xs">
                    (available {minChapter}–{maxChapter})
                  </span>
                </div>
              </div>

              {/* Budget cap */}
              <div className="space-y-2">
                <Label htmlFor="batch-cap">Budget cap (USD)</Label>
                <Input
                  id="batch-cap"
                  type="number"
                  min={1}
                  max={MAX_CAP_USD}
                  step={1}
                  value={cap}
                  onChange={(e) => setCap(Number(e.target.value))}
                  className="w-28"
                />
                <p className="text-muted-foreground text-xs">
                  Estimated spend, not billed actuals. Max ${MAX_CAP_USD}. The batch
                  halts remaining passes if the estimate reaches this cap.
                </p>
              </div>

              {/* Schedule */}
              <div className="space-y-2">
                <Label>Run</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={schedule === "now" ? "default" : "outline"}
                    onClick={() => setSchedule("now")}
                  >
                    <ZapIcon className="mr-1.5 size-3.5" />
                    Now
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={schedule === "tonight" ? "default" : "outline"}
                    onClick={() => setSchedule("tonight")}
                  >
                    <MoonIcon className="mr-1.5 size-3.5" />
                    Tonight 2am
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={submit} disabled={submitting || passes.size === 0}>
                {submitting && <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />}
                Queue batch
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Batch status</DialogTitle>
              <DialogDescription>
                {status?.batch.scheduledFor && !isTerminal
                  ? "Scheduled — will run at the chosen time."
                  : "Passes run ~2 at a time; check back for the morning digest."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={isTerminal ? "secondary" : "outline"}>
                  {status?.batch.status ?? "queued"}
                </Badge>
                <span className="text-muted-foreground text-sm">
                  ${(status?.batch.spentUsd ?? 0).toFixed(2)} / $
                  {(status?.batch.budgetCapUsd ?? cap).toFixed(2)}
                </span>
              </div>

              <Progress value={pct} />
              <p className="text-muted-foreground text-xs">
                {done}/{total} passes done
                {status && status.counts.skipped > 0
                  ? ` · ${status.counts.skipped} skipped`
                  : ""}
                {status && status.counts.failed > 0
                  ? ` · ${status.counts.failed} failed`
                  : ""}
                {status?.batch.halted && status.batch.haltReason
                  ? ` · halted (${status.batch.haltReason})`
                  : ""}
              </p>
            </div>

            <DialogFooter className="gap-2">
              {!isTerminal && (
                <Button variant="outline" size="sm" onClick={cancel}>
                  Cancel batch
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={reset}>
                New batch
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
