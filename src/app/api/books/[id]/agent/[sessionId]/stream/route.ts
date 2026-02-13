import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getSession, addListener } from "@/lib/agents";

type RouteParams = {
  params: Promise<{ id: string; sessionId: string }>;
};

/** GET /api/books/:id/agent/:sessionId/stream — SSE stream of agent messages. */
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const user = await requireUser();
    const { id: bookId, sessionId } = await params;

    const session = getSession(sessionId);

    // Bug 2 fix: If session not found (e.g. server restarted), return a proper
    // SSE stream with an error event instead of JSON 404. EventSource cannot
    // parse JSON error responses — it just retries forever.
    if (!session || session.bookId !== bookId || session.userId !== user.id) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const errorMsg = {
            type: "error" as const,
            content: "Session not found. The server may have restarted. Please start a new workflow.",
          };
          controller.enqueue(
            encoder.encode(`id: 0\ndata: ${JSON.stringify(errorMsg)}\n\n`)
          );
          controller.close();
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // Bug 1 fix: Read Last-Event-ID to skip already-sent messages on reconnect
    const lastEventIdHeader = _req.headers.get("Last-Event-ID");
    const replayOffset = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) + 1 : 0;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Replay buffered messages, skipping ones the client already received
        for (let i = replayOffset; i < session.messages.length; i++) {
          controller.enqueue(
            encoder.encode(`id: ${i}\ndata: ${JSON.stringify(session.messages[i])}\n\n`)
          );
        }

        // If already complete, send the result and close
        if (session.status !== "running") {
          if (session.result) {
            const completeMsg = {
              type: "complete",
              content: "Session finished",
              metadata: { ...session.result, suggestedNext: session.suggestedNext },
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
                encoder.encode(`id: ${index}\ndata: ${JSON.stringify(message)}\n\n`)
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if ((error as Error).message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    console.error("GET /api/books/:id/agent/:sessionId/stream error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to connect to stream" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
