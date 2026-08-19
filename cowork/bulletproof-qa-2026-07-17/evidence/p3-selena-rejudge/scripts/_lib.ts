/**
 * Shared helpers for the P3-Selena rejudge journey.
 * NEVER logs raw secrets. Reads E2E_TEST_SECRET from env, uses it only in headers.
 */
import fs from "fs";
import path from "path";

export const BASE = "http://localhost:3002";
export const EVID = path.resolve(
  "cowork/bulletproof-qa-2026-07-17/evidence/p3-selena-rejudge"
);
export const TRACES = path.join(EVID, "api-traces");
export const NEO = path.join(EVID, "neo4j-reads");
export const STATE_FILE = path.join(EVID, "_state.json");
export const RUN_TAG = "RJ0720";

const SECRET = process.env.E2E_TEST_SECRET ?? "";

export function headersFor(clerkId: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-e2e-test-secret": SECRET,
    "x-e2e-clerk-id": clerkId,
  };
}

/** Mask a header set for trace persistence (never write the raw secret). */
function maskHeaders(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { ...h };
  if (out["x-e2e-test-secret"]) out["x-e2e-test-secret"] = "***MASKED***";
  return out;
}

export interface TraceResult {
  status: number;
  body: unknown;
}

/** HTTP call that also persists a masked request/response trace to api-traces/. */
export async function call(
  method: string,
  urlPath: string,
  clerkId: string,
  body?: unknown,
  traceName?: string
): Promise<TraceResult> {
  const url = `${BASE}${urlPath}`;
  const headers = headersFor(clerkId);
  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  const t0 = Date.now();
  const res = await fetch(url, init);
  const ms = Date.now() - t0;
  let parsed: unknown;
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (traceName) {
    const trace = {
      capturedAt: new Date().toISOString(),
      request: {
        method,
        url: urlPath,
        actingAs: clerkId,
        headers: maskHeaders(headers),
        body: body ?? null,
      },
      response: { status: res.status, latencyMs: ms, body: parsed },
    };
    fs.mkdirSync(TRACES, { recursive: true });
    fs.writeFileSync(
      path.join(TRACES, `${traceName}.json`),
      JSON.stringify(trace, null, 2)
    );
  }
  return { status: res.status, body: parsed };
}

export function loadState(): any {
  if (!fs.existsSync(STATE_FILE)) return {};
  return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
}
export function saveState(s: any): void {
  fs.mkdirSync(EVID, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

export function writeNeo(name: string, content: string): void {
  fs.mkdirSync(NEO, { recursive: true });
  fs.writeFileSync(path.join(NEO, name), content);
}

export function log(...args: unknown[]): void {
  console.log(...args);
}

// ── Canonical manuscript content. Every seeded fact is stated EXPLICITLY so a
//    real qwen3.6 extraction has the strongest possible signal. Book 1 is the
//    continuity-net testbed; Book 2 exercises series-context scope (D-25).
export const BOOK1_NAME = `Emberfall — Book I [${RUN_TAG}]`;
export const BOOK2_NAME = `Ashfall — Book II [${RUN_TAG}]`;
export const SERIES_TITLE = `Selena Rejudge Saga [${RUN_TAG}]`;

export const BOOK1_CHAPTERS: Record<number, string> = {
  1: `Chapter One — The Emberfall Pact

Kira Venn stood on the black ramparts of Highfort, the great fortress-city of the Ashfall Realm. Beside her waited Vael Thorne, the swordsman who had sworn the Emberfall Pact with her three winters past. "We are allies," Kira Venn said. "Bound by oath." Vael Thorne nodded; Kira Venn and Vael Thorne were allied, shield to shield, sworn friends of the Pact.

Below them in the harbor district of Saltmarket, the cartographer Zoë Rasmussen unrolled her charts. The crew simply called her Zoë. She had mapped every road from Highfort to the distant Cinder Ward.

Dorn Kappel, the iron warlord, watched from the far tower. Dorn Kappel commanded the Ashen Legion. He had known Kira Venn since the old wars. The Great Fire of Highfort — the blaze that first forged the realm in the earliest days — was still remembered by all of them that night.`,

  2: `Chapter Two — The Fall of Dorn Kappel

In the second dawn, Kira Venn met Dorn Kappel upon the Bridge of Ash. Their duel was short and brutal. Kira Venn drove her blade through the warlord's heart. Dorn Kappel died there upon the Bridge of Ash. Dorn Kappel was dead — his body burned upon the pyre at Saltmarket that same night. The iron warlord was gone; the Ashen Legion had lost its master forever. Kira Venn wept for the enemy she had slain. Dorn Kappel is dead, and the realm knew it.`,

  3: `Chapter Three — Charts of the Cinder Ward

Weeks passed quietly in Highfort. Zoe Rasmussen returned from the Cinder Ward with new maps. Zoe — the cartographer the whole crew loved — spread her charts across the war table of Highfort. Kira Venn studied the roads with her for hours. The realm was calm, and the pyre-ash of the Bridge of Ash had long since cooled. Vael Thorne trained the young recruits in the yard below, patient and sure.`,

  4: `Chapter Four — The Dead Warlord Walks

At the fourth moon, the impossible came to pass. Dorn Kappel strode into the great hall of Highfort, his axe in hand — though every soul present knew Dorn Kappel had died upon the Bridge of Ash two dawns before. Dorn Kappel raised his weapon and attacked Kira Venn. The warlord fought like a living man, roaring across the hall. Dorn Kappel shattered the pillars and drove Kira Venn back. Kira Venn faced the dead warlord in the Siege of the Great Hall, blade against axe.`,

  5: `Chapter Five — The Broken Pact

In the war council at Highfort, the Emberfall Pact came apart. Kira Venn and Vael Thorne were still sworn allies, bound by the old oath — allied in name before the whole council, friends who had bled together. Yet in that same council, in that very hour, Vael Thorne drew his blade against Kira Venn and openly opposed her. Vael Thorne opposed Kira Venn; Vael Thorne now stood against Kira Venn as her enemy. The hall watched allies become enemies at once: Kira Venn and Vael Thorne, allied and opposed in the same breath.`,

  6: `Chapter Six — The Ash That Was Always Burning

Kira Venn at last learned the truth of the Ritual of Emberfall. She performed the Ritual of Emberfall in the deep vault beneath Highfort. And the Ritual of Emberfall caused the Great Fire of Highfort — the very blaze that had forged the realm long ago in the first days. The Ritual of Emberfall led to the Great Fire of Highfort. What Kira Venn did now in the vault had already burned the world at the very beginning of the realm.`,
};

export const BOOK2_CHAPTERS: Record<number, string> = {
  1: `Chapter One — The Ashfall Years

A generation after the Broken Pact, Kira Venn ruled the Ashfall Realm alone from Highfort. She was older now, and the crown weighed on her. The Ashen Legion was long scattered, its warlord Dorn Kappel dead these many years. Kira Venn walked the black ramparts at dawn and remembered the friends and enemies of the Emberfall days.`,

  2: `Chapter Two — Embers of Memory

Kira Venn summoned her council in the great hall of Highfort. New names filled the benches now — Sera Locke, the young captain, chief among them. Sera Locke swore her loyalty to Kira Venn. The old cartographer Zoë Rasmussen had left her charts to the archive, and the realm charted its own course into the ashfall years.`,
};
