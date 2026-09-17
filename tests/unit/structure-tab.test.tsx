// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * O12 phase 3 — the writer's panel. What is being asserted is the promise the
 * feature makes: a proposal is a decision, not a notification.
 *
 *  - a pending move states, in the writer's language, what it would do,
 *  - nothing is applied until Accept is pressed,
 *  - a failed apply shows the engine's own reason instead of a dead button,
 *  - an applied move can be undone.
 */

const h = vi.hoisted(() => ({ openWithWorkflow: vi.fn() }));

vi.mock("@/stores/agent-ui-store", () => ({
  useAgentUIStore: (sel: (s: unknown) => unknown) =>
    sel({ openWithWorkflow: h.openWithWorkflow }),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    t: {
      structure: {
        tab: "Struktura",
        title: "Strukturna revizija",
        subtitle: "Predlozi razvojnog urednika.",
        runPass: "Predloži strukturne izmene",
        running: "U toku...",
        refresh: "Osveži",
        empty: "Još nema predloga",
        emptyDesc: "Pokrenite strukturnu reviziju.",
        loadError: "Predlozi ne mogu da se učitaju.",
        pending: "Čeka vašu odluku",
        accepted: "Prihvaćeno",
        rejected: "Odbijeno",
        applied: "Primenjeno",
        failed: "Nije moglo da se izvrši",
        undone: "Poništeno",
        accept: "Prihvati",
        reject: "Odbij",
        undo: "Poništi",
        rejectNote: "Zašto ne?",
        reason: "Zašto",
        evidence: "Na osnovu",
        confidence: "Sigurnost",
        kindReorder: "Premeštanje",
        kindRenumber: "Prenumerisanje",
        kindMerge: "Spajanje",
        kindSplit: "Razdvajanje",
        moveReorder: "Premesti poglavlje {n} na poziciju {p}",
        moveMerge: "Spoji poglavlja {list} u jedno",
        moveSplit: "Razdvoji poglavlje {n} kod {anchor}",
        nothingChangesYet: "Rukopis ostaje netaknut dok ne prihvatite potez.",
        applyError: "Potez nije mogao da se primeni",
        undoError: "Potez nije mogao da se poništi",
      },
    },
  }),
}));

import { StructureTab } from "@/components/reports/structure-tab";

const pendingMerge = {
  id: "m1",
  kind: "merge",
  status: "pending",
  reason: "Isti prizor u dva poglavlja.",
  evidence: "Pacing: oba ispod polovine medijane.",
  confidence: 0.82,
  resultSummary: null,
  rejectionReason: null,
  createdAt: "2026-09-18T00:00:00Z",
  appliedAt: null,
  payload: { kind: "merge", chapterNumbers: [17, 18] },
};

const appliedReorder = {
  ...pendingMerge,
  id: "m2",
  kind: "reorder",
  status: "applied",
  reason: "Nit iz 1903. staje na četiri poglavlja.",
  evidence: null,
  confidence: null,
  resultSummary: "Moved chapter 24 to position 21.",
  payload: { kind: "reorder", chapterNumber: 24, targetPosition: 21 },
};

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <StructureTab bookId="b1" />
    </QueryClientProvider>
  );
}

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const body = handler(String(url), init);
    const failed = (body as { __status?: number })?.__status;
    return {
      ok: !failed,
      status: failed ?? 200,
      json: async () => body,
    } as Response;
  }) as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("StructureTab", () => {
  it("offers to run the pass when there is nothing to decide", async () => {
    mockFetch(() => ({ moves: [] }));
    renderTab();

    expect(await screen.findByText("Još nema predloga")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Predloži strukturne izmene")[0]);
    expect(h.openWithWorkflow).toHaveBeenCalledWith("restructure");
  });

  it("states what a pending move would do, and that nothing has changed yet", async () => {
    mockFetch(() => ({ moves: [pendingMerge] }));
    renderTab();

    expect(await screen.findByText("Spoji poglavlja 17 + 18 u jedno")).toBeTruthy();
    expect(screen.getByText("Čeka vašu odluku")).toBeTruthy();
    expect(screen.getByText(/Rukopis ostaje netaknut/)).toBeTruthy();
    expect(screen.getByText(/Isti prizor u dva poglavlja/)).toBeTruthy();
    expect(screen.getByText(/Sigurnost 82%/)).toBeTruthy();
  });

  it("accepting posts the decision; rejecting never applies", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    mockFetch((url, init) => {
      if (url.endsWith("/decision")) {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return { applied: true, summary: "ok" };
      }
      return { moves: [pendingMerge] };
    });
    renderTab();

    fireEvent.click(await screen.findByText("Prihvati"));
    await waitFor(() => expect(calls.length).toBe(1));
    expect(calls[0].url).toContain("/structure/moves/m1/decision");
    expect(calls[0].body).toEqual({ decision: "accept" });

    fireEvent.click(screen.getByText("Odbij"));
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls[1].body).toEqual({ decision: "reject" });
  });

  it("shows the engine's own reason when an apply cannot run", async () => {
    mockFetch((url) => {
      if (url.endsWith("/decision")) {
        return { __status: 409, error: "The quote is not in this chapter.", code: "anchor_not_found" };
      }
      return { moves: [pendingMerge] };
    });
    renderTab();

    fireEvent.click(await screen.findByText("Prihvati"));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The quote is not in this chapter.");
  });

  it("an applied move offers undo and no accept button", async () => {
    const hits: string[] = [];
    mockFetch((url) => {
      if (url.endsWith("/undo")) {
        hits.push(url);
        return { undone: true };
      }
      return { moves: [appliedReorder] };
    });
    renderTab();

    expect(await screen.findByText("Premesti poglavlje 24 na poziciju 21")).toBeTruthy();
    expect(screen.queryByText("Prihvati")).toBeNull();

    fireEvent.click(screen.getByText("Poništi"));
    await waitFor(() => expect(hits.length).toBe(1));
    expect(hits[0]).toContain("/structure/moves/m2/undo");
  });

  it("reports a load failure instead of an empty panel", async () => {
    mockFetch(() => ({ __status: 500, error: "boom" }));
    renderTab();
    expect(await screen.findByText("Predlozi ne mogu da se učitaju.")).toBeTruthy();
  });
});
