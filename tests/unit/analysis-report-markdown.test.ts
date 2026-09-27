import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P4-S23 — readability never showed on a share link or the in-app snapshot.
 *
 * getAnalysisReport ran JSON.parse over the ANALYSIS_REPORT and returned
 * hasReport:false when that threw. Both workflows that write the report
 * ('analyze' and 'read-manuscript') tell the model to write a Markdown
 * document with a "Readability scores table (one row per formula, columns:
 * Formula | Score | Grade Level | Interpretation)". No producer writes JSON,
 * so a report from any real run could never be read (R-336).
 */

const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { document: { findFirst: h.findFirst } } }));
vi.mock("@/lib/storage", () => ({
  getBookStorage: () => ({ read: h.read }),
}));

import { getAnalysisReport } from "@/lib/reports/analysis-report";

const ANALYZE_REPORT = `# ANALYSIS REPORT
## The Salt Letters — Chapter 1 only

**Scope:** Chapter 1.

## 1. Executive summary
- Sentences are short; the Flesch-Kincaid grade of 7.8 sits in the genre band.

## 2. Readability scores

| Formula | Score | Grade Level | Interpretation |
|---|---|---|---|
| Flesch Reading Ease | 71.2 | 7th grade | Fairly easy |
| Flesch-Kincaid Grade Level | **7.84** | 8th grade | Accessible adult fiction |
| Gunning Fog Index | 10.27 | 10th grade | Moderate |
| Coleman-Liau Index | 9.06 | 9th grade | Moderate |

## 3. Pacing analysis
Tension rises through the chapter.
`;

const SERBIAN_REPORT = `# ANALITIČKI IZVEŠTAJ — ČITLJIVOST I METRIKA

## Ocene čitljivosti

| Formula | Ocena | Nivo | Tumačenje |
|---|---|---|---|
| Flesch lakoća čitanja | 68,5 | 8. razred | Prilično lako |
| Flesch-Kincaid (razred) | 6,9 | 7. razred | Pristupačno |
| Gunning Fog | 9,4 | 9. razred | Umereno |
| Coleman-Liau | 8,1 | 8. razred | Umereno |
`;

beforeEach(() => {
  vi.clearAllMocks();
  h.findFirst.mockResolvedValue({ storageKey: ".planning/ANALYSIS-REPORT.md" });
});

describe("getAnalysisReport — reads the Markdown report the agents write (P4-S23)", () => {
  it("finds the readability table in an 'analyze' report", async () => {
    h.read.mockResolvedValue(ANALYZE_REPORT);
    const report = await getAnalysisReport("u1", "b1");
    expect(report.hasReport).toBe(true);
    expect(report.readability.fleschKincaid).toBeCloseTo(7.84);
    expect(report.readability.gunningFog).toBeCloseTo(10.27);
    expect(report.readability.colemanLiau).toBeCloseTo(9.06);
  });

  it("never takes the Reading Ease score for the Flesch-Kincaid grade", async () => {
    h.read.mockResolvedValue(ANALYZE_REPORT);
    const report = await getAnalysisReport("u1", "b1");
    expect(report.readability.fleschKincaid).not.toBeCloseTo(71.2);
  });

  it("reads a Serbian report with decimal commas", async () => {
    h.read.mockResolvedValue(SERBIAN_REPORT);
    const report = await getAnalysisReport("u1", "b1");
    expect(report.hasReport).toBe(true);
    expect(report.readability.fleschKincaid).toBeCloseTo(6.9);
    expect(report.readability.gunningFog).toBeCloseTo(9.4);
    expect(report.readability.colemanLiau).toBeCloseTo(8.1);
  });

  it("does not claim readability for a report that has none (zeros would be a lie)", async () => {
    h.read.mockResolvedValue("# ANALYSIS\n\n## PASS 1: STRUCTURE\n\n| Ch# | Title |\n|---|---|\n| 1 | Salt |\n");
    const report = await getAnalysisReport("u1", "b1");
    expect(report.hasReport).toBe(false);
  });

  it("still reads a JSON report", async () => {
    h.read.mockResolvedValue(
      JSON.stringify({ readability: { fleschKincaid: 7.8, gunningFog: 10.3, colemanLiau: 9.1 } })
    );
    const report = await getAnalysisReport("u1", "b1");
    expect(report.hasReport).toBe(true);
    expect(report.readability.fleschKincaid).toBeCloseTo(7.8);
  });
});
