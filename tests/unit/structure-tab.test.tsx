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

// The REAL dictionary, not a hand-rolled subset. A partial `t` meant the panel
// crashed on `t.reportTabs.nextStep` the moment the component read a section
// the mock had never heard of — a test failing for a reason that had nothing to
// do with what it was testing (S3-18).
vi.mock("@/components/providers/language-provider", async () => {
  const { getUIStrings } = await import("@/lib/i18n/ui-strings");
  const strings = getUIStrings("sr");
  return {
    useLanguage: () => ({ t: strings, language: "sr" }),
    useLocale: () => "sr-Latn-RS",
  };
});

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

  it("shows the engine's reason in the writer's language when an apply cannot run", async () => {
    mockFetch((url) => {
      if (url.endsWith("/decision")) {
        return { __status: 409, error: "The quote is not in this chapter.", code: "anchor_not_found" };
      }
      return { moves: [pendingMerge] };
    });
    renderTab();

    fireEvent.click(await screen.findByText("Prihvati"));
    const alert = await screen.findByRole("alert");
    // The engine answers with a code AND an English sentence. The code is the
    // contract: the panel looks the reason up rather than printing the
    // developer's note at the writer (S3-8).
    expect(alert.textContent).toContain("Citat");
    expect(alert.textContent).not.toContain("The quote is not in this chapter.");
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

  it("numbers the pass in filing order and nests an alternative under its move", async () => {
    const second = {
      ...pendingMerge,
      id: "m3",
      reason: "Pismo se čita dvaput.",
      createdAt: "2026-09-18T00:02:00Z",
      payload: { kind: "merge", chapterNumbers: [28, 29] },
    };
    const alternative = {
      ...pendingMerge,
      id: "a1",
      reason: "Ako odbiješ 17 + 18, spoji 18 i 19.",
      createdAt: "2026-09-18T00:03:00Z",
      alternativeToId: "m1",
      payload: { kind: "merge", chapterNumbers: [18, 19] },
    };
    // Newest first, as the API returns them.
    mockFetch(() => ({ moves: [alternative, second, pendingMerge] }));
    const { container } = renderTab();

    expect(await screen.findByText("Spoji poglavlja 17 + 18 u jedno")).toBeTruthy();
    expect(screen.getByText("Alternativa, ako odbiješ potez iznad")).toBeTruthy();
    const text = container.textContent ?? "";
    const first = text.indexOf("Spoji poglavlja 17 + 18");
    const alt = text.indexOf("Spoji poglavlja 18 + 19");
    const next = text.indexOf("Spoji poglavlja 28 + 29");
    expect(first).toBeLessThan(alt);
    expect(alt).toBeLessThan(next);
    expect(text).toMatch(/1\.\s*Spoji poglavlja 17 \+ 18/);
    expect(text).toMatch(/2\.\s*Spoji poglavlja 28 \+ 29/);
  });

  it("files a replaced or withdrawn move under history with its own label", async () => {
    mockFetch(() => ({
      moves: [
        { ...pendingMerge, id: "s1", status: "superseded" },
        { ...pendingMerge, id: "w1", status: "withdrawn", payload: { kind: "merge", chapterNumbers: [3, 4] } },
      ],
    }));
    renderTab();
    expect(await screen.findByText("Raniji predlozi (2)")).toBeTruthy();
    expect(screen.getByText("Zamenjen")).toBeTruthy();
    expect(screen.getByText("Povučen")).toBeTruthy();
  });

  describe("trim and expand go through a draft", () => {
    const trim = {
      ...pendingMerge,
      id: "t1",
      kind: "trim",
      reason: "Pustinja je najduže poglavlje.",
      payload: { kind: "trim", chapterNumber: 15, targetWords: 2000 },
      draft: null,
    };

    it("offers a draft, never a blind accept", async () => {
      const hits: Array<{ url: string; method?: string }> = [];
      mockFetch((url, init) => {
        hits.push({ url, method: init?.method });
        if (url.endsWith("/draft")) return { drafted: true, baseWords: 2762, draftWords: 1980 };
        return { moves: [trim] };
      });
      renderTab();
      expect(await screen.findByText("Skrati poglavlje 15 na oko 2000 reči")).toBeTruthy();
      expect(screen.queryByText("Prihvati")).toBeNull();
      fireEvent.click(screen.getByText("Napravi nacrt"));
      await waitFor(() => expect(hits.some((h) => h.url.endsWith("/structure/moves/t1/draft") && h.method === "POST")).toBe(true));
    });

    it("shows a ready draft with both lengths, compares, applies and discards", async () => {
      const drafted = { ...trim, status: "drafted", draft: { baseWords: 2762, draftWords: 1980 } };
      const hits: Array<{ url: string; method?: string; body?: string }> = [];
      mockFetch((url, init) => {
        hits.push({ url, method: init?.method, body: init?.body as string | undefined });
        if (url.endsWith("/draft") && (!init?.method || init.method === "GET")) {
          return { before: "Duga Pustinja.", after: "Kratka Pustinja.", baseWords: 2762, draftWords: 1980 };
        }
        if (url.endsWith("/draft")) return { discarded: true };
        if (url.endsWith("/decision")) return { applied: true };
        return { moves: [drafted] };
      });
      renderTab();
      expect(await screen.findByText("Nacrt spreman")).toBeTruthy();
      expect(screen.getByText(/sa 2762 na 1980 reči/)).toBeTruthy();

      fireEvent.click(screen.getByText("Uporedi sa poglavljem"));
      expect(await screen.findByText("Kratka Pustinja.")).toBeTruthy();
      expect(screen.getByText("Duga Pustinja.")).toBeTruthy();

      fireEvent.click(screen.getByText("Primeni nacrt"));
      await waitFor(() => expect(hits.some((h) => h.url.endsWith("/t1/decision") && h.body?.includes("accept"))).toBe(true));

      fireEvent.click(screen.getByText("Odbaci nacrt"));
      await waitFor(() => expect(hits.some((h) => h.url.endsWith("/t1/draft") && h.method === "DELETE")).toBe(true));
    });
  });
});
