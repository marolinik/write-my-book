import { test, expect } from "@playwright/test";

/**
 * Health & Usage API Tests
 */
test.describe("Health & Usage", () => {
  test("health endpoint returns OK", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  test("usage endpoint returns data", async ({ request }) => {
    const res = await request.get("/api/usage?days=30");
    // P2-3: global-setup seeds the e2e user, so anything but 200 is a failure
    // (this used to pass silently on a 401).
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty("total");
    expect(data.total).toHaveProperty("costEstimate");
    expect(data.total).toHaveProperty("tokensInput");
    expect(data.total).toHaveProperty("tokensOutput");
  });
});
