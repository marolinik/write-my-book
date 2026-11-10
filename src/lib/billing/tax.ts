import type Stripe from "stripe";

type TaxParams = Pick<
  Stripe.Checkout.SessionCreateParams,
  "automatic_tax" | "customer_update" | "tax_id_collection"
>;

/**
 * Prices are VAT-inclusive (Terms §4). With Stripe Tax active on the account,
 * STRIPE_AUTOMATIC_TAX=1 makes checkout compute the VAT inside the listed
 * price, keep the customer's address for it, and accept a VAT id so business
 * buyers get the reverse charge. Off by default: enabling it before Stripe Tax
 * is set up would make every checkout fail.
 */
export function checkoutTaxParams(): TaxParams | Record<string, never> {
  if (process.env.STRIPE_AUTOMATIC_TAX?.trim() !== "1") return {};
  return {
    automatic_tax: { enabled: true },
    customer_update: { address: "auto", name: "auto" },
    tax_id_collection: { enabled: true },
  };
}

/** The prices whose tax behaviour would put VAT on top of the shown price. */
export async function pricesNotTaxInclusive(
  stripeClient: Stripe,
  priceIds: readonly string[]
): Promise<string[]> {
  const prices = await Promise.all(priceIds.map((id) => stripeClient.prices.retrieve(id)));
  return prices
    .filter((price) => price.tax_behavior !== "inclusive")
    .map((price) => `${price.id} (${price.tax_behavior ?? "unspecified"})`);
}
