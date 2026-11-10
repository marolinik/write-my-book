// Owner decision 2026-11-10: prices include VAT. With Stripe Tax on, checkout
// computes the VAT inside the listed price, collects the address it needs and
// a VAT id for business buyers; every plan price must be tax-inclusive or
// the shown price would grow at checkout.
import { describe, it, expect, afterEach, vi } from "vitest";
import type Stripe from "stripe";
import { checkoutTaxParams, pricesNotTaxInclusive } from "@/lib/billing/tax";

const ORIGINAL = process.env.STRIPE_AUTOMATIC_TAX;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.STRIPE_AUTOMATIC_TAX;
  else process.env.STRIPE_AUTOMATIC_TAX = ORIGINAL;
});

describe("checkoutTaxParams", () => {
  it("turns on Stripe Tax, address and VAT-id collection when STRIPE_AUTOMATIC_TAX=1", () => {
    process.env.STRIPE_AUTOMATIC_TAX = "1";
    expect(checkoutTaxParams()).toEqual({
      automatic_tax: { enabled: true },
      customer_update: { address: "auto", name: "auto" },
      tax_id_collection: { enabled: true },
    });
  });

  it("adds nothing while the flag is off", () => {
    delete process.env.STRIPE_AUTOMATIC_TAX;
    expect(checkoutTaxParams()).toEqual({});
  });
});

describe("pricesNotTaxInclusive", () => {
  it("names every price that is not tax-inclusive", async () => {
    const behaviour: Record<string, string | null> = {
      price_a: "inclusive",
      price_b: "exclusive",
      price_c: null,
    };
    const stripe = {
      prices: { retrieve: vi.fn(async (id: string) => ({ id, tax_behavior: behaviour[id] })) },
    } as unknown as Stripe;
    expect(await pricesNotTaxInclusive(stripe, ["price_a", "price_b", "price_c"])).toEqual([
      "price_b (exclusive)",
      "price_c (unspecified)",
    ]);
  });
});
