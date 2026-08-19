import { describe, it, expect } from "vitest";
import { billingStatusNotice } from "@/lib/billing/status-notice";

// D-07: the billing page previously rendered past_due and cancelAtPeriodEnd
// subscriptions identically to a healthy one. This pure helper decides which
// honest status notice (if any) the page must show.

const base = {
  status: "active",
  cancelAtPeriodEnd: false,
  currentPeriodEnd: "2026-08-01T00:00:00.000Z" as string | null,
};

describe("billingStatusNotice (D-07)", () => {
  it("returns null for missing subscription data", () => {
    expect(billingStatusNotice(undefined, "en-US")).toBeNull();
    expect(billingStatusNotice(null, "en-US")).toBeNull();
  });

  it("returns null for a healthy active subscription", () => {
    expect(billingStatusNotice(base, "en-US")).toBeNull();
  });

  it("returns null for none/canceled states", () => {
    expect(billingStatusNotice({ ...base, status: "none" }, "en-US")).toBeNull();
    expect(
      billingStatusNotice({ ...base, status: "canceled" }, "en-US")
    ).toBeNull();
    // cancelAtPeriodEnd on an already-dead sub is not a live cancellation
    expect(
      billingStatusNotice(
        { ...base, status: "canceled", cancelAtPeriodEnd: true },
        "en-US"
      )
    ).toBeNull();
  });

  it("past_due → payment-failed warning pointing at Manage Subscription", () => {
    const n = billingStatusNotice({ ...base, status: "past_due" }, "en-US");
    expect(n).not.toBeNull();
    expect(n!.kind).toBe("past_due");
    expect(n!.title).toMatch(/payment failed/i);
    expect(n!.body).toMatch(/manage subscription/i);
    expect(n!.body).toMatch(/update/i);
  });

  it("past_due wins over cancelAtPeriodEnd (payment failure is more urgent)", () => {
    const n = billingStatusNotice(
      { ...base, status: "past_due", cancelAtPeriodEnd: true },
      "en-US"
    );
    expect(n!.kind).toBe("past_due");
  });

  it("cancelAtPeriodEnd → end-of-plan notice with the localized end date", () => {
    const n = billingStatusNotice(
      { ...base, cancelAtPeriodEnd: true },
      "en-US"
    );
    expect(n).not.toBeNull();
    expect(n!.kind).toBe("cancel_at_period_end");
    expect(n!.body).toContain(
      new Date("2026-08-01T00:00:00.000Z").toLocaleDateString("en-US")
    );
    expect(n!.body).toMatch(/access until/i);
    expect(n!.body).toMatch(/manage subscription/i);
  });

  it("cancelAtPeriodEnd during trial also shows the notice", () => {
    const n = billingStatusNotice(
      { ...base, status: "trialing", cancelAtPeriodEnd: true },
      "en-US"
    );
    expect(n).not.toBeNull();
    expect(n!.kind).toBe("cancel_at_period_end");
  });

  it("formats the end date for the caller's locale", () => {
    const en = billingStatusNotice({ ...base, cancelAtPeriodEnd: true }, "en-US");
    const fr = billingStatusNotice({ ...base, cancelAtPeriodEnd: true }, "fr-FR");
    expect(en!.body).toContain(
      new Date(base.currentPeriodEnd!).toLocaleDateString("en-US")
    );
    expect(fr!.body).toContain(
      new Date(base.currentPeriodEnd!).toLocaleDateString("fr-FR")
    );
  });

  it("missing/invalid currentPeriodEnd degrades to period-end wording, never 'Invalid Date'", () => {
    const noDate = billingStatusNotice(
      { ...base, cancelAtPeriodEnd: true, currentPeriodEnd: null },
      "en-US"
    );
    expect(noDate).not.toBeNull();
    expect(noDate!.body).not.toMatch(/invalid date/i);
    expect(noDate!.body).toMatch(/billing period/i);

    const badDate = billingStatusNotice(
      { ...base, cancelAtPeriodEnd: true, currentPeriodEnd: "not-a-date" },
      "en-US"
    );
    expect(badDate!.body).not.toMatch(/invalid date/i);
  });
});
