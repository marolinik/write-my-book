"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StructuredFingerprint, CalibrationSample } from "@/lib/agents/types";

interface StyleProfile {
  id: string;
  name: string;
  description?: string | null;
  fingerprint: string;
  metrics?: StructuredFingerprint | null;
  calibrationSamples?: CalibrationSample[] | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Metrics Cards ────────────────────────────────────────────

function MetricCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
}

function MetricValue({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-medium">{value}</span>
    </div>
  );
}

function FrequencyBadge({ value }: { value: string }) {
  const colorMap: Record<string, string> = {
    heavy: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    frequent: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    light: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    rare: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    none: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    absent: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorMap[value] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}
    >
      {value}
    </span>
  );
}

function MetricsDisplay({ metrics }: { metrics: StructuredFingerprint }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {/* Sentence Length */}
      <MetricCard title="Sentence Length">
        <MetricValue label="Mean" value={`${metrics.sentenceLength.mean.toFixed(1)} words`} />
        <MetricValue label="Median" value={`${metrics.sentenceLength.median.toFixed(1)} words`} />
        <MetricValue label="Std Dev" value={metrics.sentenceLength.stdDev.toFixed(1)} />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Distribution</span>
          <Badge variant="outline" className="text-xs">
            {metrics.sentenceLength.distribution}
          </Badge>
        </div>
      </MetricCard>

      {/* Vocabulary */}
      <MetricCard title="Vocabulary Richness">
        <MetricValue
          label="Type-Token Ratio"
          value={metrics.vocabularyRichness.typeTokenRatio.toFixed(3)}
        />
        <MetricValue
          label="Hapax Rate"
          value={`${(metrics.vocabularyRichness.hapaxRate * 100).toFixed(1)}%`}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Register</span>
          <Badge variant="outline" className="text-xs">
            {metrics.vocabularyRichness.register}
          </Badge>
        </div>
      </MetricCard>

      {/* Dialogue Ratio */}
      <MetricCard title="Dialogue Ratio">
        <div className="flex flex-col items-center py-2">
          <span className="text-3xl font-bold tabular-nums">
            {(metrics.dialogueRatio * 100).toFixed(0)}%
          </span>
          <span className="text-xs text-muted-foreground mt-1">of text is dialogue</span>
          <div className="mt-2 h-2 w-full rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${metrics.dialogueRatio * 100}%` }}
            />
          </div>
        </div>
      </MetricCard>

      {/* Paragraph Length */}
      <MetricCard title="Paragraph Length">
        <MetricValue label="Mean" value={`${metrics.paragraphLength.mean.toFixed(1)} sentences`} />
        <MetricValue label="Median" value={`${metrics.paragraphLength.median.toFixed(1)} sentences`} />
        <MetricValue
          label="Single-Sentence"
          value={`${(metrics.paragraphLength.singleSentenceRate * 100).toFixed(0)}%`}
        />
      </MetricCard>

      {/* Punctuation */}
      <MetricCard title="Punctuation Patterns">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Em Dash</span>
            <FrequencyBadge value={metrics.punctuation.emDashFrequency} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Semicolon</span>
            <FrequencyBadge value={metrics.punctuation.semicolonUsage} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Ellipsis</span>
            <FrequencyBadge value={metrics.punctuation.ellipsisFrequency} />
          </div>
        </div>
      </MetricCard>

      {/* Narrative Distance */}
      <MetricCard title="Narrative Distance">
        <div className="flex flex-col items-center py-2">
          <Badge className="text-sm px-3 py-1">{metrics.narrativeDistance}</Badge>
          <span className="text-xs text-muted-foreground mt-2">closeness to character</span>
        </div>
      </MetricCard>

      {/* POV */}
      <MetricCard title="Point of View">
        <div className="flex flex-col items-center py-2">
          <span className="text-sm font-medium text-center">{metrics.pov}</span>
        </div>
      </MetricCard>

      {/* Metaphor Domains */}
      {metrics.metaphorDomains && metrics.metaphorDomains.length > 0 && (
        <MetricCard title="Metaphor Domains">
          <div className="flex flex-wrap gap-1.5 py-1">
            {metrics.metaphorDomains.map((domain) => (
              <Badge key={domain} variant="secondary" className="text-xs">
                {domain}
              </Badge>
            ))}
          </div>
        </MetricCard>
      )}
    </div>
  );
}

// ─── Calibration Samples ──────────────────────────────────────

function CalibrationSamplesDisplay({
  samples,
}: {
  samples: CalibrationSample[];
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Calibration Samples</h3>
      <p className="text-sm text-muted-foreground">
        These passages best demonstrate the distinctive qualities of the writing voice.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {samples.map((sample, idx) => (
          <Card key={idx}>
            <CardContent className="pt-4 space-y-3">
              <blockquote className="border-l-2 border-primary/40 pl-3 text-sm italic leading-relaxed font-serif">
                {sample.passage}
              </blockquote>
              <p className="text-sm text-muted-foreground">{sample.why}</p>
              <div className="flex flex-wrap gap-1.5">
                {sample.features.map((feature) => (
                  <Badge key={feature} variant="outline" className="text-xs">
                    {feature}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Fingerprint Text (Collapsible) ──────────────────────────

function FingerprintText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="text-xs">{expanded ? "v" : ">"}</span>
        Full Prose Fingerprint
      </button>
      {expanded && (
        <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap rounded-md border bg-muted/50 p-4 font-serif text-sm leading-relaxed">
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────

export function StyleProfileViewer({
  profiles,
}: {
  profiles: StyleProfile[];
}) {
  if (profiles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            No style profiles yet. Create one to capture your writing fingerprint.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {profiles.map((profile) => (
        <div key={profile.id} className="space-y-6">
          {/* Profile Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">{profile.name}</h2>
              {profile.description && (
                <p className="text-sm text-muted-foreground">
                  {profile.description}
                </p>
              )}
            </div>
            <Badge variant="secondary">
              {new Date(profile.updatedAt).toLocaleDateString()}
            </Badge>
          </div>

          {/* Structured Metrics */}
          {profile.metrics && typeof profile.metrics === "object" && !Array.isArray(profile.metrics) ? (
            <MetricsDisplay metrics={profile.metrics as StructuredFingerprint} />
          ) : (
            <Card className="border-dashed">
              <CardContent className="py-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No structured metrics yet. Run the Style Capture workflow again to
                  extract quantitative voice data.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Calibration Samples */}
          {Array.isArray(profile.calibrationSamples) &&
            profile.calibrationSamples.length > 0 && (
              <CalibrationSamplesDisplay
                samples={profile.calibrationSamples}
              />
            )}

          {/* Collapsible Prose Fingerprint */}
          <FingerprintText text={profile.fingerprint} />
        </div>
      ))}
    </div>
  );
}
