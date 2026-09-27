// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  renderHook,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";

import { AnnotationTooltip } from "@/components/editor/annotation-tooltip";
import { useContinuityScan } from "@/hooks/use-continuity-scan";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * P3-S13 — a continuity flag could not be dismissed from the editor. The
 * DELETE /api/books/:id/continuity?flagId= route exists "to give the writer a
 * verb to clear the current surface" (RC-4 fix 5c), but no client called it:
 * the flag's tooltip offered only "Go to Ch N" and "Intentional" (a permanent
 * suppression), and the scan hook had no dismiss.
 */

const t = getUIStrings("en");
const rect = { top: 10, bottom: 30, left: 10, right: 110, width: 100, height: 20 } as DOMRect;
const container = { top: 0, bottom: 800, left: 0, right: 600, width: 600, height: 800 } as DOMRect;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("the continuity flag tooltip", () => {
  it("offers Dismiss next to Intentional, and dismissing calls back", () => {
    const onDismiss = vi.fn();
    const onIntentional = vi.fn();
    render(
      <AnnotationTooltip
        annotationId="continuity-f1"
        annotationType="continuity"
        description="Mara's eyes were grey in chapter 3."
        anchorRect={rect}
        containerRect={container}
        onAccept={() => {}}
        onReject={() => {}}
        onClose={() => {}}
        onIntentional={onIntentional}
        onDismiss={onDismiss}
      />
    );

    expect(screen.getByRole("button", { name: t.editorChrome.intentional })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.editorUI.dismiss }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onIntentional).not.toHaveBeenCalled();
  });
});

describe("useContinuityScan().dismiss", () => {
  it("DELETEs the flag through the dismiss route and drops it from the surface", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({
            flags: [
              { id: "f1", description: "eyes", anchor: "grey", jumpChapter: 3 },
              { id: "f2", description: "date", anchor: "May", jumpChapter: null },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ ok: true, dismissed: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useContinuityScan("book-1"));
    await act(async () => {
      await result.current.scan(12);
    });
    expect(result.current.flags.map((f) => f.id)).toEqual(["f1", "f2"]);

    await act(async () => {
      await result.current.dismiss("f1");
    });

    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(init?.method).toBe("DELETE");
    expect(url).toBe("/api/books/book-1/continuity?flagId=f1");
    expect(result.current.flags.map((f) => f.id)).toEqual(["f2"]);
  });
});
