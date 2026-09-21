"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, SparklesIcon } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { countWithNoun } from "@/lib/i18n/plural";
import { useLanguage } from "@/components/providers/language-provider";
import { useAgentUIStore } from "@/stores/agent-ui-store";
import {
  BarChart,
  Bar,
  Cell,
  Line,
  LineChart,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

function ReadabilityCard({
  title,
  value,
  benchmark,
  description,
}: {
  title: string;
  value: number;
  benchmark?: { min: number; max: number } | null;
  description: string;
}) {
  const { t } = useLanguage();
  const inRange =
    !benchmark || (value >= benchmark.min && value <= benchmark.max);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-4xl font-bold">{value}</p>
        {benchmark && (
          <p className="mt-2 text-sm text-muted-foreground">
            {t.reportsUI.genreRange
              .replace("{min}", String(benchmark.min))
              .replace("{max}", String(benchmark.max))}{" "}
            <Badge variant={inRange ? "default" : "destructive"} className="ml-2">
              {inRange ? t.reportsUI.inRange : t.reportsUI.outsideRange}
            </Badge>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function getBarColor(score: number): string {
  if (score < 4) return "hsl(0, 72%, 51%)";    // red
  if (score < 7) return "hsl(45, 93%, 47%)";   // yellow
  return "hsl(142, 71%, 45%)";                   // green
}

interface ChapterBetaData {
  id: string;
  chapterNumber: number;
  title: string | null;
  betaScore: number | null;
}

export function AnalyticsTab({ bookId }: { bookId: string }) {
  // O13 - the analysis report was a dead end: metrics arrived, nothing consumed
  // them, and the journey stopped at a report. Pacing numbers exist to drive a
  // structural decision, so the report now hands off to the restructure pass.
  const { t, language } = useLanguage();
  const openWithWorkflow = useAgentUIStore((st) => st.openWithWorkflow);
  const router = useRouter();

  const { data: analysisData, isLoading: isLoadingAnalysis } = useQuery({
    queryKey: ["analysis", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/analysis`);
      if (!res.ok) throw new Error("Failed to load analysis data");
      return res.json();
    },
  });

  const { data: chaptersRaw, isLoading: isLoadingChapters } = useQuery<ChapterBetaData[]>({
    queryKey: ["chapters", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/chapters`);
      if (!res.ok) throw new Error("Failed to load chapters");
      return res.json();
    },
  });

  const { data: usageData, isLoading: isLoadingUsage } = useQuery({
    queryKey: ["usage"],
    queryFn: async () => {
      const res = await fetch("/api/usage");
      if (!res.ok) throw new Error("Failed to load usage");
      return res.json();
    },
  });

  const isEmpty = analysisData?.empty;
  const readability = analysisData?.readability;
  const pacing = analysisData?.pacing ?? [];
  const dialogue = analysisData?.dialogue ?? [];
  const overuse = analysisData?.overuse ?? [];

  // Beta score chart data
  const betaData = (chaptersRaw ?? [])
    .filter((ch): ch is ChapterBetaData & { betaScore: number } => ch.betaScore != null)
    .map((ch) => ({
      name: ch.title || `Ch ${ch.chapterNumber}`,
      score: ch.betaScore,
      chapterId: ch.id,
    }));

  const avgScore =
    betaData.length > 0
      ? betaData.reduce((sum, d) => sum + d.score, 0) / betaData.length
      : 0;

  // Histogram bins: 0-1, 1-2, ..., 9-10
  const bins = Array.from({ length: 10 }, (_, i) => ({
    range: `${i}-${i + 1}`,
    count: betaData.filter((d) => d.score >= i && d.score < i + 1).length,
  }));
  // Edge case: score of exactly 10 goes in the 9-10 bin
  const exactTens = betaData.filter((d) => d.score === 10).length;
  if (exactTens > 0) {
    // Remove duplicates from the 9-10 bin filter (scores >= 9 && < 10 are already counted)
    // Only add scores that are exactly 10
    bins[9].count += exactTens;
  }

  // Cost breakdown data from usage API
  const costData = usageData?.byKeySource
    ? Object.entries(usageData.byKeySource)
        .filter(([, data]) => (data as { costEstimate: number }).costEstimate > 0)
        .map(([source, data]) => ({
          name: source === "user" ? "Your Keys" : source === "platform" ? "Platform Keys" : source,
          value: Number(((data as { costEstimate: number }).costEstimate).toFixed(4)),
          fill: source === "user" ? "var(--primary)" : "var(--muted-foreground)",
        }))
    : [];
  const totalCost = usageData?.total?.costEstimate ?? 0;
  const allUserKeys = costData.length === 1 && costData[0]?.name === "Your Keys";
  const hasCostData = totalCost > 0;

  const isLoading = isLoadingAnalysis || isLoadingChapters;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasAnalysis = !isEmpty && readability;
  const hasBetaScores = betaData.length > 0;

  if (!hasAnalysis && !hasBetaScores && !hasCostData) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">
            {analysisData?.message ||
              "No analysis report found. Run the manuscript analyst agent first."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const defaultTab = hasBetaScores ? "betaScores" : hasAnalysis ? "readability" : "cost";

  return (
    <div className="space-y-4">
      {hasAnalysis && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t.structure.fromAnalysis}</p>
          <Button size="sm" onClick={() => openWithWorkflow("restructure")}>
            <SparklesIcon className="mr-1.5 size-3.5" />
            {t.structure.runPass}
          </Button>
        </div>
      )}
      <Tabs defaultValue={defaultTab}>
      <TabsList>
        {hasBetaScores && (
          <TabsTrigger value="betaScores">{t.reportsUI.betaScores}</TabsTrigger>
        )}
        {hasAnalysis && (
          <>
            <TabsTrigger value="readability">{t.reportsUI.readability}</TabsTrigger>
            <TabsTrigger value="pacing">{t.reportsUI.pacing}</TabsTrigger>
            <TabsTrigger value="dialogue">{t.reportsUI.dialogue}</TabsTrigger>
            <TabsTrigger value="overuse">{t.reportsUI.overuse}</TabsTrigger>
          </>
        )}
        {hasCostData && (
          <TabsTrigger value="cost">{t.reportsUI.cost}</TabsTrigger>
        )}
      </TabsList>

      {hasBetaScores && (
        <TabsContent value="betaScores">
          <div className="space-y-6">
            {/* Per-Chapter Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>{t.reportsUI.perChapterBeta}</CardTitle>
                <CardDescription>
                  {t.reportsUI.clickBarHint.replace("{avg}", avgScore.toFixed(1))}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[350px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={betaData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        className="text-xs fill-muted-foreground"
                      />
                      <YAxis
                        domain={[0, 10]}
                        className="text-xs fill-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.5rem",
                        }}
                        formatter={(value?: number | string) => [`${Number(value ?? 0).toFixed(1)} / 10`, "Score"]}
                      />
                      <ReferenceLine
                        y={avgScore}
                        stroke="var(--muted-foreground)"
                        strokeDasharray="5 5"
                        label={{ value: `Avg ${avgScore.toFixed(1)}`, position: "insideTopRight", fontSize: 11 }}
                      />
                      <Bar
                        dataKey="score"
                        name="Beta Score"
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={(_data, index) => {
                          const entry = betaData[index];
                          if (entry?.chapterId) {
                            router.push(`/books/${bookId}/chapters/${entry.chapterId}`);
                          }
                        }}
                      >
                        {betaData.map((entry, index) => (
                          <Cell key={index} fill={getBarColor(entry.score)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Score Distribution Histogram */}
            <Card>
              <CardHeader>
                <CardTitle>{t.reportsUI.scoreDistribution}</CardTitle>
                <CardDescription>{t.reportsUI.scoreRangeHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={bins}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="range"
                        className="text-xs fill-muted-foreground"
                      />
                      <YAxis
                        allowDecimals={false}
                        className="text-xs fill-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.5rem",
                        }}
                        formatter={(value?: number | string) => [Number(value ?? 0), "Chapters"]}
                      />
                      <Bar
                        dataKey="count"
                        name="Chapters"
                        fill="var(--primary)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Beta Score Progression Line Chart */}
            {betaData.length >= 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>{t.reportsUI.betaProgression}</CardTitle>
                  <CardDescription>
                    {t.reportsUI.scoreTrendHint.replace("{avg}", avgScore.toFixed(1))}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={betaData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          className="text-xs fill-muted-foreground"
                        />
                        <YAxis
                          domain={[0, 10]}
                          className="text-xs fill-muted-foreground"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--card)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.5rem",
                          }}
                          formatter={(value?: number | string) => [`${Number(value ?? 0).toFixed(1)} / 10`, "Score"]}
                        />
                        <ReferenceLine
                          y={avgScore}
                          stroke="var(--muted-foreground)"
                          strokeDasharray="5 5"
                          label={{ value: `Avg ${avgScore.toFixed(1)}`, position: "insideTopRight", fontSize: 11 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="score"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      )}

      {hasAnalysis && (
      <>
      <TabsContent value="readability">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReadabilityCard
            title={t.reportsUI.fleschKincaid}
            value={readability.fleschKincaid}
            benchmark={readability.genreBenchmark?.fk}
            description={t.reportsUI.fleschKincaidHint}
          />
          <ReadabilityCard
            title={t.reportsUI.gunningFog}
            value={readability.gunningFog}
            description={t.reportsUI.gunningFogHint}
          />
          <ReadabilityCard
            title={t.reportsUI.colemanLiau}
            value={readability.colemanLiau}
            description={t.reportsUI.colemanLiauHint}
          />
        </div>
      </TabsContent>

      <TabsContent value="pacing">
        <Card>
          <CardHeader>
            <CardTitle>{t.reportsUI.tensionCurve}</CardTitle>
            <CardDescription>{t.reportsUI.tensionOverlayHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {pacing.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.reportsUI.noPacingData}</p>
            ) : (
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={pacing}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="chapter" className="text-xs fill-muted-foreground" />
                    <YAxis domain={[0, 10]} className="text-xs fill-muted-foreground" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="tension"
                      name="Your Tension"
                      stroke="var(--primary)"
                      fill="var(--primary)"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    {pacing[0]?.genreAvg != null && (
                      <Line
                        type="monotone"
                        dataKey="genreAvg"
                        name="Genre Average"
                        stroke="var(--muted-foreground)"
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="dialogue">
        <Card>
          <CardHeader>
            <CardTitle>{t.reportsUI.dialogueDistribution}</CardTitle>
            <CardDescription>{t.reportsUI.dialogueDistributionHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {dialogue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.reportsUI.noDialogueData}</p>
            ) : (
              <>
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dialogue} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis type="number" className="text-xs fill-muted-foreground" />
                      <YAxis
                        type="category"
                        dataKey="character"
                        width={80}
                        className="text-xs fill-muted-foreground"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "var(--card)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.5rem",
                        }}
                      />
                      <Bar
                        dataKey="lineCount"
                        name="Lines"
                        fill="var(--primary)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-6 space-y-2">
                  {dialogue.map(
                    (char: {
                      character: string;
                      lineCount: number;
                      avgLength: number;
                      percentage: number;
                    }) => (
                      <div
                        key={char.character}
                        className="flex items-center justify-between rounded-md border p-3 text-sm"
                      >
                        <span className="font-medium">{char.character}</span>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <span>
                            {t.reportsUI.linesCount.replace(
                              "{count}",
                              String(char.lineCount)
                            )}
                          </span>
                          <span>
                            {t.reportsUI.avgWords.replace(
                              "{count}",
                              String(char.avgLength)
                            )}
                          </span>
                          <span>{char.percentage}%</span>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="overuse">
        <Card>
          <CardHeader>
            <CardTitle>{t.reportsUI.overuseDetection}</CardTitle>
            <CardDescription>{t.reportsUI.overuseHint}</CardDescription>
          </CardHeader>
          <CardContent>
            {overuse.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{t.reportsUI.noOveruse}</p>
            ) : (
              <div className="space-y-3">
                {overuse.map(
                  (item: {
                    word: string;
                    count: number;
                    expected: number;
                    ratio: number;
                  }) => (
                    <div
                      key={item.word}
                      className="flex items-center justify-between rounded-md border p-4"
                    >
                      <div>
                        <p className="font-medium font-mono">
                          &quot;{item.word}&quot;
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {t.reportsUI.foundTimes
                            .replace("{count}", String(item.count))
                            .replace("{expected}", String(item.expected))}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            item.ratio >= 2.5 ? "destructive" : "secondary"
                          }
                        >
                          {t.reportsUI.overuseRatio.replace(
                            "{ratio}",
                            item.ratio.toFixed(1)
                          )}
                        </Badge>
                        <div className="h-2 w-24 rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{
                              width: `${Math.min(100, (item.ratio / 3) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
      </>
      )}

      {hasCostData && (
        <TabsContent value="cost">
          <div className="space-y-6">
            {/* Total Cost Summary */}
            <Card>
              <CardHeader>
                <CardTitle>{t.reportsUI.totalCost30}</CardTitle>
                <CardDescription>{t.reportsUI.costHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">${totalCost.toFixed(2)}</p>
                {usageData?.total?.sessions > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {t.reportsUI.acrossSessions.replace(
                      "{countNoun}",
                      countWithNoun(
                        usageData.total.sessions,
                        t.common.sessionOne,
                        t.common.sessionMany,
                        { few: t.common.sessionFew, language }
                      )
                    )}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cost Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>{t.reportsUI.costByKeySource}</CardTitle>
                <CardDescription>{t.reportsUI.keySplitHint}</CardDescription>
              </CardHeader>
              <CardContent>
                {allUserKeys ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Badge variant="default" className="mb-3 bg-green-600 hover:bg-green-700">{t.reportsUI.allYourKeys}</Badge>
                    <p className="text-lg font-medium">{t.reportsUI.allYourKeysHint}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {t.reportsUI.noMarkupHint}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <div className="h-[300px] w-full max-w-[400px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={costData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            label={({ name, percent }: { name?: string; percent?: number }) =>
                              `${name ?? ""}: ${((percent ?? 0) * 100).toFixed(0)}%`
                            }
                          >
                            {costData.map((entry, index) => (
                              <Cell key={index} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "var(--card)",
                              border: "1px solid var(--border)",
                              borderRadius: "0.5rem",
                            }}
                            formatter={(value?: number | string) => [`$${Number(value ?? 0).toFixed(2)}`, "Cost"]}
                          />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 space-y-2 w-full max-w-[400px]">
                      {costData.map((entry) => (
                        <div
                          key={entry.name}
                          className="flex items-center justify-between rounded-md border p-3 text-sm"
                        >
                          <span className="font-medium">{entry.name}</span>
                          <span className="font-mono">${entry.value.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      )}
    </Tabs>
    </div>
  );
}
