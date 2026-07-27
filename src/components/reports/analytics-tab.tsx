"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
            Genre range: {benchmark.min}-{benchmark.max}{" "}
            <Badge variant={inRange ? "default" : "destructive"} className="ml-2">
              {inRange ? "In Range" : "Outside Range"}
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
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        {hasBetaScores && (
          <TabsTrigger value="betaScores">Beta Scores</TabsTrigger>
        )}
        {hasAnalysis && (
          <>
            <TabsTrigger value="readability">Readability</TabsTrigger>
            <TabsTrigger value="pacing">Pacing</TabsTrigger>
            <TabsTrigger value="dialogue">Dialogue</TabsTrigger>
            <TabsTrigger value="overuse">Overuse</TabsTrigger>
          </>
        )}
        {hasCostData && (
          <TabsTrigger value="cost">Cost</TabsTrigger>
        )}
      </TabsList>

      {hasBetaScores && (
        <TabsContent value="betaScores">
          <div className="space-y-6">
            {/* Per-Chapter Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Per-Chapter Beta Scores</CardTitle>
                <CardDescription>
                  Click a bar to navigate to that chapter. Dashed line shows the average ({avgScore.toFixed(1)}).
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
                <CardTitle>Score Distribution</CardTitle>
                <CardDescription>
                  Number of chapters in each 1-point score range
                </CardDescription>
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
                  <CardTitle>Beta Score Progression</CardTitle>
                  <CardDescription>
                    Score trend across chapters (left to right). Dashed line shows the average ({avgScore.toFixed(1)}).
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
            title="Flesch-Kincaid"
            value={readability.fleschKincaid}
            benchmark={readability.genreBenchmark?.fk}
            description="Grade level required to understand the text"
          />
          <ReadabilityCard
            title="Gunning Fog"
            value={readability.gunningFog}
            description="Years of formal education needed"
          />
          <ReadabilityCard
            title="Coleman-Liau"
            value={readability.colemanLiau}
            description="Based on characters and sentences"
          />
        </div>
      </TabsContent>

      <TabsContent value="pacing">
        <Card>
          <CardHeader>
            <CardTitle>Tension Curve</CardTitle>
            <CardDescription>
              Chapter-by-chapter tension with genre overlay
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pacing.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No pacing data available.
              </p>
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
            <CardTitle>Dialogue Distribution</CardTitle>
            <CardDescription>Per-character dialogue breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {dialogue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No dialogue data available.
              </p>
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
                          <span>{char.lineCount} lines</span>
                          <span>Avg {char.avgLength} words</span>
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
            <CardTitle>Overuse Detection</CardTitle>
            <CardDescription>
              Words and phrases appearing 2x+ above expected frequency
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overuse.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No overuse patterns detected.
              </p>
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
                          Found {item.count} times (expected ~{item.expected})
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            item.ratio >= 2.5 ? "destructive" : "secondary"
                          }
                        >
                          {item.ratio.toFixed(1)}x overuse
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
                <CardTitle>Total Cost (Last 30 Days)</CardTitle>
                <CardDescription>
                  Estimated cost across all agent sessions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">${totalCost.toFixed(2)}</p>
                {usageData?.total?.sessions > 0 && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Across {usageData.total.sessions} session{usageData.total.sessions !== 1 ? "s" : ""}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Cost Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown by Key Source</CardTitle>
                <CardDescription>
                  How your costs are split between your own API keys and platform keys
                </CardDescription>
              </CardHeader>
              <CardContent>
                {allUserKeys ? (
                  <div className="flex flex-col items-center py-8 text-center">
                    <Badge variant="default" className="mb-3 bg-green-600 hover:bg-green-700">
                      100% Your Keys
                    </Badge>
                    <p className="text-lg font-medium">
                      All usage is on your own API keys
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      You&apos;re paying provider rates directly with no platform markup.
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
  );
}
