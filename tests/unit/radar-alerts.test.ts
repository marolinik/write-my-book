// #18: Story Radar advertised-vs-emitted honesty. The UI once claimed 5 alert
// families (continuity / pacing / character / style / structure) but the code
// only ever emits two word-count heuristics: pacing (length outliers) and
// structure (staleness). These tests pin the emitted set to the advertised set
// so the copy and the code can never drift back apart.
import { describe, it, expect } from "vitest";
import {
  buildRadarAlerts,
  RADAR_ALERT_TYPES,
  type RadarChapterInput,
} from "@/lib/radar/alerts";

const NOW = new Date("2026-07-04T00:00:00Z").getTime();
const DAY = 1000 * 60 * 60 * 24;

function ch(overrides: Partial<RadarChapterInput> = {}): RadarChapterInput {
  return {
    chapterNumber: 1,
    status: "drafting",
    updatedAt: new Date(NOW), // fresh by default
    wordCount: 2000,
    ...overrides,
  };
}

describe("Story Radar — advertised alert types", () => {
  it("advertises exactly the two implemented heuristics", () => {
    expect([...RADAR_ALERT_TYPES].sort()).toEqual(["pacing", "structure"]);
  });

  it("never advertises unimplemented continuity/character/style families", () => {
    for (const fabricated of ["continuity", "character", "style"]) {
      expect(RADAR_ALERT_TYPES).not.toContain(fabricated);
    }
  });
});

describe("buildRadarAlerts — emitted types stay within the advertised set", () => {
  it("emits a pacing alert for an unusually short chapter", () => {
    const alerts = buildRadarAlerts(
      [ch({ chapterNumber: 1, wordCount: 100 }), ch({ chapterNumber: 2, wordCount: 3000 })],
      NOW
    );
    const short = alerts.find((a) => a.id === "short-1");
    expect(short?.type).toBe("pacing");
  });

  it("emits a pacing alert for an unusually long chapter", () => {
    const alerts = buildRadarAlerts(
      [
        ch({ chapterNumber: 1, wordCount: 500 }),
        ch({ chapterNumber: 2, wordCount: 8000 }),
        ch({ chapterNumber: 3, wordCount: 500 }),
        ch({ chapterNumber: 4, wordCount: 500 }),
      ],
      NOW
    );
    const long = alerts.find((a) => a.id === "long-2");
    expect(long?.type).toBe("pacing");
  });

  it("emits a structure alert for a stale chapter", () => {
    const alerts = buildRadarAlerts(
      [ch({ chapterNumber: 1, updatedAt: new Date(NOW - 45 * DAY) })],
      NOW
    );
    const stale = alerts.find((a) => a.id === "stale-1");
    expect(stale?.type).toBe("structure");
    expect(stale?.severity).toBe("warning");
  });

  it("does not flag a chapter that has passed beta as stale", () => {
    const alerts = buildRadarAlerts(
      [ch({ chapterNumber: 1, status: "beta_passed", updatedAt: new Date(NOW - 90 * DAY) })],
      NOW
    );
    expect(alerts).toHaveLength(0);
  });

  it("formats word counts with the caller's locale (no server-locale leak)", () => {
    const chapters = [
      ch({ chapterNumber: 1, wordCount: 500 }),
      ch({ chapterNumber: 2, wordCount: 8000 }),
      ch({ chapterNumber: 3, wordCount: 500 }),
      ch({ chapterNumber: 4, wordCount: 500 }),
    ];
    const en = buildRadarAlerts(chapters, NOW, "en-US").find((a) => a.id === "long-2");
    const de = buildRadarAlerts(chapters, NOW, "de-DE").find((a) => a.id === "long-2");
    // en-US groups with commas ("8,000"), de-DE with dots ("8.000").
    expect(en?.detail).toContain((8000).toLocaleString("en-US"));
    expect(de?.detail).toContain((8000).toLocaleString("de-DE"));
    expect(en?.detail).not.toEqual(de?.detail);
  });

  it("defaults to en-US formatting when no locale is passed", () => {
    const chapters = [
      ch({ chapterNumber: 1, wordCount: 500 }),
      ch({ chapterNumber: 2, wordCount: 8000 }),
      ch({ chapterNumber: 3, wordCount: 500 }),
      ch({ chapterNumber: 4, wordCount: 500 }),
    ];
    const long = buildRadarAlerts(chapters, NOW).find((a) => a.id === "long-2");
    expect(long?.detail).toContain((8000).toLocaleString("en-US"));
  });

  it("every emitted alert carries a type from RADAR_ALERT_TYPES", () => {
    const alerts = buildRadarAlerts(
      [
        ch({ chapterNumber: 1, wordCount: 100 }), // short → pacing
        ch({ chapterNumber: 2, wordCount: 6000 }), // long → pacing
        ch({ chapterNumber: 3, wordCount: 2000, updatedAt: new Date(NOW - 60 * DAY) }), // stale → structure
      ],
      NOW
    );
    expect(alerts.length).toBeGreaterThan(0);
    for (const a of alerts) {
      expect(RADAR_ALERT_TYPES).toContain(a.type);
    }
  });
});
