// @vitest-environment jsdom
import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterEach,
} from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { getUIStrings } from "@/lib/i18n/ui-strings";

/**
 * D-154 (cold-funnel) — /books/new gated its required "Book name" field with a
 * bare `if (!name.trim()) return;`. The native `required` attribute only blocks
 * the type="submit" button; the "Guided setup instead" button is type="button"
 * (never submits) and a whitespace-only name passes native validation, so both
 * reached the silent return: the writer clicked and NOTHING happened — no
 * message, no aria-invalid, no focus. This asserts the block is now surfaced
 * (role=alert + aria-invalid + focus) and clears once the field is fixed.
 */

// Radix Select (the language picker) touches a few DOM APIs jsdom omits.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
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

const routerPush = vi.hoisted(() => vi.fn());
const routerBack = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush, back: routerBack }),
}));

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-books", () => ({
  useCreateBook: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/use-series", () => ({
  useSeries: () => ({ data: [] }),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ t: getUIStrings("en"), language: "en" }),
}));

import NewBookPage from "@/app/(app)/books/new/page";

const NAME_REQUIRED = getUIStrings("en").newBook.nameRequired;

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  routerBack.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  mutateAsync.mockReset();
});

describe("NewBookPage — D-154 required name is no longer a silent no-op", () => {
  it("opts the form out of native validation so submit always reaches the JS guard", () => {
    // The headline reported path: native `required` on the name input would
    // otherwise block the submit event on an empty name (and its bubble is
    // silent on mobile), so the inline guard could never run. `noValidate`
    // hands submission to createAndGo on every device.
    const { container } = render(<NewBookPage />);
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect((form as HTMLFormElement).noValidate).toBe(true);
    // `required` is kept on the input for accessibility semantics.
    const nameInput = screen.getByRole("textbox", { name: /book name/i });
    expect(nameInput.hasAttribute("required")).toBe(true);
  });

  it("surfaces the inline alert + aria-invalid + focus when the PRIMARY 'Start writing' submit fires with an empty name", () => {
    render(<NewBookPage />);

    // The exact reported funnel: primary submit button, truly-empty name. With
    // noValidate the submit event reaches createAndGo instead of dying behind
    // native validation, so the inline block shows here too — not a native
    // bubble that renders silently on the capture device.
    fireEvent.click(screen.getByRole("button", { name: /start writing/i }));

    expect(mutateAsync).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(NAME_REQUIRED);

    const nameInput = screen.getByRole("textbox", { name: /book name/i });
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(nameInput);
  });

  it("surfaces an alert + aria-invalid + focus when 'Guided setup instead' is clicked with an empty name", () => {
    render(<NewBookPage />);

    // The type="button" path bypasses native `required` entirely — the exact
    // funnel where the click used to land in dead air.
    fireEvent.click(
      screen.getByRole("button", { name: /guided setup instead/i })
    );

    // No book creation attempted...
    expect(mutateAsync).not.toHaveBeenCalled();
    // ...and the writer is told why, with the field flagged and focused.
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(NAME_REQUIRED);

    const nameInput = screen.getByRole("textbox", { name: /book name/i });
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(nameInput);
  });

  it("also blocks a whitespace-only name (which slips past native `required`)", () => {
    render(<NewBookPage />);

    const nameInput = screen.getByRole("textbox", { name: /book name/i });
    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.click(
      screen.getByRole("button", { name: /guided setup instead/i })
    );

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(NAME_REQUIRED);
  });

  it("clears the alert as soon as the writer types, then creates on a valid name", async () => {
    mutateAsync.mockResolvedValue({ id: "bk1", firstChapterId: "ch1" });
    render(<NewBookPage />);

    fireEvent.click(
      screen.getByRole("button", { name: /guided setup instead/i })
    );
    expect(screen.getByRole("alert")).toBeTruthy();

    // Typing a real name clears the block...
    const nameInput = screen.getByRole("textbox", { name: /book name/i });
    fireEvent.change(nameInput, { target: { value: "My Novel" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(nameInput.getAttribute("aria-invalid")).not.toBe("true");

    // ...and the next click funnels through to book creation.
    fireEvent.click(
      screen.getByRole("button", { name: /guided setup instead/i })
    );
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ name: "My Novel" })
      )
    );
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/books/bk1/setup?step=1")
    );
  });
});
