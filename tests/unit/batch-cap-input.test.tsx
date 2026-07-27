// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * D-125 (P4 re-judge v3/v4 floor rider) — the batch budget-cap field rendered
 * `min={1} step={1}` while the submit gate accepted anything `> 0` and the API
 * accepts any finite `0 < cap <= 25`. Two consequences, both filed:
 *
 *   1. The cap that makes the BUDGET-HALT path observable (a cent-scale cap, so
 *      the very first child trips it) looked FORBIDDEN in the UI — the halt
 *      could only ever be driven by hand-rolled API calls, which is why the
 *      halted-digest defects (D-123/D-126) stayed unprobed for four re-judges.
 *   2. Nonsense input was "blocked" by a `toast.error` only: no `aria-invalid`,
 *      no field-level message, no focus move — and the rendered `min`/`step`
 *      claimed a contract the code did not enforce.
 *
 * This asserts the rendered constraints and the JS gate now describe the SAME
 * contract, that a sub-dollar cap is typable + submittable, and that nonsense
 * (empty, 0, negative, over-max) is refused with visible, accessible feedback
 * (the D-154 alert + aria-invalid + focus shape).
 */

// Radix Dialog touches a few DOM APIs jsdom omits.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  if (!window.matchMedia) {
    window.matchMedia = (() => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })) as unknown as typeof window.matchMedia;
  }
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import {
  BatchEditorialDialog,
  parseBatchCapUsd,
} from "@/components/editorial/batch-editorial-dialog";

const fetchMock = vi.fn();

beforeEach(() => {
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ batchId: "batch1", childCount: 2, scheduledFor: null }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Render + open the dialog, returning the cap field. */
function openDialog(): HTMLInputElement {
  render(<BatchEditorialDialog bookId="b1" chapterNumbers={[1, 2]} />);
  fireEvent.click(screen.getByRole("button", { name: /batch editorial/i }));
  return screen.getByLabelText(/budget cap/i) as HTMLInputElement;
}

function queueBatch(): void {
  fireEvent.click(screen.getByRole("button", { name: /queue batch/i }));
}

/** The `budgetCapUsd` the component actually POSTed. */
function postedCap(): unknown {
  const init = fetchMock.mock.calls[0][1] as { body: string };
  return (JSON.parse(init.body) as { budgetCapUsd: unknown }).budgetCapUsd;
}

describe("D-125: parseBatchCapUsd — the gate itself", () => {
  it("accepts the whole advertised range, cents included", () => {
    for (const raw of ["0.01", "0.05", "0.99", " 7 ", "25", "24.99"]) {
      expect(parseBatchCapUsd(raw)).toEqual({ ok: true, value: Number(raw.trim()) });
    }
  });

  it("refuses everything outside it, with the bounds named", () => {
    for (const raw of ["", "   ", "0", "0.009", "-1", "25.01", "1e9", "abc", "NaN"]) {
      const parsed = parseBatchCapUsd(raw);
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) {
        expect(parsed.error).toContain("$0.01");
        expect(parsed.error).toContain("$25.00");
      }
    }
  });
});

describe("D-125: batch budget-cap field — rendered constraints match the gate", () => {
  it("advertises a cent-granular minimum and step (not min=1 / step=1)", () => {
    const cap = openDialog();
    expect(cap.getAttribute("min")).toBe("0.01");
    expect(cap.getAttribute("step")).toBe("0.01");
    expect(cap.getAttribute("max")).toBe("25");
  });

  it("names both bounds in the helper copy, so the floor is discoverable", () => {
    openDialog();
    const hint = document.getElementById("batch-cap-hint");
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain("$0.01");
    expect(hint!.textContent).toContain("$25");
  });

  it("accepts a typed sub-dollar cap and POSTs it verbatim (halt path drivable)", async () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "0.25" } });
    // The typed value must survive the controlled-input round trip.
    expect(cap.value).toBe("0.25");
    queueBatch();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedCap()).toBe(0.25);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("accepts the cent floor ($0.01) — the cap that halts on the first child", async () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "0.01" } });
    expect(cap.value).toBe("0.01");
    queueBatch();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedCap()).toBe(0.01);
  });
});

describe("D-125: nonsense caps are refused with visible feedback", () => {
  it("blocks an EMPTY cap with an inline alert + aria-invalid + focus (no silent coercion to 0)", () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "" } });
    queueBatch();

    expect(fetchMock).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("0.01");
    expect(alert.textContent).toContain("25");
    expect(cap.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(cap);
  });

  it("blocks a zero cap", () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "0" } });
    queueBatch();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(cap.getAttribute("aria-invalid")).toBe("true");
  });

  it("blocks a negative cap", () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "-5" } });
    queueBatch();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("blocks a cap above the $25 hard max", () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "30" } });
    queueBatch();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("clears the block as soon as the writer fixes the field", async () => {
    const cap = openDialog();
    fireEvent.change(cap, { target: { value: "" } });
    queueBatch();
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.change(cap, { target: { value: "5" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(cap.getAttribute("aria-invalid")).not.toBe("true");

    queueBatch();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(postedCap()).toBe(5);
  });
});
