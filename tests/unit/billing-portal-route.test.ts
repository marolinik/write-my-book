// P1-8: the portal route built return_url from req.nextUrl.origin, which is
// http://0.0.0.0:3000 inside the container, so every writer leaving the
// Stripe portal landed on a host their browser cannot reach.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  requireUser: vi.fn(),
  findUnique: vi.fn(),
  portalCreate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireUser: () => h.requireUser() }));
vi.mock("@/lib/db", () => ({ db: { subscription: { findUnique: h.findUnique } } }));
vi.mock("@/lib/billing", () => ({
  stripe: { billingPortal: { sessions: { create: h.portalCreate } } },
}));

import { POST } from "@/app/api/billing/portal/route";

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  vi.clearAllMocks();
  h.requireUser.mockResolvedValue({ id: "u1" });
  h.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
  h.portalCreate.mockResolvedValue({ url: "https://billing.stripe.com/p/session" });
  process.env.NEXT_PUBLIC_APP_URL = "https://writemybook.app";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("POST /api/billing/portal", () => {
  it("returns the writer to the product domain, not the container host", async () => {
    const res = await POST(new NextRequest("http://0.0.0.0:3000/api/billing/portal", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(h.portalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://writemybook.app/settings/billing",
    });
  });
});

// P2-64 (Wave 5 Task 6): the rest of the route's answers.
describe("POST /api/billing/portal — refusals", () => {
  const post = () => POST(new NextRequest("http://0.0.0.0:3000/api/billing/portal", { method: "POST" }));

  it("answers 404 with no Stripe call when the writer has no billing account", async () => {
    h.findUnique.mockResolvedValue({ stripeCustomerId: null });
    expect((await post()).status).toBe(404);
    h.findUnique.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(h.portalCreate).not.toHaveBeenCalled();
  });

  it("looks up only the caller's own subscription", async () => {
    await post();
    expect(h.findUnique).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("answers 401, not 500, when signed out", async () => {
    h.requireUser.mockRejectedValue(new Error("Unauthorized"));
    expect((await post()).status).toBe(401);
    expect(h.portalCreate).not.toHaveBeenCalled();
  });

  it("answers 500 without Stripe's message when Stripe fails", async () => {
    h.portalCreate.mockRejectedValue(new Error("No such customer: cus_1; a similar object exists in live mode"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("cus_1");
  });
});
