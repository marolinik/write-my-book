import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSession, addListener } from "@/lib/agents";
import { createRedisConnection } from "@/lib/queue";

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
            // Check session status in Redis
            const sessionStatus = await subscriber.get(
              `session:${sessionId}:status`
            );

            // Replay buffered messages from Redis list
            const buffered = await subscriber.lrange(
              `session:${sessionId}:messages`,
              0,
              -1
            );
            let idx = 0;
            for (let i = 0; i < buffered.length; i++) {
              if (i < replayOffset) {
                idx++;
                continue;
              }
              try {
                controller.enqueue(
                  encoder.encode(`id: ${i}\ndata: ${buffered[i]}\n\n`)
                );
              } catch {
                // Stream closed by client during replay
                subscriber.disconnect();
                return;
              }
              idx = i + 1;
            }

            // If session already completed/failed, close the stream
            if (
              sessionStatus === "completed" ||
              sessionStatus === "failed"
            ) {
              try {
                controller.close();
              } catch {
                // Already closed
              }
              subscriber.disconnect();
              return;
            }

            // Session is still running — subscribe for live events
            await subscriber.subscribe(`session:${sessionId}`);

            subscriber.on("message", (_channel: string, message: string) => {
              try {
                controller.enqueue(
                  encoder.encode(`id: ${idx++}\ndata: ${message}\n\n`)
                );
                // Check if this is a terminal message
                const parsed = JSON.parse(message);
                if (
                  parsed.type === "complete" ||
                  parsed.type === "error"
                ) {
                  subscriber
                    .unsubscribe()
                    .then(() => subscriber.disconnect())
                    .catch(() => {});
                  try {
                    controller.close();
                  } catch {
                    // Already closed
                  }
                }
              } catch {
                // Stream closed by client
              }
            });

            // Keepalive heartbeat (same interval as inline path)
            const keepaliveInterval = setInterval(() => {
              try {
                controller.enqueue(encoder.encode(`: keepalive\n\n`));
              } catch {
                clearInterval(keepaliveInterval);
              }
            }, 15_000);

            // Handle client disconnect
            _req.signal.addEventListener("abort", () => {
              clearInterval(keepaliveInterval);
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
