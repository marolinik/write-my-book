"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage, useLocale } from "@/components/providers/language-provider";

interface DailyWordChartProps {
  data: Array<{ date: string; words: number }>;
  language?: string;
}

function formatDateLabel(dateStr: string, locale: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

function formatTooltipDate(dateStr: string, locale: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function DailyWordChart({ data }: DailyWordChartProps) {
  const { t } = useLanguage();
  const locale = useLocale();
  const s = t.writingDashboard;

  // Show every 5th label to avoid overcrowding
  const chartData = data.map((d, i) => ({
    ...d,
    label: i % 5 === 0 || i === data.length - 1 ? formatDateLabel(d.date, locale) : "",
  }));

  const maxWords = Math.max(...data.map((d) => d.words), 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{s.last30Days}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, Math.ceil(maxWords * 1.1)]}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                axisLine={false}
                tickLine={false}
                width={50}
              />
              <Tooltip
                cursor={{ fill: "color-mix(in oklab, var(--muted) 30%, transparent)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const item = payload[0].payload as { date: string; words: number };
                  return (
                    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
                      <p className="font-medium">{formatTooltipDate(item.date, locale)}</p>
                      <p className="text-muted-foreground">
                        {item.words.toLocaleString(locale)} words
                      </p>
                    </div>
                  );
                }}
              />
              <Bar
                dataKey="words"
                fill="var(--primary)"
                radius={[3, 3, 0, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
