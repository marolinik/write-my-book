"use client";

import { useQuery } from "@tanstack/react-query";
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
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
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

export function AnalyticsTab({ bookId }: { bookId: string }) {
  const { data: analysisData, isLoading } = useQuery({
    queryKey: ["analysis", bookId],
    queryFn: async () => {
      const res = await fetch(`/api/books/${bookId}/analysis`);
      if (!res.ok) throw new Error("Failed to load analysis data");
      return res.json();
    },
  });

  const isEmpty = analysisData?.empty;
  const readability = analysisData?.readability;
  const pacing = analysisData?.pacing ?? [];
  const dialogue = analysisData?.dialogue ?? [];
  const overuse = analysisData?.overuse ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isEmpty) {
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

  if (!readability) return null;

  return (
    <Tabs defaultValue="readability">
      <TabsList>
        <TabsTrigger value="readability">Readability</TabsTrigger>
        <TabsTrigger value="pacing">Pacing</TabsTrigger>
        <TabsTrigger value="dialogue">Dialogue</TabsTrigger>
        <TabsTrigger value="overuse">Overuse</TabsTrigger>
      </TabsList>

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
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "0.5rem",
                      }}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="tension"
                      name="Your Tension"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.1}
                      strokeWidth={2}
                    />
                    {pacing[0]?.genreAvg != null && (
                      <Line
                        type="monotone"
                        dataKey="genreAvg"
                        name="Genre Average"
                        stroke="hsl(var(--muted-foreground))"
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
                          backgroundColor: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "0.5rem",
                        }}
                      />
                      <Bar
                        dataKey="lineCount"
                        name="Lines"
                        fill="hsl(var(--primary))"
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
    </Tabs>
  );
}
