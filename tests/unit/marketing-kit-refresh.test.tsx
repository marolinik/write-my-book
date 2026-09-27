// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * P3-S25 — after a successful generation the card stayed on the empty state
 * with its "Generate" button, because onSuccess only toasted: nothing wrote
 * the new kit into ['marketing-kit', bookId], and the query's defaults
 * (staleTime 60 s, no refetch on focus) never re-read it. Every further click
 * was another billed generation. Once a kit was loaded there was no way to
 * regenerate it at all, though R-313 says a new generation replaces the
 * previous one.
 */

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MarketingKit } from "@/components/book/marketing-kit";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const t = getUIStrings("en");

function kit(logline: string) {
  return {
    logline,
    blurb: "A blurb.",
    storeDescription: "<p>Store.</p>",
    compTitles: ["Comp A"],
    socialPosts: ["Post one"],
    emailAnnouncement: "Email.",
    generatedAt: "2026-09-25T04:41:31.659Z",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function renderKit() {
  // The app's defaults: a 60 s stale window and no refetch on focus.
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 60_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return render(<MarketingKit bookId="b1" bookTitle="Salt Letters" />, { wrapper });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketingKit — the generated kit replaces the empty state (P3-S25)", () => {
  it("shows the new kit right after a successful generation", async () => {
    // Server state: nothing saved until the POST, the saved kit after it.
    let saved: ReturnType<typeof kit> | null = null;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        saved = kit("A keeper of salt letters.");
        return jsonResponse(saved);
      }
      return jsonResponse(saved);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderKit();
    const generate = await screen.findByRole("button", { name: t.bookUI.generateKit });
    fireEvent.click(generate);

    expect(await screen.findByText("A keeper of salt letters.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: t.bookUI.generateKit })).toBeNull();
  });

  it("does not start a second generation while one is running", async () => {
    let release: (r: Response) => void = () => {};
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            release = resolve;
          })
        : Promise.resolve(jsonResponse(null))
    );
    vi.stubGlobal("fetch", fetchMock);

    renderKit();
    const generate = await screen.findByRole("button", { name: t.bookUI.generateKit });
    fireEvent.click(generate);
    fireEvent.click(generate);

    const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === "POST").length;
    await waitFor(() => expect(posts()).toBe(1));
    expect((generate as HTMLButtonElement).disabled).toBe(true);
    release(jsonResponse(kit("One run only.")));
    expect(await screen.findByText("One run only.")).toBeTruthy();
    expect(posts()).toBe(1);
  });

  it("offers Regenerate on a loaded kit, and the new kit replaces the old one", async () => {
    let saved = kit("Logline v1");
    let generation = 1;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        generation += 1;
        saved = kit(`Logline v${generation}`);
      }
      return jsonResponse(saved);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderKit();
    expect(await screen.findByText("Logline v1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: t.common.regenerate }));

    expect(await screen.findByText("Logline v2")).toBeTruthy();
    expect(screen.queryByText("Logline v1")).toBeNull();
  });
});
