// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@clerk/nextjs", () => ({ SignUp: () => null }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("sign-up page", () => {
  it("tells the writer that creating an account accepts the Terms and the Privacy Policy", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_Y2xlcmsuZXhhbXBsZS50ZXN0JA");
    vi.stubEnv("DEV_AUTH_BYPASS", "");
    const { default: SignUpPage } = await import("@/app/(auth)/signup/[[...sign-up]]/page");

    render(<SignUpPage />);

    expect(screen.getByText(/creating an account/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /terms/i }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: /privacy/i }).getAttribute("href")).toBe("/privacy");
  });
});
