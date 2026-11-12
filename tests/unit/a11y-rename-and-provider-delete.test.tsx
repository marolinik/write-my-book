// @vitest-environment jsdom
// P2-56: the chapter-title rename on the book overview is reachable by
// keyboard and a failed save says so. P2-55: a failed custom-provider delete
// shows its reason instead of being swallowed.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

const h = vi.hoisted(() => ({ toastError: vi.fn(), invalidate: vi.fn() }));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: "en", t: getUIStrings("en") }),
  useLocale: () => "en-US",
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: h.invalidate }),
  useQuery: () => ({ data: [{ id: "cp1", displayName: "Box", baseURL: "https://llm.example.com/v1", hasKey: false, maskedKey: null, models: [] }] }),
}));

import { InlineEditableTitle } from "@/components/book/inline-editable-title";
import { CustomProvidersSection } from "@/components/settings/custom-providers-section";

const en = getUIStrings("en");

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InlineEditableTitle", () => {
  it("is a button, so Enter starts the rename", () => {
    render(<InlineEditableTitle bookId="b1" chapterId="c1" initialTitle="The Letter" />);
    const button = screen.getByRole("button", { name: /The Letter/ });
    fireEvent.click(button); // Enter/Space on a native button fire click
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("a failed save says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    render(<InlineEditableTitle bookId="b1" chapterId="c1" initialTitle="The Letter" />);
    fireEvent.click(screen.getByRole("button", { name: /The Letter/ }));
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "The Second Letter" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(h.toastError).toHaveBeenCalledWith(en.appUI.titleSaveFailed));
  });
});

describe("CustomProvidersSection delete", () => {
  it("a failed delete shows the reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "x" }), { status: 500 })));
    render(<CustomProvidersSection />);
    const del = screen.getAllByRole("button").find((b) => /delete|remove/i.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
    expect(del).toBeTruthy();
    fireEvent.click(del!);
    await waitFor(() => expect(screen.getByText(en.apiErrors.SERVER_ERROR)).toBeTruthy());
  });
});
