// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

/**
 * P1-S18 — the batch editorial dialog ignored upgradeToTier.
 *
 * POST /api/books/:id/batch refuses a Free writer with 403 {error,
 * upgradeToTier: "indie"}. The dialog only toasted `body.error`, so the writer
 * got a red toast and no way to act on it, while every sibling wall (books,
 * series, now the agent start) opens the upgrade modal. A plan denial must go
 * to the modal; the batch dialog steps aside so the two do not stack.
 */

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
});

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { BatchEditorialDialog } from "@/components/editorial/batch-editorial-dialog";
import { useUpgradeModal } from "@/hooks/use-billing";

const DENIAL = { error: "Overnight batch runs are part of the Indie plan.", upgradeToTier: "indie" };
const fetchMock = vi.fn();

beforeEach(() => {
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  fetchMock.mockReset();
  useUpgradeModal.getState().hide();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function openAndQueue(): void {
  render(<BatchEditorialDialog bookId="b1" chapterNumbers={[1, 2, 3]} />);
  fireEvent.click(screen.getByRole("button", { name: /batch editorial/i }));
  fireEvent.click(screen.getByRole("button", { name: /queue batch/i }));
}

describe("P1-S18: a batch plan wall opens the upgrade modal", () => {
  it("routes 403 + upgradeToTier to the modal (reason + tier), not a bare toast", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => DENIAL });
    openAndQueue();

    await vi.waitFor(() => expect(useUpgradeModal.getState().open).toBe(true));
    expect(useUpgradeModal.getState().reason).toBe(DENIAL.error);
    expect(useUpgradeModal.getState().upgradeToTier).toBe("indie");
    expect(toastMock.error).not.toHaveBeenCalled();
    // The batch dialog closes so the upgrade modal is the one thing on screen.
    await vi.waitFor(() => expect(screen.queryByLabelText(/budget cap/i)).toBeNull());
  });

  it("keeps the toast for a failure that is not a plan wall", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid chapter range" }),
    });
    openAndQueue();

    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Invalid chapter range"));
    expect(useUpgradeModal.getState().open).toBe(false);
  });
});
