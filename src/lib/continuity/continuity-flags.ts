// src/lib/continuity/continuity-flags.ts
import { createHash } from "node:crypto";
import type { ConsistencyIssue } from "@/lib/graph/types";

const INLINE_TYPES = new Set<ConsistencyIssue["type"]>([
  "dead_character_reappears",
  "location_conflict",
  "timeline_violation",
]);
const BOOK_LEVEL_TYPES = new Set<ConsistencyIssue["type"]>(["relationship_contradiction", "attribute_conflict"]);

export interface ContinuityFlagInput {
  signature: string;
  type: ConsistencyIssue["type"];
  severity: "critical" | "major" | "minor";
  description: string;
  entities: string[];
  chapterNumber: number; // primary site (0 = book-level)
  jumpChapter: number | null;
  anchor: string | null;
}

/**
 * The chapters that carry the issue's IDENTITY (as opposed to its display
 * evidence). D-79: for `dead_character_reappears`, graph-queries returns
 * chapters = [deathChapter, ...postDeathChapters], and postDeathChapters GROWS
 * by one every chapter the resurrected character keeps acting. Hashing that
 * growing list churned the signature every chapter, so an [Intentional]
 * dismissal (which stored the OLD signature) never matched again — a fresh,
 * un-dismissable CRITICAL inline flag fired every chapter for a legitimate
 * resurrection / fake-death arc. The identity of that contradiction is the death
 * ANCHOR (which character died, in which chapter); the reappearances are
 * evidence. So collapse to the earliest chapter (the death) for this type only.
 * Every other flag type keeps its full chapter set — their lists are bounded
 * (a single chapter, or an earlier/later pair), so they never churn, and
 * narrowing them would wrongly merge genuinely-distinct contradictions.
 */
function signatureChapters(issue: ConsistencyIssue): number[] {
  const chapters = issue.chapters ?? [];
  if (issue.type === "dead_character_reappears" && chapters.length > 0) {
    return [Math.min(...chapters)];
  }
  return [...chapters];
}

/**
 * Stable idempotency key derived from the STRUCTURED issue (type + sorted
 * entities + identity chapters) — deliberately NOT the description text, whose
 * token order is nondeterministic (Neo4j collect()/id() ordering). This keeps
 * the signature — and therefore dedup + [Intentional] suppression — stable.
 * See signatureChapters() for the D-79 death-anchor narrowing.
 */
export function continuityIssueSignature(issue: ConsistencyIssue): string {
  const ents = [...(issue.entities ?? [])].sort().join(",");
  const chs = signatureChapters(issue).sort((a, b) => a - b).join(",");
  return createHash("sha1").update(`${issue.type}|${ents}|${chs}`).digest("hex");
}

/** Primary chapter (where the flag anchors inline) + the [Go to Ch N] target. */
function siteFor(issue: ConsistencyIssue): { chapterNumber: number; jumpChapter: number | null } {
  const sorted = [...(issue.chapters ?? [])].sort((a, b) => a - b);
  switch (issue.type) {
    case "dead_character_reappears":
      // chapters = [deathChapter, ...reappearanceChapters]; anchor on the earliest reappearance.
      return { chapterNumber: sorted[1] ?? sorted[0] ?? 0, jumpChapter: sorted[0] ?? null };
    case "timeline_violation":
      // chapters = [earlier, later]; the later event's name is the anchor and lives in the later chapter.
      return { chapterNumber: sorted[sorted.length - 1] ?? 0, jumpChapter: sorted[0] ?? null };
    case "location_conflict":
      return { chapterNumber: sorted[0] ?? 0, jumpChapter: null };
    default:
      return { chapterNumber: 0, jumpChapter: null }; // book-level
  }
}

export function toContinuityFlags(input: {
  issues: ConsistencyIssue[];
  intentionalSignatures: Set<string>;
}): ContinuityFlagInput[] {
  const out: ContinuityFlagInput[] = [];
  for (const issue of input.issues ?? []) {
    const isInline = INLINE_TYPES.has(issue.type);
    const isBookLevel = BOOK_LEVEL_TYPES.has(issue.type);
    if (!isInline && !isBookLevel) continue;

    const signature = continuityIssueSignature(issue);
    if (input.intentionalSignatures.has(signature)) continue;

    const { chapterNumber, jumpChapter } = siteFor(issue);
    out.push({
      signature,
      type: issue.type,
      severity: issue.severity,
      description: issue.description,
      entities: Array.isArray(issue.entities) ? issue.entities : [],
      chapterNumber,
      jumpChapter,
      anchor: isInline ? (issue.entities?.[0] ?? null) : null,
    });
  }
  return out;
}

/** Time-throttle extraction: extract only if never done or older than minIntervalMs. */
export function shouldExtract(lastExtractedAt: Date | null, now: Date, minIntervalMs: number): boolean {
  if (lastExtractedAt === null) return true;
  return now.getTime() - lastExtractedAt.getTime() >= minIntervalMs;
}
