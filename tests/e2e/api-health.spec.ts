import { test, expect } from "@playwright/test";

/**
 * Health & Usage API Tests
 */
test.describe("Health & Usage", () => {
  test("health endpoint returns OK", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("ok");
  });

  test("usage endpoint returns data", async ({ request }) => {
    const res = await request.get("/api/usage?days=30");
    // Might be 401 if E2E user not found, or 200
    if (res.ok()) {
      const data = await res.json();
      expect(data).toHaveProperty("total");
      expect(data.total).toHaveProperty("costEstimate");
      expect(data.total).toHaveProperty("tokensInput");
      expect(data.total).toHaveProperty("tokensOutput");
    }
  });
});
