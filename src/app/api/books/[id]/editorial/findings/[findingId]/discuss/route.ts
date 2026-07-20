import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildDiscussPrompt, parseDiscussResponse, type ThreadTurn } from "@/lib/editorial/discuss-prompt";
import { formatWriterMemoryForPrompt } from "@/lib/agents/writer-memory";
import { DiscussLLMEmptyError, runDiscussTurn } from "@/lib/editorial/discuss-llm";
import { parseJsonBody, invalidJsonBodyResponse } from "@/lib/api/parse-json-body";

export const dynamic = "force-dynamic";

const MAX_USER_TURNS = 3;
const RATE_LIMIT_24H = 200;
type RouteParams = { params: Promise<{ id: string; findingId: string }> };
const bodySchema = z.object({ writerMessage: z.string().min(1).max(2000) });

async function loadOwnedFinding(userId: string, bookId: string, findingId: string) {
  const book = await db.book.findFirst({ where: { id: bookId, userId }, select: { id: true } });
  if (!book) return { error: NextResponse.json({ error: "Book not found" }, { status: 404 }) };
  const finding = await db.editFinding.findFirst({ where: { id: findingId, bookId } });
  if (!finding) return { error: NextResponse.json({ error: "Finding not found" }, { status: 404 }) };
  return { finding };
}

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;
    const owned = await loadOwnedFinding(user.id, bookId, findingId);
    if (owned.error) return owned.error;

    const replies = await db.findingReply.findMany({
      where: { findingId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true },
    });
    const userTurns = replies.filter((r) => r.role === "user").length;
    const canDiscuss = owned.finding.status === "pending" && userTurns < MAX_USER_TURNS;
    const view = replies.map((r) => ({
      role: r.role,
      content: r.content,
      createdAt: r.createdAt,
      ...(r.role === "assistant" ? parseDiscussResponse(r.content) : {}),
    }));
    return NextResponse.json({ replies: view, userTurns, canDiscuss });
  } catch (e) {
    if ((e as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Failed to load conversation" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, findingId } = await params;
    const { writerMessage } = bodySchema.parse(await parseJsonBody(req));

    const owned = await loadOwnedFinding(user.id, bookId, findingId);
    if (owned.error) return owned.error;
    const finding = owned.finding;

    // Rate limit: total user replies across all books in the last 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await db.findingReply.count({ where: { userId: user.id, role: "user", createdAt: { gte: since } } });
    if (recent >= RATE_LIMIT_24H) {
      return NextResponse.json({ capped: true, reason: "rate_limited", retryAfterSec: 3600 }, { status: 429 });
    }

    const writerMemoryBlock = await formatWriterMemoryForPrompt(user.id, bookId);

    // Step 1: lock the finding row and read prior turns inside a short, DB-only txn
    // (no network I/O while the lock is held — matches tools.ts:987, post-session.ts:443,
    // version-manager.ts:29, none of which perform network I/O while holding a lock).
    const precheck = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM edit_findings WHERE id = ${findingId} FOR UPDATE`;
      const prior = await tx.findingReply.findMany({
        where: { findingId }, orderBy: { createdAt: "asc" }, select: { role: true, content: true },
      });
      const userTurns = prior.filter((r) => r.role === "user").length;
      return { prior, userTurns };
    });

    if (precheck.userTurns >= MAX_USER_TURNS) {
      return NextResponse.json(
        { capped: true, assistantMessage: "You've discussed this finding thoroughly (3 exchanges). Ready to make a decision?", userTurns: precheck.userTurns },
        { status: 409 }
      );
    }

    const { system, user: userPrompt } = buildDiscussPrompt({
      finding: {
        category: finding.category, severity: finding.severity, description: finding.description,
        rationale: finding.rationale, anchorQuote: finding.anchorQuote,
        alternatives: safeAlternatives(finding.alternatives),
      },
      priorTurns: precheck.prior as ThreadTurn[],
      writerMessage,
      writerMemoryBlock,
      agentType: finding.agentType,
    });

    // Step 2: the network call runs OUTSIDE any transaction/lock.
    const raw = await runDiscussTurn({ system, user: userPrompt, userId: user.id });
    const parsed = parseDiscussResponse(raw);
    // D-41b: the parser only yields a revisedSuggestion when it is non-empty (an
    // empty "suggestion:" line degrades to undefined), so an empty revision can
    // never reach — and clobber — the finding's stored suggestion below.
    const revisedSuggestion = parsed.revisedSuggestion?.trim();

    // Step 3: short atomic check-and-insert — re-verify the cap wasn't crossed by a
    // concurrent turn between step 1 and now, then persist both replies together
    // and write any concrete revision back onto the finding.
    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM edit_findings WHERE id = ${findingId} FOR UPDATE`;
      const currentUserTurns = await tx.findingReply.count({ where: { findingId, role: "user" } });
      if (currentUserTurns >= MAX_USER_TURNS) {
        return { capped: true as const, userTurns: currentUserTurns };
      }

      await tx.findingReply.create({ data: { findingId, userId: user.id, role: "user", content: writerMessage } });
      await tx.findingReply.create({ data: { findingId, userId: user.id, role: "assistant", content: raw } });

      // D-41b: persist a non-empty revised suggestion onto the finding itself so a
      // later plain Apply uses the agreed revision — not the stale original — even
      // without the client hand-carrying it as overrideText. Empty revisions are
      // filtered above, so this never clobbers an existing suggestion.
      //
      // D-105: a discuss revision is a sentence-scoped compromise. If originalText
      // spans MORE prose than the revision replaces, arming the revision onto
      // newText while leaving originalText wide makes a later Apply wipe the
      // un-discussed sentences (Apply replaces the whole originalText span). Only
      // write the revision back when the span stays coherent:
      //   • no originalText → nothing to over-delete → arm as-is;
      //   • anchorQuote is a concrete substring of originalText → narrow the span
      //     to that anchor (the passage the revision was negotiated against).
      // Otherwise skip the write-back — the revision still lives in the thread
      // (returned to the client, re-parsed on GET), it just isn't armed for a lossy
      // plain Apply.
      if (revisedSuggestion) {
        const anchor = finding.anchorQuote?.trim();
        const canNarrow = !!anchor && !!finding.originalText && finding.originalText.includes(anchor);
        const spanUnsafe = !!finding.originalText && !canNarrow;
        if (!spanUnsafe) {
          const narrowedOriginal = canNarrow ? anchor : undefined;
          await tx.editFinding.update({
            where: { id: findingId },
            data: {
              newText: revisedSuggestion,
              ...(narrowedOriginal ? { originalText: narrowedOriginal } : {}),
              ...(finding.alternatives
                ? { alternatives: applyRevisionToAlternatives(finding.alternatives, revisedSuggestion, narrowedOriginal) }
                : {}),
            },
          });
        }
      }

      return { capped: false as const, userTurns: currentUserTurns + 1 };
    });

    if (result.capped) {
      return NextResponse.json(
        { capped: true, assistantMessage: "You've discussed this finding thoroughly (3 exchanges). Ready to make a decision?", userTurns: result.userTurns },
        { status: 409 }
      );
    }
    return NextResponse.json({ ...parsed, userTurns: result.userTurns, capped: false });
  } catch (e) {
    const invalidJson = invalidJsonBodyResponse(e);
    if (invalidJson) return invalidJson;
    if ((e as Error).message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((e as Error).name === "ZodError") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    // D-04: model produced no usable text even after the doubled-budget retry.
    // It threw BEFORE step 3, so nothing was persisted and the 3-turn cap is
    // untouched — answer an honest 502 instead of a 200 with an empty reply.
    if (e instanceof DiscussLLMEmptyError || (e as Error).name === "DiscussLLMEmptyError") {
      return NextResponse.json(
        { error: "The editor couldn't produce a reply. Your discussion turn was not used — please try again." },
        { status: 502 }
      );
    }
    console.error("POST /discuss error:", e);
    return NextResponse.json({ error: "Failed to discuss finding" }, { status: 500 });
  }
}

function safeAlternatives(raw: unknown): Array<{ label?: string; originalText?: string; newText?: string }> {
  if (typeof raw !== "string") return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; } catch { return []; }
}

/** D-41b: write `revision` into the first alternative's newText, preserving
 *  everything else (label, later alternatives). Malformed or empty alternatives
 *  JSON is left untouched — the finding's top-level newText still carries the
 *  revision, so a plain Apply still uses it.
 *  D-105: when a narrowed anchor is supplied, also narrow the first alternative's
 *  originalText to that span so applying via `alternativeIndex` replaces the same
 *  coherent passage the top-level Apply would; otherwise the alt's originalText is
 *  preserved unchanged. */
function applyRevisionToAlternatives(raw: string, revision: string, narrowedOriginal?: string): string {
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return raw;
    return JSON.stringify(
      arr.map((alt, i) =>
        i === 0
          ? { ...alt, ...(narrowedOriginal ? { originalText: narrowedOriginal } : {}), newText: revision }
          : alt
      )
    );
  } catch {
    return raw;
  }
}
