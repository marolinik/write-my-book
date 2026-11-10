// P1-8: every Stripe return URL uses the product domain, never the
// container's own advertised host (http://0.0.0.0:3000 in the standalone image).
import { describe, it, expect, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { productOrigin } from "@/lib/http/product-origin";

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("productOrigin", () => {
  it("uses NEXT_PUBLIC_APP_URL without its trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = " https://writemybook.app/ ";
    const req = new NextRequest("http://0.0.0.0:3000/api/billing/portal");
    expect(productOrigin(req)).toBe("https://writemybook.app");
  });

  it("falls back to the request origin when the env value is unset", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const req = new NextRequest("http://wmb.test:3005/api/billing/portal");
    expect(productOrigin(req)).toBe("http://wmb.test:3005");
  });
});
