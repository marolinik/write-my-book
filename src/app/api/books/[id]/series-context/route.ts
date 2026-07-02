import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildAmbientContext } from "@/lib/series/ambient-context";
import {
  getOnStageNames,
  getPriorCharacters,
  getOpenThreads,
  getStyleBaseline,
  getCurrentChapterMetrics,
  type PriorBookRef,
} from "@/lib/series/ambient-sources";
import type { PriorCharacter, PriorThread } from "@/lib/series/ambient-context";
import type { StyleMetrics } from "@/lib/series/chapter-metrics";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const querySchema = z.object({ chapterNumber: z.coerce.number().int().positive() });

const GRAPH_TIMEOUT_MS = 5000;

/** Run a source, reporting ok=false on throw instead of propagating (route never 500s). */
async function safe<T>(p: Promise<T>, fallback: T): Promise<{ value: T; ok: boolean }> {
  try {
    return { value: await p, ok: true };
  } catch {
    return { value: fallback, ok: false };
  }
}

/** Bound a graph call so a reachable-but-unresponsive Neo4j degrades in seconds, not ~30s. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("graph query timeout")), ms)),
  ]);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId } = await params;

    const parsed = querySchema.safeParse({
      chapterNumber: new URL(request.url).searchParams.get("chapterNumber"),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid chapterNumber" }, { status: 400 });
    }
    const chapterNumber = parsed.data.chapterNumber;

    const book = await db.book.findFirst({
      where: { id: bookId, userId: user.id },
      include: { series: true },
    });
    if (!book) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Standalone book, OR (defense-in-depth) a book whose seriesId points at a
    // series NOT owned by this user → hide the sidebar. NOTE: graph:true here —
    // "no series" is not a graph outage, so the panel must not show "graph
    // offline"; the panel also short-circuits on series===null (review fix).
    // DEVIATION FROM PLAN: the plan's `seriesOwned` boolean loses TS's null
    // narrowing on `book.series` for the code below (tsc --noEmit fails with
    // TS18047). Checking `!book.series` directly in the same guard condition
    // preserves the identical security semantics (seriesId present AND series
    // exists AND owned by this user) while keeping `book.series` narrowed to
    // non-null afterward.
    if (!book.seriesId || !book.series || book.series.userId !== user.id) {
      return NextResponse.json({
        series: null,
        chapterNumber,
        characters: [],
        threads: [],
        toneDrift: null,
        meta: { notReady: false, sourcesAvailable: { graph: true, style: true } },
      });
    }

    // userId in the WHERE is REQUIRED: without it a book whose seriesId was set to
    // another user's series (see the POST /api/books hardening, Task 5b) would pull
    // that user's prior-book graph state. Scoping by userId makes the leak impossible
    // regardless of how the seriesId got set (review fix — cross-user isolation).
    const priorBooks: PriorBookRef[] = await db.book.findMany({
      where: { seriesId: book.seriesId, bookNumber: { lt: book.bookNumber }, userId: user.id },
      select: { id: true, bookNumber: true },
      orderBy: { bookNumber: "asc" },
    });

    // Per-source failure isolation + concurrency: each source runs in parallel and
    // reports ok=false on throw (never 500s the sidebar); graph calls are time-bounded
    // so a stalled Neo4j degrades in ~5s, not ~30s×3 sequential (review fix).
    const seriesBookIds = [book.id, ...priorBooks.map((b) => b.id)];
    const [onStage, prior, threads, baseline, current] = await Promise.all([
      safe(withTimeout(getOnStageNames(book.id, chapterNumber), GRAPH_TIMEOUT_MS), [] as string[]),
      safe(withTimeout(getPriorCharacters(priorBooks), GRAPH_TIMEOUT_MS), [] as PriorCharacter[]),
      safe(withTimeout(getOpenThreads(priorBooks), GRAPH_TIMEOUT_MS), [] as PriorThread[]),
      safe(getStyleBaseline(user.id, seriesBookIds), {
        metrics: null as StyleMetrics | null,
        baselineBookNumber: null as number | null,
      }),
      safe(getCurrentChapterMetrics(user.id, book.id, chapterNumber), null as StyleMetrics | null),
    ]);

    const graphOk = onStage.ok && prior.ok && threads.ok;
    // styleOk reflects an actual error only — a user with no StyleProfile is a
    // legitimate "nothing to show", NOT an outage (review fix: don't conflate).
    const styleOk = baseline.ok;

    const view = buildAmbientContext({
      currentBookNumber: book.bookNumber,
      onStageNames: onStage.value,
      priorBookCharacters: prior.value,
      openThreads: threads.value,
      currentStyleMetrics: current.value,
      seriesBaselineMetrics: baseline.value.metrics,
      baselineBookNumber: baseline.value.baselineBookNumber,
    });

    return NextResponse.json({
      series: {
        id: book.series.id,
        title: book.series.title,
        seriesType: book.series.seriesType,
        currentBookNumber: book.bookNumber,
      },
      chapterNumber,
      characters: view.characters,
      threads: view.threads,
      toneDrift: view.toneDrift,
      meta: { notReady: view.notReady, sourcesAvailable: { graph: graphOk, style: styleOk } },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[series-context]", error);
    return NextResponse.json({ error: "Failed to load series context" }, { status: 500 });
  }
}
