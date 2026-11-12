// P2-51: the heatmap grid is built in UTC. A New York writer at 20:00 local
// (01:00 UTC the next day) used to get every cell one row off, and the server
// and the browser built different grids.
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { buildHeatmapGrid, utcMonthOf } from "@/lib/writing/heatmap-grid";

const savedTz = process.env.TZ;
afterEach(() => {
  if (savedTz === undefined) delete process.env.TZ;
  else process.env.TZ = savedTz;
});

describe("buildHeatmapGrid", () => {
  it.each(["America/New_York", "Europe/Berlin", "Asia/Tokyo", "UTC"])("puts today in its UTC weekday row in %s", (tz) => {
    process.env.TZ = tz;
    const grid = buildHeatmapGrid([{ date: "2026-11-12", words: 1200 }], "2026-11-12");
    const last = grid.at(-1)!.at(-1)!;
    expect(last).toEqual({ date: "2026-11-12", words: 1200, dayOfWeek: 4 }); // a Thursday
    expect(grid.flat()).toHaveLength(365);
  });

  it("gives the same grid in every time zone", () => {
    process.env.TZ = "America/New_York";
    const a = JSON.stringify(buildHeatmapGrid([], "2026-03-08"));
    process.env.TZ = "Pacific/Auckland";
    const b = JSON.stringify(buildHeatmapGrid([], "2026-03-08"));
    expect(a).toBe(b);
  });

  it("weeks start on Sunday", () => {
    const grid = buildHeatmapGrid([], "2026-11-12");
    for (const week of grid.slice(1)) expect(week[0].dayOfWeek).toBe(0);
  });

  it("reads the month from the date, not the local clock", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(utcMonthOf("2026-12-01")).toBe(11);
  });
});

describe("the heatmap component", () => {
  it("builds its grid with the UTC helper", () => {
    const src = readFileSync("src/components/book/writing-heatmap.tsx", "utf8");
    expect(src).toMatch(/buildHeatmapGrid\(/);
    expect(src).not.toMatch(/\.getDay\(\)/);
  });
});
