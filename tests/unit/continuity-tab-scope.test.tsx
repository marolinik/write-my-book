// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * O10 — the continuity tab always ran the SERIES check, even for a standalone
 * book outside any series: the writer was offered a cross-book pass over books
 * he does not have. The tab was also entirely hardcoded English inside an app
 * whose owner writes in Serbian.
 */

const h = vi.hoisted(() => ({
  openWithWorkflow: vi.fn(),
  book: { id: "b1", seriesId: null as string | null },
}));

vi.mock("@/stores/agent-ui-store", () => ({
  useAgentUIStore: (sel: (s: unknown) => unknown) =>
    sel({ openWithWorkflow: h.openWithWorkflow }),
}));

vi.mock("@/hooks/use-books", () => ({ useBook: () => ({ data: h.book }) }));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    t: {
      continuityTab: {
        title: "Kontinuitet",
        subtitle: "Pratite doslednost kroz ceo rukopis",
        run: "Proveri ovu knjigu",
        runSeries: "Proveri ceo serijal",
        tracker: "Praćenje kontinuiteta",
        trackerEmpty: "Još ništa nije nađeno",
        findingsSummary: "{n} nalaza u {d} oblasti",
        report: "Izveštaj o kontinuitetu",
        reportDesc: "Napisao proverivač kontinuiteta",
        reportEmpty: "Još nema izveštaja o kontinuitetu.",
        findings: "Nalazi kontinuiteta",
        domainFindings: "Nalazi: {domain}",
        showAll: "Prikaži sve",
        chapterShort: "Pogl.",
        domCharacters: "Likovi",
        domTimeline: "Hronologija",
        domGeography: "Geografija",
        domObjects: "Predmeti i rekviziti",
        domRelationships: "Odnosi",
        domWorld: "Pravila sveta",
        domOther: "Ostalo",
      },
    },
  }),
}));

import { ContinuityTab } from "@/components/reports/continuity-tab";

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ContinuityTab bookId="b1" />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.book = { id: "b1", seriesId: null };
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const body = u.includes("findings") ? { findings: [] } : { documents: [] };
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;
});
afterEach(cleanup);

describe("ContinuityTab scope", () => {
  it("offers the single-book check for a standalone book", async () => {
    renderTab();
    const button = await screen.findByText("Proveri ovu knjigu");
    fireEvent.click(button);
    expect(h.openWithWorkflow).toHaveBeenCalledWith("check-continuity");
  });

  it("offers the series check only when the book belongs to a series", async () => {
    h.book = { id: "b1", seriesId: "s1" };
    renderTab();
    const button = await screen.findByText("Proveri ceo serijal");
    fireEvent.click(button);
    expect(h.openWithWorkflow).toHaveBeenCalledWith("check-series-continuity");
  });

  it("renders its chrome in the writer's language, not English", async () => {
    renderTab();
    await waitFor(() => expect(screen.getByText("Kontinuitet")).toBeTruthy());
    expect(screen.getByText("Praćenje kontinuiteta")).toBeTruthy();
    expect(screen.getByText("Likovi")).toBeTruthy();
    expect(screen.getByText("Pravila sveta")).toBeTruthy();
    expect(screen.getByText("Još nema izveštaja o kontinuitetu.")).toBeTruthy();
    expect(screen.queryByText("Continuity Tracker")).toBeNull();
    expect(screen.queryByText("Run Continuity Check")).toBeNull();
  });
});
