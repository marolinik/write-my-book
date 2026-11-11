// P1-1: the Clerk webhook trusted `data.id as string`. A verified
// user.deleted without an id turned into `deleteMany({ where: { clerkId:
// undefined } })`, which Prisma reads as "no filter": every user deleted.
// The payload is now validated before anything touches the database.
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  payload: null as unknown,
  db: {
    user: { upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    subscription: { findFirst: vi.fn() },
  },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("svix", () => ({
  Webhook: class {
    verify() {
      return h.payload;
    }
  },
}));
vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/erasure-queue", () => ({ enqueueErasure: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/llm/defaults", () => ({ getDefaultModelId: () => "model-x" }));
vi.mock("@/lib/billing", () => ({ stripe: null }));

import { POST } from "@/app/api/auth/webhook/route";

function req() {
  return new Request("http://t/api/auth/webhook", {
    method: "POST",
    headers: { "svix-id": "msg_1", "svix-timestamp": "1700000000", "svix-signature": "v1,sig" },
    body: "raw",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test";
});

describe("POST /api/auth/webhook — payload validation", () => {
  it.each([
    ["user.deleted with no id", { type: "user.deleted", data: { deleted: true } }],
    ["user.deleted with a non-Clerk id", { type: "user.deleted", data: { id: "" } }],
    ["user.updated with no id", { type: "user.updated", data: { email_addresses: [] } }],
    ["user.created with a non-user id", { type: "user.created", data: { id: "org_123" } }],
  ])("%s is refused with 400 and touches nothing", async (_name, payload) => {
    h.payload = payload;
    const res = await POST(req() as never);
    expect(res.status).toBe(400);
    expect(h.db.user.deleteMany).not.toHaveBeenCalled();
    expect(h.db.user.updateMany).not.toHaveBeenCalled();
    expect(h.db.user.upsert).not.toHaveBeenCalled();
  });

  it("acknowledges an event type it does not handle, so Clerk stops retrying it", async () => {
    h.payload = { type: "session.created", data: { id: "sess_1" } };
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    expect(h.db.user.deleteMany).not.toHaveBeenCalled();
  });
});
