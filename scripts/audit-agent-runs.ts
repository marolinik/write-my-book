/**
 * Audit what the agents actually did — a standing check for the failure modes
 * that reached the writer before anyone noticed them.
 *
 * Every rule here exists because the symptom shipped:
 *  - documents written in a language the book is not set to (English output for
 *    a Serbian book),
 *  - double-encoded text (U+FFFD or Latin-1 mojibake) from a broken byte path,
 *  - empty or stub documents recorded as finished work,
 *  - sessions that failed, or that ran far past the point of being useful,
 *  - flattened markdown tables (the editor round-trip dropping structure).
 *
 *   npx tsx scripts/audit-agent-runs.ts            # last 24h
 *   npx tsx scripts/audit-agent-runs.ts --hours 3
 */

import "dotenv/config";
import { db } from "../src/lib/db";
import { DocumentService } from "../src/lib/documents/document-service";

interface Finding {
  severity: "HIGH" | "MEDIUM" | "LOW";
  what: string;
  detail: string;
}

/** Word shapes that are common in each language and rare in the other. */
const LANGUAGE_MARKERS: Record<string, RegExp> = {
  en: /\b(the|and|of|with|through|chapter|characters|story|plot|must|should)\b/gi,
  sr: /\b(je|su|koji|koja|nije|ali|kroz|prema|zbog|poglavlje|likovi|pri[čc]a|treba)\b/gi,
  de: /\b(der|die|das|und|nicht|kapitel|figuren|muss)\b/gi,
  es: /\b(el|la|los|las|que|con|cap[íi]tulo|personajes|debe)\b/gi,
  fr: /\b(le|la|les|des|que|avec|chapitre|personnages|doit)\b/gi,
};

function count(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

/** Latin-1 runs that decode as UTF-8 — the double-encoding signature. */
function mojibakeRuns(text: string): number {
  let hits = 0;
  for (const match of text.matchAll(/[-ÿ]+/g)) {
    const bytes = Uint8Array.from([...match[0]].map((c) => c.charCodeAt(0)));
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded !== match[0]) hits++;
    } catch {
      // Genuine Latin-1 — not mojibake.
    }
  }
  return hits;
}

/**
 * Serbian is written in Latin script and ekavian here. Models drift into
 * Cyrillic or into Croatian/ijekavian forms mid-run, and the result reads wrong
 * to the writer even though the "language" is nominally right.
 */
const CYRILLIC = /[Ѐ-ӿ]/g;
// Word boundaries matter: without them "dio" matches inside "studio" and
// "radio", and the report fills with false positives.
const IJEKAVIAN =
  /\b(vrijeme|gdje|tko|uvijek|poslije|dio|susjed\w*|lijep\w*|mlijeko|vjerovati|razumjeti|djeca|cvije\u0107e|tisu\u0107a|kruh|vlak|tvornica|to\u010dn\w*|uvjet\w*|kazali\u0161te|kemija|povijest|op\u0107enito)\b/gi;

/** A markdown table that lost its pipes reads as one long fused line. */
function looksFlattened(text: string): boolean {
  return /\b[a-zA-Zčćžšđ]{4,}\*\*[A-ZČĆŽŠĐ]/.test(text);
}

async function main() {
  const hoursArg = process.argv.indexOf("--hours");
  const hours = hoursArg > -1 ? Number(process.argv[hoursArg + 1]) : 24;
  const since = new Date(Date.now() - hours * 3600_000);
  const findings: Finding[] = [];

  // ── Sessions ─────────────────────────────────────────────────────────────
  const sessions = await db.agentSession.findMany({
    where: { startedAt: { gte: since } },
    include: { book: true },
    orderBy: { startedAt: "desc" },
  });

  for (const s of sessions) {
    const label = `${s.workflowId ?? s.agentType} (${s.id.slice(0, 8)})`;
    if (s.status === "failed") {
      findings.push({ severity: "HIGH", what: "session failed", detail: label });
    }
    if (s.status === "running") {
      const mins = (Date.now() - s.startedAt.getTime()) / 60000;
      if (mins > 45) {
        findings.push({
          severity: "HIGH",
          what: "session running far too long",
          detail: `${label} — ${mins.toFixed(0)} min`,
        });
      }
    }
    if (s.status === "completed" && s.tokensInput === 0 && s.tokensOutput === 0) {
      findings.push({
        severity: "LOW",
        what: "completed session recorded no tokens",
        detail: `${label} — usage accounting may be missing for this path`,
      });
    }
  }

  // ── Documents ────────────────────────────────────────────────────────────
  const docs = await db.document.findMany({
    where: { updatedAt: { gte: since } },
    include: { book: true, series: true },
    orderBy: { updatedAt: "desc" },
  });

  for (const d of docs) {
    const ownerId = d.book?.userId ?? d.series?.userId;
    if (!ownerId) continue;
    const expected = d.book?.language ?? d.series?.language ?? "en";
    const svc = new DocumentService(
      ownerId,
      d.bookId ?? undefined,
      d.seriesId ?? undefined,
    );

    let content = "";
    try {
      content = (await svc.read(d.id))?.content ?? "";
    } catch (err) {
      findings.push({
        severity: "HIGH",
        what: "document unreadable",
        detail: `${d.type} ${d.id.slice(0, 8)} — ${(err as Error).message}`,
      });
      continue;
    }

    const label = `${d.type} ${d.id.slice(0, 8)}`;

    if (content.trim().length < 200) {
      findings.push({
        severity: "HIGH",
        what: "document is empty or a stub",
        detail: `${label} — ${content.trim().length} chars`,
      });
      continue;
    }

    const bad = content.match(/�/g)?.length ?? 0;
    if (bad > 0) {
      findings.push({
        severity: "HIGH",
        what: "replacement characters in stored text",
        detail: `${label} — ${bad} U+FFFD (a byte path is decoding per chunk)`,
      });
    }

    const moji = mojibakeRuns(content);
    if (moji > 0) {
      findings.push({
        severity: "HIGH",
        what: "double-encoded text in stored document",
        detail: `${label} — ${moji} run(s)`,
      });
    }

    const expectedMarker = LANGUAGE_MARKERS[expected];
    const englishMarker = LANGUAGE_MARKERS.en;
    if (expectedMarker && expected !== "en") {
      const own = count(content, expectedMarker);
      const english = count(content, englishMarker);
      if (english > own) {
        findings.push({
          severity: "HIGH",
          what: "document written in the wrong language",
          detail: `${label} — book is "${expected}" but English markers ${english} > ${own}`,
        });
      }
    }

    if (expected === "sr") {
      const cyr = (content.match(CYRILLIC) ?? []).length;
      if (cyr > 0) {
        findings.push({
          severity: "HIGH",
          what: "Cyrillic in a Latin-script Serbian document",
          detail: `${label} — ${cyr} character(s)`,
        });
      }
      const ijek = content.match(IJEKAVIAN) ?? [];
      if (ijek.length > 0) {
        const sample = [...new Set(ijek.map((w) => w.toLowerCase()))].slice(0, 6);
        findings.push({
          severity: "MEDIUM",
          what: "Croatian / ijekavian forms in a Serbian document",
          detail: `${label} — ${ijek.length} hit(s): ${sample.join(", ")}`,
        });
      }
    }

    if (looksFlattened(content)) {
      findings.push({
        severity: "MEDIUM",
        what: "markdown structure looks flattened",
        detail: `${label} — fused cell text, a table may have lost its pipes`,
      });
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  console.log(
    `Audited ${sessions.length} session(s) and ${docs.length} document(s) from the last ${hours}h.`,
  );
  if (findings.length === 0) {
    console.log("No problems found.");
    return;
  }
  for (const f of findings) {
    console.log(`[${f.severity}] ${f.what}: ${f.detail}`);
  }
  console.log(`\n${findings.length} finding(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
