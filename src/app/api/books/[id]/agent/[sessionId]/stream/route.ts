import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession, addListener } from "@/lib/agents";
import { createRedisConnection } from "@/lib/queue";
import { getAppConnection } from "@/lib/queue/connection";
import { decodeLiveEvent } from "@/lib/queue/session-stream";
import {
  isJobStuckWithoutWorker,
  WORKER_ABSENT_MESSAGE,
} from "@/lib/health/worker-liveness";

/**
 * Grace period before the worker-liveness watchdog fires. A running worker
 * picks up a job in well under a second; this window tolerates a momentary
 * consumer gap before we declare the job unconsumable.
 */
const WORKER_GRACE_MS = 10_000;

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
} as const;

/** Helper: return an SSE stream with a single error event, then close. */
function sseError(message: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const errorMsg = { type: "error" as const, content: message };
      controller.enqueue(
        encoder.encode(`id: 0\ndata: ${JSON.stringify(errorMsg)}\n\n`)
      );
      controller.close();
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

/** GET /api/books/:id/agent/:sessionId/stream — SSE stream of agent messages. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;

    // ── Step 1: Check DB for session (handles both inline and background) ──
    const dbSession = await db.agentSession.findFirst({
      where: { id: sessionId, bookId, userId: user.id },
      select: { jobId: true, status: true },
    });

    if (!dbSession) {
      return sseError(
        "Session not found. The server may have restarted. Please start a new workflow."
      );
    }

    const isBackgroundJob = dbSession.jobId != null;

    // Read Last-Event-ID for replay offset (used by both paths)
    const lastEventIdHeader = _req.headers.get("Last-Event-ID");
    const replayOffset = lastEventIdHeader
      ? parseInt(lastEventIdHeader, 10) + 1
      : 0;

    const encoder = new TextEncoder();

    if (isBackgroundJob) {
      // ── Background Job Path: Redis-backed SSE ──────────────────────

      // Each SSE connection gets its own Redis subscriber (required by Redis
      // pub/sub: a connection in subscriber mode cannot execute regular commands)
      const subscriber = createRedisConnection();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // P2-15: subscribe FIRST, buffer live events while the list is
            // replayed, then drop live copies of what was replayed (by list
            // index). Replay-then-subscribe lost anything published between
            // the two, including a final "complete" (a spinner forever).
            let nextIndex = replayOffset;
            let finished = false;
            let replaying = true;
            const pendingLive: string[] = [];
            const keepalive: { timer?: ReturnType<typeof setInterval> } = {};
            let workerWatchdog: ReturnType<typeof setTimeout> | undefined;

            const finish = () => {
              if (finished) return;
              finished = true;
              if (keepalive.timer) clearInterval(keepalive.timer);
              if (workerWatchdog) {
                clearTimeout(workerWatchdog);
                workerWatchdog = undefined;
              }
              subscriber
                .unsubscribe()
                .then(() => subscriber.disconnect())
                .catch(() => {});
              try {
                controller.close();
              } catch {
                // Already closed
              }
            };

            const deliver = (index: number | null, data: string) => {
              if (finished) return;
              let id: number;
              if (index === null) {
                id = nextIndex++;
              } else {
                if (index < nextIndex) return; // already replayed
                id = index;
                nextIndex = index + 1;
              }
              try {
                controller.enqueue(encoder.encode(`id: ${id}\ndata: ${data}\n\n`));
              } catch {
                finish(); // stream closed by the client
                return;
              }
              // Any event means the worker is consuming — stand down.
              if (workerWatchdog) {
                clearTimeout(workerWatchdog);
                workerWatchdog = undefined;
              }
              try {
                const parsed = JSON.parse(data) as { type?: string };
                if (parsed.type === "complete" || parsed.type === "error") finish();
              } catch {
                // not JSON: not terminal
              }
            };

            subscriber.on("message", (_channel: string, raw: string) => {
              if (replaying) {
                pendingLive.push(raw);
                return;
              }
              const live = decodeLiveEvent(raw);
              deliver(live.index, live.data);
            });
            await subscriber.subscribe(`session:${sessionId}`);

            const reader = getAppConnection();
            const buffered = await reader.lrange(`session:${sessionId}:messages`, 0, -1);
            for (let i = replayOffset; i < buffered.length; i++) deliver(i, buffered[i]);
            replaying = false;
            for (const raw of pendingLive.splice(0)) {
              const live = decodeLiveEvent(raw);
              deliver(live.index, live.data);
            }
            if (finished) return;

            // Re-read the status after subscribing: a session that ended
            // before we subscribed has nothing more to send.
            const sessionStatus = await reader.get(`session:${sessionId}:status`);
            if (sessionStatus === "completed" || sessionStatus === "failed") {
              finish();
              return;
            }

            // Worker-liveness watchdog: if the job is never picked up because no
            // worker is consuming the queue, surface an error instead of leaving
            // the client on a silent infinite spinner. Fires once after a short
            // grace; a running worker will have advanced the job by then.
            workerWatchdog =
              setTimeout(() => {
                void (async () => {
                  try {
                    if (!(await isJobStuckWithoutWorker(sessionId))) return;
                    const errorMsg = {
                      type: "error" as const,
                      content: WORKER_ABSENT_MESSAGE,
                    };
                    // deliver() numbers it and finish()es on the terminal error.
                    deliver(null, JSON.stringify(errorMsg));
                  } catch (err) {
                    console.error("[SSE-Redis] Worker watchdog error:", err);
                  }
                })();
              }, WORKER_GRACE_MS);

            // Keepalive heartbeat (same interval as inline path)
            keepalive.timer = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(`: keepalive\n\n`));
              } catch {
                clearInterval(keepalive.timer);
              }
            }, 15_000);

            // Handle client disconnect
            _req.signal.addEventListener("abort", () => {
              clearInterval(keepalive.timer);
              if (workerWatchdog) {
                clearTimeout(workerWatchdog);
                workerWatchdog = undefined;
              }
              subscriber
                .unsubscribe()
                .then(() => subscriber.disconnect())
                .catch(() => {});
              try {
                controller.close();
              } catch {
                // Already closed
              }
            });
          } catch (err) {
            // Redis connection error — send SSE error and close
            console.error(
              "[SSE-Redis] Error setting up subscriber:",
              err
            );
            try {
              const errorMsg = {
                type: "error" as const,
                content:
                  "Failed to connect to background job stream. Please try refreshing.",
              };
              controller.enqueue(
                encoder.encode(
                  `id: 0\ndata: ${JSON.stringify(errorMsg)}\n\n`
                )
              );
              controller.close();
            } catch {
              // Stream already closed
            }
            subscriber.disconnect();
          }
        },
      });

      return new Response(stream, { headers: SSE_HEADERS });
    } else {
      // ── Inline Job Path: In-Memory SSE (unchanged) ─────────────────

      const session = getSession(sessionId);

      // For inline sessions, the in-memory session must exist.
      // If it doesn't (e.g. server restarted mid-session), return SSE error.
      if (
        !session ||
        session.bookId !== bookId ||
        session.userId !== user.id
      ) {
        return sseError(
          "Session not found. The server may have restarted. Please start a new workflow."
        );
      }

      const stream = new ReadableStream({
        start(controller) {
          // Replay buffered messages, skipping ones the client already received
          for (let i = replayOffset; i < session.messages.length; i++) {
            controller.enqueue(
              encoder.encode(
                `id: ${i}\ndata: ${JSON.stringify(session.messages[i])}\n\n`
              )
            );
          }

          // If already complete, send the result and close
          if (session.status !== "running") {
            if (session.result) {
              const completeMsg = {
                type: "complete",
                content: "Session finished",
                metadata: {
                  ...session.result,
                  suggestedNext: session.suggestedNext,
                },
              };
              controller.enqueue(
                encoder.encode(
                  `id: ${session.messages.length}\ndata: ${JSON.stringify(completeMsg)}\n\n`
                )
              );
            }
            controller.close();
            return;
          }

          // Keepalive heartbeat — prevents proxy/browser timeouts during
          // long tool executions (reading docs, writing large content).
          // SSE comment lines (starting with ":") are ignored by EventSource.
          const keepaliveInterval = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(`: keepalive\n\n`));
            } catch {
              clearInterval(keepaliveInterval);
            }
          }, 15_000);

          // Register live listener
          const unsubscribe = addListener(
            sessionId,
            (message, index) => {
              try {
                controller.enqueue(
                  encoder.encode(
                    `id: ${index}\ndata: ${JSON.stringify(message)}\n\n`
                  )
                );
              } catch {
                // Stream closed by client
                clearInterval(keepaliveInterval);
                unsubscribe?.();
              }
            },
            (result, suggestedNext) => {
              clearInterval(keepaliveInterval);
              try {
                const completeMsg = {
                  type: "complete",
                  content: "Session finished",
                  metadata: { ...result, suggestedNext },
                };
                controller.enqueue(
                  encoder.encode(
                    `id: ${session.messages.length}\ndata: ${JSON.stringify(completeMsg)}\n\n`
                  )
                );
                controller.close();
              } catch {
                // Stream already closed
              }
            }
          );

          // Handle client disconnect — will be called when the request is aborted
          _req.signal.addEventListener("abort", () => {
            clearInterval(keepaliveInterval);
            unsubscribe?.();
            try {
              controller.close();
            } catch {
              // Already closed
            }
          });
        },
      });

      return new Response(stream, { headers: SSE_HEADERS });
    }
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error(
      "GET /api/books/:id/agent/:sessionId/stream error:",
      error
    );
    return new Response(
      JSON.stringify({ error: "Failed to connect to stream" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
