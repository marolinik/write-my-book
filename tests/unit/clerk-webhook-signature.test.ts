// P2-4 (Wave 5 Task 8): the Clerk webhook's signature rejection had no test
// (svix was mocked to always verify), and user.created / user.updated were
// never exercised. These run the REAL svix: a request signed with the secret
// is processed, a tampered or unsigned one is refused before any write.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomBytes } from "node:crypto";
import { Webhook } from "svix";

const h = vi.hoisted(() => ({
  db: {
    user: { upsert: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), findFirst: vi.fn() },
    subscription: { findFirst: vi.fn() },
  },
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@/lib/db", () => ({ db: h.db }));
vi.mock("@/lib/queue/erasure-queue", () => ({ enqueueErasure: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: h.logger }));
vi.mock("@/lib/llm/defaults", () => ({ getDefaultModelId: () => "model-x" }));
vi.mock("@/lib/billing", () => ({ stripe: null }));

import { POST } from "@/app/api/auth/webhook/route";

const SECRET = `whsec_${randomBytes(24).toString("base64")}`;

function signed(payload: unknown, opts: { tamper?: boolean; secret?: string; drop?: string } = {}) {
  const body = JSON.stringify(payload);
  const id = "msg_test_1";
  const timestamp = new Date();
  const signature = new Webhook(opts.secret ?? SECRET).sign(id, timestamp, body);
  const headers: Record<string, string> = {
    "svix-id": id,
    "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
    "svix-signature": signature,
  };
  if (opts.drop) delete headers[opts.drop];
  return new Request("http://t/api/auth/webhook", {
    method: "POST",
    headers,
    body: opts.tamper ? body.replace("Ana", "Eve") : body,
  });
}

const created = {
  type: "user.created",
  data: {
    id: "user_2abc",
    email_addresses: [{ email_address: "ana@example.com" }],
    first_name: "Ana",
    last_name: "Petrović",
    username: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLERK_WEBHOOK_SECRET = SECRET;
  h.db.user.upsert.mockResolvedValue({});
  h.db.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("Clerk webhook signature (real svix)", () => {
  it.each(["svix-id", "svix-timestamp", "svix-signature"])("answers 401 without %s, and writes nothing", async (header) => {
    const res = await POST(signed(created, { drop: header }) as never);
    expect(res.status).toBe(401);
    expect(h.db.user.upsert).not.toHaveBeenCalled();
  });

  it("answers 401 for a body changed after signing", async () => {
    const res = await POST(signed(created, { tamper: true }) as never);
    expect(res.status).toBe(401);
    expect(h.db.user.upsert).not.toHaveBeenCalled();
  });

  it("answers 401 for a request signed with another secret", async () => {
    const res = await POST(signed(created, { secret: `whsec_${randomBytes(24).toString("base64")}` }) as never);
    expect(res.status).toBe(401);
    expect(h.db.user.upsert).not.toHaveBeenCalled();
  });
});

describe("Clerk webhook events (real svix)", () => {
  it("user.created upserts on the Clerk id with the email, name and deployment default model", async () => {
    expect((await POST(signed(created) as never)).status).toBe(200);
    expect(h.db.user.upsert).toHaveBeenCalledWith({
      where: { clerkId: "user_2abc" },
      create: {
        clerkId: "user_2abc",
        email: "ana@example.com",
        defaultModel: "model-x",
        displayName: "Ana Petrović",
      },
      update: {},
    });
  });

  it("user.updated maps the new email and name onto the Clerk id's row only", async () => {
    const updated = {
      type: "user.updated",
      data: { id: "user_2abc", email_addresses: [{ email_address: "ana@new.example" }], first_name: "Ana", last_name: "P." },
    };
    expect((await POST(signed(updated) as never)).status).toBe(200);
    expect(h.db.user.updateMany).toHaveBeenCalledWith({
      where: { clerkId: "user_2abc" },
      data: { email: "ana@new.example", displayName: "Ana P." },
    });
  });

  it("a signed user.deleted without an id is still refused (400) and deletes nothing", async () => {
    const res = await POST(signed({ type: "user.deleted", data: { deleted: true } }) as never);
    expect(res.status).toBe(400);
    expect(h.db.user.deleteMany).not.toHaveBeenCalled();
  });
});
