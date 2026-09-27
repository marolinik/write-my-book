// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createElement } from "react";
import type { Editor } from "@tiptap/react";

/**
 * P5-S20 — a cancelled F2 inline edit was still billed. The server's D-142
 * path (req.signal -> 499, no usage_record, no Free meter tick) was proven to
 * work, but the client never aborted: use-inline-edit called fetch with no
 * signal, and the popup's Escape / Cancel / outside-click / unmount paths only
 * closed the UI while the request ran on and was billed. R-095: a quick assist
 * is never billed after an abort. R-099: Esc cancels.
 */

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-inline-edit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/use-inline-edit")>();
  return {
    ...actual,
    useInlineEdit: (bookId: string) =>
      (globalThis as { __realInlineEdit?: boolean }).__realInlineEdit
        ? actual.useInlineEdit(bookId)
        : { mutateAsync },
  };
});

import { useInlineEdit } from "@/hooks/use-inline-edit";
import { InlineEditPopup } from "@/components/editor/inline-edit-popup";

function makeEditorStub() {
  const rect = {
    top: 0, left: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0,
    toJSON: () => ({}),
  };
  const editor = {
    isDestroyed: false,
    commands: { focus: vi.fn() },
    state: {
      selection: { from: 1, to: 20 },
      doc: { content: { size: 200 }, textBetween: () => "the salt wind over the harbor" },
    },
    view: {
      state: { selection: { from: 1, to: 20 } },
      coordsAtPos: () => ({ top: 50, left: 30, bottom: 66, right: 34 }),
      dom: { getBoundingClientRect: () => rect },
    },
  };
  return editor as unknown as Editor;
}

/** A mutation that never settles on its own, like a slow provider call. */
function pendingUntilAborted() {
  let signal: AbortSignal | undefined;
  mutateAsync.mockImplementation((vars: { signal?: AbortSignal }) => {
    signal = vars.signal;
    return new Promise((_resolve, reject) => {
      vars.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted.", "AbortError"))
      );
    });
  });
  return () => signal;
}

afterEach(() => {
  cleanup();
  mutateAsync.mockReset();
  (globalThis as { __realInlineEdit?: boolean }).__realInlineEdit = false;
  vi.unstubAllGlobals();
});

describe("useInlineEdit — the request carries an AbortSignal", () => {
  it("passes the caller's signal to fetch and keeps it out of the JSON body", async () => {
    (globalThis as { __realInlineEdit?: boolean }).__realInlineEdit = true;
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ suggestions: [{ text: "x", label: "y" }] }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useInlineEdit("b1"), { wrapper });
    const controller = new AbortController();
    await act(async () => {
      await result.current.mutateAsync({
        selectedText: "some prose",
        count: 3,
        signal: controller.signal,
      });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.signal).toBe(controller.signal);
    expect(JSON.parse(String(init.body))).toEqual({ selectedText: "some prose", count: 3 });
  });
});

describe("InlineEditPopup — closing cancels the in-flight request (P5-S20)", () => {
  it("Escape during loading aborts the request before closing", async () => {
    const signalOf = pendingUntilAborted();
    const onClose = vi.fn();
    render(
      <InlineEditPopup editor={makeEditorStub()} bookId="b1" onClose={onClose} initialInstruction="Rewrite" />
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(signalOf()).toBeDefined();
    expect(signalOf()!.aborted).toBe(false);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(signalOf()!.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("an outside click during loading aborts the request", async () => {
    const signalOf = pendingUntilAborted();
    const onClose = vi.fn();
    render(
      <InlineEditPopup editor={makeEditorStub()} bookId="b1" onClose={onClose} initialInstruction="Rewrite" />
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    fireEvent.mouseDown(document.body);

    expect(signalOf()!.aborted).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it("unmounting the popup mid-request aborts it", async () => {
    const signalOf = pendingUntilAborted();
    const { unmount } = render(
      <InlineEditPopup editor={makeEditorStub()} bookId="b1" onClose={vi.fn()} initialInstruction="Rewrite" />
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));

    unmount();

    expect(signalOf()!.aborted).toBe(true);
  });

  it("a cancelled request shows no error alert", async () => {
    pendingUntilAborted();
    render(
      <InlineEditPopup editor={makeEditorStub()} bookId="b1" onClose={vi.fn()} initialInstruction="Rewrite" />
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document, { key: "Escape" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
