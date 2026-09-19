/**
 * The beta score, end to end.
 *
 * betaScore was null on 28 of 28 chapters of the owner's book and the "Ocena"
 * column has been empty product-wide. Two halves of one defect: the
 * beta-reader's prompt ended with "This report is for the WRITER'S reference
 * only — all data is in the CreateFinding calls", while post-session.ts parses
 * that same report for the score; and parsePersonas recognised none of the
 * shapes the model actually emits. The real Serbian report scores its personas
 * in a markdown table and states the mean as "Prosečno ukupno uživanje: 8,2 /
 * 10" — a comma decimal, which every score regex in the parser rejected.
 *
 * The report now carries an explicit machine-readable block, and the parser
 * reads that first, the stated mean second, and the table third.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBetaReaderReport } from "@/lib/parsers/beta-reader-parser";

const SERBIAN_TABLE_REPORT = `# BETA IZVEŠTAJ — Poglavlje 1

**Ocena kapije:** **PASS**

## OCENE PO PERSONAMA

| Persona | Angažovanost | Verodostojnost | Emocionalni udar | Tempo | Ukupno uživanje |
|---|---|---|---|---|---|
| **Žanrovski ekspert** | 9 | 8 | 7 | 8 | 8 |
| **Običan čitalac** | 8 | 8 | 7 | 7 | 8 |
| **Emocionalni čitalac** | 9 | 8 | 9 | 7 | 9 |
| **Kritični čitalac** | 7 | 7 | 6 | 7 | 7 |
| **Ciljna publika** | 9 | 9 | 8 | 8 | 9 |

**Prosečno ukupno uživanje:** 8,2 / 10.
`;

describe("the beta report's score block", () => {
  it("is read before anything else", () => {
    const report = `BETA_SCORE: 7.4\nBETA_GATE: NEEDS_REVISION\n\n${SERBIAN_TABLE_REPORT}`;
    const data = parseBetaReaderReport(report);
    expect(data.overallScore).toBe(7.4);
    expect(data.gate.result).toBe("NEAR_MISS");
  });

  it("accepts a comma decimal in the block", () => {
    const data = parseBetaReaderReport("BETA_SCORE: 8,2\nBETA_GATE: PASS\n");
    expect(data.overallScore).toBe(8.2);
    expect(data.gate.result).toBe("PASSED");
  });
});

describe("a real Serbian report with no score block", () => {
  const data = parseBetaReaderReport(SERBIAN_TABLE_REPORT);

  it("takes the stated mean, comma decimal and all", () => {
    expect(data.overallScore).toBe(8.2);
  });

  it("reads the five personas out of the markdown table", () => {
    expect(data.personas).toHaveLength(5);
    expect(data.personas[0]).toMatchObject({ name: "Žanrovski ekspert", score: 8, vote: true });
    expect(data.personas[3]).toMatchObject({ name: "Kritični čitalac", score: 7 });
  });

  it("still reads the gate", () => {
    expect(data.gate.result).toBe("PASSED");
  });
});

describe("an English report with no stated mean", () => {
  it("averages the personas the panel scored", () => {
    const report = `# Beta Report

| Persona | Engagement | Believability | Emotional impact | Pacing | Overall enjoyment |
|---|---|---|---|---|---|
| The Genre Expert | 8 | 7 | 7 | 8 | 7 |
| The Casual Reader | 9 | 8 | 8 | 8 | 8 |

GATE RESULT: PASS
`;
    const data = parseBetaReaderReport(report);
    expect(data.personas).toHaveLength(2);
    expect(data.overallScore).toBe(7.5);
  });
});

describe("the prompt asks for what the parser reads", () => {
  const prompt = readFileSync(
    join(__dirname, "..", "..", "src", "lib", "agents", "prompt-assembler.ts"),
    "utf-8"
  );
  const betaBlock = prompt.slice(
    prompt.indexOf('"beta-reader": `## YOUR ROLE'),
    prompt.indexOf('"manuscript-analyst"')
  );

  it("names the score block the app reads", () => {
    expect(betaBlock).toMatch(/BETA_SCORE:/);
    expect(betaBlock).toMatch(/BETA_GATE:/);
  });

  it("no longer tells the model its report is unread", () => {
    expect(betaBlock).not.toMatch(/WRITER'S reference only/);
  });
});
