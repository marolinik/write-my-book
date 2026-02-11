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
    if (!session || session.bookId !== bookId || session.userId !== user.id) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        // Replay buffered messages first
        for (const msg of session.messages) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(msg)}\n\n`)
          );
        }

        // If already complete, send the result and close
        if (session.status !== "running") {
          if (session.result) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "complete", content: "Session finished", metadata: session.result })}\n\n`
              )
            );
          }
          controller.close();
          return;
        }

        // Register live listener
        const unsubscribe = addListener(
          sessionId,
          (message) => {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
              );
            } catch {
              // Stream closed by client
              unsubscribe?.();
            }
          },
          (result) => {
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "complete", content: "Session finished", metadata: result })}\n\n`
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
