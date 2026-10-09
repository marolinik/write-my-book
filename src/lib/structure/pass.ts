/**
 * Dev editor v2, phase A — one restructure run is ONE coherent pass.
 *
 * The live baseline (2026-10-08) showed why this has to be enforced rather
 * than asked for: the conductor delegated to the architect three times, each
 * delegation filed under its own sub-session, and the writer's panel held 36
 * pending moves while the chat promised 6. The rules here:
 *   - a pass is the ROOT agent session; a delegate files into its parent's pass,
 *   - a pass holds at most MAX_MOVES_PER_PASS primary moves,
 *   - an alternative nests under one primary and does not count against the cap,
 *   - a new pass retires the still-pending moves of older passes,
 *   - accepting one move of a group retires the rest of the group.
 */

import { db } from "@/lib/db";

export const MAX_MOVES_PER_PASS = 7;
export const MAX_ALTERNATIVES_PER_MOVE = 2;

/**
 * Run `fn` with this pass's filings serialized. The model can issue several
 * ProposeStructureMove calls in one turn; each reads the pass, checks the cap
 * and dedup, then creates, so concurrent calls would all pass the check.
 */
const passLocks = new Map<string, Promise<unknown>>();
export async function withPassLock<T>(passId: string, fn: () => Promise<T>): Promise<T> {
  const previous = passLocks.get(passId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(fn);
  passLocks.set(passId, run);
  try {
    return await run;
  } finally {
    if (passLocks.get(passId) === run) passLocks.delete(passId);
  }
}

/**
 * The moves a new proposal must not repeat: this pass's pending moves, anything
 * accepted, and applied merges and splits (S3-5: an applied merge re-filed and
 * re-applied swallowed a chapter). Not an older pass's pending moves, which the
 * new pass retires and may re-file, and not an applied reorder: moving the same
 * chapter to the same place again is a legitimate later decision.
 */
export function blocksRefiling(m: PassMove, passId: string): boolean {
  if (m.status === "pending") return m.sessionId === passId;
  if (m.status === "accepted" || m.status === "drafted") return true;
  if (m.status === "applied") return m.kind === "merge" || m.kind === "split";
  return false;
}

/** Statuses a move can be retired into without the writer deciding it. */
export const RETIRED_STATUSES = ["superseded", "withdrawn"] as const;

const DELEGATE_MARKER = "-delegate-";

/** The pass a session files into: its root session, never a delegate's sub-session. */
export function passIdOf(sessionId: string): string {
  const at = sessionId.indexOf(DELEGATE_MARKER);
  return at === -1 ? sessionId : sessionId.slice(0, at);
}

/** The fields of a live move the pass rules read. */
export interface PassMove {
  id: string;
  kind: string;
  payload: string;
  status: string;
  sessionId: string | null;
  alternativeToId: string | null;
  reason: string;
}

/** Columns to select for `PassMove` rows. */
export const PASS_MOVE_SELECT = {
  id: true,
  kind: true,
  payload: true,
  status: true,
  sessionId: true,
  alternativeToId: true,
  reason: true,
} as const;

/** The pending moves of one pass, split into primaries and alternatives. */
export function pendingOfPass(
  live: readonly PassMove[],
  passId: string
): { primaries: PassMove[]; alternatives: PassMove[] } {
  // A drafted trim/expand is still undecided: it counts as part of the pass.
  const ofPass = live.filter(
    (m) => (m.status === "pending" || m.status === "drafted") && m.sessionId === passId
  );
  return {
    primaries: ofPass.filter((m) => !m.alternativeToId),
    alternatives: ofPass.filter((m) => !!m.alternativeToId),
  };
}

function chaptersOf(payload: string): string {
  try {
    const p = JSON.parse(payload) as { chapterNumbers?: number[]; chapterNumber?: number };
    const numbers = p.chapterNumbers ?? (p.chapterNumber !== undefined ? [p.chapterNumber] : []);
    return numbers.join("+");
  } catch {
    return "?";
  }
}

function oneLine(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The pass so far, as the model reads it after every filing. Seeing its own
 * ledger is what keeps a later delegation from re-filing what an earlier one
 * already put on the table.
 */
/** The fields a ledger line reads. */
export type LedgerMove = Pick<PassMove, "id" | "kind" | "payload" | "reason" | "alternativeToId">;

export function formatPassLedger(
  primaries: readonly LedgerMove[],
  alternatives: readonly LedgerMove[]
): string {
  const lines = [`Pass so far: ${primaries.length}/${MAX_MOVES_PER_PASS} moves filed.`];
  for (const m of primaries) {
    lines.push(`- ${m.id}: ${m.kind} ${chaptersOf(m.payload)} — ${oneLine(m.reason)}`);
    for (const a of alternatives.filter((x) => x.alternativeToId === m.id)) {
      lines.push(`  - alternative ${a.id}: ${a.kind} ${chaptersOf(a.payload)} — ${oneLine(a.reason)}`);
    }
  }
  return lines.join("\n");
}

/**
 * Retire every still-pending move that belongs to an older pass, including
 * rows filed before passes existed (sessionId null). The writer decides one
 * coherent proposal, not the residue of every run.
 */
export async function retireOlderPasses(bookId: string, passId: string): Promise<number> {
  const { count } = await db.structureMove.updateMany({
    where: {
      bookId,
      status: "pending",
      OR: [{ sessionId: { not: passId } }, { sessionId: null }],
    },
    data: { status: "superseded", decidedAt: new Date() },
  });
  return count;
}

/**
 * Accepting one move of a group retires its siblings: the primary and its
 * alternatives are, by construction, mutually exclusive answers to one problem.
 */
export async function supersedeSiblings(
  bookId: string,
  accepted: { id: string; alternativeToId: string | null }
): Promise<number> {
  const primaryId = accepted.alternativeToId ?? accepted.id;
  const { count } = await db.structureMove.updateMany({
    where: {
      bookId,
      status: { in: ["pending", "drafted"] },
      id: { not: accepted.id },
      OR: [{ id: primaryId }, { alternativeToId: primaryId }],
    },
    data: { status: "superseded", decidedAt: new Date() },
  });
  return count;
}

/** Withdraw a pending move and its alternatives (the editor's own replacement). */
export async function withdrawWithAlternatives(bookId: string, moveId: string): Promise<number> {
  const { count } = await db.structureMove.updateMany({
    where: {
      bookId,
      status: "pending",
      OR: [{ id: moveId }, { alternativeToId: moveId }],
    },
    data: { status: "withdrawn", decidedAt: new Date() },
  });
  return count;
}
