"use client";

import { useMemo } from "react";
import {
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useBookState } from "@/hooks/use-book-state";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import { useLanguage } from "@/components/providers/language-provider";

// ---------------------------------------------------------------------------
// Issue 10: Pre-Export Quality Gate
// Shows manuscript readiness scorecard before allowing export.
// ---------------------------------------------------------------------------

interface ManuscriptReadinessProps {
  bookId: string;
  /** Called when user clicks "Export anyway" */
  onProceed: () => void;
}

interface ReadinessCheck {
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
}

export function ManuscriptReadiness({ bookId, onProceed }: ManuscriptReadinessProps) {
  const bookState = useBookState(bookId);
  const openWithWorkflow = useAgentUIStore((s) => s.openWithWorkflow);
  const { t } = useLanguage();

  const checks = useMemo((): ReadinessCheck[] => {
    if (bookState.isLoading) return [];

    const bs = bookState;
    const cs = bs.chapterStatuses;
    const total = bs.chapterCount;

    const draftedPlus = (cs.drafted ?? 0) + (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.beta_passed ?? 0);
    const editedPlus = (cs.dev_edited ?? 0) + (cs.line_edited ?? 0) + (cs.beta_read ?? 0) + (cs.beta_passed ?? 0);
    const betaPassedCount = cs.beta_passed ?? 0;
    const pendingFindings = bs.pendingFindingsCount ?? 0;

    const s = t.importExportUI;
    const counted = (template: string, done: number) =>
      template.replace("{done}", String(done)).replace("{total}", String(total));

    return [
      {
        label: s.readyChaptersDrafted,
        status: draftedPlus >= total ? "pass" : draftedPlus > 0 ? "warn" : "fail",
        detail: counted(s.readyDraftedDetail, draftedPlus),
      },
      {
        label: s.readyChaptersEdited,
        status: editedPlus >= total ? "pass" : editedPlus > 0 ? "warn" : "fail",
        detail: editedPlus >= total
          ? s.readyEditedAll
          : s.readyEditedSome.replace("{count}", String(total - editedPlus)),
      },
      {
        label: s.readyBetaReading,
        status: betaPassedCount >= total ? "pass" : betaPassedCount > 0 ? "warn" : "fail",
        detail: betaPassedCount >= total
          ? s.readyBetaAll
          : counted(s.readyBetaSome, betaPassedCount),
      },
      {
        label: s.readyPendingFindings,
        status: pendingFindings === 0 ? "pass" : pendingFindings < 10 ? "warn" : "fail",
        detail: pendingFindings === 0
          ? s.readyFindingsNone
          : s.readyFindingsSome.replace("{count}", String(pendingFindings)),
      },
      {
        label: s.readyFingerprint,
        status: bs.hasFingerprint ? "pass" : "warn",
        detail: bs.hasFingerprint ? s.readyFingerprintYes : s.readyFingerprintNo,
      },
      {
        label: s.readyStoryBible,
        status: bs.hasStoryBible ? "pass" : "warn",
        detail: bs.hasStoryBible ? s.readyBibleYes : s.readyBibleNo,
      },
    ];
  }, [bookState, t]);

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const totalChecks = checks.length;
  const score = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 0;
  const isReady = failCount === 0;

  const statusIcon = (status: string) => {
    switch (status) {
      case "pass":
        return <CheckCircle2Icon className="size-4 text-green-500 shrink-0" />;
      case "warn":
        return <AlertTriangleIcon className="size-4 text-amber-500 shrink-0" />;
      case "fail":
        return <XCircleIcon className="size-4 text-red-500 shrink-0" />;
    }
  };

  if (bookState.isLoading) return null;

  return (
    <Card className="border-2 border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheckIcon className="size-4" />{t.importExportUI.manuscriptReadiness}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">{t.appUI.qualityScore}</span>
            <span className="font-medium">{score}%</span>
          </div>
          <Progress
            value={score}
            className={`h-2 ${score >= 80 ? "" : score >= 50 ? "[&>div]:bg-amber-500" : "[&>div]:bg-red-500"}`}
          />
        </div>

        {/* Checks */}
        <div className="space-y-2">
          {checks.map((check) => (
            <div key={check.label} className="flex items-start gap-2">
              {statusIcon(check.status)}
              <div className="min-w-0">
                <p className="text-sm font-medium">{check.label}</p>
                <p className="text-xs text-muted-foreground">{check.detail}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Summary badges */}
        <div className="flex flex-wrap gap-2">
          {passCount > 0 && (
            <Badge variant="secondary" className="text-green-600 bg-green-500/10">
              {t.importExportUI.passedCount.replace("{count}", String(passCount))}
            </Badge>
          )}
          {warnCount > 0 && (
            <Badge variant="secondary" className="text-amber-600 bg-amber-500/10">
              {t.importExportUI.warningsCount.replace("{count}", String(warnCount))}
            </Badge>
          )}
          {failCount > 0 && (
            <Badge variant="secondary" className="text-red-600 bg-red-500/10">
              {t.importExportUI.issuesCount.replace("{count}", String(failCount))}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          {!isReady && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openWithWorkflow("publishing-check")}
            >{t.importExportUI.runPublishingCheck}</Button>
          )}
          <Button
            size="sm"
            variant={isReady ? "default" : "secondary"}
            onClick={onProceed}
          >
            {isReady ? t.importExportUI.exportManuscript : t.importExportUI.exportAnyway}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
